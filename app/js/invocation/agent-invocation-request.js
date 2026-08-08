/* AI Council v0.1 — D3-D0
 * AgentInvocationRequest：Meeting 侧 → Transport 侧唯一的机器合同（纯数据、JSON-safe、浅冻结）。
 *
 * 冻结边界：
 *  - 只回答「哪场会议、哪个相位、哪位委员、此刻该说什么」，绝不承载供应商字段
 *    （openai_model / claude_url / chatgpt_tab_id 一类一律拒绝进入 metadata）。
 *  - 绝不承载 UI 状态（Tab、按钮、textarea）；rendered_prompt 是 Renderer 的确定性产物，不是 UI 状态。
 *  - request_id = 内容寻址(meeting+phase+participant+packet) + 显式 sequence：同一目标的第 N 次调用
 *    可复现且不撞号；Retry 复用同一 request_id，重新发起才递增 sequence。
 *  - 时钟可注入；默认确定性常量，测试不受真实时间影响。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var D = A.Diagnostic;
  var C = D.CODE;
  var FP = A.ProtocolFingerprint;

  var SCHEMA_VERSION = "0.1.0";
  var DETERMINISTIC_NOW = "0001-01-01T00:00:00+00:00";
  var TRANSPORT_KINDS = Object.freeze(["mock", "api", "local", "web_relay", "web_automation"]);
  var FIELDS = Object.freeze([
    "schema_version", "request_id", "meeting_id", "phase_id", "participant_id",
    "model_ref", "transport_kind", "instruction_packet", "rendered_prompt",
    "renderer_version", "created_at", "metadata"
  ]);
  /* 把「禁止供应商/UI 细节进入通用合同」这条红线变成可执行、可测试的检查。 */
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

  function findParticipant(meeting, id) {
    var list = (meeting && meeting.participants) || [];
    for (var i = 0; i < list.length; i++) if (list[i].participant_id === id) return list[i];
    return null;
  }

  /* inputs: { meeting, phaseId, participantId, packet, prompt, sequence?, metadata? } */
  function create(inputs) {
    inputs = inputs || {};
    var m = inputs.meeting, packet = inputs.packet;
    if (!m || !m.meetingId) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "缺少 meeting（meetingId）。")] };
    if (!packet || !packet.packet_id) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "缺少 InstructionPacket。")] };
    if (typeof inputs.prompt !== "string" || inputs.prompt.length === 0)
      return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "缺少 rendered_prompt（必须由 PromptRenderer 产出）。")] };
    if (!inputs.phaseId) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "缺少 phase_id。")] };

    var p = findParticipant(m, inputs.participantId);
    if (!p) return { ok: false, diagnostics: [diag(C.PARTICIPANT_NOT_FOUND,
      "participant 不在本会议 participants[] 中：" + String(inputs.participantId) + "。")] };

    var kind = p.transport_kind || "mock";
    if (TRANSPORT_KINDS.indexOf(kind) < 0) return { ok: false, diagnostics: [diag(C.TRANSPORT_KIND_UNSUPPORTED,
      "未知 transport_kind：" + String(kind) + "。")] };

    var meta = inputs.metadata || {};
    var bad = Object.keys(meta).filter(function (k) { return FORBIDDEN_METADATA_KEYS.indexOf(k) >= 0; });
    if (bad.length) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID,
      "metadata 含供应商/UI 专有字段，禁止污染通用合同：" + bad.join("、") + "。")] };

    var seq = (typeof inputs.sequence === "number" && inputs.sequence >= 0) ? Math.floor(inputs.sequence) : 0;
    var seed = FP.canonicalize({ mt: m.meetingId, ph: inputs.phaseId, pa: p.participant_id, pk: packet.packet_id });
    return { ok: true, request: Object.freeze({
      schema_version: SCHEMA_VERSION,
      request_id: "req-" + fnv1a32(seed) + "-" + (seq < 10 ? "0" : "") + seq,
      meeting_id: m.meetingId,
      phase_id: inputs.phaseId,
      participant_id: p.participant_id,
      model_ref: (p.model_ref === undefined ? null : p.model_ref),
      transport_kind: kind,
      instruction_packet: clone(packet),
      rendered_prompt: inputs.prompt,
      renderer_version: A.PromptRenderer.RENDERER_VERSION,
      created_at: _clock(),
      metadata: clone(meta)
    }) };
  }

  /* 合同完整性检查：字段集必须与冻结列表严格一致（多一个少一个都算违约）。 */
  function validate(req) {
    if (!req || typeof req !== "object") return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "request 不是对象。")] };
    var keys = Object.keys(req).sort(), want = FIELDS.slice().sort(), d = [];
    if (keys.join(",") !== want.join(",")) d.push(diag(C.INVOCATION_REQUEST_INVALID,
      "字段集不符合冻结合同：实际 [" + keys.join(",") + "]。"));
    return { ok: d.length === 0, diagnostics: d };
  }

  A.AgentInvocationRequest = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION, FIELDS: FIELDS, TRANSPORT_KINDS: TRANSPORT_KINDS,
    FORBIDDEN_METADATA_KEYS: FORBIDDEN_METADATA_KEYS,
    create: create, validate: validate, setClock: setClock
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
