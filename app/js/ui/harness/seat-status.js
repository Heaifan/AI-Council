/* AI Council v0.1 — D3 · 六席会议控制台 · SeatStatus：席位状态中文判定（无 DOM 纯函数）。
 * 状态枚举（用户方案 Task2）：空闲 / 等待发言 / 当前发言 / 等待网页回答 / 已收到回答 / 已写入会议 / 已发言。
 */
(function (root) {
  "use strict";

  function statusText(seat, meeting, relayActive) {
    if (!seat.occupied) return "空席";
    if (!meeting) return "等待发言";
    if (relayActive && relayActive.request && relayActive.request.participant_id === seat.participant_id) {
      var st = relayActive.state;
      if (st === "response_received") return "已收到回答";
      if (st === "validated") return "校验通过";
      if (st === "accepted") return "已写入会议";
      return "等待网页回答";
    }
    var pa = meeting.pendingAction;
    if (pa && pa.requiredParticipantIds && pa.requiredParticipantIds.indexOf(seat.participant_id) >= 0) {
      if (pa.receivedParticipantIds && pa.receivedParticipantIds.indexOf(seat.participant_id) >= 0) return "已发言";
      return "当前发言";
    }
    return "等待发言";
  }

  /* 是否当前轮次：relay 会话命中，或 pendingAction 轮到且未发言。 */
  function isCurrentSeat(seat, meeting, relayActive) {
    if (relayActive && relayActive.request && relayActive.request.participant_id === seat.participant_id) return true;
    if (meeting && meeting.pendingAction && meeting.pendingAction.requiredParticipantIds) {
      return meeting.pendingAction.requiredParticipantIds.indexOf(seat.participant_id) >= 0 &&
        meeting.pendingAction.receivedParticipantIds.indexOf(seat.participant_id) < 0;
    }
    return false;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatStatus = Object.freeze({ statusText: statusText, isCurrentSeat: isCurrentSeat });
})(typeof globalThis !== "undefined" ? globalThis : this);
