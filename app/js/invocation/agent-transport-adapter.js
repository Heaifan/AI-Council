/* AI Council v0.1 — D3-D0
 * TransportAdapter：Transport 层最小抽象（冻结接口）。
 * 本文件只承载「抽象合同」：接口形态说明、isTransportAdapter 判定、工厂 create。
 * 两个具体实现拆到独立文件（见 agent-mock-transport.js / agent-web-relay-transport.js），
 * 以保持单文件 ≤100 行、单一职责。工厂在运行期（实现已加载后）惰性引用具体类。
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

  /* 工厂：仅允许 D3-D0 冻结的两种 kind。具体实现由子文件注册到 A.TransportAdapter.*。
     运行期惰性引用，保证加载顺序无关（base 先加载，实现后注册）。 */
  function create(kind) {
    if (kind === "mock") return { ok: true, adapter: new A.TransportAdapter.MockTransport() };
    if (kind === "web_relay") return { ok: true, adapter: new A.TransportAdapter.WebRelayTransport() };
    return { ok: false, diagnostics: [diag(C.TRANSPORT_KIND_UNSUPPORTED, "D3-D0 不支持 transport_kind：" + String(kind) + "（api/local/web_automation 不在本轮）。")] };
  }

  /* 命名空间非冻结（实现类由子文件注册）；INTERFACE 与接口语义冻结。 */
  A.TransportAdapter = {
    INTERFACE: INTERFACE,
    isTransportAdapter: isTransportAdapter,
    create: create,
    MockTransport: null,
    WebRelayTransport: null
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
