/* AI Council v0.1 — MEETING-RUNTIME-F1 · SeatNav：席位浏览导航（T11/F4，DOM 投影）。
 * ← 上一席 | 当前 A2 · 2/6 | 下一席 →：只改变 selectedSeat（查看对象），绝不改变 activeSpeaker。
 * F4：会议运行中上一/下一席遍历 Phase Roster（1v1: A1↔B1，不经过空席）；物理席位仅在无会议时兜底。
 * selectedSeat ≠ activeSpeaker 时出现「回到当前发言」（浏览后一键回调度焦点）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function btn(id, label, cls, disabled, onClick) {
    var b = Dom.el("button", "btn secondary small" + (cls ? " " + cls : ""), label);
    b.id = id; b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }

  /* 会议运行中：Phase Roster 席位顺序；无会议：物理六席。 */
  function navList(m) {
    if (m && A.MeetingTurnSelector && m.participants) {
      var roster = A.MeetingTurnSelector.getRoundRoster(m);
      var seats = A.SeatLayout.mapParticipants(m.participants, A.ConsoleActions.getStanceOverrides());
      var out = [];
      for (var i = 0; i < roster.length; i++) {
        for (var j = 0; j < seats.length; j++) if (seats[j].participant_id === roster[i]) { out.push(seats[j].seat_id); break; }
      }
      if (out.length) return out;
    }
    return A.SeatLayout.SEATS.map(function (s) { return s.seat_id; });
  }

  function navSeat(delta) {
    var cur = A.ConsoleActions.getSelectedSeatId();
    var list = navList(A.HarnessStore.get().meeting);
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i] === cur) { idx = i; break; }
    if (idx < 0) idx = 0;
    A.SeatLocalConfig.selectOnly(list[(idx + delta + list.length) % list.length]);   /* 只改查看对象 */
  }

  function build(state, isReplay) {
    var m = state.meeting;
    var roster = A.MeetingTurnSelector ? A.MeetingTurnSelector.getRoundRoster(m) : [];
    var done = A.MeetingTurnSelector ? A.MeetingTurnSelector.deriveCompleted(m).length : 0;
    var spk = null;
    if (m && m.activeSpeakerId) {
      var seats = A.SeatLayout.mapParticipants(m.participants, A.ConsoleActions.getStanceOverrides());
      for (var i = 0; i < seats.length; i++) if (seats[i].participant_id === m.activeSpeakerId) { spk = seats[i].seat_id; break; }
      if (!spk) spk = m.activeSpeakerId;
    }
    var nav = Dom.el("div", "controls seat-nav");
    nav.appendChild(btn("seat-prev", "← 上一席", null, !m || isReplay, function () { navSeat(-1); }));
    var isSec = !!(spk && m && m.participants && m.participants.some(function (x) { return x.participant_id === spk && x.role_class === "chair_secretary"; }));
    var curL = Dom.el("span", "seat-nav-cur", (spk || "—") + " · " + (spk ? (isSec ? "当前汇总" : "当前发言") : "全部完成") + " · " + done + "/" + roster.length);
    curL.id = "seat-nav-current";
    nav.appendChild(curL);
    /* F4：查看对象 ≠ 当前发言人时提供「回到当前发言」 */
    var sel = A.ConsoleActions.getSelectedSeatId();
    if (!isReplay && m && spk && sel && sel !== spk) {
      nav.appendChild(btn("seat-follow", "回到当前发言", null, false, function () { A.ConsoleActions.followActiveSpeaker(); }));
    }
    nav.appendChild(btn("seat-next", "下一席 →", null, !m || isReplay, function () { navSeat(1); }));
    return nav;
  }

  A.SeatNav = Object.freeze({ build: build, navSeat: navSeat, navList: navList });
})(typeof globalThis !== "undefined" ? globalThis : this);
