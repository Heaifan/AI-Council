/* AI Council v0.1 — MEETING-INTEGRITY-F1-A
 * PhaseContextSnapshot：进入 Phase 的瞬间冻结「可见上下文引用」（只存消息 ID，不复制大段文本）。
 * 用户裁定上下文政策（F1-A）：
 *   agent_turn(opening) → 完全独立（同一 Phase 其他委员发言不可见，S01/S02）
 *   secretary_summary   → 已完成阶段全部委员 official 发言（S03 输入源）
 *   critique            → 已完成阶段全部 official（Opening + 秘书汇总），同阶段 critique 不可见（S03）
 *   battle              → 保持既有语义（每参与者最新 official + 秘书最新汇总，F2 再议）
 * 挂载点：pendingAction.phase_context（schema additionalProperties:true，
 *   checkpoint 深拷贝 / 存档 DTO / restore 均自动携带 → 零 schema 变更、S04 恢复后一致）。
 * 消费端：RelayFlow.open 经 resolve() 解析引用 → CompileFlow extras（与 F5 形状一致）。
 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var Log = A.MeetingEventLog;

  function docOf(p) { return (p && p.document) ? p.document : p; }
  function kindOf(protocol, phaseId) {
    var phases = (docOf(protocol) || {}).phases || [];
    for (var i = 0; i < phases.length; i++) if (phases[i].phase_id === phaseId) return phases[i].kind;
    return null;
  }
  function st(m) { return (m.extensions && m.extensions.response_status) || "official"; }
  function isSecretary(meeting, pid) {
    var parts = meeting.participants || [];
    for (var i = 0; i < parts.length; i++) if (parts[i].participant_id === pid) return parts[i].role_class === "chair_secretary";
    return false;
  }
  /* 进入阶段时冻结可见引用集（snapshot 是派生缓存，原始事实仍存于 messages）。 */
  function create(meeting, protocol, phaseId) {
    var kind = kindOf(protocol, phaseId);
    if (kind !== "agent_turn" && kind !== "secretary_summary" && kind !== "critique" && kind !== "battle") return null;
    var msgs = meeting.messages || [];
    var completed = meeting.completedPhaseIds || [];
    var official = msgs.filter(function (m) { return st(m) === "official"; });
    var ids = [], secId = null;
    if (kind === "agent_turn") {
      /* opening：完全独立——不引用任何发言 */
    } else if (kind === "secretary_summary") {
      official.forEach(function (m) {
        if (completed.indexOf(m.phase_id) >= 0 && !isSecretary(meeting, m.sender.actor_id)) ids.push(m.message_id);
      });
    } else if (kind === "critique") {
      official.forEach(function (m) {
        if (completed.indexOf(m.phase_id) < 0) return;
        if (isSecretary(meeting, m.sender.actor_id)) secId = m.message_id; else ids.push(m.message_id);
      });
    } else {
      /* battle：保持既有语义 = 每参与者最新 official + 秘书最新汇总（数组序最后一条） */
      var seen = {};
      official.forEach(function (m) {
        var pid = m.sender.actor_id;
        if (isSecretary(meeting, pid)) secId = m.message_id; else seen[pid] = m.message_id;
      });
      ids = Object.keys(seen).map(function (k) { return seen[k]; });
    }
    return { phase_id: phaseId, created_at: Log.now(),
      source_message_ids: ids, secretary_summary_id: secId, human_decision_context: null };
  }
  /* 引用 → 渲染输入（与 F5 extras 形状一致：{participant_id, alias, text, responseId}）。 */
  function resolve(meeting, snap) {
    var byId = {};
    (meeting.messages || []).forEach(function (m) { byId[m.message_id] = m; });
    var prev = [], sec = null;
    (snap.source_message_ids || []).forEach(function (id) {
      var m = byId[id]; if (!m) return;
      var item = { participant_id: m.sender.actor_id, alias: m.sender.alias || m.sender.actor_id,
        text: (m.content && m.content.raw_text) || (m.payload && m.payload.text) || "", responseId: m.message_id };
      if (isSecretary(meeting, item.participant_id)) sec = item; else prev.push(item);
    });
    if (snap.secretary_summary_id && byId[snap.secretary_summary_id]) {
      var sm = byId[snap.secretary_summary_id];
      sec = { participant_id: sm.sender.actor_id, alias: sm.sender.alias || sm.sender.actor_id,
        text: (sm.content && sm.content.raw_text) || (sm.payload && sm.payload.text) || "", responseId: sm.message_id };
    }
    return { previousResponses: prev, secretarySummary: sec };
  }
  function fromPending(meeting) {
    return meeting && meeting.pendingAction ? (meeting.pendingAction.phase_context || null) : null;
  }
  root.AICouncil = root.AICouncil || {};
  root.AICouncil.PhaseContextSnapshot = Object.freeze({
    create: create, resolve: resolve, fromPending: fromPending
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
