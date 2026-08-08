/* AI Council v0.1 — D3 · 六席会议控制台 · CenterStage：中央大屏（DOM 装配，规则全在 ConsoleActions）。
 * 结构：
 *  - 顶部模式条：会议运行 / 席位配置 两个主模式 + 当前上下文摘要。
 *  - 模式 run ：RelayPanel（Prompt/Response 主工作区 + 校验折叠 + 决定按钮）。
 *  - 模式 seat：SeatConfigPanel（当前选中席位的详细配置表单，含立场/备注）。
 * 会议配置卡（#console-config）常驻大屏顶部：无会议=可编辑表单+创建按钮，有会议=冻结摘要（创建按钮 disabled 保留文本）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function modeBtn(id, label, active, onClick) {
    var b = Dom.el("button", "mode-btn" + (active ? " active" : ""), label);
    b.id = id;
    b.addEventListener("click", onClick);
    return b;
  }

  function contextLine(box) {
    var st = A.HarnessStore.get();
    var m = st.meeting;
    if (!m) { box.appendChild(Dom.el("p", "note", "尚未创建会议：请先填写会议配置并创建，或选择席位进行配置。")); return; }
    var relay = A.WebRelayActions.activeSession(m);
    var line = "会议进行中";
    if (relay && relay.request) line += " · 当前席位 " + relay.request.participant_id;
    else if (m.pendingAction && m.pendingAction.requiredParticipantIds) line += " · 等待发言：" + m.pendingAction.requiredParticipantIds.join(", ");
    if (relay) line += " · " + A.UIText.relayState(relay.state);
    var status = Dom.el("p", "context-line", line);
    status.id = "center-context";
    box.appendChild(status);
  }

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var actions = A.ConsoleActions;
    var mode = actions.getMode();

    /* 顶部模式条 */
    var bar = Dom.el("div", "mode-bar");
    bar.appendChild(modeBtn("mode-run", "会议运行", mode === "run", function () { actions.setMode("run"); }));
    bar.appendChild(modeBtn("mode-seat", "席位配置", mode === "seat", function () { actions.setMode("seat"); }));
    host.appendChild(bar);

    /* 当前上下文 */
    var ctx = Dom.el("div", "card context");
    contextLine(ctx);
    host.appendChild(ctx);

    /* 会议配置卡（常驻）：无会议=表单，有会议=冻结摘要 */
    A.ConfigPanel.render(host, state);

    /* 模式主体：两个面板都渲染，按 mode 显隐（Browser 契约 id 常驻 DOM，C11 等创建后检查仍可查 disabled） */
    var runWrap = Dom.el("div");
    runWrap.id = "console-relay";
    runWrap.style.display = (mode === "run") ? "" : "none";
    A.RelayPanel.render(runWrap, state);
    host.appendChild(runWrap);

    var seatWrap = Dom.el("div");
    seatWrap.id = "console-seat";
    seatWrap.style.display = (mode === "seat") ? "" : "none";
    A.SeatConfigPanel.render(seatWrap, state);
    host.appendChild(seatWrap);
  }

  A.CenterStage = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
