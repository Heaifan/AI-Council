/* AI Council v0.1 — MEETING-INTEGRITY-F1-C · Formal Message Commit（TEST-246..263，C01..C18）。
 * 核心：Runtime 只由正式 Message 满足 Slot 而推进（received = committed slots 维护）；
 *   commit 幂等（同 slot 同 message NO-OP / 不同 message 拒绝）；rejected 不进入 messages[]。
 * 事件链：agent_output_received → message_validated → message_accepted / message_rejected → phase_completed。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var RT = A.MeetingRuntime;
  var TS = A.MeetingTurnSelector;
  var MC = A.MessageCommit;

  var OPEN_SCHEMA = { type: "object", required: ["position", "reasons", "risks"],
    properties: { position: { type: "string" }, reasons: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } } }, additionalProperties: false };
  var GOOD = JSON.stringify({ position: "支持", reasons: ["理由一"], risks: ["风险一"] });

  function proto() {
    return { protocolId: "rt-f1c", document: {
      protocol_id: "rt-f1c", version: "0.1.0", name: "事实落库", initial_phase_id: "opening",
      required_roles: [{ role_class: "advisor", min_count: 2, max_count: 6 }],
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "$end" }],
          output_contract: { mode: "structured_json", json_schema: OPEN_SCHEMA } }
      ] } };
  }
  function parts() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "web_relay", model_ref: "claude-web" }
    ];
  }
  function openM() {
    var m = A.MeetingFactory.createMeeting(proto(), { meetingId: "rt-f1c-" + Date.now().toString(36), participants: parts() });
    RT.start(m, proto());
    return m;
  }
  function relayOpen(m, pid) {
    return A.RelayFlow.open(m, proto(), { participantId: pid, registry: { ok: true, findRole: function () { return null; } } });
  }
  function acceptValid(m, pid, raw) {
    var o = relayOpen(m, pid);
    A.RelayFlow.receive(m, o.handle, raw || GOOD);
    var chk = A.RelayFlow.validate(m, o.handle);
    T.assert(chk.ok, "validate 应通过：" + JSON.stringify(chk.checks));
    return A.RelayFlow.accept(m, proto(), o.handle);
  }
  function msgCount(m) { return (m.messages || []).length; }
  function acceptedEvents(m) { return (m.events || []).filter(function (e) { return e.event_type === "message_accepted"; }); }

  /* ============ A. Formal Commit ============ */
  T.test("TEST-246", "C01 valid JSON accept → 1 Formal Message", function () {
    var m = openM();
    var acc = acceptValid(m, "agent-a1");
    T.assert(acc.ok && acc.message, "accept 返回正式消息");
    T.assertEqual(msgCount(m), 1, "messages=1");
    T.assertEqual(m.pendingAction.receivedParticipantIds.join(","), "agent-a1", "received 由 commit 维护");
    return Promise.resolve();
  });

  T.test("TEST-247", "C02 valid text accept → 1 Formal Message（content_type=text）", function () {
    var p2 = proto();
    p2.document.phases[0].output_contract = { mode: "text", required_sections: [] };
    var m = A.MeetingFactory.createMeeting(p2, { meetingId: "rt-f1c-txt-" + Date.now().toString(36), participants: parts() });
    RT.start(m, p2);
    var o = A.RelayFlow.open(m, p2, { participantId: "agent-a1", registry: { ok: true, findRole: function () { return null; } } });
    A.RelayFlow.receive(m, o.handle, "建议：控制风险。");
    var chk = A.RelayFlow.validate(m, o.handle);
    T.assert(chk.ok, "text validate 应通过：" + JSON.stringify(chk.checks));
    var acc = A.RelayFlow.accept(m, p2, o.handle);
    T.assert(acc.ok, "accept 成功");
    T.assertEqual((m.messages || []).length, 1, "messages=1");
    T.assertEqual(m.messages[0].content.content_type, "text", "content_type=text");
    return Promise.resolve();
  });

  T.test("TEST-248", "C03 Message 保存 normalized_content（structured_output 非 null）", function () {
    var m = openM();
    acceptValid(m, "agent-a1");
    var msg = m.messages[0];
    T.assert(msg.content.structured_output !== null && msg.content.structured_output.position === "支持", "structured_output=解析对象");
    T.assert(msg.content.raw_text.indexOf("支持") >= 0, "raw_text=原文");
    T.assert(msg.accepted_by_runtime === true && msg.validation.status === "valid", "accepted+valid");
    return Promise.resolve();
  });

  T.test("TEST-249", "C04 Message 保存 request_id / result_id（provenance）", function () {
    var m = openM();
    acceptValid(m, "agent-a1");
    var msg = m.messages[0];
    T.assert(typeof msg.request_id === "string" && msg.request_id.length > 0, "request_id 存在");
    T.assert(typeof msg.result_id === "string" && msg.result_id.length > 0, "result_id 存在");
    var ev = acceptedEvents(m)[0];
    T.assert(ev.payload.request_id === msg.request_id && ev.payload.result_id === msg.result_id, "事件 provenance 一致");
    return Promise.resolve();
  });

  /* ============ B. Reject ============ */
  T.test("TEST-250", "C05 invalid JSON → messages length = 0", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    A.RelayFlow.receive(m, o.handle, "{bad json");
    A.RelayFlow.validate(m, o.handle);
    T.assertEqual(msgCount(m), 0, "messages=0");
    return Promise.resolve();
  });

  T.test("TEST-251", "C06 missing section → messages length = 0", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    A.RelayFlow.receive(m, o.handle, JSON.stringify({ position: "支持" }));
    A.RelayFlow.validate(m, o.handle);
    T.assertEqual(msgCount(m), 0, "messages=0");
    return Promise.resolve();
  });

  T.test("TEST-252", "C07 rejected result → message_rejected Event（可追溯）", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    A.RelayFlow.receive(m, o.handle, GOOD + "\n尾巴");
    A.RelayFlow.validate(m, o.handle);
    var evs = (m.events || []).filter(function (e) { return e.event_type === "message_rejected"; });
    T.assertEqual(evs.length, 1, "1 条 message_rejected");
    T.assert(evs[0].payload.participant_id === "agent-a1", "payload 含 participant");
    T.assert(evs[0].payload.request_id && evs[0].payload.result_id, "payload 含 request/result provenance");
    T.assert(evs[0].payload.validation && evs[0].payload.validation.parser_error, "payload 含拒绝原因");
    return Promise.resolve();
  });

  T.test("TEST-253", "C08 rejected participant remains pending", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    A.RelayFlow.receive(m, o.handle, "{bad");
    A.RelayFlow.validate(m, o.handle);
    T.assertEqual(m.pendingAction.receivedParticipantIds.length, 0, "received=0");
    T.assertEqual(TS.phaseStatus(m, proto()), "running", "phase running");
    return Promise.resolve();
  });

  /* ============ C. Advance Gate ============ */
  T.test("TEST-254", "C09 A1 committed / B1 pending → phase NOT complete", function () {
    var m = openM();
    acceptValid(m, "agent-a1");
    T.assertEqual(TS.phaseStatus(m, proto()), "running", "1/2 不完成");
    T.assert(m.pendingAction.receivedParticipantIds.length === 1, "received=1");
    return Promise.resolve();
  });

  T.test("TEST-255", "C10 A1 transport accepted but Message 未 commit → phase NOT complete", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    A.RelayFlow.receive(m, o.handle, GOOD);
    A.RelayFlow.validate(m, o.handle);
    var a = A.WebRelayController.accept(m, o.handle);
    var r = RT.submitResult(m, proto(), a.submission);   /* transport 已收，但不 commit */
    T.assert(r.ok, "transport 提交成功");
    T.assertEqual(msgCount(m), 0, "messages=0（未 commit）");
    T.assertEqual(m.pendingAction.receivedParticipantIds.length, 0, "received=0（旁路残留被堵死）");
    T.assertEqual(TS.phaseStatus(m, proto()), "running", "phase 不完成");
    return Promise.resolve();
  });

  T.test("TEST-256", "C11 A1+B1 Formal Message committed → phase complete", function () {
    var m = openM();
    acceptValid(m, "agent-a1");
    acceptValid(m, "agent-b1");
    T.assertEqual(TS.phaseStatus(m, proto()), "ready_to_advance", "2/2 → READY");
    T.assertEqual(msgCount(m), 2, "messages=2");
    return Promise.resolve();
  });

  T.test("TEST-257", "C12 phase_completed 晚于所有 required message_accepted", function () {
    var m = openM();
    acceptValid(m, "agent-a1");
    acceptValid(m, "agent-b1");
    T.assert(RT.advancePhase(m, proto()).ok, "advance");
    var evs = m.events || [];
    var lastAccepted = -1, completed = -1;
    evs.forEach(function (e, i) {
      if (e.event_type === "message_accepted") lastAccepted = i;
      if (e.event_type === "phase_completed") completed = i;
    });
    T.assert(completed > lastAccepted, "phase_completed seq > 最后 message_accepted seq");
    return Promise.resolve();
  });

  /* ============ D. Retry / Idempotency ============ */
  T.test("TEST-258", "C13 invalid A1 → no message；retry valid → exactly 1", function () {
    var m = openM();
    var o = relayOpen(m, "agent-a1");
    A.RelayFlow.receive(m, o.handle, "{bad");
    A.RelayFlow.validate(m, o.handle);
    T.assertEqual(msgCount(m), 0, "非法后 0 条");
    A.RelayFlow.retry(m, o.handle);
    A.RelayFlow.receive(m, o.handle, GOOD);
    var chk = A.RelayFlow.validate(m, o.handle);
    T.assert(chk.ok, "重试合法");
    A.RelayFlow.accept(m, proto(), o.handle);
    T.assertEqual(msgCount(m), 1, "恰好 1 条");
    return Promise.resolve();
  });

  T.test("TEST-259", "C14 accepted 后重放同一 message → still exactly 1（NO-OP）", function () {
    var m = openM();
    var acc = acceptValid(m, "agent-a1");
    var cm = MC.commit(m, acc.message);
    T.assert(cm.ok && cm.noop === true, "重放 → NO-OP");
    T.assertEqual(msgCount(m), 1, "仍 1 条");
    T.assertEqual(m.pendingAction.receivedParticipantIds.length, 1, "received 不重复");
    return Promise.resolve();
  });

  T.test("TEST-260", "C15 accepted 后不同 result 再提交同一 slot → 拒绝（不覆盖）", function () {
    var m = openM();
    var acc = acceptValid(m, "agent-a1");
    var other = JSON.parse(JSON.stringify(acc.message));
    other.message_id = "msg-other-" + m.events.length;
    other.content.raw_text = "不同内容";
    var cm = MC.commit(m, other);
    T.assert(!cm.ok && cm.code === MC.DUP_SLOT, "拒绝覆盖：" + cm.code);
    T.assertEqual(msgCount(m), 1, "正式事实不被覆盖");
    return Promise.resolve();
  });

  T.test("TEST-261", "C16 restore 后重复处理已 committed result → no duplicate", function () {
    var m = openM();
    var acc = acceptValid(m, "agent-a1");
    return A.MeetingArchive.build(m, proto()).then(function (archive) {
      T.assertEqual(archive.messages.length, 1, "存档含正式消息");
      var restored = A.MeetingRestore.restore(archive);
      var cm = MC.commit(restored, acc.message);   /* 恢复后重放同一 result */
      T.assert(cm.ok && cm.noop === true, "恢复后重放 → NO-OP");
      T.assertEqual((restored.messages || []).length, 1, "恢复后仍 1 条（不重复）");
      return Promise.resolve();
    });
  });

  /* ============ E. 完整会议 7 条（含一次 invalid summary） ============ */
  T.test("TEST-262", "C17 完整 7 条：Opening2+Summary1+Critique2+Battle2，invalid 尝试不进 messages", function () {
    var p = { protocolId: "rt-f1c7", document: {
      protocol_id: "rt-f1c7", version: "0.1.0", name: "七条", initial_phase_id: "opening",
      required_roles: [{ role_class: "advisor", min_count: 2, max_count: 6 }, { role_class: "chair_secretary", min_count: 1, max_count: 1 }],
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "summary" }],
          output_contract: { mode: "structured_json", json_schema: OPEN_SCHEMA } },
        { phase_id: "summary", kind: "secretary_summary", name: "秘书汇总", actor: { selector: "role_class", role_class: "chair_secretary" },
          completion: { mode: "secretary_respond" }, transitions: [{ trigger: "complete", target: "critique" }],
          output_contract: { mode: "structured_json", json_schema: { type: "object", required: ["supporting_points"], properties: { supporting_points: { type: "array", items: { type: "string" } } }, additionalProperties: false } } },
        { phase_id: "critique", kind: "critique", name: "全员挑刺", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }],
          output_contract: { mode: "structured_json", json_schema: { type: "object", required: ["challenges"], properties: { challenges: { type: "array", items: { type: "string" } } }, additionalProperties: false } } },
        { phase_id: "human-decision", kind: "human_gate", name: "主席裁定",
          transitions: [{ trigger: "human_choice", choice: "battle", target: "battle" }, { trigger: "human_choice", choice: "finish", target: "$end" }] },
        { phase_id: "battle", kind: "battle", name: "正反交锋", actor: { selector: "selected_participants", selection_key: "battle_participants" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }],
          output_contract: { mode: "text", required_sections: ["claim", "rebuttal", "remaining_uncertainty"] } }
      ] } };
    var pts = [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", transport_kind: "web_relay", model_ref: "claude-web" },
      { participant_id: "agent-a3", role_class: "chair_secretary", side_id: null, actor_type: "agent", alias: "A3", transport_kind: "web_relay", model_ref: "chatgpt-web" }
    ];
    var m = A.MeetingFactory.createMeeting(p, { meetingId: "rt-f1c7-" + Date.now().toString(36), participants: pts });
    RT.start(m, p);
    var opened = function (pid, raw) {
      var o = A.RelayFlow.open(m, p, { participantId: pid, registry: { ok: true, findRole: function () { return null; } } });
      A.RelayFlow.receive(m, o.handle, raw);
      return A.RelayFlow.validate(m, o.handle);
    };
    var acc7 = function (pid, raw) {
      var o = A.RelayFlow.open(m, p, { participantId: pid, registry: { ok: true, findRole: function () { return null; } } });
      A.RelayFlow.receive(m, o.handle, raw);
      var chk = A.RelayFlow.validate(m, o.handle);
      T.assert(chk.ok, pid + " validate 通过");
      return A.RelayFlow.accept(m, p, o.handle);
    };
    acc7("agent-a1", GOOD);
    acc7("agent-b1", GOOD);
    RT.advancePhase(m, p);
    T.assert(m.currentPhaseId === "summary", "进入 summary");
    /* 故意一次 invalid summary → message_rejected，不计数 */
    var chkBad = opened("agent-a3", '{"supporting_points":["x"]}\n\n这是我的总结。');
    T.assert(!chkBad.ok, "invalid summary 被拒");
    T.assertEqual(msgCount(m), 2, "invalid 后仍 2 条");
    acc7("agent-a3", '{"supporting_points":["自研理由充分"]}');
    T.assertEqual(msgCount(m), 3, "summary 落库 → 3 条");
    RT.advancePhase(m, p);
    T.assert(m.currentPhaseId === "critique", "进入 critique");
    acc7("agent-a1", '{"challenges":["成本被低估"]}');
    acc7("agent-b1", '{"challenges":["周期不可控"]}');
    RT.advancePhase(m, p);
    T.assert(m.currentPhaseId === "human-decision", "进入 human gate");
    m.stateData = m.stateData || {}; m.stateData.battle_participants = ["agent-a1", "agent-b1"];
    var dec = RT.submitHumanDecision(m, p, { choice: "battle" });
    T.assert(dec.ok, "battle");
    acc7("agent-a1", "claim\n自研可行。\n\nrebuttal\n对方低估成本。\n\nremaining_uncertainty\n周期未定。");
    acc7("agent-b1", "claim\n外购更稳。\n\nrebuttal\n自研锁死。\n\nremaining_uncertainty\n迁移成本未定。");
    T.assertEqual(msgCount(m), 7, "完整会议 messages = 7");
    T.assertEqual(acceptedEvents(m).length, 7, "message_accepted = 7");
    T.assertEqual((m.events || []).filter(function (e) { return e.event_type === "message_rejected"; }).length, 1, "message_rejected = 1（invalid 尝试）");
    T.assertEqual(TS.phaseStatus(m, p), "ready_to_advance", "battle 2/2 → READY");
    return Promise.resolve();
  });

  /* ============ F. Integrity Assert：phase_completed 时 ∀ required slots 有 accepted message ============ */
  T.test("TEST-263", "C18 完整性：phase_completed 发生时全部 required slot 均有正式消息", function () {
    var m = openM();
    acceptValid(m, "agent-a1");
    acceptValid(m, "agent-b1");
    RT.advancePhase(m, proto());
    var slots = {};
    (m.messages || []).forEach(function (msg) {
      var key = MC.slotKey(msg.phase_id, msg.sender.actor_id, MC.turnOf(msg));
      slots[key] = true;
    });
    var pa = m.pendingAction;
    if (pa && pa.requiredParticipantIds && pa.requiredParticipantIds.length) {
      var missing = pa.requiredParticipantIds.filter(function (pid) { return !slots[MC.slotKey(pa.phaseId, pid, 1)]; });
      T.assertEqual(missing.length, 0, "完成后无缺失 slot：" + missing.join(","));
    }
    T.assert(pa === null || pa.action_type === "await_human_decision" || pa.requiredParticipantIds.length === 0 ||
      pa.requiredParticipantIds.every(function (pid) { return slots[MC.slotKey(pa.phaseId, pid, 1)]; }),
      "advance 后无未满足的 required slot");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
