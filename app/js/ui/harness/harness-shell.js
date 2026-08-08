/* AI Council v0.1 — D3 · 会议控制台 · HarnessShell：开发验证台外壳。
 * 顶栏（标题+徽标+项目条）→ 能力灯 → 当前状态行 → 三 Tab（默认「会议」）。
 * 会议 Tab = 三栏控制台：左 ConfigPanel / 中 RelayPanel / 右 StatusPanel（含底部时间线）。
 * 能力灯只表示「模块是否成功装载」；当前进度由「当前状态」行表达。
 */
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

  function renderCapabilities() {
    var host = document.getElementById("capabilities");
    if (!host) return;
    Dom.clear(host);
    CAPABILITIES.forEach(function (c) {
      var ok = !!c[2]();
      var n = Dom.el("span", "capability " + (ok ? "ok" : "bad"), c[1] + (ok ? " ✅" : " ❌"));
      n.setAttribute("data-capability", c[0]);
      n.setAttribute("data-ok", ok ? "1" : "0");
      n.title = ok ? (c[1] + "：模块已装载") : (c[1] + "：模块未装载");
      host.appendChild(n);
    });
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
      var on = (t === id);
      var b = document.getElementById("tab-btn-" + t);
      var p = document.getElementById("tab-" + t);
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
    renderRuntimeStatus(s);
    A.ProjectBar.render(document.getElementById("project-bar"), s, onChooseProject);
    A.ConfigPanel.render(document.getElementById("console-config"), s);
    A.RelayPanel.render(document.getElementById("console-relay"), s);
    A.StatusPanel.render(document.getElementById("console-status"), s);
    A.TimelinePanel.render(document.getElementById("console-timeline"), s.meeting);
    A.CompilerView.render(document.getElementById("view-compiler"), s);
  }

  function start() {
    renderCapabilities();
    TAB_IDS.forEach(function (t) {
      var b = document.getElementById("tab-btn-" + t);
      if (b) b.addEventListener("click", function () { select(t); });
    });
    select("meeting");   /* 会议是主工作区，默认打开（方案 §17） */
    A.HarnessStore.subscribe(refresh);
    refresh();
  }

  A.HarnessShell = Object.freeze({
    select: select, refresh: refresh, start: start, runtimeStatusText: runtimeStatusText
  });

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
