/* AI Council v0.1 — MEETING-RUNTIME-F1 · MeetingResponseState：正式发言可逆（T12/T13/T14）。
 * 修改 = 追加 superseded 链（历史不物理覆盖）；撤回 = status=revoked + received remove + 事件。
 * 真相链：事件（agent_output_revised/revoked）→ Replay 重建；messages.extensions 仅展示投影。
 * Live 与 Replay 一致性由事件顺序消费保证（修正 4 硬要求）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  function st(m) { return (m && m.extensions && m.extensions.response_status) || "official"; }
  /* 某席位当前有效（official）的正式发言消息（按 created_at 取最新）。 */
  function latestOfficial(meeting, participantId) {
    var list = (meeting && meeting.messages) || [];
    var found = null;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.sender && m.sender.actor_id === participantId && st(m) === "official") found = m;
    }
    return found;
  }

  function findMessage(meeting, messageId) {
    var list = (meeting && meeting.messages) || [];
    for (var i = 0; i < list.length; i++) if (list[i].message_id === messageId) return list[i];
    return null;
  }

  /* 修改：原 official → superseded；追加新 official（revision+1，supersedes 链）。 */
  function revise(meeting, protocol, messageId, newText) {
    var old = findMessage(meeting, messageId);
    if (!old) return { ok: false, message: "找不到该正式发言。" };
    if (st(old) !== "official") return { ok: false, message: "只有当前有效的正式发言才能修改。" };
    var pid = old.sender.actor_id;
    var rev = (old.extensions && old.extensions.revision) || 1;
    old.extensions = Object.assign({}, old.extensions || {}, { response_status: "superseded" });
    var msg = { schema_version: "0.1.0", message_id: "msg-" + pid + "-r" + (rev + 1) + "-" + meeting.events.length,
      meeting_id: meeting.meetingId, phase_id: old.phase_id,
      sender: Object.assign({}, old.sender), recipients: { scope: "meeting" },
      content: { raw_text: newText }, validation: { status: "valid", errors: [] },
      accepted_by_runtime: true, created_at: A.MeetingEventLog.now() };
    msg.extensions = { response_status: "official", revision: rev + 1, supersedes_message_id: messageId };
    if (!meeting.messages) meeting.messages = [];
    meeting.messages.push(msg);
    A.MeetingEventLog.append(meeting, "agent_output_revised", {
      phaseId: old.phase_id, actorType: "agent", actorId: pid,
      payload: { participant_id: pid, target_message_id: messageId, supersedes_message_id: msg.message_id, revision: rev + 1 }
    });
    return { ok: true, message: msg };
  }

  /* 撤回：status=revoked + received remove + 事件；activeSpeaker 若不在 pending 则回退 pending[0]。 */
  function revoke(meeting, messageId) {
    var msg = findMessage(meeting, messageId);
    if (!msg) return { ok: false, message: "找不到该正式发言。" };
    if (st(msg) !== "official") return { ok: false, message: "该发言已不是当前有效状态。" };
    var pid = msg.sender.actor_id;
    msg.extensions = Object.assign({}, msg.extensions || {}, { response_status: "revoked" });
    var pa = meeting.pendingAction;
    if (pa && pa.receivedParticipantIds) {
      var idx = pa.receivedParticipantIds.indexOf(pid);
      if (idx >= 0) pa.receivedParticipantIds.splice(idx, 1);
    }
    A.MeetingEventLog.append(meeting, "agent_output_revoked", {
      phaseId: msg.phase_id, actorType: "agent", actorId: pid,
      payload: { participant_id: pid, target_message_id: messageId }
    });
    /* 修正 2/十五：activeSpeaker 仍 pending → 不动（保持当前发言者）；
     * 不在 pending（撤回者正是当前/唯一待发言）→ 回退到派生 pending[0]。 */
    var TS = root.AICouncil.MeetingTurnSelector;
    var pending = TS ? TS.derivePending(meeting) : [];
    if (pending.length && pending.indexOf(meeting.activeSpeakerId) < 0) meeting.activeSpeakerId = pending[0];
    else if (!pending.length) meeting.activeSpeakerId = null;
    return { ok: true, revoked: msg };
  }

  /* F5：委员（非秘书）当前有效正式发言——秘书汇总输入源。 */
  function effectiveResponses(meeting) {
    var out = [];
    ((meeting && meeting.participants) || []).forEach(function (p) {
      if (p.role_class !== "chair_secretary") { var m = latestOfficial(meeting, p.participant_id);
        if (m) out.push({ participant_id: p.participant_id, alias: p.alias, text: (m.content && m.content.raw_text) || (m.payload && m.payload.text), responseId: m.message_id }); }
    });
    return out;
  }

  /* F5：秘书最新有效正式汇总——下一阶段共享公共上下文。 */
  function secretarySummary(meeting) {
    var sec = ((meeting && meeting.participants) || []).filter(function (p) { return p.role_class === "chair_secretary"; })[0];
    if (!sec) return null;
    var m = latestOfficial(meeting, sec.participant_id);
    return m ? { participant_id: sec.participant_id, alias: sec.alias, text: (m.content && m.content.raw_text) || (m.payload && m.payload.text), responseId: m.message_id } : null;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingResponseState = Object.freeze({
    latestOfficial: latestOfficial, revise: revise, revoke: revoke,
    effectiveResponses: effectiveResponses, secretarySummary: secretarySummary
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
