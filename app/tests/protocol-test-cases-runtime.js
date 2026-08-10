/* AI Council v0.1 — D1-R3 用例：Meeting State Machine / Deterministic Runtime。
 * 覆盖创建、启动、各类 Phase、Human Gate、合法循环、Battle、Completion、歧义 Transition、步数安全阀与两条端到端。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var F = A.TestFixtures;
  var RT = A.MeetingRuntime;
  var MOCK = A.MockAgentRuntime;
  var FACTORY = A.MeetingFactory;

  /* ---------- 助手 ---------- */

  function committeeParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1" },
      { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null, actor_type: "chair", alias: "Chair" }
    ];
  }

  /* 把一个已（假定）合法的 document 通过正式 Registry/会话管线拿到 Available Protocol 记录 */
  function availableFromDoc(doc, ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry(doc.protocol_id, JSON.stringify(doc))]).then(function (s) {
      if (s.registry.counts.available !== 1) {
        throw new Error("availableFromDoc: protocol 未成为 Available，diagnostics=" +
          JSON.stringify(s.registry.diagnostics.map(function (d) { return d.code; })));
      }
      return s.registry.available[0];
    });
  }

  /* committee-mvp 起点（已 start） */
  function startCommittee(ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", ctx.validText)]).then(function (s) {
      var proto = s.registry.available[0];
      var m = FACTORY.createMeeting(proto, { meetingId: "rt-committee", participants: committeeParticipants() });
      RT.start(m, proto);
      return { proto: proto, m: m };
    });
  }

  function reachHuman(proto, m) {
    MOCK.runOnce(RT, m, proto); /* opening */
    MOCK.runOnce(RT, m, proto); /* summary */
    MOCK.runOnce(RT, m, proto); /* critique → human-decision */
  }

  /* ---------- 自定义协议构造（用于 selector / system / 歧义 / 步数 等定向测试） ---------- */

  function mkProtocol(id, initial, phases) {
    return {
      schema_version: "0.1.0",
      protocol_id: id,
      name: id,
      version: "0.1.0",
      source: "built_in",
      lifecycle_status: "formal",
      description: "D1-R3 runtime test",
      default_visibility_mode: "semi_anonymous",
      allowed_visibility_modes: ["public", "semi_anonymous", "full_anonymous"],
      participant_policy: {
        min_advisors: 2, max_advisors: 6,
        sides: [
          { side_id: "A", label: "A", min_members: 1, max_members: 3 },
          { side_id: "B", label: "B", min_members: 1, max_members: 3 }
        ]
      },
      required_roles: [
        { role_class: "advisor", min_count: 2, max_count: 6 },
        { role_class: "chair_secretary", min_count: 1, max_count: 1 }
      ],
      initial_phase_id: initial,
      phases: phases
    };
  }

  function act(sel, opts) {
    var a = { selector: sel };
    if (opts) Object.keys(opts).forEach(function (k) { a[k] = opts[k]; });
    return a;
  }

  function tr(trigger, target, choice) {
    var t = { trigger: trigger, target: target };
    if (choice !== undefined) t.choice = choice;
    return t;
  }

  function mkPhase(id, kind, actor, completionMode, transitions) {
    return {
      phase_id: id, name: id, kind: kind, actor: actor,
      instruction: { task: "t", context_scope: "meeting", include_role_card: false, include_visibility_rules: false },
      output_contract: { mode: "text" },
      completion: { mode: completionMode },
      checkpoint: false,
      transitions: transitions
    };
  }

  /* ================= 创建 / 启动 ================= */

  T.test("TEST-32", "从 Available Protocol 创建会议：initialized + currentPhase=opening", function (ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", ctx.validText)]).then(function (s) {
      var proto = s.registry.available[0];
      var m = FACTORY.createMeeting(proto, { meetingId: "t32", participants: committeeParticipants() });
      T.assertEqual(m.status, "initialized", "创建后状态 initialized");
      T.assertEqual(m.currentPhaseId, "opening", "初始 phase = opening");
      T.assertEqual(m.completedPhaseIds.length, 0, "completedPhaseIds 初始为空");
    });
  });

  T.test("TEST-33", "start 后：running + 等待 opening 的 advisors 响应", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      T.assertEqual(r.m.status, "running", "start 后 running");
      T.assert(r.m.pendingAction, "存在 pending action");
      T.assertEqual(r.m.pendingAction.action_type, "collect_responses", "动作类型 collect_responses");
      T.assertEqual(r.m.pendingAction.phaseId, "opening", "等待 opening");
      T.assertEqual(r.m.pendingAction.requiredParticipantIds.length, 2, "opening 需要 2 个 advisor");
    });
  });

  /* ================= Completion 规则 ================= */

  T.test("TEST-34", "all_selected_respond：A 先答不推进，B 答齐后进入 summary", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      var res = RT.submitResult(r.m, r.proto, { participant_id: "agent-a1", payload: {} });
      T.assert(res.ok, "A 提交被接受");
      T.assertEqual(r.m.currentPhaseId, "opening", "仅 A 响应时仍在 opening");
      T.assertEqual(r.m.pendingAction.receivedParticipantIds.length, 1, "已收到 1 份");
      RT.submitResult(r.m, r.proto, { participant_id: "agent-b1", payload: {} });
      T.assertEqual(A.MeetingTurnSelector.phaseStatus(r.m, r.proto), "ready_to_advance", "B 响应齐后 READY_TO_ADVANCE（不自动切）");
      T.assert(RT.advancePhase(r.m, r.proto).ok, "advance 成功");
      T.assertEqual(r.m.currentPhaseId, "summary", "advance 后进入 summary");
    });
  });

  T.test("TEST-35", "重复提交：同一参与者第二次响应被拒，不重复计数", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      RT.submitResult(r.m, r.proto, { participant_id: "agent-a1", payload: {} });
      var dup = RT.submitResult(r.m, r.proto, { participant_id: "agent-a1", payload: {} });
      T.assert(!dup.ok, "重复提交返回 ok=false");
      T.assertEqual(dup.diagnostic.code, "RUNTIME_DUPLICATE_RESPONSE", "诊断码 RUNTIME_DUPLICATE_RESPONSE");
      T.assertEqual(r.m.pendingAction.receivedParticipantIds.length, 1, "received 仍为 1，未重复计数");
      T.assertEqual(r.m.currentPhaseId, "opening", "会议仍在 opening");
    });
  });

  T.test("TEST-36", "Secretary Summary：只请求 chair_secretary", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      MOCK.stepOnce(RT, r.m, r.proto); MOCK.stepOnce(RT, r.m, r.proto); /* opening 两位 */
      T.assertEqual(r.m.currentPhaseId, "opening", "收齐后停在 opening（READY_TO_ADVANCE）");
      T.assert(RT.advancePhase(r.m, r.proto).ok, "advance 成功");
      T.assertEqual(r.m.currentPhaseId, "summary", "进入 summary");
      T.assertEqual(r.m.pendingAction.requiredParticipantIds.length, 1, "summary 仅 1 个要求");
      T.assertEqual(r.m.pendingAction.requiredParticipantIds[0], "chair-secretary-1", "要求是 chair_secretary");
    });
  });

  T.test("TEST-37", "Critique：重新请求 advisors", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      MOCK.stepOnce(RT, r.m, r.proto); MOCK.stepOnce(RT, r.m, r.proto); /* opening 两位 */
      RT.advancePhase(r.m, r.proto); MOCK.stepOnce(RT, r.m, r.proto); /* summary 秘书 */
      RT.advancePhase(r.m, r.proto); MOCK.stepOnce(RT, r.m, r.proto); MOCK.stepOnce(RT, r.m, r.proto); /* critique 两位 */
      RT.advancePhase(r.m, r.proto);
      T.assertEqual(r.m.status, "waiting_human", "模拟到 Human Gate 停住");
    });
  });

  /* ================= Human Gate ================= */

  T.test("TEST-38", "Human Gate：进入 waiting_human，无人类输入不推进", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      T.assertEqual(r.m.status, "waiting_human", "状态 waiting_human");
      T.assertEqual(r.m.currentPhaseId, "human-decision", "停在 human-decision");
      T.assertEqual(r.m.pendingAction.action_type, "await_human_decision", "等待人类决策");
    });
  });

  T.test("TEST-39", "Human Finish：finish → archive(system) → $end → completed", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var res = RT.submitHumanDecision(r.m, r.proto, { choice: "finish" });
      T.assert(res.ok, "finish 决策被接受");
      T.assertEqual(r.m.status, "completed", "完成");
      T.assertEqual(r.m.currentPhaseId, null, "$end 后 currentPhaseId=null");
      T.assertEqual(r.m.pendingAction, null, "completed 后 pending=null");
    });
  });

  T.test("TEST-40", "Human Continue：continue → critique", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var res = RT.submitHumanDecision(r.m, r.proto, { choice: "continue" });
      T.assert(res.ok, "continue 决策被接受");
      T.assertEqual(r.m.currentPhaseId, "critique", "continue → critique");
      T.assertEqual(r.m.status, "running", "critique 为 running");
    });
  });

  T.test("TEST-41", "Legal Cycle：critique→human→continue→critique 不因曾完成而失败", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m); /* human-decision #1 */
      RT.submitHumanDecision(r.m, r.proto, { choice: "continue" }); /* → critique */
      MOCK.runOnce(RT, r.m, r.proto); /* critique 完成 → human-decision #2 */
      RT.submitHumanDecision(r.m, r.proto, { choice: "finish" });
      T.assertEqual(r.m.status, "completed", "合法循环后仍能正常结束");
      T.assert(r.m.completedPhaseIds.indexOf("critique") >= 0, "completedPhaseIds 含 critique");
    });
  });

  T.test("TEST-44", "非法 Human Choice：choice=abc 被拒，会议不偷偷改 phase", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var res = RT.submitHumanDecision(r.m, r.proto, { choice: "abc" });
      T.assert(!res.ok, "非法 choice 返回 ok=false");
      T.assertEqual(res.diagnostic.code, "RUNTIME_INVALID_HUMAN_CHOICE", "诊断码 RUNTIME_INVALID_HUMAN_CHOICE");
      T.assertEqual(r.m.status, "waiting_human", "仍 waiting_human");
      T.assertEqual(r.m.currentPhaseId, "human-decision", "phase 未变");
    });
  });

  /* ================= Battle ================= */

  T.test("TEST-42", "Battle：selection 存在时只向 selected participants 请求响应", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      r.m.stateData.battle_participants = ["agent-a1", "agent-b1"];
      var res = RT.submitHumanDecision(r.m, r.proto, { choice: "battle" });
      T.assert(res.ok, "battle 决策被接受");
      T.assertEqual(r.m.currentPhaseId, "battle", "进入 battle phase");
      T.assertEqual(r.m.pendingAction.requiredParticipantIds.length, 2, "battle 仅向 2 个 selected 请求");
      T.assert(r.m.pendingAction.requiredParticipantIds.indexOf("agent-a1") >= 0 &&
        r.m.pendingAction.requiredParticipantIds.indexOf("agent-b1") >= 0, true, "selected = [a1,b1]");
    });
  });

  T.test("TEST-43", "Battle 无 selection：明确失败，不自动选人", function (ctx) {
    return startCommittee(ctx).then(function (r) {
      reachHuman(r.proto, r.m);
      var res = RT.submitHumanDecision(r.m, r.proto, { choice: "battle" });
      T.assert(res.ok, "battle 决策本身接受（进入 battle phase 时解析 selection 才失败）");
      T.assertEqual(r.m.status, "failed", "缺少 selection → failed");
      T.assertEqual(r.m.error.code, "RUNTIME_SELECTION_NOT_FOUND", "诊断码 RUNTIME_SELECTION_NOT_FOUND");
    });
  });

  /* ================= Actor Selector ================= */

  T.test("TEST-45", "participant_ids selector：只选显式列出的参与者", function (ctx) {
    var doc = mkProtocol("rt-pids", "p1", [
      mkPhase("p1", "agent_turn", act("participant_ids", { participant_ids: ["agent-a1"] }), "all_selected_respond", [tr("complete", "p2")]),
      mkPhase("p2", "agent_turn", act("all_advisors"), "all_selected_respond", [tr("complete", "$end")])
    ]);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, {
        meetingId: "t45",
        participants: [
          { participant_id: "agent-a1", role_class: "advisor", side_id: "A" },
          { participant_id: "agent-b2", role_class: "advisor", side_id: "B" }
        ]
      });
      RT.start(m, proto);
      T.assertEqual(m.pendingAction.requiredParticipantIds.length, 1, "只要求 agent-a1");
      T.assertEqual(m.pendingAction.requiredParticipantIds[0], "agent-a1", "显式参与者被选中");
      RT.submitResult(m, proto, { participant_id: "agent-a1", payload: {} });
      T.assertEqual(A.MeetingTurnSelector.phaseStatus(m, proto), "ready_to_advance", "a1 响应后 ready");
      T.assert(RT.advancePhase(m, proto).ok, "advance 成功");
      T.assertEqual(m.currentPhaseId, "p2", "advance 后进入 p2");
    });
  });

  T.test("TEST-46", "side selector：仅选择指定 Side", function (ctx) {
    var doc = mkProtocol("rt-side", "p1", [
      mkPhase("p1", "agent_turn", act("side", { side_id: "A" }), "all_selected_respond", [tr("complete", "$end")])
    ]);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, {
        meetingId: "t46",
        participants: [
          { participant_id: "agent-a1", role_class: "advisor", side_id: "A" },
          { participant_id: "agent-b1", role_class: "advisor", side_id: "B" }
        ]
      });
      RT.start(m, proto);
      T.assertEqual(m.pendingAction.requiredParticipantIds.length, 1, "Side A 仅 1 人");
      T.assertEqual(m.pendingAction.requiredParticipantIds[0], "agent-a1", "选中 A 侧");
    });
  });

  T.test("TEST-47", "role_class selector：正确选择 Role Class", function (ctx) {
    var doc = mkProtocol("rt-role", "p1", [
      mkPhase("p1", "agent_turn", act("role_class", { role_class: "advisor" }), "all_selected_respond", [tr("complete", "$end")])
    ]);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, {
        meetingId: "t47",
        participants: [
          { participant_id: "agent-a1", role_class: "advisor", side_id: "A" },
          { participant_id: "agent-b1", role_class: "advisor", side_id: "B" },
          { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null }
        ]
      });
      RT.start(m, proto);
      T.assertEqual(m.pendingAction.requiredParticipantIds.length, 2, "advisor 共 2 人");
      T.assert(m.pendingAction.requiredParticipantIds.indexOf("chair-secretary-1") < 0, "秘书不在 advisor 集合内");
    });
  });

  /* ================= System / $end ================= */

  T.test("TEST-48", "System Immediate：system phase 进入即自动完成并推进", function (ctx) {
    var doc = mkProtocol("rt-sys", "sys1", [
      mkPhase("sys1", "system", act("system"), "system_immediate", [tr("complete", "op1")]),
      mkPhase("op1", "agent_turn", act("all_advisors"), "all_selected_respond", [tr("complete", "$end")])
    ]);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, {
        meetingId: "t48",
        participants: [
          { participant_id: "agent-a1", role_class: "advisor", side_id: "A" },
          { participant_id: "agent-b1", role_class: "advisor", side_id: "B" }
        ]
      });
      RT.start(m, proto);
      T.assertEqual(m.currentPhaseId, "op1", "sys1 自动完成并推进到 op1");
      T.assertEqual(m.status, "running", "op1 为 running");
      T.assertEqual(m.pendingAction.requiredParticipantIds.length, 2, "op1 等待 advisors");
    });
  });

  T.test("TEST-49", "$end：system 直接到 $end 时会议 completed", function (ctx) {
    var doc = mkProtocol("rt-end", "sys1", [
      mkPhase("sys1", "system", act("system"), "system_immediate", [tr("complete", "$end")])
    ]);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, {
        meetingId: "t49",
        participants: [{ participant_id: "agent-x", role_class: "advisor", side_id: "A" }]
      });
      RT.start(m, proto);
      T.assertEqual(m.status, "completed", "直接 $end → completed");
      T.assertEqual(m.currentPhaseId, null, "currentPhaseId=null");
    });
  });

  /* ================= 歧义 / 安全阀 ================= */

  T.test("TEST-50", "Ambiguous Complete Transition：两条 complete 确定性失败", function (ctx) {
    var doc = mkProtocol("rt-amb", "p1", [
      mkPhase("p1", "agent_turn", act("all_advisors"), "all_selected_respond",
        [tr("complete", "p2"), tr("complete", "p3")]),
      mkPhase("p2", "agent_turn", act("all_advisors"), "all_selected_respond", [tr("complete", "$end")]),
      mkPhase("p3", "agent_turn", act("all_advisors"), "all_selected_respond", [tr("complete", "$end")])
    ]);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, {
        meetingId: "t50",
        participants: [
          { participant_id: "agent-a1", role_class: "advisor", side_id: "A" },
          { participant_id: "agent-b1", role_class: "advisor", side_id: "B" }
        ]
      });
      RT.start(m, proto);
      RT.submitResult(m, proto, { participant_id: "agent-a1", payload: {} });
      var res = RT.submitResult(m, proto, { participant_id: "agent-b1", payload: {} });
      T.assert(res.ok, "响应被接受（停在 READY_TO_ADVANCE）");
      var adv = RT.advancePhase(m, proto); /* 歧义在 advance 时解析 */
      T.assert(!adv.ok, "advance 返回 ok=false（歧义）");
      T.assertEqual(m.status, "failed", "歧义 transition → failed");
      T.assertEqual(m.error.code, "RUNTIME_AMBIGUOUS_TRANSITION", "诊断码 RUNTIME_AMBIGUOUS_TRANSITION");
    });
  });

  T.test("TEST-51", "Internal Step Limit：超长 system 链触发安全阀，不挂死", function (ctx) {
    var phases = [];
    var N = 1200;
    for (var i = 1; i <= N; i++) {
      var next = (i < N) ? ("sys" + (i + 1)) : "$end";
      phases.push(mkPhase("sys" + i, "system", act("system"), "system_immediate", [tr("complete", next)]));
    }
    var doc = mkProtocol("rt-steplimit", "sys1", phases);
    return availableFromDoc(doc, ctx).then(function (proto) {
      var m = FACTORY.createMeeting(proto, {
        meetingId: "t51",
        participants: [{ participant_id: "agent-x", role_class: "advisor", side_id: "A" }]
      });
      var res = RT.start(m, proto);
      T.assert(!res.ok || m.status === "failed", "start 在超步数后中止");
      T.assertEqual(m.status, "failed", "安全阀触发 → failed");
      T.assertEqual(m.error.code, "RUNTIME_STEP_LIMIT_EXCEEDED", "诊断码 RUNTIME_STEP_LIMIT_EXCEEDED");
    });
  });

  /* ================= 端到端 ================= */

  T.test("TEST-52", "E2E Finish 路径：opening→summary→critique→human finish→archive→completed", function (ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", ctx.validText)]).then(function (s) {
      var proto = s.registry.available[0];
      var m = FACTORY.createMeeting(proto, { meetingId: "t52", participants: committeeParticipants() });
      RT.start(m, proto);
      MOCK.runOnce(RT, m, proto); /* 递归模拟：opening→summary→critique→human-decision */
      T.assertEqual(m.status, "waiting_human", "模拟到 human-decision");
      var res = RT.submitHumanDecision(m, proto, { choice: "finish" });
      T.assert(res.ok, "finish 接受");
      T.assertEqual(m.status, "completed", "finish→archive→$end→completed");
      T.assertEqual(m.currentPhaseId, null, "currentPhaseId=null");
    });
  });

  T.test("TEST-53", "E2E Continue+Battle：完整覆盖 Cycle / Human Gate / Battle / $end", function (ctx) {
    return F.buildSession([F.schemaEntry(ctx.schemaText), F.protocolEntry("committee", ctx.validText)]).then(function (s) {
      var proto = s.registry.available[0];
      var m = FACTORY.createMeeting(proto, { meetingId: "t53", participants: committeeParticipants() });
      RT.start(m, proto);
      MOCK.runOnce(RT, m, proto); /* opening */
      MOCK.runOnce(RT, m, proto); /* summary */
      MOCK.runOnce(RT, m, proto); /* critique → human-decision #1 */
      RT.submitHumanDecision(m, proto, { choice: "continue" });
      T.assertEqual(m.currentPhaseId, "critique", "continue→critique");
      MOCK.runOnce(RT, m, proto); /* critique → human-decision #2 */
      m.stateData.battle_participants = ["agent-a1", "agent-b1"];
      RT.submitHumanDecision(m, proto, { choice: "battle" });
      T.assertEqual(m.currentPhaseId, "battle", "battle phase");
      MOCK.runOnce(RT, m, proto); /* battle → human-decision #3 */
      var res = RT.submitHumanDecision(m, proto, { choice: "finish" });
      T.assert(res.ok, "finish 接受");
      T.assertEqual(m.status, "completed", "battle→human→finish→completed");
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
