/* AI Council v0.1 — D3 · WEB_RELAY · InvocationMessageFactory：把“已 Accept 的 Invocation Result”转成正式 Meeting Message。
 * 红线：仅在 result 已被 accept（Runtime 已接受）之后才生成 Message；Message 的 accepted_by_runtime=true。
 * 绝不凭空生成会议事实——外部 AI 的返回先经 validate→accept，这里只是把被接受的内容落成会议记录。 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var C = A.Diagnostic.CODE, FP = A.ProtocolFingerprint, Log = A.MeetingEventLog;
  var SCHEMA_VERSION = "0.1.0";
  function diag(code, message) { return A.Diagnostic.create({ code: code, message: message }); }
  function fnv1a32(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ("00000000" + h.toString(16)).slice(-8); }
  /* inputs: { meeting, handle, result }（result = 已被 accept 的 AgentInvocationResult）。
   * F1-C：provenance（request_id/result_id）+ normalized（structured_output）+ content_type 落进正式 Message。 */
  function create(inputs) {
    inputs = inputs || {};
    var m = inputs.meeting, result = inputs.result;
    if (!m || !result) return { ok: false, diagnostics: [diag(C.INVOCATION_REQUEST_INVALID, "缺少 meeting/result。")] };
    var rec = (A.WebRelayController && A.WebRelayController.state(m, inputs.handle)) || null;
    var req = rec ? rec.request : null;
    var pid = (req && req.participant_id) || result.request_id;
    var p = (m.participants || []).filter(function (x) { return x.participant_id === pid; })[0] || null;
    var mode = (rec && rec.validation && rec.validation.mode) || "text";
    var now = Log.now();
    var seed = FP.canonicalize({ mid: m.meetingId, ph: (req ? req.phase_id : m.currentPhaseId), pa: pid, at: now });
    var msg = {
      schema_version: SCHEMA_VERSION,
      message_id: "msg-" + fnv1a32(seed),
      meeting_id: m.meetingId,
      phase_id: req ? req.phase_id : m.currentPhaseId,
      sender: { actor_type: (p && p.actor_type) || "agent", actor_id: pid, role_id: (p && p.role_id) || null, alias: (p && p.alias) || pid },
      recipients: { scope: "meeting" },
      content: { raw_text: result.raw_response || "", content_type: mode === "structured_json" ? "structured_json" : "text" },
      validation: { status: "valid", errors: [] },
      accepted_by_runtime: true,
      request_id: result.request_id || null,
      result_id: result.result_id || null,
      created_at: now
    };
    if (result.normalized_content !== undefined && result.normalized_content !== null) msg.content.structured_output = result.normalized_content;
    msg.extensions = { turn: (m.pendingAction && m.pendingAction.phase_entry) || 1 };   /* F1-C：slot turn = 该 phase 进入次数 */
    return { ok: true, message: msg };
  }
  function append(meeting, message) {
    if (!meeting.messages) meeting.messages = [];
    meeting.messages.push(message);
    return message;
  }
  A.InvocationMessageFactory = Object.freeze({ create: create, append: append });
})(typeof globalThis !== "undefined" ? globalThis : this);
