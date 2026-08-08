/* AI Council v0.1 — D3 · 会议控制台 · RelayPanel：中栏主工作区装配（DOM 投影，动作全在 WebRelayActions）。
 * 当前执行信息 → RelayWorkarea 双栏 → 校验折叠 → 状态驱动决定按钮。
 */
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
    f.lastChild.id = id;
    box.appendChild(f);
  }

  function execCard(active, profiles) {
    var box = Dom.el("div", "card exec");
    box.appendChild(Dom.el("h2", null, "当前执行"));
    var req = active && active.request;
    var pid = req ? req.participant_id : "—";
    row(box, "relay-exec-pid", "当前委员", pid);
    var modelRef = req ? (req.model_ref || "") : "";
    row(box, "relay-exec-model", "模型", A.RelayProfiles.displayName(profiles, modelRef));
    row(box, "relay-state", "状态", active ? A.UIText.relayState(active.state) : "—");
    row(box, "relay-state-raw", "内部状态", active ? active.state : "—");
    var open = btn("relay-open-web", "打开模型网页", "secondary",
      !active || !A.RelayProfiles.isSafeUrl(A.RelayProfiles.webUrlFor(profiles, modelRef)),
      function () { A.ConsoleActions.openWeb(modelRef); });
    box.appendChild(open);
    box.appendChild(A.AutomationView.build(active, modelRef));
    return box;
  }

  function actionsBar(active, check) {
    var bar = Dom.el("div", "controls relay-actions");
    /* 状态驱动（方案 §六）：校验通过后才显示接受/拒绝/重新请求。 */
    if (check && check.ok) {
      bar.appendChild(btn("relay-accept", "接受为正式发言", "primary", false, function () { A.WebRelayActions.accept(); }));
      bar.appendChild(btn("relay-reject", "拒绝回答", "secondary", false, function () { A.WebRelayActions.reject(); }));
      bar.appendChild(btn("relay-retry", "重新请求", "secondary", false, function () { A.WebRelayActions.retry(); }));
    } else {
      var canAlt = !(active && active.state !== "rejected" && active.state !== "failed");
      bar.appendChild(btn("relay-reject", "拒绝回答", "secondary", canAlt, function () { A.WebRelayActions.reject(); }));
      bar.appendChild(btn("relay-retry", "重新请求", "secondary", canAlt, function () { A.WebRelayActions.retry(); }));
    }
    bar.appendChild(btn("relay-cancel", "取消本次请求", "secondary", !active, function () { A.WebRelayActions.cancel(); }));
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
    var active = A.WebRelayActions.activeSession(state.meeting);
    var check = active ? A.WebRelayActions.getCheck() : null;
    var notice = A.WebRelayActions.getNotice();
    if (!active) {
      idleOrEmpty(host, state);
      if (notice) { var n0 = Dom.el("div", "status " + notice.kind, notice.text); n0.id = "relay-msg"; host.appendChild(n0); }
      return;
    }
    var profiles = A.ConsoleActions.getProfiles();
    host.appendChild(execCard(active, profiles));
    host.appendChild(A.RelayWorkarea.workarea(active));
    host.appendChild(A.RelayVerdict.build(active, check));
    var note = Dom.el("p", "status warn", "注意：此回答尚未写入正式会议记录。");
    note.id = "relay-not-official";
    host.appendChild(note);
    host.appendChild(actionsBar(active, check));
    if (notice) { var nm = Dom.el("div", "status " + notice.kind, notice.text); nm.id = "relay-msg"; host.appendChild(nm); }
  }

  A.RelayPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
