/* AI Council v0.1 — D3-D0 Contract Tests（状态机 / Transport 组，D3D0-09..12）
 * 纯合同冻结校验：WebRelayStateMachine 合法/非法转移 + replay，TransportAdapter 工厂与 WebRelayTransport 端到端。
 * 合同结构组见 protocol-test-cases-web-relay-contract.js（D3D0-01..08）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var C = A.Diagnostic.CODE;
  var Req = A.AgentInvocationRequest;
  var SM = A.WebRelayStateMachine;
  var TA = A.TransportAdapter;

  function fixtureMeeting() {
    return {
      meetingId: "mtg-d3d0-001",
      participants: [
        { participant_id: "p1", transport_kind: "web_relay", model_ref: "web-gpt", role_id: "advisor", role_class: "advisor", side_id: "s1", alias: "A1", actor_type: "agent" }
      ]
    };
  }
  function fixturePacket() { return { packet_id: "pk-d3d0-abc123", phase_id: "opening", participant_id: "p1" }; }
  function makeReq(extra) {
    var m = fixtureMeeting(), p = fixturePacket();
    var inputs = { meeting: m, phaseId: "opening", participantId: "p1", packet: p, prompt: "请作为顾问给出建议。" };
    if (extra) for (var k in extra) inputs[k] = extra[k];
    return Req.create(inputs);
  }

  /* 9) StateMachine 合法链路 + 终止态 */
  T.test("D3D0-09", "WebRelay 状态机合法链路 created→…→accepted", function () {
    var s = "created";
    var e = SM.EVENTS;
    var a1 = SM.apply(s, e.BEGIN_EXTERNAL); T.assert(a1.ok && a1.next === "waiting_external", "created→waiting_external");
    var a2 = SM.apply(a1.next, e.RESPONSE_RECEIVED); T.assert(a2.ok && a2.next === "response_received", "waiting→response_received");
    var a3 = SM.apply(a2.next, e.VALIDATE_OK); T.assert(a3.ok && a3.next === "validated", "response→validated");
    var a4 = SM.apply(a3.next, e.ACCEPT); T.assert(a4.ok && a4.next === "accepted", "validated→accepted");
    T.assert(SM.isTerminal("accepted"), "accepted 为终止态");
    T.assert(SM.isTerminal("cancelled"), "cancelled 为终止态");
    T.assert(!SM.isTerminal("waiting_external"), "waiting_external 非终止态");
  });

  /* 10) 非法转移被拒 + replay 重放审计 */
  T.test("D3D0-10", "状态机非法转移拒绝 + replay 重放校验", function () {
    T.assert(!SM.canTransition("accepted", SM.EVENTS.RETRY), "accepted 不接受 RETRY");
    var bad = SM.apply("created", SM.EVENTS.ACCEPT);
    T.assert(!bad.ok && bad.error.code === C.INVOCATION_STATE_TRANSITION_INVALID, "created 直接 ACCEPT 应被拒且码正确");
    var ok = SM.replay([SM.EVENTS.BEGIN_EXTERNAL, SM.EVENTS.RESPONSE_RECEIVED, SM.EVENTS.VALIDATE_OK, SM.EVENTS.ACCEPT]);
    T.assert(ok.ok && ok.finalState === "accepted", "replay 合法序列通过");
    var fail = SM.replay([SM.EVENTS.BEGIN_EXTERNAL, SM.EVENTS.ACCEPT]);
    T.assert(!fail.ok && fail.atIndex === 1, "replay 在非法跳精确报错位置");
  });

  /* 11) TransportAdapter 工厂：只允许 mock/web_relay；Mock invoke 回指 request */
  T.test("D3D0-11", "TransportAdapter 工厂：放行 mock/web_relay，禁止 api/local/web_automation", function () {
    var m = TA.create("mock"); T.assert(m.ok && m.adapter.kind === "mock", "mock 放行");
    var w = TA.create("web_relay"); T.assert(w.ok && w.adapter.kind === "web_relay", "web_relay 放行");
    var api = TA.create("api"); T.assert(!api.ok && api.diagnostics[0].code === C.TRANSPORT_KIND_UNSUPPORTED, "api 禁止");
    var local = TA.create("local"); T.assert(!local.ok && local.diagnostics[0].code === C.TRANSPORT_KIND_UNSUPPORTED, "local 禁止");
    var wa = TA.create("web_automation"); T.assert(!wa.ok && wa.diagnostics[0].code === C.TRANSPORT_KIND_UNSUPPORTED, "web_automation 禁止");
    T.assert(TA.isTransportAdapter(m.adapter), "isTransportAdapter(mock) 为 true");
    var req = makeReq().request;
    var inv = m.adapter.invoke(req);
    T.assert(inv.ok && inv.result.status === "success" && inv.result.request_id === req.request_id, "Mock invoke 回指 request_id");
  });

  /* 12) WebRelayTransport 端到端 Manual Relay：空→rejected→retry→接受；另测 cancel */
  T.test("D3D0-12", "WebRelayTransport 端到端 Manual Relay 生命周期", function () {
    var t = new TA.WebRelayTransport();
    var req = makeReq().request;
    var b = t.begin(req); T.assert(b.ok && b.state === "waiting_external", "begin→waiting_external");
    var rcvEmpty = t.receive(b.handle, "   "); T.assert(rcvEmpty.ok && rcvEmpty.state === "response_received", "receive(空)→response_received");
    var vEmpty = t.validate(b.handle); T.assert(vEmpty.ok && vEmpty.state === "rejected" && vEmpty.error.code === C.EMPTY_RESPONSE, "空响应→rejected(EMPTY_RESPONSE)");
    var rt = t.retry(b.handle); T.assert(rt.ok && rt.state === "waiting_external", "retry→waiting_external");
    var rcv = t.receive(b.handle, "建议：分散仓位、设止损。"); T.assert(rcv.ok && rcv.state === "response_received", "receive(有效)→response_received");
    var v = t.validate(b.handle); T.assert(v.ok && v.state === "validated", "有效响应→validated");
    var ac = t.accept(b.handle); T.assert(ac.ok && ac.state === "accepted", "accept→accepted");
    T.assert(ac.result.status === "success" && ac.result.request_id === req.request_id, "accepted result 回指 request");
    var st = t.getState(b.handle); T.assertEqual(st, "accepted", "getState=accepted");
    /* 取消路径（独立 request_id：sequence=1） */
    var req2 = makeReq({ sequence: 1 }).request;
    var b2 = t.begin(req2); var c = t.cancel(b2.handle);
    T.assert(c.ok && c.state === "cancelled", "cancel→cancelled");
    T.assert(c.result && c.result.status === "cancelled", "cancel 产出 cancelled result");
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
