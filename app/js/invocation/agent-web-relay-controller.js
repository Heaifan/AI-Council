/* AI Council v0.1 — D3 · WEB_RELAY · WebRelayController：Manual Relay 协调层。
 * 无 DOM / 无网络 / 不生成 Prompt；把 meeting pendingAction + 已编译 Packet + 已渲染 Prompt 变成一次 WEB_RELAY 会话。
 * 协调：open / receive / validate(V01–V05) / accept / reject / retry / cancel。
 * 运行态持久化进 meeting.stateData.web_relay（additionalProperties:true），支持 Save/Load 断点续传。 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var C = A.Diagnostic.CODE, Req = A.AgentInvocationRequest;
  var TA = A.TransportAdapter, ACT = A.MeetingAction.ACTION;
  var MAX_LEN = 20000, NS = "web_relay";
  var T = new A.TransportAdapter.WebRelayTransport();
  function diag(c, m) { return A.Diagnostic.create({ code: c, message: m }); }
  function bag(m) { return m.stateData || (m.stateData = {}); }
  function slot(m, h) { var b = bag(m); var s = b[NS] || (b[NS] = {}); return s[h] || (s[h] = {}); }
  function sync(m, h) { var r = T._rec(h); if (!r) return; var s = slot(m, h); s.state = r.state; s.result = r.result; s.error = r.error; s.request = r.request; }
  function participant(m, id) { var ps = m.participants || []; for (var i = 0; i < ps.length; i++) if (ps[i].participant_id === id) return ps[i]; return null; }
  function nextRelay(m) { var pa = m.pendingAction; if (!pa || pa.action_type !== ACT.COLLECT_RESPONSES) return null; for (var i = 0; i < pa.requiredParticipantIds.length; i++) { var id = pa.requiredParticipantIds[i]; if (pa.receivedParticipantIds.indexOf(id) >= 0) continue; var p = participant(m, id); if (p && (p.transport_kind || "mock") === "web_relay") return p; } return null; }
  /* Save/Load 后把 stateData 断点灌回 transport 内存态。 */
  function hydrate(m) { var b = bag(m)[NS]; if (b) Object.keys(b).forEach(function (h) { T._store[h] = b[h]; }); }
  /* 打开一次 relay：inputs={participantId?, prompt, packet}。自动挑选下一个 web_relay 参与者。 */
  function open(m, inputs) {
    inputs = inputs || {};
    var p = inputs.participantId ? participant(m, inputs.participantId) : nextRelay(m);
    if (!p) return { ok: false, diagnostics: [diag(C.PARTICIPANT_NOT_FOUND, "没有可 relay 的 web_relay 参与者。")] };
    var req = Req.create({ meeting: m, phaseId: m.currentPhaseId, participantId: p.participant_id, packet: inputs.packet, prompt: inputs.prompt });
    if (!req.ok) return req;
    var b = TA.create("web_relay"); if (!b.ok) return b;
    var r = T.begin(req.request); if (!r.ok) return r;
    sync(m, r.handle);
    return { ok: true, handle: r.handle, request: req.request, prompt: inputs.prompt, participantId: p.participant_id, state: r.state };
  }
  function receive(m, h, raw) { var r = T.receive(h, raw); if (r.ok) sync(m, h); return r; }
  /* V01–V05 五条硬校验：句柄有效 / 状态机在 response_received / 原文非空 / 长度合理 / 参与者仍在会议。 */
  function validate(m, h) {
    var rec = T._rec(h); if (!rec) return fail(h, "V01", C.STALE_INVOCATION);
    var tr = T.validate(h); if (!tr.ok) return fail(h, "V01", tr.diagnostics[0].code);
    var checks = [{ id: "V01", ok: true }, { id: "V02", ok: true }];
    if (rec.state === "rejected") { checks.push({ id: "V03", ok: false }); return { ok: false, state: "rejected", checks: checks, diagnostics: [diag(C.EMPTY_RESPONSE, "外部返回为空。")] }; }
    checks.push({ id: "V03", ok: true });
    var raw = rec.result ? rec.result.raw_response : "";
    if (raw.length > MAX_LEN) { T.reject(h, C.INVALID_RESPONSE, "响应超 " + MAX_LEN + " 字符，疑似误粘贴。"); sync(m, h); checks.push({ id: "V04", ok: false }); return { ok: false, state: "rejected", checks: checks, diagnostics: [diag(C.INVALID_RESPONSE, "响应过长。")] }; }
    checks.push({ id: "V04", ok: true });
    if (!participant(m, rec.request.participant_id)) { checks.push({ id: "V05", ok: false }); return { ok: false, state: "rejected", checks: checks, diagnostics: [diag(C.PARTICIPANT_NOT_FOUND, "参与者已不在会议。")] }; }
    checks.push({ id: "V05", ok: true });
    sync(m, h);
    return { ok: true, state: "validated", checks: checks, result: rec.result };
  }
  function fail(h, vid, code) { return { ok: false, state: null, checks: [{ id: vid, ok: false }], diagnostics: [diag(code, "校验未通过：" + vid)] }; }
  function accept(m, h) { var rec = T._rec(h); var r = T.accept(h); if (!r.ok) return r; sync(m, h); return { ok: true, state: "accepted", result: r.result, submission: { participant_id: rec.request.participant_id, payload: { mock: false, web_relay: true, result: r.result } } }; }
  function reject(m, h, code, msg) { var r = T.reject(h, code, msg); if (r.ok) sync(m, h); return r; }
  function retry(m, h) { var r = T.retry(h); if (r.ok) sync(m, h); return r; }
  function cancel(m, h) { var r = T.cancel(h); if (r.ok) sync(m, h); return r; }
  function state(m, h) { var rec = T._rec(h); return rec ? { handle: h, state: rec.state, result: rec.result, error: rec.error, request: rec.request } : null; }
  function sessions(m) { var b = bag(m)[NS] || {}; return Object.keys(b).map(function (h) { return state(m, h); }); }
  A.WebRelayController = Object.freeze({ open: open, receive: receive, validate: validate, accept: accept, reject: reject, retry: retry, cancel: cancel, hydrate: hydrate, state: state, sessions: sessions });
})(typeof globalThis !== "undefined" ? globalThis : this);
