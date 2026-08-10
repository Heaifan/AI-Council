/* AI Council v0.1 — MEETING-INTEGRITY-F1-C · MessageCommit
 * Formal Message 唯一落库入口（幂等）：
 *   三态（transport+validation+runtime_accepted）全真 → commit → messages[] + message_accepted + slot satisfied。
 * Slot = phase_id:participant_id:turn（turn 默认 0，为 Battle 多回合预留，本轮不做多回合）。
 * 幂等（用户 F1-C §11/§12）：
 *   同 slot 同 message → NO-OP（重放/恢复不重复落库）；
 *   同 slot 不同 message → 拒绝（不静默覆盖正式事实，审计链不破坏）。
 * 不变量：slot satisfied ⟺ 存在 accepted Formal Message（receivedParticipantIds 由 commit 维护）。
 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var Log = A.MeetingEventLog;
  var DUP_SLOT = "DUPLICATE_MESSAGE_SLOT";

  function turnOf(message) {
    return (message && message.extensions && typeof message.extensions.turn === "number") ? message.extensions.turn : 0;
  }
  function slotKey(phaseId, participantId, turn) {
    return phaseId + ":" + participantId + ":" + (turn === undefined ? 0 : turn);
  }
  function isAccepted(m) { return !!(m && m.accepted_by_runtime === true); }
  /* 当前有效正式消息：排除 revoked/superseded（撤回后槽位回到 pending，修改链以最新 official 为准）。 */
  function isEffective(m) {
    if (!isAccepted(m)) return false;
    var s = m.extensions && m.extensions.response_status;
    return s !== "revoked" && s !== "superseded";
  }
  /* 当前 phase 内某 slot 的已落库正式消息（无 → null）。 */
  function findCommitted(meeting, phaseId, participantId, turn) {
    var list = (meeting && meeting.messages) || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (isEffective(m) && m.phase_id === phaseId && m.sender && m.sender.actor_id === participantId && turnOf(m) === (turn || 0)) return m;
    }
    return null;
  }
  function isSatisfied(meeting, phaseId, participantId, turn) {
    return findCommitted(meeting, phaseId, participantId, turn) !== null;
  }
  /* 幂等落库：已存在 → NO-OP（同 message_id）或拒绝（不同 message_id）；否则 push + event + received。 */
  function commit(meeting, message) {
    if (!meeting || !message || !message.message_id) return { ok: false, code: "INVALID_MESSAGE", message: "缺少合法 Formal Message。" };
    var pid = message.sender && message.sender.actor_id;
    var turn = turnOf(message);
    var existing = findCommitted(meeting, message.phase_id, pid, turn);
    if (existing) {
      if (existing.message_id === message.message_id) return { ok: true, noop: true, message: existing };
      return { ok: false, code: DUP_SLOT,
        message: "该发言槽位（" + slotKey(message.phase_id, pid, turn) + "）已有正式消息，拒绝覆盖（审计链保护）。" };
    }
    if (!meeting.messages) meeting.messages = [];
    meeting.messages.push(message);
    Log.append(meeting, "message_accepted", {
      phaseId: message.phase_id, actorType: (message.sender && message.sender.actor_type) || "agent", actorId: pid,
      payload: { message_id: message.message_id, participant_id: pid,
        request_id: message.request_id || null, result_id: message.result_id || null, turn: turn }
    });
    var pa = meeting.pendingAction;
    if (pa && pa.requiredParticipantIds && pa.requiredParticipantIds.indexOf(pid) >= 0 &&
        pa.receivedParticipantIds.indexOf(pid) < 0) pa.receivedParticipantIds.push(pid);
    var TS = A.MeetingTurnSelector;
    if (TS) {
      var pending = TS.derivePending(meeting);
      meeting.activeSpeakerId = pending && pending.length ? pending[0] : null;
    }
    return { ok: true, message: message };
  }
  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MessageCommit = Object.freeze({
    commit: commit, findCommitted: findCommitted, isSatisfied: isSatisfied,
    slotKey: slotKey, turnOf: turnOf, DUP_SLOT: DUP_SLOT
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
