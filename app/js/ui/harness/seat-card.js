/* AI Council v0.1 — D3 · 六席会议控制台 · SeatCard：席位摘要卡（DOM 投影）。
 * F1 紧凑化：头部（编号+角色+当前轮次徽标）/ 摘要行（模型·引用）/ 元信息行（传输·立场）/ 状态行 / 按钮行。
 * 单卡目标高度 130-145px；详细配置进中央大屏席位配置模式（用户 ONE-SCREEN-F1 §三）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function btn(id, label, cls, disabled, onClick) {
    var b = Dom.el("button", "btn seat-btn" + (cls ? " " + cls : ""), label);
    b.id = id; b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }

  /* 取参与者投影：会议已建从 meeting 取，未建从草稿取（创建前席位卡也可点选配置）。 */
  function participantOf(seat, state, actions) {
    if (!seat.occupied) return null;
    var list = state.meeting ? state.meeting.participants : actions.getDraft().participants;
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i].participant_id === seat.participant_id) return list[i];
    }
    return null;
  }

  function stateClass(text) {
    if (text === "当前发言" || text === "等待网页回答" || text === "已收到回答" ||
        text === "校验通过" || text === "已写入会议") return " current";
    if (text === "已发言") return "";
    return " wait";
  }

  function render(host, seat, state, opts) {
    if (!host) return;
    var actions = A.ConsoleActions;
    var meeting = state.meeting;
    var relayActive = A.WebRelayActions.activeSession(meeting);
    var p = participantOf(seat, state, actions);
    var isCurrent = A.SeatStatus.isCurrentSeat(seat, meeting, relayActive);
    var selected = actions.getSelectedSeatId() === seat.seat_id;

    var box = Dom.el("div", "card seat-card" +
      (isCurrent ? " current" : "") + (selected ? " selected" : "") + (seat.occupied ? "" : " empty"));
    box.id = "seat-" + seat.seat_id;
    /* 点击卡片本身即选中（用户方案 §六：删除 [选中] 按钮）。 */
    box.addEventListener("click", function () { actions.setSelectedSeat(seat.seat_id); });

    var head = Dom.el("div", "seat-head");
    head.appendChild(Dom.el("span", "seat-id", seat.seat_id + (seat.occupied ? "" : "（空）")));
    if (p) head.appendChild(Dom.el("span", "seat-role", p.role_id || p.role_class || ""));
    if (isCurrent) head.appendChild(Dom.el("span", "seat-current", "当前轮次"));
    box.appendChild(head);

    var modelRef = p ? (p.model_ref || "") : "";
    if (p) {
      var sum = Dom.el("div", "seat-sum");
      sum.appendChild(Dom.el("b", null, A.RelayProfiles.displayName(actions.getProfiles(), modelRef)));
      sum.appendChild(Dom.el("span", null, modelRef || "（未指定模型）"));
      box.appendChild(sum);
      var meta = Dom.el("div", "seat-meta");
      meta.textContent = A.UIText.transport(p.transport_kind || "mock") + " · " + (seat.stance_text || "—");
      box.appendChild(meta);
    }

    var stText = A.SeatStatus.statusText(seat, meeting, relayActive);
    var st = Dom.el("div", "seat-state" + stateClass(stText), stText);
    box.appendChild(st);

    var bar = Dom.el("div", "seat-actions");
    bar.appendChild(btn("seat-edit-" + seat.seat_id, "配置", "secondary", !seat.occupied,
      function () { actions.setSelectedSeat(seat.seat_id); }));
    bar.appendChild(btn("seat-openweb-" + seat.seat_id, "打开网页", "secondary",
      !p || !A.RelayProfiles.isSafeUrl(A.RelayProfiles.webUrlFor(actions.getProfiles(), modelRef)),
      function () { actions.openWeb(modelRef); }));
    box.appendChild(bar);
    host.appendChild(box);
  }

  A.SeatCard = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
