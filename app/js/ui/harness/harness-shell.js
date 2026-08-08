/* AI Council v0.1 — D3 · WEB_RELAY
 * HarnessShell：开发验证台外壳——能力灯 + 三 Tab 切换 + 订阅 Store 驱动重绘。
 * 能力灯语义（冻结）：只表示「该模块是否成功装载」，与是否已选目录 / 是否已建会议无关。
 * 当前进行到哪一步由下方独立的「当前状态」行表达，绝不用能力灯红叉来表示「还没开始」。
 * 只管外壳：不编译、不推进会议、不判定业务规则。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;
  var TAB_IDS = ["protocols", "meeting", "compiler"];

  /* [机器标识（data-capability，保持英文）, 界面中文名, 装载判定] */
  var CAPABILITIES = [
    ["Protocol", "议事规则", function () { return !!(A.ProtocolSession && A.ProtocolRegistry); }],
    ["Runtime", "会议运行时", function () { return !!(A.MeetingRuntime && A.MeetingFactory); }],
    ["Persistence", "会议存档", function () { return !!(A.MeetingArchive && A.MeetingPersistence && A.MeetingRestore); }],
    ["Compiler", "指令编译器", function () { return !!(A.InstructionCompiler && A.RoleCardRegistry); }],
    ["Renderer", "提示词渲染器", function () { return !!A.PromptRenderer; }],
    ["WebRelay", "网页中继", function () { return !!(A.WebRelayController && A.RelayFlow && A.WebRelayView); }]
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

  /* 运行状态与能力灯彻底分开：这里说的是「现在进行到哪一步」。 */
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

  /* Store 一变就整屏重绘：Harness 不做局部 diff，宁可全量重画换取状态与界面绝对一致。 */
  function refresh() {
    var s = A.HarnessStore.get();
    renderRuntimeStatus(s);
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

  A.HarnessShell = Object.freeze({
    select: select, refresh: refresh, start: start, runtimeStatusText: runtimeStatusText
  });

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
