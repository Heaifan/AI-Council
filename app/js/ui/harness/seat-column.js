/* AI Council v0.1 — D3 · 六席会议控制台 · SeatColumn：左右席位列装配（DOM 投影）。
 * 左列 = A1..A3（支持侧），右列 = B1..B3（质疑侧）+ 右列底部会议摘要窄卡（F1 压缩为双列）。
 * 席位卡 = SeatCard 摘要卡（选中/编辑/打开网页）；详细配置进中央大屏，不在两侧铺开。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function columnSeats(side) {
    return A.SeatLayout.SEATS.filter(function (s) { return s.side === side; });
  }

  /* 会议摘要窄卡（F1 双列 grid：状态/内部、阶段/事件数、应发言/已接收，按钮行 + 消息行）。
   * T06：回放模式下所有 mutating 按钮禁用（执行/裁定/存档），仅浏览。 */
  function meetingSummary(state, ds) {
    ds = ds || A.ReplayProvider.get(state);
    var isReplay = !!ds.isReplay;
    var box = Dom.el("div", "card summary-card");
    box.appendChild(Dom.el("h2", null, "会议摘要"));
    var s = A.MeetingStepFlow.summary(state.meeting);
    if (!s) {
      var e = Dom.el("p", "empty", "当前没有正在进行的会议。");
      e.id = "mt-empty";
      box.appendChild(e);
      return box;
    }
    var line = function (target, id, key, val) {
      var f = Dom.el("div", "seat-line");
      f.appendChild(Dom.el("span", "seat-key", key));
      var v = Dom.el("span", "seat-val", val);
      v.id = id;
      f.appendChild(v);
      target.appendChild(f);
    };
    var grid = Dom.el("div", "summary-grid");
    line(grid, "mt-status", "状态", A.UIText.meetingStatus(s.status));
    line(grid, "mt-status-raw", "内部", s.status);
    line(grid, "mt-phase", "阶段", s.currentPhaseId || "—");
    line(grid, "mt-events", "事件数", s.events);
    if (s.pending) {
      line(grid, "mt-required", "应发言", s.pending.required.join(", ") || "—");
      line(grid, "mt-received", "已接收",
        s.pending.received.length ? (s.pending.received.join(", ")) : "（无）");
    }
    box.appendChild(grid);
    box.appendChild(A.SeatNav.build(state, isReplay));   /* T11：上一席/当前/下一席（只改查看） */
    var gate = A.MeetingStepFlow.humanGateState(state.meeting);
    var bar = Dom.el("div", "controls");
    /* T25-F2：仅 completion 满足才出现「进入下一阶段」（running 不渲染灰按钮） */
    var advOn = !isReplay && A.MeetingTurnSelector && A.MeetingTurnSelector.phaseStatus(state.meeting, state.protocol) === "ready_to_advance";
    if (advOn) { var adv = Dom.el("button", "btn primary small", "进入下一阶段 →"); adv.id = "mt-advance";
      adv.addEventListener("click", function () { A.MeetingActions.advance(state); }); bar.appendChild(adv); }
    [["mt-finish", "结束会议", "finish"], ["mt-continue", "继续会议", "continue"], ["mt-battle", "进入对辩", "battle"]].forEach(function (g) {
      var off = !gate.enabled || gate.choices.indexOf(g[2]) < 0 || isReplay;
      var b = Dom.el("button", "btn secondary small", g[1]);
      b.id = g[0]; b.disabled = off;
      if (!off) b.addEventListener("click", function () { A.MeetingActions.decide(state, g[2]); });
      bar.appendChild(b);
    });
    var save = Dom.el("button", "btn secondary small", "保存");
    save.id = "mt-save"; save.disabled = !state.meeting || isReplay;
    save.addEventListener("click", function () { A.MeetingActions.save(state); });
    bar.appendChild(save);
    var load = Dom.el("button", "btn secondary small", "加载");
    load.id = "mt-load"; load.disabled = !state.registry || isReplay;
    load.addEventListener("click", function () { A.MeetingActions.load(state); });
    bar.appendChild(load);
    box.appendChild(bar);
    var m = A.MeetingActions.message();
    var note = Dom.el("div", "status " + m.kind, m.text);
    note.id = "mt-msg";
    box.appendChild(note);
    return box;
  }

  function render(host, side, state) {
    if (!host) return;
    Dom.clear(host);
    var actions = A.ConsoleActions;
    /* T04：统一消费 displayState——回放时整个右栏/席列从 replay 视图投影，组件不自判 replay。 */
    var ds = A.ReplayProvider.get(state);
    var vs = ds.isReplay ? Object.assign({}, state, { meeting: ds.meeting }) : state;
    var seats = A.SeatLayout.mapParticipants(
      vs.meeting ? vs.meeting.participants : actions.getDraft().participants,
      actions.getStanceOverrides());
    columnSeats(side).forEach(function (def) {
      var seat = null;
      for (var i = 0; i < seats.length; i++) if (seats[i].seat_id === def.seat_id) { seat = seats[i]; break; }
      A.SeatCard.render(host, seat || def, vs);
    });
    if (side === "B") host.appendChild(meetingSummary(vs, ds));
  }

  A.SeatColumn = Object.freeze({ render: render, meetingSummary: meetingSummary });
})(typeof globalThis !== "undefined" ? globalThis : this);
