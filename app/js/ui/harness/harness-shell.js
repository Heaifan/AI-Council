/* AI Council v0.1 — D2-F1
 * HarnessShell：Developer Harness 外壳——能力灯 + 三 Tab 切换 + 订阅 Store 驱动重绘。
 * 只管外壳：不编译、不推进会议、不判定业务规则。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;
  var TAB_IDS = ["protocols", "meeting", "compiler"];

  var CAPABILITIES = [
    ["Protocol", function () { return !!(A.ProtocolSession && A.ProtocolRegistry); }],
    ["Runtime", function () { return !!(A.MeetingRuntime && A.MeetingFactory); }],
    ["Persistence", function () { return !!(A.MeetingArchive && A.MeetingPersistence && A.MeetingRestore); }],
    ["Compiler", function () { return !!(A.InstructionCompiler && A.RoleCardRegistry); }],
    ["Renderer", function () { return !!A.PromptRenderer; }],
    ["WebRelay", function () { return !!(A.WebRelayController && A.RelayFlow); }]
  ];

  function renderCapabilities() {
    var host = document.getElementById("capabilities");
    if (!host) return;
    Dom.clear(host);
    CAPABILITIES.forEach(function (c) {
      var ok = !!c[1]();
      var n = Dom.el("span", "capability " + (ok ? "ok" : "bad"), c[0] + (ok ? " ✅" : " ❌"));
      n.setAttribute("data-capability", c[0]);
      n.setAttribute("data-ok", ok ? "1" : "0");
      host.appendChild(n);
    });
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

  /* Store 一变就整屏重绘：Harness 不做局部 diff，宁可全量重画换取状态与界面绝对一致。 */
  function refresh() {
    var s = A.HarnessStore.get();
    var mh = document.getElementById("view-meeting");
    if (mh) {
      A.Dom.clear(mh);
      var rt = A.Dom.el("div"); mh.appendChild(rt); A.MeetingRuntimeView.render(rt, s);
      var rl = A.Dom.el("div"); mh.appendChild(rl); A.WebRelayView.render(rl, s);
    }
    A.CompilerView.render(document.getElementById("view-compiler"), s);
  }

  function start() {
    renderCapabilities();
    TAB_IDS.forEach(function (t) {
      var b = document.getElementById("tab-btn-" + t);
      if (b) b.addEventListener("click", function () { select(t); });
    });
    select("protocols");
    A.HarnessStore.subscribe(refresh);
    refresh();
  }

  A.HarnessShell = Object.freeze({ select: select, refresh: refresh, start: start });

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
