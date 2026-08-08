/* AI Council v0.1 — D3-D0 Contract Tests（12 条）
 * 纯合同冻结校验：Request / Result / StateMachine / TransportAdapter 四份合同互不依赖业务运行时。
 * 夹具全部手工最小构造，不依赖 Meeting Runtime，确保 D3-D0 对 D1/D2 零侵入。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var C = A.Diagnostic.CODE;
  var Req = A.AgentInvocationRequest;
  var Res = A.AgentInvocationResult;
  var SM = A.WebRelayStateMachine;
  var TA = A.TransportAdapter;

  function fixtureMeeting() {
    return {
      meetingId: "mtg-d3d0-001",
      participants: [
        { participant_id: "p1", transport_kind: "web_relay", model_ref: "web-gpt", role_id: "advisor", role_class: "advisor", side_id: "s1", alias: "A1", actor_type: "agent" },
        { participant_id: "p2", transport_kind: "mock", model_ref: null, role_id: "chair", role_class: "chair", side_id: "s1", alias: "C1", actor_type: "chair" }
      ]
    };
  }
  function fixturePacket() {
    return { packet_id: "pk-d3d0-abc123", phase_id: "opening", participant_id: "p1" };
  }
  function makeReq(extra) {
    var m = fixtureMeeting(), p = fixturePacket();
    var inputs = { meeting: m, phaseId: "opening", participantId: "p1", packet: p, prompt: "请作为顾问给出建议。" };
    if (extra) for (var k in extra) inputs[k] = extra[k];
    return Req.create(inputs);
  }

  /* 1) Request 成功路径 + validate 字段集严格一致 */
  T.test("D3D0-01", "AgentInvocationRequest.create 成功且 validate 通过", function () {
    var r = makeReq();
    T.assert(r.ok, "create 应成功：" + (r.diagnostics && r.diagnostics[0] && r.diagnostics[0].message));
    T.assertEqual(r.request.transport_kind, "web_relay", "transport_kind 来自 participant");
    T.assertEqual(r.request.model_ref, "web-gpt", "model_ref 来自 participant");
    T.assertEqual(r.request.rendered_prompt, "请作为顾问给出建议。", "rendered_prompt = 入参 prompt");
    var v = Req.validate(r.request);
    T.assert(v.ok, "validate 应通过");
  });

  /* 2) 拒绝供应商/UI 专有字段污染 metadata */
  T.test("D3D0-02", "Request 拒绝供应商/UI 字段（openai_model）", function () {
    var r = makeReq({ metadata: { openai_model: "gpt-4" } });
    T.assert(!r.ok, "含 openai_model 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.INVOCATION_REQUEST_INVALID, "错误码应为 INVOCATION_REQUEST_INVALID");
    T.assert(/openai_model/.test(r.diagnostics[0].message), "错误信息应点名违规字段");
  });

  /* 3) 必须有 participant */
  T.test("D3D0-03", "Request 缺 participant → PARTICIPANT_NOT_FOUND", function () {
    var m = fixtureMeeting(), p = fixturePacket();
    var r = Req.create({ meeting: m, phaseId: "opening", participantId: "nope", packet: p, prompt: "x" });
    T.assert(!r.ok, "未知 participant 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.PARTICIPANT_NOT_FOUND, "错误码应为 PARTICIPANT_NOT_FOUND");
  });

  /* 4) transport_kind 非法 */
  T.test("D3D0-04", "Request 非法 transport_kind → TRANSPORT_KIND_UNSUPPORTED", function () {
    var m = fixtureMeeting(); m.participants[0].transport_kind = "skynet";
    var p = fixturePacket();
    var r = Req.create({ meeting: m, phaseId: "opening", participantId: "p1", packet: p, prompt: "x" });
    T.assert(!r.ok, "非法 transport_kind 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.TRANSPORT_KIND_UNSUPPORTED, "错误码应为 TRANSPORT_KIND_UNSUPPORTED");
  });

  /* 5) request_id 内容寻址可复现；prompt 不影响；sequence 改变 id */
  T.test("D3D0-05", "request_id 内容寻址：同目标可复现，prompt 不影响，sequence 改变", function () {
    var a = makeReq();
    var b = makeReq();
    T.assertEqual(a.request.request_id, b.request.request_id, "同输入 request_id 一致");
    var d = makeReq({ prompt: "完全不同的 prompt" });
    T.assertEqual(a.request.request_id, d.request.request_id, "prompt 不影响 request_id（按目标寻址）");
    var e = makeReq({ sequence: 1 });
    T.assert(a.request.request_id !== e.request.request_id, "sequence 不同则 request_id 不同");
    T.assert(/^req-[0-9a-f]{8}-[0-9]{2}$/.test(a.request.request_id), "request_id 形态 req-<hash>-<seq>");
  });

  /* 6) Result 成功 + validate；Result ≠ 正式 Message（无 message_id） */
  T.test("D3D0-06", "AgentInvocationResult 成功且不含 message_id（≠ 正式 Message）", function () {
    var r = Res.create({ requestId: "req-00000000-00", status: "success", rawResponse: "建议：控制风险敞口。" });
    T.assert(r.ok, "result.create 应成功");
    T.assert(r.result.message_id === undefined, "Result 严禁携带 message_id（那是 Runtime 接受后才生成）");
    var v = Res.validate(r.result);
    T.assert(v.ok, "validate 应通过");
    T.assertEqual(r.result.status, "success", "status=success");
    T.assertEqual(r.result.raw_response, "建议：控制风险敞口。", "raw_response 原样保存");
  });

  /* 7) Result 一致性约束：success 必带 raw_response；failure/cancelled 必带 error */
  T.test("D3D0-07", "Result 一致性约束（raw_response / error 必填）", function () {
    var badSuccess = Res.create({ requestId: "req-x", status: "success" });
    T.assert(!badSuccess.ok, "success 无 raw_response 应被拒");
    var badFail = Res.create({ requestId: "req-x", status: "failure" });
    T.assert(!badFail.ok, "failure 无 error 应被拒");
    var badCancel = Res.create({ requestId: "req-x", status: "cancelled" });
    T.assert(!badCancel.ok, "cancelled 无 error 应被拒");
    var okFail = Res.create({ requestId: "req-x", status: "failure", error: { code: C.TRANSPORT_FAILED, message: "网络超时" } });
    T.assert(okFail.ok && okFail.result.error.code === C.TRANSPORT_FAILED, "failure 带 error 应通过");
  });

  /* 8) Result 拒绝供应商/UI metadata 字段 */
  T.test("D3D0-08", "Result 拒绝供应商/UI 字段（chatgpt_tab_id）", function () {
    var r = Res.create({ requestId: "req-x", status: "success", rawResponse: "x", transportMetadata: { chatgpt_tab_id: "tab-9" } });
    T.assert(!r.ok, "含 chatgpt_tab_id 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.INVOCATION_REQUEST_INVALID, "错误码应为 INVOCATION_REQUEST_INVALID");
  });

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
