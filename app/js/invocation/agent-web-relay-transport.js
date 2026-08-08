/* AI Council v0.1 — D3-D0 · WebRelayTransport：Manual Relay，状态由 WebRelayStateMachine 驱动；拆自原 adapter，保持单一职责、≤100 行。 */
(function (root) {
  "use strict";
  var A = root.AICouncil, C = A.Diagnostic.CODE, SM = A.WebRelayStateMachine, Res = A.AgentInvocationResult;
  function diag(code, message) { return A.Diagnostic.create({ code: code, message: message }); }

  function WebRelayTransport() {
    this.kind = "web_relay";
    this._store = Object.create(null);
  }
  WebRelayTransport.prototype._rec = function (handle) { return this._store[handle] || null; };

  WebRelayTransport.prototype.begin = function (request) {
    if (!request || !request.request_id) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "begin 缺少 request.request_id。")] };
    var step = SM.apply("created", SM.EVENTS.BEGIN_EXTERNAL);
    if (!step.ok) return { ok: false, diagnostics: [step.error] };
    this._store[request.request_id] = { request: request, state: step.next, result: null, error: null };
    return { ok: true, handle: request.request_id, state: step.next };
  };

  WebRelayTransport.prototype.receive = function (handle, rawResponse) {
    var rec = this._rec(handle);
    if (!rec) return { ok: false, diagnostics: [diag(C.STALE_INVOCATION, "未知 handle：" + String(handle) + "。")] };
    if (rec.state !== "waiting_external") return { ok: false, diagnostics: [diag(C.INVOCATION_STATE_TRANSITION_INVALID, "receive 要求状态 waiting_external，实际 " + rec.state + "。")] };
    var step = SM.apply("waiting_external", SM.EVENTS.RESPONSE_RECEIVED);
    if (!step.ok) return { ok: false, diagnostics: [step.error] };
    var r = Res.create({ requestId: handle, status: "success", rawResponse: (typeof rawResponse === "string") ? rawResponse : "" });
    if (!r.ok) return r;
    rec.state = step.next; rec.result = r.result; rec.error = null;
    return { ok: true, state: step.next, result: r.result };
  };

  WebRelayTransport.prototype.validate = function (handle) {
    var rec = this._rec(handle);
    if (!rec) return { ok: false, diagnostics: [diag(C.STALE_INVOCATION, "未知 handle：" + String(handle) + "。")] };
    if (rec.state !== "response_received") return { ok: false, diagnostics: [diag(C.INVOCATION_STATE_TRANSITION_INVALID, "validate 要求状态 response_received，实际 " + rec.state + "。")] };
    var raw = rec.result ? rec.result.raw_response : "";
    var ev = (raw && raw.trim().length > 0) ? SM.EVENTS.VALIDATE_OK : SM.EVENTS.VALIDATE_FAIL;
    var step = SM.apply("response_received", ev);
    if (!step.ok) return { ok: false, diagnostics: [step.error] };
    rec.state = step.next;
    if (ev === SM.EVENTS.VALIDATE_FAIL) {
      rec.error = diag(C.EMPTY_RESPONSE, "外部返回为空，需要人工回填或重试。");
      return { ok: true, state: step.next, result: rec.result, error: rec.error };
    }
    rec.error = null;
    return { ok: true, state: step.next, result: rec.result };
  };

  WebRelayTransport.prototype.accept = function (handle) {
    var rec = this._rec(handle);
    if (!rec) return { ok: false, diagnostics: [diag(C.STALE_INVOCATION, "未知 handle：" + String(handle) + "。")] };
    if (rec.state !== "validated") return { ok: false, diagnostics: [diag(C.INVOCATION_STATE_TRANSITION_INVALID, "accept 要求状态 validated，实际 " + rec.state + "。")] };
    var step = SM.apply("validated", SM.EVENTS.ACCEPT);
    if (!step.ok) return { ok: false, diagnostics: [step.error] };
    rec.state = step.next; rec.error = null;
    return { ok: true, state: step.next, result: rec.result };
  };

  WebRelayTransport.prototype.reject = function (handle, code, message) {
    var rec = this._rec(handle);
    if (!rec) return { ok: false, diagnostics: [diag(C.STALE_INVOCATION, "未知 handle：" + String(handle) + "。")] };
    if (rec.state !== "validated") return { ok: false, diagnostics: [diag(C.INVOCATION_STATE_TRANSITION_INVALID, "reject 要求状态 validated，实际 " + rec.state + "。")] };
    var step = SM.apply("validated", SM.EVENTS.REJECT);
    if (!step.ok) return { ok: false, diagnostics: [step.error] };
    rec.state = step.next; rec.error = diag(code || C.INVALID_RESPONSE, message || "响应被会议 Runtime 拒绝。");
    return { ok: true, state: step.next, result: rec.result, error: rec.error };
  };

  WebRelayTransport.prototype.cancel = function (handle) {
    var rec = this._rec(handle);
    if (!rec) return { ok: false, diagnostics: [diag(C.STALE_INVOCATION, "未知 handle：" + String(handle) + "。")] };
    if (rec.state !== "waiting_external") return { ok: false, diagnostics: [diag(C.INVOCATION_STATE_TRANSITION_INVALID, "cancel 要求状态 waiting_external，实际 " + rec.state + "。")] };
    var step = SM.apply("waiting_external", SM.EVENTS.CANCEL);
    if (!step.ok) return { ok: false, diagnostics: [step.error] };
    var r = Res.create({ requestId: handle, status: "cancelled", error: { code: C.CANCELLED, message: "用户取消本次 Manual Relay。" } });
    rec.state = step.next; rec.error = r.ok ? r.result.error : diag(C.CANCELLED, "用户取消"); rec.result = r.ok ? r.result : null;
    return { ok: true, state: step.next, result: rec.result || undefined };
  };

  WebRelayTransport.prototype.retry = function (handle) {
    var rec = this._rec(handle);
    if (!rec) return { ok: false, diagnostics: [diag(C.STALE_INVOCATION, "未知 handle：" + String(handle) + "。")] };
    if (rec.state !== "rejected" && rec.state !== "failed") return { ok: false, diagnostics: [diag(C.INVOCATION_STATE_TRANSITION_INVALID, "retry 要求状态 rejected/failed，实际 " + rec.state + "。")] };
    var step = SM.apply(rec.state, SM.EVENTS.RETRY);
    if (!step.ok) return { ok: false, diagnostics: [step.error] };
    rec.state = step.next; rec.result = null; rec.error = null;
    return { ok: true, state: step.next };
  };

  WebRelayTransport.prototype.getState = function (handle) {
    var rec = this._rec(handle);
    return rec ? rec.state : null;
  };

  A.TransportAdapter.WebRelayTransport = WebRelayTransport;
})(typeof globalThis !== "undefined" ? globalThis : this);
