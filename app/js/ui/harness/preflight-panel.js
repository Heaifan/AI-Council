/* AI Council v0.1 — T25-F3 · PreflightPanel：点名卡。六席=容量；participants=本场名单（勾选决定，开始后冻结）；未参会不阻塞，参会但配置缺失 → ⚠（保留 F2）。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;
  function tmplFor(seatId) {
    var list = A.SeatLayout.sixSeatParticipants();
    for (var i = 0; i < list.length; i++) if (list[i].alias === seatId) return list[i];
    return null;
  }
  function draftFor(pid) {
    var d = A.ConsoleActions.getDraft(), i = (d.participants || []).length;
    while (i--) if (d.participants[i].participant_id === pid) return d.participants[i];
    return null;
  }
  function seatOf(m, id) {
    var seats = A.SeatLayout.mapParticipants(m.participants, A.ConsoleActions.getStanceOverrides());
    for (var i = 0; i < seats.length; i++) if (seats[i].participant_id === id) return seats[i].seat_id;
    return id;
  }
  /* 按物理席位顺序（A1..B3）重排 participants，保证发言顺序与席位一致。 */
  function sortBySeats(m) {
    var order = A.SeatLayout.SEATS.map(function (s) { var t = tmplFor(s.seat_id); return t ? t.participant_id : null; }).filter(Boolean);
    m.participants.sort(function (x, y) { var xi = order.indexOf(x.participant_id), yi = order.indexOf(y.participant_id); return (xi < 0 ? 99 : xi) - (yi < 0 ? 99 : yi); });
  }
  function toggle(m, proto, seatId, attending, pid, on) {   /* 改本场名单 → 重解析（仅未开始时） */
    if (on) {
      var t = tmplFor(seatId), dp = t ? draftFor(t.participant_id) : null;
      if (t) m.participants.push({ participant_id: t.participant_id, actor_type: "agent", role_class: t.role_class, role_id: t.role_id, side_id: t.side_id, alias: t.alias,
        model_ref: dp ? (dp.model_ref || null) : (t.model_ref || null), transport_kind: dp ? (dp.transport_kind || "mock") : (t.transport_kind || "mock") });
      sortBySeats(m);
    } else {
      m.participants = m.participants.filter(function (x) { return x.participant_id !== pid; });
    }
    A.MeetingRuntime.reenterPhase(m, proto); A.HarnessStore.notify();
  }

  function render(host, state) {
    var m = state.meeting, proto = state.protocol;
    if (!m || !proto) return;
    var pf = A.MeetingAdmission.preflight(m, proto, A.ConsoleActions.getProfiles());
    var locked = !!(m.stateData && m.stateData.preflight_confirmed);
    var box = Dom.el("div", "card preflight");
    var secN = m.participants.filter(function (x) { return x.role_class === "chair_secretary"; }).length;
    box.appendChild(Dom.el("h2", null, "会议点名 · Round 1 · 委员 " + (m.participants.length - secN) + " · 秘书 " + secN));
    var list = Dom.el("div", "preflight-list");
    var seats = A.SeatLayout.mapParticipants(m.participants, A.ConsoleActions.getStanceOverrides());
    A.SeatLayout.SEATS.forEach(function (def) {
      var seat = null;
      for (var i = 0; i < seats.length; i++) if (seats[i].seat_id === def.seat_id) { seat = seats[i]; break; }
      var attending = !!(seat && seat.participant_id);
      var row = Dom.el("div", "preflight-row");
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = attending; cb.disabled = locked; cb.id = "pf-check-" + def.seat_id;
      cb.addEventListener("change", function () { toggle(m, proto, def.seat_id, attending, seat ? seat.participant_id : null, cb.checked); });
      row.appendChild(cb);
      if (attending) {
        var adm = pf.blocked.filter(function (b) { return b.participant_id === seat.participant_id; })[0];
        row.appendChild(Dom.el("span", adm ? "bad" : "ok", "✓ " + def.seat_id + "  " + (A.RelayProfiles.displayName(A.ConsoleActions.getProfiles(), seat.model_ref) || "未指定模型") + (adm ? "  无法入会" : "  已就绪")));
        if (adm) row.appendChild(Dom.el("span", "muted", "  " + adm.reason));
      } else {
        row.appendChild(Dom.el("span", "muted", "○ " + def.seat_id + "  未参会"));
      }
      list.appendChild(row);
    });
    box.appendChild(list);
    if (pf.blocked.length > 0) {
      var seatBlocked = pf.blocked.some(function (x) { return !x.roleBlock; });
      var note = Dom.el("p", "bad", pf.blocked.length + " 个参会成员尚未就绪，无法开始会议。");
      note.id = "preflight-blocked-note";
      box.appendChild(note);
      var bar2 = Dom.el("div", "controls");
      var cfgAll = Dom.el("button", "btn secondary", "配置未就绪席位");
      cfgAll.id = "preflight-config-blocked";
      if (!seatBlocked) cfgAll.style.display = "none";
      cfgAll.addEventListener("click", function () { var b = pf.blocked.filter(function (x) { return !x.roleBlock; })[0]; if (b) A.ConsoleActions.setSelectedSeat(seatOf(m, b.participant_id)); });
      bar2.appendChild(cfgAll);
      var recheck = Dom.el("button", "btn secondary", "重新检查");
      recheck.id = "preflight-recheck";
      recheck.addEventListener("click", function () { A.HarnessStore.notify(); });
      bar2.appendChild(recheck);
      box.appendChild(bar2);
    }
    var start = Dom.el("button", "btn primary", "开始 Round 1");
    start.id = "preflight-start";
    start.disabled = pf.blocked.length > 0;
    start.addEventListener("click", function () {
      m.stateData = m.stateData || {};
      m.stateData.preflight_confirmed = true;
      A.SeatLocalConfig.selectOnly(seatOf(m, m.activeSpeakerId));
      A.HarnessStore.notify();
    });
    box.appendChild(start);
    host.appendChild(box);
  }

  A.PreflightPanel = Object.freeze({ render: render, toggle: toggle });
})(typeof globalThis !== "undefined" ? globalThis : this);
