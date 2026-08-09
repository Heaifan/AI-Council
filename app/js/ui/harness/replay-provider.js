/* AI Council v0.1 — MEETING-REPLAY-F1 · ReplayProvider：Display State 唯一出口（方案 T04，架构核心）。
 * displayState = replayCursor === latest ? liveState : replayState
 * 全部 UI 组件（SeatCard / Header / Current Execution / Summary / PendingAction / Phase / Round）
 * 只消费 get(state) 的返回；禁止组件自行混读 Live Runtime。
 * 回放视图 = meeting-shaped 只读投影（participants 同 live、pendingAction/phase/status 由 events 重建），
 * 组件无需感知 replay 即可正确显示历史；mutating 判定走 isReplay。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  function get(state) {
    var meeting = state.meeting;
    if (!meeting) return { isReplay: false, cursor: 0, latest: 0, meeting: null, replay: null, timeline: [] };
    var nodes = A.MeetingReplay.buildTimeline(meeting, state.protocol);
    var cur = A.ReplayCursor.get();
    var latest = A.ReplayCursor.latest(meeting);
    if (cur < 0 || cur >= latest) return { isReplay: false, cursor: latest, latest: latest, meeting: meeting, replay: null, timeline: nodes };
    var rs = A.MeetingReplay.replayStateAt(meeting, state.protocol, cur);
    /* stateData 浅拷贝且清空 web_relay：回放视图不得暴露「未来」的中继会话（activeSession 依赖 stateData.web_relay）。 */
    var sd = Object.assign({}, meeting.stateData || {});
    delete sd.web_relay;
    var view = {
      meetingId: meeting.meetingId, title: meeting.title, topic: meeting.topic,
      protocolId: meeting.protocolId, participants: meeting.participants,
      currentPhaseId: rs.phase_id, status: rs.status || meeting.status,
      pendingAction: rs.pending_action, events: meeting.events.slice(0, cur),
      messages: [], lastAction: null, stateData: sd,
      isReplayView: true
    };
    return { isReplay: true, cursor: cur, latest: latest, meeting: view, replay: rs, timeline: nodes };
  }

  /* 回放模式下必须禁用的 mutating 控件（方案 T06）：提交/接受/拒绝/重试/取消/执行步骤/裁定/存档。 */
  function mutatingDisabled(state) {
    return get(state).isReplay;
  }

  A.ReplayProvider = Object.freeze({ get: get, mutatingDisabled: mutatingDisabled });
})(typeof globalThis !== "undefined" ? globalThis : this);
