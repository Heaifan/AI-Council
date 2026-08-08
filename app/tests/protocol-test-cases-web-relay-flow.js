/* AI Council v0.1 — D3 · WEB_RELAY · WebRelayController 流程测试（WR-01..10）。无 DOM，直接驱动会议 Runtime。 */
(function (root) {
  "use strict";
  var A = root.AICouncil, T = A.TestSuite, C = A.Diagnostic.CODE, WC = A.WebRelayController, RT = A.MeetingRuntime;
  var PK = { packet_id: "pk-relay", phase_id: "p1", participant_id: "relay1" };
  function proto() {
    return { protocol_id: "proto-relay-flow", version: "0.1.0", name: "RelayFlow", initial_phase_id: "p1",
      phases: [{ phase_id: "p1", kind: "agent_turn", actor: { selector: "all_advisors" },
        completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "$end" }] }] };
  }
  function relay(id) { return { participant_id: "relay1", transport_kind: "web_relay", model_ref: "web-gpt", role_id: "advisor", role_class: "advisor", side_id: "s1", alias: "A1", actor_type: "agent" }; }
  function meet(id) { return A.MeetingFactory.createMeeting(proto(), { meetingId: id, participants: [relay(id)] }); }
  function open(m, prompt) { return WC.open(m, { participantId: "relay1", prompt: prompt, packet: PK }); }

  T.test("WR-01", "open→receive→validate(V01–V05 全过)→state=validated", function () {
    var m = meet("mtg-wr-01"); RT.start(m, proto());
    var o = open(m, "WR01 请给出建议"); T.assertEqual(o.state, "waiting_external", "begin 后 waiting_external");
    WC.receive(m, o.handle, "建议：控制风险敞口。");
    var v = WC.validate(m, o.handle);
    T.assert(v.ok, "validate 应通过：" + JSON.stringify(v.checks));
    T.assertEqual(v.state, "validated", "validate 后置 validated");
    T.assertEqual(v.checks.length, 5, "应跑满 V01–V05 五条校验");
    T.assert(v.checks.every(function (c) { return c.ok; }), "五条校验必须全部 ok");
  });

  T.test("WR-02", "空响应 → V03 失败，state=rejected(EMPTY_RESPONSE)", function () {
    var m = meet("mtg-wr-02"); RT.start(m, proto());
    var o = open(m, "WR02"); WC.receive(m, o.handle, "");
    var v = WC.validate(m, o.handle);
    T.assert(!v.ok && v.state === "rejected", "空响应应 rejected");
    T.assertEqual(v.checks[2].id, "V03", "第三条应为 V03");
    T.assertEqual(v.diagnostics[0].code, C.EMPTY_RESPONSE, "错误码 EMPTY_RESPONSE");
  });

  T.test("WR-03", "超长响应 → V04 失败，state=rejected(INVALID_RESPONSE)", function () {
    var m = meet("mtg-wr-03"); RT.start(m, proto());
    var o = open(m, "WR03"); WC.receive(m, o.handle, new Array(30001).join("x"));
    var v = WC.validate(m, o.handle);
    T.assert(!v.ok && v.state === "rejected", "超长响应应 rejected");
    T.assertEqual(v.diagnostics[0].code, C.INVALID_RESPONSE, "错误码 INVALID_RESPONSE");
  });

  T.test("WR-04", "accept → submission 形态正确（participant_id + mock=false + web_relay=true）", function () {
    var m = meet("mtg-wr-04"); RT.start(m, proto());
    var o = open(m, "WR04"); WC.receive(m, o.handle, "建议 A。");
    var v = WC.validate(m, o.handle); T.assert(v.ok, "前置 validate 应通过");
    var a = WC.accept(m, o.handle);
    T.assert(a.ok && a.state === "accepted", "accept 应成功");
    T.assertEqual(a.submission.participant_id, "relay1", "submission.participant_id");
    T.assert(a.submission.payload.mock === false, "payload.mock 必须为 false（非 Mock）");
    T.assert(a.submission.payload.web_relay === true, "payload.web_relay 标记");
  });

  T.test("WR-05", "accept→runtime.submitResult → 会议推进至 completed", function () {
    var m = meet("mtg-wr-05"); RT.start(m, proto());
    var o = open(m, "WR05"); WC.receive(m, o.handle, "建议 B。");
    var v = WC.validate(m, o.handle); T.assert(v.ok, "前置 validate 应通过：" + JSON.stringify(v.checks));
    var a = WC.accept(m, o.handle); T.assert(a.ok, "accept 应通过");
    var r = RT.submitResult(m, proto(), a.submission);
    T.assert(r.ok, "runtime.submitResult 应通过：" + (r.diagnostic && r.diagnostic.message));
    T.assertEqual(m.status, "completed", "单参与者全响应后应终局 completed");
    T.assert(m.pendingAction === null, "终局 pendingAction 清空");
  });

  T.test("WR-06", "Save/Load 断点续传：state_data.web_relay 持久化运行态", function () {
    var m = meet("mtg-wr-06"); RT.start(m, proto());
    var o = open(m, "WR06"); WC.receive(m, o.handle, "草稿");
    T.assertEqual(WC.state(m, o.handle).state, "response_received", "接收后 response_received");
    return A.MeetingArchive.build(m, proto()).then(function (archive) {
      var r = A.MeetingRestore.restore(archive);
      WC.hydrate(r);
      var st = WC.state(r, o.handle);
      T.assert(st !== null, "断点续传后状态应可恢复");
      T.assertEqual(st.state, "response_received", "state_data 持久化 relay 运行态");
    });
  });

  T.test("WR-07", "cancel → state=cancelled（waiting_human 时 WEB_RELAY 已停下）", function () {
    var m = meet("mtg-wr-07"); RT.start(m, proto());
    var o = open(m, "WR07");
    var c = WC.cancel(m, o.handle);
    T.assert(c.ok && WC.state(m, o.handle).state === "cancelled", "cancel 应置 cancelled");
  });

  T.test("WR-08", "空响应 rejected → retry → waiting_external", function () {
    var m = meet("mtg-wr-08"); RT.start(m, proto());
    var o = open(m, "WR08"); WC.receive(m, o.handle, "");
    WC.validate(m, o.handle); T.assertEqual(WC.state(m, o.handle).state, "rejected", "空响应后 rejected");
    var r = WC.retry(m, o.handle);
    T.assertEqual(r.state, "waiting_external", "retry 应回到 waiting_external");
  });

  T.test("WR-09", "参与者被移出会议 → V05 失败(PARTICIPANT_NOT_FOUND)", function () {
    var m = meet("mtg-wr-09"); RT.start(m, proto());
    var o = open(m, "WR09"); WC.receive(m, o.handle, "建议 C。");
    m.participants = [];
    var v = WC.validate(m, o.handle);
    T.assert(!v.ok && v.state === "rejected", "参与者缺失应 rejected");
    T.assertEqual(v.diagnostics[0].code, C.PARTICIPANT_NOT_FOUND, "错误码 PARTICIPANT_NOT_FOUND");
  });

  T.test("WR-10", "nextRelay 自动跳过 mock、只挑 web_relay 参与者", function () {
    var pr = proto();
    var m = A.MeetingFactory.createMeeting(pr, { meetingId: "mtg-wr-10", participants: [
      { participant_id: "m1", transport_kind: "mock", role_class: "advisor", side_id: "s1", alias: "M", actor_type: "agent" },
      { participant_id: "w1", transport_kind: "web_relay", role_class: "advisor", side_id: "s1", alias: "W", actor_type: "agent" }
    ] });
    RT.start(m, pr);
    var o = WC.open(m, { prompt: "WR10", packet: { packet_id: "pk-relay", phase_id: "p1", participant_id: "w1" } });
    T.assertEqual(o.participantId, "w1", "自动挑选 web_relay 参与者 w1 而非 mock m1");
  });

  T.test("WR-11", "MeetingStepFlow.step 遇 web_relay 参与者必须停下（不自动推进）", function () {
    var m = meet("mtg-wr-11"); RT.start(m, proto());
    var before = m.status;
    var r = A.MeetingStepFlow.step(m, proto());
    T.assert(!r.ok && r.reason === "web_relay", "step 应拒绝 web_relay 并给出 reason");
    T.assertEqual(m.status, before, "会议状态不应被自动改变");
    T.assert(m.pendingAction !== null, "pendingAction 仍存在（relay 未完成）");
  });

  T.test("WR-12", "MeetingStepFlow.step 对 mock 参与者正常推进（无回归）", function () {
    var pr = proto();
    var m = A.MeetingFactory.createMeeting(pr, { meetingId: "mtg-wr-12", participants: [
      { participant_id: "m1", transport_kind: "mock", role_class: "advisor", side_id: "s1", alias: "M", actor_type: "agent" }
    ] });
    RT.start(m, pr);
    var r = A.MeetingStepFlow.step(m, pr);
    T.assert(r.ok, "mock 参与者应被自动推进：" + (r.message || ""));
    T.assertEqual(m.status, "completed", "单 mock 参与者全响应后终局");
  });

  T.test("WR-13", "RelayFlow.accept 后会议 messages 写入 accepted_by_runtime=true 的正式 Message", function () {
    var m = meet("mtg-wr-13"); RT.start(m, proto());
    var o = open(m, "WR13"); WC.receive(m, o.handle, "建议 D。");
    var v = WC.validate(m, o.handle); T.assert(v.ok, "前置 validate 应通过");
    var r = A.RelayFlow.accept(m, proto(), o.handle);
    T.assert(r.ok, "RelayFlow.accept 应通过：" + (r.message || ""));
    T.assert(r.message !== null, "应返回被写入的 Message");
    T.assertEqual(r.message.accepted_by_runtime, true, "accepted_by_runtime 必须为 true");
    T.assertEqual(r.message.content.raw_text, "建议 D。", "Message 文本来自被接受的响应");
    T.assertEqual((m.messages || []).length, 1, "meeting.messages 应恰好写入 1 条");
    T.assertEqual(m.messages[0].message_id, r.message.message_id, "写入的 Message 与返回一致");
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
