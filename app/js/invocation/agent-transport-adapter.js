/* AI Council v0.1 — D3-D0
 * TransportAdapter：Transport 层最小抽象（冻结接口）。
 * 本轮只实现 MockTransport（确定性，无外部调用）与 WebRelayTransport（Manual Relay，状态机驱动）。
 * 严禁在 D3-D0 实现 ApiTransport / LocalTransport / WebAutomationTransport —— 它们属于 D6 或更晚，
 * 且不得在 WEB_RELAY 合同里预置任何供应商/UI 字段。
 *
 * 冻结的接口形状（所有 Transport 必现）：
 *   kind        : "mock" | "web_relay"（将来才扩展 api/local/web_automation）
 *   Mock 风格   : invoke(request) -> { ok, result }
 *   WebRelay 风格: begin/receive/validate/accept/reject/cancel/retry/getState(handle)
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var D = A.Diagnostic;
  var C = D.CODE;
  var SM = A.WebRelayStateMachine;
  var Res = A.AgentInvocationResult;

  /* 冻结的接口文档（不是运行期强制，但作为合同说明被测试引用）。 */
  var INTERFACE = Object.freeze({
    kind: "string (transport_kind)",
    invoke: "Mock 风格：function(request) -> {ok, result}",
    begin: "WebRelay 风格：function(request) -> {ok, handle, state}",
    receive: "function(handle, rawResponse) -> {ok, state, result}",
    validate: "function(handle) -> {ok, state, result}",
    accept: "function(handle) -> {ok, state, result}",
    reject: "function(handle, code, message) -> {ok, state, result?}",
    cancel: "function(handle) -> {ok, state, result?}",
    retry: "function(handle) -> {ok, state}",
    getState: "function(handle) -> state | null"
  });

  function isTransportAdapter(x) {
    return !!x && typeof x.kind === "string" && typeof x.invoke === "function";
  }
  function diag(code, message) { return D.create({ code: code, message: message }); }

  /* ------------------------------------------------------------------ *
   * MockTransport：确定性、无外部调用，仅用于合同测试与离线演练。
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ *
   * WebRelayTransport：Manual Relay（人把 prompt 复制到外部 Web AI，
   * 再把响应粘贴回来）。状态由 WebRelayStateMachine 驱动，可审计、可重放。
   * 本对象持有运行期实例（store）；状态合法性全部委托给冻结的状态机。
   * ------------------------------------------------------------------ */
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

  /* 工厂：仅允许 D3-D0 冻结的两种 kind。 */
  function create(kind) {
    if (kind === "mock") return { ok: true, adapter: new MockTransport() };
    if (kind === "web_relay") return { ok: true, adapter: new WebRelayTransport() };
    return { ok: false, diagnostics: [diag(C.TRANSPORT_KIND_UNSUPPORTED, "D3-D0 不支持 transport_kind：" + String(kind) + "（api/local/web_automation 不在本轮）。")] };
  }

  A.TransportAdapter = Object.freeze({
    INTERFACE: INTERFACE,
    isTransportAdapter: isTransportAdapter,
    create: create,
    MockTransport: MockTransport,
    WebRelayTransport: WebRelayTransport
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
