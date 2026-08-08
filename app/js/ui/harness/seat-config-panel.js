/* AI Council v0.1 — D3 · 六席会议控制台 · SeatConfigPanel：中央大屏「席位配置」编辑器（DOM 投影）。
 * 当前选中席位的详细配置表单装配；字段构建在 SeatConfigFields。
 * F1：保存回调 = SeatConfigCommit.run（写入后自动返回会议运行）；取消 = 直接返回（挂起编辑丢弃）。
 * Browser 契约 id（C 系列）：cfg-model-ref-<pid> / cfg-url-<pid> / cfg-open-web-<pid>。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function findSeat(state, actions) {
    var seatId = actions.getSelectedSeatId();
    var seats = A.SeatLayout.mapParticipants(
      state.meeting ? state.meeting.participants : actions.getDraft().participants,
      actions.getStanceOverrides());
    for (var i = 0; i < seats.length; i++) if (seats[i].seat_id === seatId) return seats[i];
    return null;
  }

  function findParticipant(state, actions, pid) {
    var list = state.meeting ? state.meeting.participants : actions.getDraft().participants;
    for (var j = 0; j < (list || []).length; j++) if (list[j].participant_id === pid) return list[j];
    return null;
  }

  function render(host, state) {
    if (!host) return;
    var actions = A.ConsoleActions;
    var frozen = actions.isFrozen();
    var seat = findSeat(state, actions);
    var pt = seat && seat.participant_id ? findParticipant(state, actions, seat.participant_id) : null;

    var box = Dom.el("div", "card seat-config-card");
    box.id = "seat-config";
    box.appendChild(Dom.el("h2", null, (seat ? seat.seat_id : "—") + " · 席位配置" +
      (pt ? "（" + pt.participant_id + "）" : "（空席）")));
    if (frozen) {
      box.appendChild(Dom.el("p", "note", "会议协议与历史已冻结；席位运行配置（模型/引用/传输/网页/立场/备注）仍可修改。"));
    }

    if (!pt) {
      box.appendChild(Dom.el("p", "empty", "该席位当前为空。创建会议前请先为席位分配与会者。"));
      host.appendChild(box);
      return;
    }

    var profile = A.RelayProfiles.findByModelRef(actions.getProfiles(), pt.model_ref || "");
    A.SeatConfigFields.build(box, pt, seat, profile, frozen, actions,
      function (edits) { A.SeatConfigCommit.run(pt.participant_id, seat.seat_id, edits); },
      function () { A.SeatEditDraft.clear(pt.participant_id); actions.setMode("run"); });
    host.appendChild(box);
  }

  A.SeatConfigPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
