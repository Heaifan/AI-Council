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

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var actions = A.ConsoleActions;
    var mode = actions.getMode();
    var ds = A.ReplayProvider.get(state);

    /* T06：回放模式横幅——查看历史时顶部明确提示 + [回到当前会议]（只读浏览）。 */
    if (ds.isReplay) {
      var rn = ds.timeline[ds.cursor] || null;
      var banner = Dom.el("div", "replay-banner");
      banner.id = "replay-banner";
      banner.appendChild(Dom.el("span", null, "⏱ 正在查看历史状态" +
        (rn ? " · R" + rn.round + " · " + rn.label : "") + "（游标 " + ds.cursor + " / " + ds.latest + "）"));
      var back = Dom.el("button", "btn secondary", "回到当前会议");
      back.id = "replay-back";
      back.addEventListener("click", function () { A.ReplayCursor.toLatest(state.meeting); });
      banner.appendChild(back);
      host.appendChild(banner);
    }

    /* 顶部模式条：仅 run 模式显示（seat 模式由表单标题/取消/保存表达，省 80px 让配置一屏）。
     * F2：上下文卡删除——状态/等待信息由顶部 Meeting HUD 承担（不再占中央空间）。 */
    if (mode !== "seat") {
      var bar = Dom.el("div", "mode-bar");
      bar.appendChild(modeBtn("mode-run", "会议运行", mode === "run", function () { actions.setMode("run"); }));
      bar.appendChild(modeBtn("mode-seat", "席位配置", mode === "seat", function () { actions.setMode("seat"); }));
      host.appendChild(bar);
    }

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
