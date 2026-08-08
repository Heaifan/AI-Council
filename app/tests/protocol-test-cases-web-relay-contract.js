/* AI Council v0.1 — D3-D0 Contract Tests（合同结构组，D3D0-01..08）。夹具手工最小构造，不依赖 Meeting Runtime；状态机/Transport 组见 protocol-test-cases-web-relay-state.js。 */
(function (root) {
  "use strict";
  var A = root.AICouncil, T = A.TestSuite, C = A.Diagnostic.CODE, Req = A.AgentInvocationRequest, Res = A.AgentInvocationResult;
  function fixtureMeeting() {
    return {
      meetingId: "mtg-d3d0-001",
      participants: [
        { participant_id: "p1", transport_kind: "web_relay", model_ref: "web-gpt", role_id: "advisor", role_class: "advisor", side_id: "s1", alias: "A1", actor_type: "agent" },
        { participant_id: "p2", transport_kind: "mock", model_ref: null, role_id: "chair", role_class: "chair", side_id: "s1", alias: "C1", actor_type: "chair" }
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

  T.test("D3D0-01", "AgentInvocationRequest.create 成功且 validate 通过", function () {
    var r = makeReq();
    T.assert(r.ok, "create 应成功：" + (r.diagnostics && r.diagnostics[0] && r.diagnostics[0].message));
    T.assertEqual(r.request.transport_kind, "web_relay", "transport_kind 来自 participant");
    T.assertEqual(r.request.model_ref, "web-gpt", "model_ref 来自 participant");
    T.assertEqual(r.request.rendered_prompt, "请作为顾问给出建议。", "rendered_prompt = 入参 prompt");
    T.assert(Req.validate(r.request).ok, "validate 应通过");
  });

  T.test("D3D0-02", "Request 拒绝供应商/UI 字段（openai_model）", function () {
    var r = makeReq({ metadata: { openai_model: "gpt-4" } });
    T.assert(!r.ok, "含 openai_model 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.INVOCATION_REQUEST_INVALID, "错误码应为 INVOCATION_REQUEST_INVALID");
    T.assert(/openai_model/.test(r.diagnostics[0].message), "错误信息应点名违规字段");
  });

  T.test("D3D0-03", "Request 缺 participant → PARTICIPANT_NOT_FOUND", function () {
    var m = fixtureMeeting(), p = fixturePacket();
    var r = Req.create({ meeting: m, phaseId: "opening", participantId: "nope", packet: p, prompt: "x" });
    T.assert(!r.ok, "未知 participant 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.PARTICIPANT_NOT_FOUND, "错误码应为 PARTICIPANT_NOT_FOUND");
  });

  T.test("D3D0-04", "Request 非法 transport_kind → TRANSPORT_KIND_UNSUPPORTED", function () {
    var m = fixtureMeeting(); m.participants[0].transport_kind = "skynet";
    var p = fixturePacket();
    var r = Req.create({ meeting: m, phaseId: "opening", participantId: "p1", packet: p, prompt: "x" });
    T.assert(!r.ok, "非法 transport_kind 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.TRANSPORT_KIND_UNSUPPORTED, "错误码应为 TRANSPORT_KIND_UNSUPPORTED");
  });

  T.test("D3D0-05", "request_id 内容寻址：同目标可复现，prompt 不影响，sequence 改变", function () {
    var a = makeReq(), b = makeReq();
    T.assertEqual(a.request.request_id, b.request.request_id, "同输入 request_id 一致");
    var d = makeReq({ prompt: "完全不同的 prompt" });
    T.assertEqual(a.request.request_id, d.request.request_id, "prompt 不影响 request_id（按目标寻址）");
    var e = makeReq({ sequence: 1 });
    T.assert(a.request.request_id !== e.request.request_id, "sequence 不同则 request_id 不同");
    T.assert(/^req-[0-9a-f]{8}-[0-9]{2}$/.test(a.request.request_id), "request_id 形态 req-<hash>-<seq>");
  });

  T.test("D3D0-06", "AgentInvocationResult 成功且不含 message_id（≠ 正式 Message）", function () {
    var r = Res.create({ requestId: "req-00000000-00", status: "success", rawResponse: "建议：控制风险敞口。" });
    T.assert(r.ok, "result.create 应成功");
    T.assert(r.result.message_id === undefined, "Result 严禁携带 message_id（那是 Runtime 接受后才生成）");
    T.assert(Res.validate(r.result).ok, "validate 应通过");
    T.assertEqual(r.result.status, "success", "status=success");
    T.assertEqual(r.result.raw_response, "建议：控制风险敞口。", "raw_response 原样保存");
  });

  T.test("D3D0-07", "Result 一致性约束（raw_response / error 必填）", function () {
    T.assert(!Res.create({ requestId: "req-x", status: "success" }).ok, "success 无 raw_response 应被拒");
    T.assert(!Res.create({ requestId: "req-x", status: "failure" }).ok, "failure 无 error 应被拒");
    T.assert(!Res.create({ requestId: "req-x", status: "cancelled" }).ok, "cancelled 无 error 应被拒");
    var okFail = Res.create({ requestId: "req-x", status: "failure", error: { code: C.TRANSPORT_FAILED, message: "网络超时" } });
    T.assert(okFail.ok && okFail.result.error.code === C.TRANSPORT_FAILED, "failure 带 error 应通过");
  });

  T.test("D3D0-08", "Result 拒绝供应商/UI 字段（chatgpt_tab_id）", function () {
    var r = Res.create({ requestId: "req-x", status: "success", rawResponse: "x", transportMetadata: { chatgpt_tab_id: "tab-9" } });
    T.assert(!r.ok, "含 chatgpt_tab_id 应被拒");
    T.assertEqual(r.diagnostics[0].code, C.INVOCATION_REQUEST_INVALID, "错误码应为 INVOCATION_REQUEST_INVALID");
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
