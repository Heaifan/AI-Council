/* AI Council v0.1 — MEETING-RUNTIME-F1 · MeetingTurnSelector：轮转派生（纯函数，无 DOM）。
 * T03/修正 1：Phase Roster 单一权威 = pendingAction.requiredParticipantIds（enterPhase 冻结，无第二份数组）。
 * T05/修正 2：pending/completed/progress/phaseStatus 全部派生；只有 activeSpeakerId 是游标。
 * 派生式队列：pending = roster.filter(id => !received.includes(id))，撤回后天然恢复。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  /* 本阶段冻结名单（语义包装，不复制）。 */
  function getRoundRoster(meeting) {
    return (meeting && meeting.pendingAction && meeting.pendingAction.requiredParticipantIds) || [];
  }

  /* 当前有效完成集合（accept add / revoke remove 的权威源）。 */
  function getReceived(meeting) {
    return (meeting && meeting.pendingAction && meeting.pendingAction.receivedParticipantIds) || [];
  }

  function derivePending(meeting) {
    return getRoundRoster(meeting).filter(function (id) { return getReceived(meeting).indexOf(id) < 0; });
  }

  function deriveCompleted(meeting) { return getReceived(meeting).slice(); }

  function nextSpeaker(meeting) { return derivePending(meeting)[0] || null; }

  /* 调度目标：activeSpeaker 未完成则优先它（撤回后保持当前轮），否则 pending 首位。 */
  function nextTarget(meeting) {
    var id = meeting && meeting.activeSpeakerId;
    if (id && getReceived(meeting).indexOf(id) < 0 && getRoundRoster(meeting).indexOf(id) >= 0) return id;
    return nextSpeaker(meeting);
  }

  /* 阶段状态：满足 completion 规则 → ready_to_advance（停在当前 phase，等用户「进入下一阶段」）；
   * 否则 running。撤回后 completed 减少 → 自动回 running（派生，无布尔状态可漂移）。 */
  function phaseStatus(meeting, protocol) {
    var pa = meeting && meeting.pendingAction;
    if (!pa) return null;
    var doc = protocol && (protocol.document || protocol);
    var pm = A.MeetingFactory ? A.MeetingFactory.buildPhaseMap(doc) : null;
    var phase = pm && pa.phaseId ? pm[pa.phaseId] : null;
    if (!phase) return null;
    var mode = (phase.completion || {}).mode;
    var need = mode === "all_selected_respond" ? getRoundRoster(meeting).length
      : mode === "secretary_respond" ? 1
      : mode === "any_selected_respond" ? Math.max(1, (phase.completion || {}).min_responses || 1) : Infinity;
    return getReceived(meeting).length >= need ? "ready_to_advance" : "running";
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingTurnSelector = Object.freeze({
    getRoundRoster: getRoundRoster, getReceived: getReceived,
    derivePending: derivePending, deriveCompleted: deriveCompleted,
    nextSpeaker: nextSpeaker, nextTarget: nextTarget, phaseStatus: phaseStatus
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
