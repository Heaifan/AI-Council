/* AI Council v0.1 — D3/F5 · 六席会议控制台 · SeatStatus：席位状态中文判定（无 DOM 纯函数）。
 * 状态枚举：未参会 / 等待发言 / 当前发言 / 等待网页回答 / 已收到回答 / 校验通过 / 已写入会议 / 已发言。
 * F5：秘书席（role_class=chair_secretary）——辩论阶段「等待秘书阶段」、汇总阶段「当前汇总/等待汇总/已汇总」；
 * 委员在秘书阶段且此前已正式发言 → 「上阶段已发言」（跨阶段视角，latestOfficial 判定）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  function isSecretary(m, pid) {
    var parts = (m && m.participants) || [];
    for (var i = 0; i < parts.length; i++) if (parts[i].participant_id === pid) return parts[i].role_class === "chair_secretary";
    return false;
  }

  function statusText(seat, meeting, relayActive) {
    if (!seat.occupied) return "未参会";   /* T25-F3：六席是容量，空席≠阻塞 */
    if (!meeting) return "等待发言";
    if (relayActive && relayActive.request && relayActive.request.participant_id === seat.participant_id) {
      var secR = isSecretary(meeting, seat.participant_id);
      var st = relayActive.state;
      if (st === "response_received") return secR ? "已收到秘书回答" : "已收到回答";
      if (st === "validated") return secR ? "秘书汇总校验通过" : "校验通过";
      if (st === "accepted") return secR ? "已汇总" : "已写入会议";
      return secR ? "等待秘书回答" : "等待网页回答";
    }
    var sec = isSecretary(meeting, seat.participant_id);
    var pa = meeting.pendingAction;
    if (pa && pa.requiredParticipantIds && pa.requiredParticipantIds.indexOf(seat.participant_id) >= 0) {
      if (pa.receivedParticipantIds && pa.receivedParticipantIds.indexOf(seat.participant_id) >= 0) return sec ? "已汇总" : "已发言";
      if (meeting.activeSpeakerId === seat.participant_id) return sec ? "当前汇总" : "当前发言";   /* F1-RT：唯一当前发言 = activeSpeakerId */
      return sec ? "等待汇总" : "等待发言";
    }
    /* F5：本阶段 roster 之外（秘书阶段中的委员 / 辩论阶段中的秘书）——按历史有效正式发言判定 */
    if (A.MeetingResponseState.latestOfficial(meeting, seat.participant_id)) return sec ? "已汇总" : "上阶段已发言";
    return sec ? "等待秘书阶段" : "未参与本阶段";
  }

  /* 是否当前轮次：relay 会话命中，或唯一调度游标命中（F1-RT：禁止 required-received 派生导致多席同亮）。 */
  function isCurrentSeat(seat, meeting, relayActive) {
    if (relayActive && relayActive.request && relayActive.request.participant_id === seat.participant_id) return true;
    return !!(meeting && meeting.activeSpeakerId === seat.participant_id);
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatStatus = Object.freeze({ statusText: statusText, isCurrentSeat: isCurrentSeat, isSecretary: isSecretary });
})(typeof globalThis !== "undefined" ? globalThis : this);
