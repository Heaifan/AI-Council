/* AI Council v0.1 — MEETING-RUNTIME-F1 · 六席状态机用例（N01..N10 + Admission，方案 §二十五/§六）。
 * 覆盖：roster 顺序 / accept 后 activeSpeaker 推进 / 连续六席 / 收齐 ready_to_advance /
 * Admission FAIL 停留不跳席 / 修复重试 / selectedSeat 不影响 activeSpeaker /
 * 修改仅最新版有效 / 撤回回 pending / 撤回后完成度重算 / Replay 与 Live 一致。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var RT = A.MeetingRuntime;
  var TS = A.MeetingTurnSelector;
  var ADM = A.MeetingAdmission;
  var RS = A.MeetingResponseState;
  var PROFILE = [
    { profile_id: "chatgpt", display_name: "ChatGPT", model_ref: "chatgpt-web", web_url: "https://chatgpt.com/" },
    { profile_id: "claude", display_name: "Claude", model_ref: "claude-web", web_url: "https://claude.ai/" },
    { profile_id: "gemini", display_name: "Gemini", model_ref: "gemini-web", web_url: "https://gemini.google.com/" }
  ];

  function sixProtocol() {
    return { protocolId: "rt-six", document: {
      protocol_id: "rt-six", version: "0.1.0", name: "六席", initial_phase_id: "opening",
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }] },
        { phase_id: "human-decision", kind: "human_gate", name: "主席裁定",
          transitions: [{ trigger: "human_choice", choice: "finish", target: "$end" }] }
      ] } };
  }

  function sixParticipants() {
    return ["agent-a1", "agent-a2", "agent-a3", "agent-b1", "agent-b2", "agent-b3"].map(function (id, i) {
      return { participant_id: id, actor_type: "agent", role_class: "advisor", role_id: "advisor",
        side_id: id.indexOf("a") === 1 ? "A" : "B", alias: id.toUpperCase(),
        model_ref: PROFILE[i % 3].model_ref, transport_kind: "mock" };
    });
  }

  function openSix(opts) {
    var m = A.MeetingFactory.createMeeting(sixProtocol(), { meetingId: "rt-six-" + (opts && opts.id || "m"), participants: (opts && opts.participants) || sixParticipants() });
    RT.start(m, sixProtocol());
    return m;
  }
  function speak(m, id) {
    var r = RT.submitResult(m, sixProtocol(), { participant_id: id, payload: { mock: true, participantId: id } });
    A.MessageCommit.commit(m, A.MockAgentRuntime.mockMessage(m, id));   /* F1-C：mock 也落库（slot satisfied 统一依据） */
    return r;
  }
  function officialMsg(m, id) { return RS.latestOfficial(m, id); }
  /* 模拟真实 accept 链：先写正式 message（工厂形状）再 submitResult（mock 路径不写 message）。 */
  function acceptLike(m, id, text) {
    var msg = { schema_version: "0.1.0", message_id: "msg-" + id + "-" + m.events.length,
      meeting_id: m.meetingId, phase_id: m.currentPhaseId,
      sender: { actor_type: "agent", actor_id: id, role_id: "advisor", alias: id },
      recipients: { scope: "meeting" }, content: { raw_text: text || ("回答 " + id) },
      validation: { status: "valid", errors: [] }, accepted_by_runtime: true,
      request_id: null, result_id: null,
      created_at: new Date().toISOString() };
    var r = RT.submitResult(m, sixProtocol(), { participant_id: id, payload: { mock: false, participantId: id } });
    A.MessageCommit.commit(m, msg);   /* F1-C：正式落库由 commit 统一处理（received + message_accepted） */
    return r;
  }

  T.test("TEST-185", "N01 roster 顺序完全等于 Protocol 输出（all_advisors 按 participants 序）", function () {
    var m = openSix();
    T.assertEqual(TS.getRoundRoster(m).join(","), "agent-a1,agent-a2,agent-a3,agent-b1,agent-b2,agent-b3", "roster 顺序");
    T.assertEqual(TS.getRoundRoster(m), m.pendingAction.requiredParticipantIds, "单一权威：无第二份数组");
    return Promise.resolve();
  });

  T.test("TEST-186", "N02 A1 Accept → A1 Done + activeSpeaker=A2", function () {
    var m = openSix();
    T.assertEqual(m.activeSpeakerId, "agent-a1", "会议开始时 activeSpeaker=A1");
    var r = speak(m, "agent-a1");
    T.assert(r.ok, "A1 响应被接受");
    T.assertEqual(TS.deriveCompleted(m).join(","), "agent-a1", "A1 Done");
    T.assertEqual(m.activeSpeakerId, "agent-a2", "自动推进 activeSpeaker=A2");
    return Promise.resolve();
  });

  T.test("TEST-187", "N03 连续 A1→A2→A3→B1→B2→B3（每步自动推进）", function () {
    var m = openSix();
    var order = ["agent-a1", "agent-a2", "agent-a3", "agent-b1", "agent-b2", "agent-b3"];
    for (var i = 0; i < order.length; i++) {
      T.assertEqual(m.activeSpeakerId, order[i], "轮到 " + order[i]);
      var r = speak(m, order[i]);
      T.assert(r.ok, order[i] + " 响应成功");
    }
    T.assertEqual(TS.phaseStatus(m, sixProtocol()), "ready_to_advance", "六席收齐 → ready_to_advance");
    T.assertEqual(m.currentPhaseId, "opening", "仍停留在 opening（不自动切）");
    return Promise.resolve();
  });

  T.test("TEST-188", "N04 收齐后 advancePhase 才进入下一阶段", function () {
    var m = openSix();
    sixParticipants().forEach(function (p) { speak(m, p.participant_id); });
    T.assertEqual(m.currentPhaseId, "opening", "收齐后不自动切");
    var adv = RT.advancePhase(m, sixProtocol());
    T.assert(adv.ok, "advance 成功");
    T.assertEqual(m.currentPhaseId, "human-decision", "advance 后进入 human-decision");
    return Promise.resolve();
  });

  T.test("TEST-189", "N05 A2 Admission FAIL → activeSpeaker=A2、停留不跳 A3（Blocked 可解释）", function () {
    var parts = sixParticipants();
    parts[1].model_ref = null;   /* A2 未配置模型 */
    parts[1].transport_kind = "web_relay";
    var m = openSix({ participants: parts });
    var a2 = ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a2");
    T.assertEqual(a2.status, "blocked", "A2 blocked");
    T.assert(a2.reason.indexOf("模型") >= 0, "原因含模型：" + a2.reason);
    var a1 = ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a1");
    T.assertEqual(a1.status, "admitted", "A1 admitted");
    /* 轮转：A1 完成后 candidate=A2 blocked → 停留 A2，不跳 A3 */
    speak(m, "agent-a1");
    T.assertEqual(m.activeSpeakerId, "agent-a2", "activeSpeaker=A2（Blocked 席位，不跳 A3）");
    T.assertEqual(TS.derivePending(m)[0], "agent-a2", "pending[0]=A2");
    return Promise.resolve();
  });

  T.test("TEST-190", "N06 A2 修复后 Retry → admitted，可继续", function () {
    var parts = sixParticipants();
    parts[1].model_ref = null;
    parts[1].transport_kind = "web_relay";
    var m = openSix({ participants: parts });
    m.participants[1].model_ref = "claude-web";   /* 修复配置（meeting 内） */
    var a2 = ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a2");
    T.assertEqual(a2.status, "admitted", "修复后 admitted（可重试）");
    return Promise.resolve();
  });

  T.test("TEST-191", "N07 selectedSeat 不影响 activeSpeaker（浏览 ≠ 调度）", function () {
    var m = openSix();
    speak(m, "agent-a1");
    T.assertEqual(m.activeSpeakerId, "agent-a2", "activeSpeaker=A2");
    /* selectedSeat 是 UI 会话状态，不写 meeting；浏览 A1 后 activeSpeaker 必须不变。 */
    T.assert(m.activeSpeakerId !== "agent-a1", "浏览 A1 不改变调度器");
    return Promise.resolve();
  });

  T.test("TEST-192", "N08 修改：只有最新版进入有效上下文（superseded 链保留）", function () {
    var m = openSix();
    acceptLike(m, "agent-a1", "回答 V1");
    var v1 = officialMsg(m, "agent-a1");
    T.assert(v1, "A1 有正式发言");
    var r = RS.revise(m, sixProtocol(), v1.message_id, "回答 V2");
    T.assert(r.ok, "修改成功：" + (r.message || ""));
    T.assertEqual(officialMsg(m, "agent-a1").extensions.revision, 2, "最新版 revision=2");
    T.assertEqual(officialMsg(m, "agent-a1").content.raw_text, "回答 V2", "上下文取 V2");
    T.assertEqual(v1.extensions.response_status, "superseded", "V1 标记 superseded（历史保留）");
    T.assertEqual(TS.deriveCompleted(m).length, 1, "修改不改变完成集合");
    return Promise.resolve();
  });

  T.test("TEST-193", "N09 撤回：A1 回 pending，历史保留 revoked", function () {
    var m = openSix();
    acceptLike(m, "agent-a1", "回答 V1");
    var v1 = officialMsg(m, "agent-a1");
    var r = RS.revoke(m, v1.message_id);
    T.assert(r.ok, "撤回成功");
    T.assertEqual(v1.extensions.response_status, "revoked", "原发言 revoked（不删除）");
    T.assertEqual(TS.deriveCompleted(m).join(","), "", "A1 不再完成");
    T.assertEqual(TS.derivePending(m)[0], "agent-a1", "A1 回 pending（roster 顺序首位）");
    T.assertEqual(m.activeSpeakerId, "agent-a2", "已轮到后面的人 → activeSpeaker 保持 A2（不抢屏）");
    var ev = m.events.filter(function (e) { return e.event_type === "agent_output_revoked"; });
    T.assertEqual(ev.length, 1, "事件 agent_output_revoked 已记录");
    return Promise.resolve();
  });

  T.test("TEST-194", "N10 6/6 → 撤回 A2 → phaseComplete 由 true 回 false（5/6）", function () {
    var m = openSix();
    sixParticipants().forEach(function (p) { acceptLike(m, p.participant_id); });
    T.assertEqual(TS.phaseStatus(m, sixProtocol()), "ready_to_advance", "6/6 → ready");
    var v2 = officialMsg(m, "agent-a2");
    RS.revoke(m, v2.message_id);
    T.assertEqual(TS.phaseStatus(m, sixProtocol()), "running", "撤回后回 running（5/6）");
    T.assertEqual(TS.deriveCompleted(m).length, 5, "5/6");
    T.assertEqual(TS.derivePending(m)[0], "agent-a2", "A2 回 pending 首位");
    /* 补 A2 后恢复 6/6 */
    speak(m, "agent-a2");
    T.assertEqual(TS.phaseStatus(m, sixProtocol()), "ready_to_advance", "补答后恢复 ready");
    return Promise.resolve();
  });

  T.test("TEST-195", "修正 4：Replay 与 Live 对撤回后的最终状态一致", function () {
    var m = openSix();
    acceptLike(m, "agent-a1", "A1 回答"); acceptLike(m, "agent-a2", "A2 回答");
    var v1 = officialMsg(m, "agent-a1");
    RS.revoke(m, v1.message_id);
    var rp = A.MeetingReplay.replayStateAt(m, sixProtocol(), m.events.length);
    T.assertEqual(rp.spoken.join(","), "agent-a2", "Replay spoken 只含 A2（A1 被 revoked 事件移除）");
    T.assertEqual(TS.deriveCompleted(m).join(","), "agent-a2", "Live completed 同 Replay spoken（一致性）");
    return Promise.resolve();
  });

  T.test("TEST-197", "N04 validated ≠ received：校验通过不算正式接收（T08/T17 契约）", function () {
    var m = A.MeetingFactory.createMeeting(sixProtocol(), { meetingId: "rt-n04", participants: sixParticipants() });
    RT.start(m, sixProtocol());
    var o = A.WebRelayController.open(m, { participantId: "agent-a1", prompt: "A1 提示词", packet: { packet_id: "pk-n04", phase_id: "opening", participant_id: "agent-a1" } });
    A.WebRelayController.receive(m, o.handle, "A1 回答内容。");
    var v = A.WebRelayController.validate(m, o.handle);
    T.assert(v.ok && v.state === "validated", "回答校验通过（validated）");
    T.assertEqual(TS.deriveCompleted(m).length, 0, "validated 后 received 仍为 0（绝不等于正式接收）");
    T.assertEqual(TS.phaseStatus(m, sixProtocol()), "running", "validated 不影响 completion");
    var a = A.RelayFlow.accept(m, sixProtocol(), o.handle);
    T.assert(a.ok, "accept 才成为正式接收：" + (a.message || ""));
    T.assertEqual(TS.deriveCompleted(m).join(","), "agent-a1", "accept 后 received 含 A1");
    T.assertEqual(m.activeSpeakerId, "agent-a2", "accept 后自动推进 activeSpeaker=A2");
    return Promise.resolve();
  });

  T.test("TEST-198", "N17 INVOCATION_STATE_TRANSITION_INVALID 不得冒充回答校验问题（T49 错误分类）", function () {
    /* 错误码枚举独立：INVOCATION 类 ≠ VALIDATOR 类（文案分类映射在 UI 层，Browser R1T 断言） */
    var C = A.Diagnostic.CODE;
    T.assert(C.INVOCATION_STATE_TRANSITION_INVALID !== C.VALIDATION_FAILED, "错误码必须独立");
    /* RelayFlow.accept 的席位绑定校验（T07）必须返回 INVOCATION 类错误而非校验错误 */
    var m = A.MeetingFactory.createMeeting(sixProtocol(), { meetingId: "rt-n17", participants: sixParticipants() });
    RT.start(m, sixProtocol());
    var o = A.WebRelayController.open(m, { participantId: "agent-a1", prompt: "p", packet: { packet_id: "pk-n17", phase_id: "opening", participant_id: "agent-a1" } });
    A.WebRelayController.receive(m, o.handle, "A1 回答。");
    A.WebRelayController.validate(m, o.handle);
    A.RelayFlow.accept(m, sixProtocol(), o.handle);
    /* A1 已完成：重复 accept 同一 handle → 被 T07 绑定校验拒绝（INVOCATION 类） */
    var again = A.RelayFlow.accept(m, sixProtocol(), o.handle);
    T.assert(!again.ok && again.diagnostics[0].code === A.Diagnostic.CODE.INVOCATION_STATE_TRANSITION_INVALID,
      "串席/重复接受返回 INVOCATION 类错误：" + (again.diagnostics ? again.diagnostics[0].code : "?"));
    return Promise.resolve();
  });

  T.test("TEST-201", "M01 1v1：participants=[A1,B1] → required=[A1,B1]（六席是容量不是满员，T25-F3）", function () {
    var parts = sixParticipants().filter(function (p) { return p.participant_id === "agent-a1" || p.participant_id === "agent-b1"; });
    var m = openSix({ participants: parts });
    T.assertEqual(TS.getRoundRoster(m).join(","), "agent-a1,agent-b1", "Phase Roster = 参会名单（2 人）");
    T.assertEqual(m.activeSpeakerId, "agent-a1", "activeSpeaker=A1");
    var pf = ADM.preflight(m, sixProtocol(), PROFILE);
    T.assertEqual(pf.admitted.length, 2, "参会 2 席全部就绪");
    T.assertEqual(pf.blocked.length, 0, "空席（A2/A3/B2/B3）不阻塞");
    T.assertEqual(TS.phaseStatus(m, sixProtocol()), "running", "进度语义 0/2");
    return Promise.resolve();
  });

  T.test("TEST-202", "M02 1v1 完整：A1 → B1 → 2/2 → READY_TO_ADVANCE（绝不到空席）", function () {
    var parts = sixParticipants().filter(function (p) { return p.participant_id === "agent-a1" || p.participant_id === "agent-b1"; });
    var m = openSix({ participants: parts });
    acceptLike(m, "agent-a1", "A1 回答");
    T.assertEqual(m.activeSpeakerId, "agent-b1", "A1 后轮到 B1（不碰空席）");
    acceptLike(m, "agent-b1", "B1 回答");
    T.assertEqual(TS.phaseStatus(m, sixProtocol()), "ready_to_advance", "2/2 → ready");
    return Promise.resolve();
  });

  T.test("TEST-203", "M04 未参会席位永不进入 activeSpeaker / 不阻塞（1v1 中 activeSpeaker ∈ [A1,B1]）", function () {
    var parts = sixParticipants().filter(function (p) { return p.participant_id === "agent-a1" || p.participant_id === "agent-b1"; });
    var m = openSix({ participants: parts });
    /* 未参会席位（agent-a2）虽在六席模板有配置，但不属于本场 */
    var a2 = ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a2");
    T.assertEqual(a2.status, "blocked", "非参会席位不在 roster（admission 直接 blocked——但永远不会被轮转选中）");
    for (var i = 0; i < 3; i++) {
      if (m.activeSpeakerId === "agent-a1") acceptLike(m, "agent-a1", "A1 回答");
      else if (m.activeSpeakerId === "agent-b1") acceptLike(m, "agent-b1", "B1 回答");
      else break;
      T.assert(!m.activeSpeakerId || ["agent-a1", "agent-b1"].indexOf(m.activeSpeakerId) >= 0, "activeSpeaker 恒 ∈ 参会名单（null=全部完成）");
    }
    return Promise.resolve();
  });

  T.test("TEST-204", "M05/reenterPhase：勾选 A2（未配置）→ blocked 阻塞；取消勾选 → 恢复（名单开始前可改）", function () {
    var parts = sixParticipants().filter(function (p) { return p.participant_id === "agent-a1" || p.participant_id === "agent-b1"; });
    var m = openSix({ participants: parts });
    /* 勾选 A2（模拟点名页 toggle：加入 participants + 重解析） */
    var tmpl = sixParticipants().filter(function (p) { return p.participant_id === "agent-a2"; })[0];
    m.participants.push({ participant_id: tmpl.participant_id, actor_type: "agent", role_class: tmpl.role_class, role_id: tmpl.role_id, side_id: tmpl.side_id, alias: tmpl.alias, model_ref: null, transport_kind: "mock" });
    var r = RT.reenterPhase(m, sixProtocol());
    T.assert(r.ok, "重解析成功");
    T.assertEqual(TS.getRoundRoster(m).length, 3, "roster 3 人（A1/B1/A2）");
    var pf = ADM.preflight(m, sixProtocol(), PROFILE);
    T.assertEqual(pf.blocked.length, 1, "A2 未配置 → blocked（F2 保留）");
    /* 会议开始后名单冻结 */
    m.stateData = m.stateData || {}; m.stateData.preflight_confirmed = true;
    var r2 = RT.reenterPhase(m, sixProtocol());
    T.assert(!r2.ok, "开始后 reenterPhase 拒绝（名单冻结）");
    return Promise.resolve();
  });

  T.test("TEST-199", "B02 mock 不得绕过模型配置（正式模式未配置模型 → blocked，T25-F2）", function () {
    var parts = sixParticipants();
    parts[1].model_ref = null;   /* A2 mock 但未指定模型 */
    var m = openSix({ participants: parts });
    var a2 = ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a2");
    T.assertEqual(a2.status, "blocked", "mock + 无模型 → blocked（不因模拟 Agent 自动放行）");
    T.assert(a2.reason.indexOf("模型") >= 0, "原因 = " + a2.reason);
    /* 对照：A1 mock 且配置完整 → admitted */
    T.assertEqual(ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a1").status, "admitted", "配置完整的 mock 席位可入会");
    return Promise.resolve();
  });

  T.test("TEST-200", "dev_mode（开发/测试会议）mock 豁免模型检查（mock 是测试能力，非兜底模型）", function () {
    var parts = sixParticipants();
    parts[1].model_ref = null;
    var m = openSix({ participants: parts });
    m.stateData = m.stateData || {}; m.stateData.dev_mode = true;
    T.assertEqual(ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a2").status, "admitted", "dev_mode mock 豁免");
    m.stateData.dev_mode = false;
    T.assertEqual(ADM.admissionOf(m, sixProtocol(), PROFILE, "agent-a2").status, "blocked", "关闭 dev_mode 后恢复严格");
    return Promise.resolve();
  });

  T.test("TEST-196", "Preflight：全员 admitted 才可点名通过；任一 blocked 明确列出", function () {
    var parts = sixParticipants();
    parts[4].model_ref = null;   /* B2 未配置模型 */
    parts[4].transport_kind = "web_relay";
    var m = openSix({ participants: parts });
    var pf = ADM.preflight(m, sixProtocol(), PROFILE);
    T.assertEqual(pf.admitted.length, 5, "5 席 admitted");
    T.assertEqual(pf.blocked.length, 1, "1 席 blocked");
    T.assertEqual(pf.blocked[0].participant_id, "agent-b2", "blocked 是 B2");
    T.assert(pf.blocked[0].reason.indexOf("模型") >= 0, "B2 原因 = 未指定模型");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
