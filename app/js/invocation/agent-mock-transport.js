/* AI Council v0.1 — D3-D0
 * MockTransport：确定性、无外部调用，仅用于合同测试与离线演练。
 * 实现 TransportAdapter 冻结接口中的 Mock 风格（invoke）。
 * 拆自原 agent-transport-adapter.js，使其保持单一职责、≤100 行。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var C = A.Diagnostic.CODE;
  var Res = A.AgentInvocationResult;

  function diag(code, message) { return A.Diagnostic.create({ code: code, message: message }); }

  function MockTransport() {
    this.kind = "mock";
  }
  MockTransport.prototype.invoke = function (request) {
    if (!request || !request.request_id) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "MockTransport.invoke 缺少 request.request_id。")] };
    var r = Res.create({
      requestId: request.request_id,
      status: "success",
      rawResponse: "[MOCK] advisor(" + String(request.participant_id) + ") deterministic response for phase " + String(request.phase_id),
      normalizedContent: { participant_id: request.participant_id, phase_id: request.phase_id, text: "[MOCK] deterministic" },
      transportMetadata: { source: "mock" }
    });
    if (!r.ok) return r;
    return { ok: true, result: r.result };
  };

  A.TransportAdapter.MockTransport = MockTransport;
})(typeof globalThis !== "undefined" ? globalThis : this);
