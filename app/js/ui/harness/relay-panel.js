/* AI Council v0.1 — D3 · RelayPanel：中栏主工作区装配（DOM 投影，动作全在 WebRelayActions）。
 * 执行信息 → 双栏工作区 → 校验折叠 → 状态驱动按钮（T06 回放只读）。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function btn(id, label, cls, disabled, onClick) {
    var b = Dom.el("button", "btn" + (cls ? " " + cls : ""), label);
    b.id = id; b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }
  function row(box, id, label, value) {
    var f = Dom.field(label, value);
    f.lastChild.id = id; box.appendChild(f);
  }

  function execCard(active, profiles) {
    var box = Dom.el("div", "card exec");
    box.appendChild(Dom.el("h2", null, "当前执行"));
    var req = active && active.request;
    var pid = req ? req.participant_id : "—", modelRef = req ? (req.model_ref || "") : "";
    row(box, "relay-exec-pid", "当前委员", pid);
    row(box, "relay-exec-model", "模型", A.RelayProfiles.displayName(profiles, modelRef));
    row(box, "relay-state", "状态", active ? A.UIText.relayState(active.state) : "—");
    row(box, "relay-state-raw", "内部状态", active ? active.state : "—");
    box.appendChild(btn("relay-open-web", "打开模型网页", "secondary",
      !active || !A.RelayProfiles.isSafeUrl(A.RelayProfiles.webUrlFor(profiles, modelRef)),
      function () { A.ConsoleActions.openWeb(modelRef); }));
    return box;
  }

  function actionsBar(active, check, isReplay) {
    var bar = Dom.el("div", "controls relay-actions");
    var ok = !!(check && check.ok);
    var canAlt = !isReplay && !!(active && active.state !== "rejected" && active.state !== "failed");
    if (ok) bar.appendChild(btn("relay-accept", "接受为正式发言", "primary", false, function () { A.WebRelayActions.accept(); }));
    bar.appendChild(btn("relay-reject", "拒绝回答", "secondary", !canAlt, function () { A.WebRelayActions.reject(); }));
    bar.appendChild(btn("relay-retry", "重新请求", "secondary", !canAlt, function () { A.WebRelayActions.retry(); }));
    bar.appendChild(btn("relay-cancel", "取消本次请求", "secondary", !active || isReplay, function () { A.WebRelayActions.cancel(); }));
    return bar;
  }

  function idleOrEmpty(host, state) {
    if (!state.meeting) {
      var e = Dom.el("p", "empty", "当前没有会议。请在左侧填写会议配置后创建会议。");
      e.id = "relay-empty";
      host.appendChild(e);
      return;
    }
    var pid = A.RelayFlow.nextRelay(state.meeting);
    if (!pid) {
      var n = Dom.el("p", "empty", "没有需要网页中继的委员。模拟 Agent 请用「执行下一步（模拟）」推进。");
      n.id = "relay-empty";
      host.appendChild(n);
      return;
    }
    var h = Dom.el("p", "note", "委员 " + pid + " 走网页中继：系统只搬运提示词与回答，绝不自动相信外部 AI。");
    h.id = "relay-hint";
    host.appendChild(h);
    host.appendChild(btn("relay-open", "生成提示词（" + pid + "）", "primary", false, function () { A.WebRelayActions.openRelay(); }));
  }

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var ds = A.ReplayProvider.get(state), isReplay = ds.isReplay;
    var vs = isReplay ? Object.assign({}, state, { meeting: ds.meeting }) : state;
    if (isReplay) {   /* T06：回放只读——不渲染任何中继操作入口 */
      var r = Dom.el("p", "empty", "⏱ 历史回放中：中继操作已禁用，仅可浏览席位状态与时间轴。");
      r.id = "relay-replay-readonly";
      host.appendChild(r);
      return;
    }
    var active = A.WebRelayActions.activeSession(vs.meeting);
    var check = active ? A.WebRelayActions.getCheck() : null;
    if (!active) {
      idleOrEmpty(host, vs);
      var n0 = A.WebRelayActions.getNotice();
      if (n0) { var n0e = Dom.el("div", "status " + n0.kind, n0.text); n0e.id = "relay-msg"; host.appendChild(n0e); }
      return;
    }
    var profiles = A.ConsoleActions.getProfiles(), req = active && active.request;
    host.appendChild(execCard(active, profiles));
    host.appendChild(A.AutomationView.build(active, req ? req.model_ref : ""));
    host.appendChild(A.RelayWorkarea.workarea(active));
    host.appendChild(A.RelayVerdict.build(active, check));
    var note = Dom.el("p", "status warn", "注意：此回答尚未写入正式会议记录。");
    note.id = "relay-not-official";
    host.appendChild(note);
    host.appendChild(actionsBar(active, check, isReplay));
    var nm = A.WebRelayActions.getNotice();
    if (nm) { var nme = Dom.el("div", "status " + nm.kind, nm.text); nme.id = "relay-msg"; host.appendChild(nme); }
  }

  A.RelayPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
