/* AI Council v0.1 — D3-D0
 * AgentInvocationResult：Transport 侧 → Meeting 侧唯一的机器合同（纯数据、JSON-safe、浅冻结）。
 *
 * 冻结边界：
 *  - Result 表达「这次外部调用到底发生了什么」：success / failure / cancelled / needs_human_refill。
 *  - 承载 raw_response（外部 AI 原样返回）、normalized_content（经校验/归一后的候选内容）、
 *    transport_metadata（开放袋，但禁止供应商/UI 专有字段）、error、received_at。
 *  - 关键红线：Result ≠ 正式 Meeting Message。外部 AI 的返回绝不能直接成为会议事实。
 *    必须经 Response Validation → Message → accepted_by_runtime → Runtime State Advance。
 *    Result 内不得出现 message_id（那是 Runtime 在接受后才生成的）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var D = A.Diagnostic;
  var C = D.CODE;

  var SCHEMA_VERSION = "0.1.0";
  var DETERMINISTIC_NOW = "0001-01-01T00:00:00+00:00";

  /* 4 种终态语义：成功 / 失败 / 取消 / 等待人工回填 */
  var STATUS = Object.freeze(["success", "failure", "cancelled", "needs_human_refill"]);

  var FIELDS = Object.freeze([
    "schema_version", "result_id", "request_id", "status",
    "raw_response", "normalized_content", "transport_metadata", "error", "received_at"
  ]);

  /* 与 Request 同一条红线：禁止供应商/UI 专有字段污染通用合同。 */
  var FORBIDDEN_METADATA_KEYS = Object.freeze([
    "openai_model", "claude_url", "chatgpt_tab_id", "gemini_url",
    "api_key", "tab_id", "dom_selector", "button_state"
  ]);

  var _clock = function () { return DETERMINISTIC_NOW; };
  function setClock(fn) { _clock = (typeof fn === "function") ? fn : function () { return DETERMINISTIC_NOW; }; }

  function diag(code, message) { return D.create({ code: code, message: message }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fnv1a32(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function isPlainError(e) {
    return !!e && typeof e === "object" && typeof e.code === "string";
  }

  /* inputs: { requestId, status, rawResponse?, normalizedContent?, transportMetadata?, error?, receivedAt? } */
  function create(inputs) {
    inputs = inputs || {};
    if (!inputs.requestId) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "缺少 request_id（必须回指 AgentInvocationRequest）。")] };
    if (STATUS.indexOf(inputs.status) < 0)
      return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "非法 status：" + String(inputs.status) + "。")] };

    var meta = inputs.transportMetadata || {};
    var bad = Object.keys(meta).filter(function (k) { return FORBIDDEN_METADATA_KEYS.indexOf(k) >= 0; });
    if (bad.length) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID,
      "transport_metadata 含供应商/UI 专有字段，禁止污染通用合同：" + bad.join("、") + "。")] };

    /* 一致性约束：failure / cancelled 必须带 error；success 必须带 raw_response（字符串）。 */
    if ((inputs.status === "failure" || inputs.status === "cancelled") && !isPlainError(inputs.error))
      return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "status=" + inputs.status + " 必须携带 error（{code,message}）。")] };
    if (inputs.status === "success" && typeof inputs.rawResponse !== "string")
      return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "status=success 必须携带 raw_response（字符串）。")] };

    var at = (typeof inputs.receivedAt === "string" && inputs.receivedAt) ? inputs.receivedAt : _clock();
    var seed = A.ProtocolFingerprint.canonicalize({ rid: inputs.requestId, st: inputs.status, at: at });
    return { ok: true, result: Object.freeze({
      schema_version: SCHEMA_VERSION,
      result_id: "res-" + fnv1a32(seed),
      request_id: inputs.requestId,
      status: inputs.status,
      raw_response: (typeof inputs.rawResponse === "string") ? inputs.rawResponse : null,
      normalized_content: (inputs.normalizedContent !== undefined) ? clone(inputs.normalizedContent) : null,
      transport_metadata: clone(meta),
      error: isPlainError(inputs.error) ? clone(inputs.error) : null,
      received_at: at
    }) };
  }

  /* 合同完整性检查：字段集必须与冻结列表严格一致。 */
  function validate(res) {
    if (!res || typeof res !== "object") return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "result 不是对象。")] };
    var d = [];
    var keys = Object.keys(res).sort(), want = FIELDS.slice().sort();
    if (keys.join(",") !== want.join(",")) d.push(diag(C.INVOCATION_REQUEST_INVALID,
      "字段集不符合冻结合同：实际 [" + keys.join(",") + "]。"));
    if (STATUS.indexOf(res.status) < 0) d.push(diag(C.INVOCATION_REQUEST_INVALID, "非法 status：" + String(res.status) + "。"));
    return { ok: d.length === 0, diagnostics: d };
  }

  A.AgentInvocationResult = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION, STATUS: STATUS, FIELDS: FIELDS,
    FORBIDDEN_METADATA_KEYS: FORBIDDEN_METADATA_KEYS,
    create: create, validate: validate, setClock: setClock
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
