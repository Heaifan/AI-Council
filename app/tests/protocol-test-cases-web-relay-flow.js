/* AI Council v0.1 — D3 · WEB_RELAY · 生命周期用例（WR-01..05）。
 * 无 DOM，直接驱动 Runtime：open→receive→validate→accept→submit。
 * 持久化/恢复/步进集成见 protocol-test-cases-web-relay-recovery.js（WR-06..13）。
 */
(function (root) {
  "use strict";
  var A = root.AICouncil, T = A.TestSuite, C = A.Diagnostic.CODE, WC = A.WebRelayController, RT = A.MeetingRuntime;
  var PK = { packet_id: "pk-relay", phase_id: "p1", participant_id: "relay1" };
  function proto() {
    return { protocol_id: "proto-relay-flow", version: "0.1.0", name: "RelayFlow", initial_phase_id: "p1",
      phases: [{ phase_id: "p1", kind: "agent_turn", actor: { selector: "all_advisors" },
        completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "$end" }] }] };
  }
  function relay() { return { participant_id: "relay1", transport_kind: "web_relay", model_ref: "web-gpt", role_id: "advisor", role_class: "advisor", side_id: "s1", alias: "A1", actor_type: "agent" }; }
  function meet(id) { return A.MeetingFactory.createMeeting(proto(), { meetingId: id, participants: [relay()] }); }
  function open(m, p) { return WC.open(m, { participantId: "relay1", prompt: p, packet: PK }); }

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
})(typeof globalThis !== "undefined" ? globalThis : this);
