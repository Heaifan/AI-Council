/* AI Council v0.1 — 开发验证台接线用例（建于 D2-F1，D3 沿用；TEST-129..144）。
 *
 * 本组测试守三条底线：
 *  1. Role ≠ Participant ≠ Model —— Compiler 的可选对象只能来自 meeting.participants[]。
 *  2. 「执行下一步 Mock」只消费一个确定性步骤，绝不自动越过 Human Gate。
 *  3. 界面上能点到的每一条链路（Protocols → Meeting → Compiler → Prompt / Save / Load）都必须真的跑通。
 *
 * 所有断言只调用无 DOM 的 harness/* 流程层，与浏览器视图层共用同一份逻辑。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var STATUS = A.MeetingState.STATUS;
  var ACTION = A.MeetingAction.ACTION;

  var ASSET_ENTRIES = [
    ["schema/schemas/protocol.schema.json", "schemaText"],
    ["schema/schemas/meeting.schema.json", "meetingSchemaText"],
    ["schema/schemas/role.schema.json", "roleSchemaText"],
    ["schema/schemas/message.schema.json", "messageSchemaText"],
    ["schema/schemas/artifact.schema.json", "artifactSchemaText"],
    ["schema/schemas/annotation.schema.json", "annotationSchemaText"],
    ["schema/schemas/instruction-packet.schema.json", "instructionPacketSchemaText"],
    ["roles/advisor.json", "roleCardAdvisorText"],
    ["roles/chair-secretary.json", "roleCardChairSecretaryText"],
    ["roles/risk-challenger.json", "roleCardRiskChallengerText"],
    ["roles/strategic-advocate.json", "roleCardStrategicAdvocateText"]
  ];

  /* 完整模拟一次「用户选择 AI-Council/ 根目录」：Protocol + Schema Pack + Role Card 库一次性冻结。 */
  function openProject(ctx) {
    var entries = ASSET_ENTRIES.map(function (e) { return { path: e[0], text: ctx[e[1]] }; });
    entries.push({ path: "protocols/committee-mvp/protocol.json", text: ctx.validText });
    return A.FileSource.fromEntries(entries, "AI-Council").then(function (snapshot) {
      var session = A.ProtocolSession.initialize(snapshot);
      A.HarnessStore.setSession(snapshot, session);
      return A.HarnessStore.get();
    });
  }

  /* 完整模拟一次「点 Create Demo Meeting」。 */
  function openMeeting(ctx) {
    return openProject(ctx).then(function (state) {
      var proto = A.HarnessStore.availableProtocol("committee-mvp");
      var r = A.MeetingStepFlow.createDemo(proto, "harness-demo");
      T.assert(r.ok, "Create Demo 失败：" + r.message);
      A.HarnessStore.setMeeting(r.meeting, proto);
      return state;
    });
  }

  function stepUntil(state, phaseId, limit) {
    for (var i = 0; i < (limit || 12); i++) {
      if (state.meeting.currentPhaseId === phaseId && state.meeting.status === STATUS.WAITING_HUMAN) return true;
      var r = A.MeetingStepFlow.step(state.meeting, state.protocol);
      if (!r.ok) return state.meeting.currentPhaseId === phaseId;
    }
    return false;
  }

  T.test("TEST-129", "index.html 必须装配 D3 会议控制台全链路脚本、中文顶栏，且不得残留过期文案", function (ctx) {
    var html = (ctx.appSources || {})["app/index.html"];
    T.assert(typeof html === "string", "未采集到 app/index.html");
    [
      "js/instruction-compiler.js", "js/prompt-renderer.js", "js/role-card-registry.js",
      "js/instruction-packet-schema.js",
      "js/invocation/agent-web-relay-controller.js", "js/invocation/invocation-message-factory.js",
      "js/harness/harness-store.js", "js/harness/participant-binding.js",
      "js/harness/meeting-draft.js", "js/harness/relay-profiles.js",
      "js/harness/meeting-step-flow.js", "js/harness/relay-flow.js",
      "js/harness/compile-flow.js", "js/harness/archive-flow.js",
      "js/ui/ui-text.js",
      "js/ui/harness/meeting-actions.js", "js/ui/harness/web-relay-actions.js",
      "js/ui/harness/console-actions.js", "js/ui/harness/config-participant.js",
      "js/ui/harness/config-panel.js", "js/ui/harness/relay-verdict.js",
      "js/ui/harness/relay-panel.js", "js/ui/harness/status-panel.js",
      "js/ui/harness/project-bar.js",
      "js/ui/harness/compiler-packet-view.js", "js/ui/harness/compiler-view.js",
      "js/ui/harness/harness-shell.js"
    ].forEach(function (src) {
      T.assert(html.indexOf('src="' + src + '"') >= 0, "index.html 缺少脚本：" + src);
    });
    ["meeting-persistence-ui.js", "meeting-runtime-view.js", "web-relay-view.js"].forEach(function (dead) {
      T.assert(html.indexOf(dead) < 0, "index.html 不得再引用已删除的旧面板：" + dead);
    });
    T.assert(html.indexOf("AI 顾问委员会 · 开发验证台") >= 0, "顶部标题必须是中文「AI 顾问委员会 · 开发验证台」");
    T.assert(html.indexOf('class="badge">人工网页中继') >= 0, "顶部徽标必须是中文「人工网页中继」");
    T.assert(html.indexOf('id="runtime-status"') >= 0, "必须有与能力灯分开的独立「当前状态」行");
    ["D2-F1", "Developer Harness", "Integration Harness"].forEach(function (dead) {
      T.assert(html.indexOf(dead) < 0, "index.html 不得残留过期文案：" + dead);
    });
    ["tab-btn-protocols", "tab-btn-meeting", "tab-btn-compiler"].forEach(function (id) {
      T.assert(html.indexOf('id="' + id + '"') >= 0, "缺少 Tab 按钮：" + id);
    });
    T.assert(html.indexOf('id="project-bar"') >= 0, "必须有顶部项目条（目录压缩）");
    T.assert(html.indexOf('id="console"') >= 0, "必须有会议控制台三栏容器");
  });

  T.test("TEST-130", "选择目录后 Snapshot 同时冻结 Role Card 库 / Schema Pack / Packet Schema", function (ctx) {
    return openProject(ctx).then(function (state) {
      T.assert(Object.isFrozen(state.snapshot.assetFiles), "assetFiles 必须冻结（无热加载）");
      T.assertEqual(state.snapshot.assetFiles.length, ASSET_ENTRIES.length, "资产文件数");
      T.assertEqual(state.roleCards.length, 4, "Role Card 装载数量");
      T.assert(state.roleRegistry && state.roleRegistry.ok, "RoleCardRegistry 必须可用");
      T.assert(state.schemaPack && state.schemaPack.meeting && state.schemaPack.annotation, "Schema Pack 必须完整");
      T.assert(state.packetSchema && state.packetSchema.$id, "Packet Schema 必须装载");
      T.assertEqual(state.registry.counts.available, 1, "Available Protocol");
      T.assertEqual(state.meeting, null, "新 Session 不得残留旧会议");
    });
  });

  T.test("TEST-131", "没有 Meeting 时 Compiler Tab 必须禁用并要求先去 Meeting 页建会", function (ctx) {
    return openProject(ctx).then(function (state) {
      var gate = A.ParticipantBinding.compilerState(state.meeting);
      T.assertEqual(gate.enabled, false, "无 Meeting 时必须禁用");
      T.assert(gate.reason.indexOf("创建会议") >= 0, "禁用理由必须用中文指引去「会议」页建会：" + gate.reason);
      T.assertEqual(A.ParticipantBinding.options(state.meeting, state.roleRegistry, null).length, 0, "不得列出任何可选对象");
    });
  });

  T.test("TEST-132", "Create Demo Meeting 只创建并 start，必须停在 opening 且不预跑任何步骤", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      var s = A.MeetingStepFlow.summary(state.meeting);
      T.assertEqual(s.currentPhaseId, "opening", "必须停在首相位");
      T.assertEqual(s.status, STATUS.RUNNING, "状态");
      T.assertEqual(s.pending.type, ACTION.COLLECT_RESPONSES, "Pending Action 类型");
      T.assertEqual(s.pending.received.length, 0, "绝不允许预跑：Received 必须为 0");
      T.assertEqual(s.pending.required.join(","), "agent-a1,agent-b1", "opening 目标 = 全部 advisor");
      T.assertEqual(s.protocol, "committee-mvp@0.1.0", "Protocol 摘要");
    });
  });

  T.test("TEST-133", "Participant 下拉严格来自 meeting.participants[]，不多不少", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      var opts = A.ParticipantBinding.options(state.meeting, state.roleRegistry, state.protocol);
      T.assertEqual(opts.length, state.meeting.participants.length, "选项数必须等于与会者数");
      T.assertEqual(opts.map(function (o) { return o.participant_id; }).join(","),
        "agent-a1,agent-b1,chair-secretary-1", "选项 id 与顺序必须与 participants[] 一致");
      T.assertEqual(opts[0].label, "A1 · 战略支持方", "标签应为 别名 · 角色名");
      T.assertEqual(A.ParticipantBinding.defaultParticipantId(opts), "agent-a1", "默认选中本阶段目标的第一位");
    });
  });

  T.test("TEST-134", "下拉必须标注当前 Phase 的 actor 目标，Chair 在 opening 不是目标", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      var opts = A.ParticipantBinding.options(state.meeting, state.roleRegistry, state.protocol);
      var byId = {};
      opts.forEach(function (o) { byId[o.participant_id] = o; });
      T.assertEqual(byId["agent-a1"].targeted, true, "A1 应是 opening 的目标");
      T.assertEqual(byId["agent-b1"].targeted, true, "B1 应是 opening 的目标");
      T.assertEqual(byId["chair-secretary-1"].targeted, false, "Chair 不是 opening 的目标");
      T.assertEqual(A.ParticipantBinding.targetedIds(state.protocol, state.meeting).join(","),
        "agent-a1,agent-b1", "targetedIds 必须复用 Runtime 的确定性解析");
    });
  });

  T.test("TEST-135", "执行下一步 Mock 一次只消费一个步骤（Received 0→1，Phase 不变）", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      var r = A.MeetingStepFlow.step(state.meeting, state.protocol);
      T.assert(r.ok, "第一步应成功：" + r.message);
      T.assertEqual(r.participantId, "agent-a1", "必须按 required 顺序取第一个未响应者");
      var s = A.MeetingStepFlow.summary(state.meeting);
      T.assertEqual(s.currentPhaseId, "opening", "一步不得越过 Phase");
      T.assertEqual(s.pending.received.join(","), "agent-a1", "Received 必须只增加一个");
      T.assertEqual(s.pending.required.length - s.pending.received.length, 1, "仍有一位未响应");
    });
  });

  T.test("TEST-136", "响应收齐后才切换 Phase，且仍然一步一动（opening → summary → critique）", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      A.MeetingStepFlow.step(state.meeting, state.protocol);
      A.MeetingStepFlow.step(state.meeting, state.protocol);
      T.assertEqual(state.meeting.currentPhaseId, "summary", "收齐两位 advisor 后进入 summary");
      var s1 = A.MeetingStepFlow.summary(state.meeting);
      T.assertEqual(s1.pending.required.join(","), "chair-secretary-1", "summary 目标 = chair_secretary");
      T.assertEqual(s1.pending.received.length, 0, "进入新 Phase 后不得自动预跑");
      A.MeetingStepFlow.step(state.meeting, state.protocol);
      T.assertEqual(state.meeting.currentPhaseId, "critique", "秘书总结完成后进入 critique");
      T.assertEqual(A.MeetingStepFlow.summary(state.meeting).pending.received.length, 0, "critique 同样不预跑");
    });
  });

  T.test("TEST-137", "Mock 到达 Human Gate 后必须停手，绝不代替人类决策", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      T.assert(stepUntil(state, "human-decision"), "应能一步步走到 human-decision");
      T.assertEqual(state.meeting.status, STATUS.WAITING_HUMAN, "状态必须是 waiting_human");
      var r = A.MeetingStepFlow.step(state.meeting, state.protocol);
      T.assertEqual(r.ok, false, "Human Gate 上 Mock 必须失败");
      T.assertEqual(r.reason, "human_gate", "失败原因必须是 human_gate");
      T.assertEqual(state.meeting.currentPhaseId, "human-decision", "会议不得被 Mock 推走");
      T.assert(r.message.indexOf("Finish") >= 0, "提示必须引导人工点击：" + r.message);
    });
  });

  T.test("TEST-138", "Human Gate 只开放 finish / continue / battle，非法 choice 被拒且状态不变", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      T.assert(stepUntil(state, "human-decision"), "应走到 human-decision");
      var gate = A.MeetingStepFlow.humanGateState(state.meeting);
      T.assertEqual(gate.enabled, true, "Human Gate 按钮应启用");
      T.assertEqual(gate.choices.slice().sort().join(","), "battle,continue,finish", "三选一");
      var bad = A.MeetingStepFlow.decide(state.meeting, state.protocol, "surrender");
      T.assertEqual(bad.ok, false, "非法 choice 必须被拒绝");
      T.assertEqual(state.meeting.status, STATUS.WAITING_HUMAN, "被拒后必须仍停在 Human Gate");
      T.assertEqual(state.meeting.currentPhaseId, "human-decision", "被拒后 Phase 不得改变");
    });
  });

  T.test("TEST-139", "人工点 Battle 进入 battle 相位，Battle 参与者确定性且如实告知", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      T.assert(stepUntil(state, "human-decision"), "应走到 human-decision");
      var r = A.MeetingStepFlow.decide(state.meeting, state.protocol, "battle");
      T.assert(r.ok, "Battle 决策应成功：" + r.message);
      T.assertEqual(state.meeting.currentPhaseId, "battle", "必须进入 battle");
      T.assertEqual(state.meeting.stateData.battle_participants.join(","), "agent-a1,agent-b1", "确定性默认 = 全部 advisor 升序");
      T.assert(r.note && r.note.indexOf("agent-a1") >= 0, "必须如实告知 Battle 参与者：" + r.note);
      T.assertEqual(A.MeetingStepFlow.summary(state.meeting).pending.received.length, 0, "battle 相位不得预跑");
    });
  });

  T.test("TEST-140", "人工点 Finish 走向 archive 并终局 completed", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      T.assert(stepUntil(state, "human-decision"), "应走到 human-decision");
      var r = A.MeetingStepFlow.decide(state.meeting, state.protocol, "finish");
      T.assert(r.ok, "Finish 决策应成功：" + r.message);
      T.assertEqual(state.meeting.status, STATUS.COMPLETED, "archive 为 system 相位，应自动驱动到 $end");
      T.assertEqual(state.meeting.currentPhaseId, null, "终局无当前 Phase");
      var gate = A.ParticipantBinding.compilerState(state.meeting);
      T.assertEqual(gate.enabled, false, "会议结束后 Compiler 必须禁用，不得编译不存在的相位");
    });
  });

  T.test("TEST-141", "Compiler 端到端：编译通过 Packet Schema，并渲染出可复制的 Prompt", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      var res = A.CompileFlow.run({
        protocol: state.protocol, meeting: state.meeting, participantId: "agent-a1",
        roleRegistry: state.roleRegistry, packetSchema: state.packetSchema
      });
      T.assert(res.ok, "编译应成功：" + res.message);
      T.assertEqual(res.schemaCheck.checked, true, "必须真的做了 Packet Schema 校验");
      T.assertEqual(res.schemaCheck.ok, true, "Packet 必须通过 instruction-packet.schema.json");
      T.assertEqual(res.digest.phase, "opening（agent_turn）", "摘要 Phase");
      T.assertEqual(res.digest.role, "战略支持方（role_id=strategic-advocate）", "摘要 Role Card");
      T.assert(res.prompt.length > 200, "Rendered Prompt 不得为空壳（实际 " + res.prompt.length + " 字符）");
      T.assert(res.prompt.indexOf("战略支持方") >= 0, "Prompt 必须包含角色名");
      T.assert(res.raw.indexOf('"packet_id"') >= 0, "Raw JSON 必须可查看");
    });
  });

  T.test("TEST-142", "切换 Participant 必须重新编译出不同产物，重复编译必须完全一致", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      function compile(pid) {
        return A.CompileFlow.run({
          protocol: state.protocol, meeting: state.meeting, participantId: pid,
          roleRegistry: state.roleRegistry, packetSchema: state.packetSchema
        });
      }
      var a1 = compile("agent-a1"), b1 = compile("agent-b1"), a1again = compile("agent-a1");
      T.assert(a1.ok && b1.ok, "两位 advisor 都应编译成功");
      T.assert(a1.packet.packet_id !== b1.packet.packet_id, "不同 Participant 的 packet_id 必须不同");
      T.assert(a1.prompt !== b1.prompt, "不同 Participant 的 Prompt 必须不同");
      T.assert(b1.prompt.indexOf("风险挑战方") >= 0, "B1 的 Prompt 必须用 B1 的角色卡");
      T.assertEqual(a1again.packet.packet_id, a1.packet.packet_id, "同输入必须内容寻址到同一 packet_id");
      T.assertEqual(a1again.prompt, a1.prompt, "同输入必须渲染出完全相同的 Prompt");
    });
  });

  T.test("TEST-143", "Role ≠ Participant：可选对象只来自会议，role_id 命中优先、role_class 才回退", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      T.assertEqual(state.roleCards.length, 4, "roles/ 有 4 张卡");
      var opts = A.ParticipantBinding.options(state.meeting, state.roleRegistry, state.protocol);
      T.assertEqual(opts.length, 3, "但可选对象只有 3 个与会者——绝不把 Role Card 当 Agent");
      var byId = {};
      opts.forEach(function (o) { byId[o.participant_id] = o; });
      T.assertEqual(byId["agent-a1"].resolved_by, "role_id", "A1 声明的 role_id 命中，必须走精确解析");
      T.assertEqual(byId["agent-a1"].role_id, "strategic-advocate", "A1 的 Role Card");
      T.assertEqual(byId["chair-secretary-1"].declared_role_id, "neutral-chair-secretary", "Chair 声明了一个不存在的 role_id");
      T.assertEqual(byId["chair-secretary-1"].resolved_by, "role_class", "未命中时必须按 role_class 确定性回退");
      T.assertEqual(byId["chair-secretary-1"].role_id, "chair-secretary-base", "回退结果必须可复现");
      var ids = state.roleCards.map(function (c) { return c.role_id; });
      T.assert(ids.indexOf("advisor-base") >= 0, "advisor-base 存在于 Role 库，但不得出现在可选对象里");
      T.assert(opts.every(function (o) { return o.role_id !== "advisor-base"; }), "没有任何与会者应被解析成 advisor-base");
    });
  });

  T.test("TEST-144", "Save / Load 往返：存档通过 meeting.schema，恢复后状态与相位完全一致", function (ctx) {
    return openMeeting(ctx).then(function (state) {
      A.MeetingStepFlow.step(state.meeting, state.protocol);
      A.MeetingStepFlow.step(state.meeting, state.protocol);
      var before = A.MeetingStepFlow.summary(state.meeting);
      return A.ArchiveFlow.buildArchive(state.meeting, state.protocol, state.schemaPack).then(function (saved) {
        T.assert(saved.ok, "存档构建应成功：" + saved.message);
        var text = A.MeetingPersistence.serialize(saved.archive);
        return A.ArchiveFlow.restoreFrom(text, state.schemaPack, state.registry.available).then(function (r) {
          T.assert(r.ok, "恢复应成功：" + r.message);
          var after = A.MeetingStepFlow.summary(r.meeting);
          T.assertEqual(after.status, before.status, "status 必须一致");
          T.assertEqual(after.currentPhaseId, before.currentPhaseId, "currentPhaseId 必须一致");
          T.assertEqual(after.events, before.events, "Events 必须一致");
          T.assertEqual(after.pending.received.join(","), before.pending.received.join(","), "Received 必须一致");
          T.assert(r.protocol && r.protocol.protocolId === "committee-mvp", "必须绑回同一 Protocol");
        });
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
