/* AI Council v0.1 — D3 · SeatCard：席位摘要卡（DOM 投影）。F1 紧凑化；F1-RT：修改/撤回/blocked。 */
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
    if (meeting && meeting.activeSpeakerId === seat.participant_id) {   /* F1（T08）：当前发言人 blocked → 状态行说明原因 */
      var adm = A.MeetingAdmission.admissionOf(meeting, state.protocol, actions.getProfiles(), seat.participant_id);
      if (adm.status === "blocked") stText = "⚠ 无法入会：" + adm.reason;
    }
    var st = Dom.el("div", "seat-state" + stateClass(stText), stText);
    box.appendChild(st);

    var bar = Dom.el("div", "seat-actions");
    bar.appendChild(btn("seat-edit-" + seat.seat_id, "配置", "secondary", !seat.occupied,
      function () { actions.setSelectedSeat(seat.seat_id); }));
    var openUrl = A.RelayProfiles.webUrlFor(actions.getProfiles(), modelRef);
    bar.appendChild(btn("seat-openweb-" + seat.seat_id, "打开网页", "secondary",
      !p || !A.RelayProfiles.isSafeUrl(openUrl), function () { actions.openWeb(modelRef); }));
    /* T12b/T13b：已发言席位可修改/撤回（历史不物理删除；replay 视图 messages 为空自动隐藏）。 */
    var msg = A.MeetingResponseState.latestOfficial(meeting, seat.participant_id);
    if (msg) {
      bar.appendChild(btn("seat-revise-" + seat.seat_id, "修改", "secondary", false, function (ev) {
        if (ev) ev.stopPropagation();   /* 不触发卡片选中（不改 mode） */
        var txt = window.prompt("修改正式发言：", (msg.content && msg.content.raw_text) || "");
        if (txt === null || txt === "") return;
        A.MeetingResponseState.revise(meeting, state.protocol, msg.message_id, txt);
        A.HarnessStore.notify();
      }));
      bar.appendChild(btn("seat-revoke-" + seat.seat_id, "撤回", "secondary", false, function (ev) {
        if (ev) ev.stopPropagation();
        A.MeetingResponseState.revoke(meeting, msg.message_id);
        A.HarnessStore.notify();
      }));
    }
    box.appendChild(bar);
    host.appendChild(box);
  }

  A.SeatCard = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
