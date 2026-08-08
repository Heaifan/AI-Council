/* AI Council v0.1 — D3 · 六席会议控制台 · HarnessShell：开发验证台外壳（F2：Meeting HUD + 席位编辑守卫）。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;
  var TAB_IDS = ["protocols", "meeting", "compiler"];

  var CAPABILITIES = [
    ["Protocol", "议事规则", function () { return !!(A.ProtocolSession && A.ProtocolRegistry); }],
    ["Runtime", "会议运行时", function () { return !!(A.MeetingRuntime && A.MeetingFactory); }],
    ["Persistence", "会议存档", function () { return !!(A.MeetingArchive && A.MeetingPersistence && A.MeetingRestore); }],
    ["Compiler", "指令编译器", function () { return !!(A.InstructionCompiler && A.RoleCardRegistry); }],
    ["Renderer", "提示词渲染器", function () { return !!A.PromptRenderer; }],
    ["WebRelay", "网页中继", function () { return !!(A.WebRelayController && A.RelayFlow && A.RelayPanel); }]
  ];

  /* 能力灯折叠层：summary = 系统 ● 正常/异常；展开显示 6 灯（data-* 契约保留）。 */
  function renderCapabilities() {
    var host = document.getElementById("capabilities");
    if (!host) return;
    Dom.clear(host);
    var allOk = CAPABILITIES.every(function (c) { return !!c[2](); });
    var details = document.createElement("details");
    details.className = "sys-status";
    var sum = Dom.el("summary", null, "系统 " + (allOk ? "● 正常" : "● 异常"));
    sum.id = "sys-status-summary"; details.appendChild(sum);
    var box = Dom.el("div", "sys-body");
    CAPABILITIES.forEach(function (c) {
      var ok = !!c[2](), n = Dom.el("span", "capability " + (ok ? "ok" : "bad"), c[1] + (ok ? " ✓" : " ✗"));
      n.setAttribute("data-capability", c[0]);
      n.setAttribute("data-ok", ok ? "1" : "0");
      n.title = ok ? (c[1] + "：模块已装载") : (c[1] + "：模块未装载");
      box.appendChild(n);
    });
    details.appendChild(box);
    host.appendChild(details);
  }

  function runtimeStatusText(s) {
    if (!s || !s.registry) return "等待选择项目目录";
    if (!s.meeting) return "已加载议事规则，等待创建会议";
    var relay = A.WebRelayActions && A.WebRelayActions.activeSession(s.meeting);
    if (relay) return "网页中继 · " + A.UIText.relayState(relay.state);
    return "会议 " + s.meeting.meetingId + " · " + A.UIText.meetingStatus(s.meeting.status);
  }

  function renderRuntimeStatus(s) {
    var host = document.getElementById("runtime-status");
    if (host) host.textContent = "当前状态：" + runtimeStatusText(s);
  }

  function select(id) {
    TAB_IDS.forEach(function (t) {
      var on = (t === id), b = document.getElementById("tab-btn-" + t), p = document.getElementById("tab-" + t);
      if (b) { b.className = "tab" + (on ? " active" : ""); b.setAttribute("aria-selected", on ? "true" : "false"); }
      if (p) p.className = "tab-panel" + (on ? " active" : "");
    });
  }

  function onChooseProject() {
    var input = document.getElementById("dir-input");
    if (input) input.click();
  }

  function refresh() {
    var s = A.HarnessStore.get();
    A.MeetingHud.render(document.getElementById("meeting-hud"), s);
    renderRuntimeStatus(s);
    renderCapabilities();
    A.ProjectBar.render(document.getElementById("project-bar"), s, onChooseProject);
    A.SeatColumn.render(document.getElementById("console-left"), "A", s);
    /* F2 守卫：中央正显示该席位表单且草稿 dirty → 不重建（防未保存输入被 runtime render 覆盖）。 */
    var actions = A.ConsoleActions, seatWrap = document.getElementById("console-seat");
    var h2 = seatWrap && seatWrap.querySelector("#seat-config h2");
    var showingSeat = !!(seatWrap && seatWrap.style.display !== "none" && h2 &&
      h2.textContent.indexOf(actions.getSelectedSeatId()) >= 0);
    var seatDirty = actions.getMode() === "seat" && showingSeat && A.SeatEditDraft.anyDirty();
    if (!seatDirty) A.CenterStage.render(document.getElementById("console-center"), s);
    A.SeatColumn.render(document.getElementById("console-right"), "B", s);
    A.TimelinePanel.render(document.getElementById("console-timeline"), s.meeting);
    A.DevToolsPanel.render(document.getElementById("console-devtools"), !!s.registry, !!s.meeting);
    A.CompilerView.render(document.getElementById("view-compiler"), s);
  }

  function start() {
    if (A.SeatLocalConfig) A.SeatLocalConfig.load();   /* F1：刷新后恢复立场/备注/选中席位 */
    TAB_IDS.forEach(function (t) {
      var b = document.getElementById("tab-btn-" + t);
      if (b) b.addEventListener("click", function () { select(t); });
    });
    select("meeting");   /* 会议是主工作区，默认打开 */
    A.HarnessStore.subscribe(refresh);
    refresh();
  }

  A.HarnessShell = Object.freeze({ select: select, refresh: refresh, start: start, runtimeStatusText: runtimeStatusText });

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
