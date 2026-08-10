/* AI Council v0.1 — D3 · 会议控制台 · DevToolsPanel：开发工具（底部 drawer 内，退出主流程，次级视觉）。
 * F1：默认折叠（32px 条），展开内容由 CSS 绝对定位覆盖在工作区上方，不挤压 workspace；
 * 保留 D2/D3 Browser 契约 id：mt-create / mt-create-relay / mt-clear；重绘时保留用户展开状态。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function render(host, hasRegistry, hasMeeting) {
    if (!host) return;
    var wasOpen = host.querySelector("details") ? host.querySelector("details").open : false;   /* 先读后清：保留用户展开状态 */
    A.Dom.clear(host);
    var details = document.createElement("details");
    details.className = "dev-tools";
    details.id = "dev-tools";
    details.open = wasOpen;   /* 默认折叠（F1）；用户展开后重绘保留 */
    details.appendChild(Dom.el("summary", null, "开发工具"));
    var box = Dom.el("div", "dev-tools-body drawer-body");
    var demo = Dom.el("button", "btn secondary", "加载 Mock Demo");
    demo.id = "mt-create";
    demo.disabled = !hasRegistry;
    demo.addEventListener("click", A.MeetingActions.create);
    box.appendChild(demo);
    var relay = Dom.el("button", "btn secondary", "加载 WEB_RELAY Demo");
    relay.id = "mt-create-relay";
    relay.disabled = !hasRegistry;
    relay.addEventListener("click", A.MeetingActions.createRelay);
    box.appendChild(relay);
    var sim = Dom.el("button", "btn secondary", "模拟下一席响应");
    sim.id = "mt-step";   /* F1（T10）：Mock 驱动从正式导航移入开发工具（语义断开） */
    sim.disabled = !hasMeeting;
    sim.addEventListener("click", function () { A.MeetingActions.step(A.HarnessStore.get()); });
    box.appendChild(sim);
    var clear = Dom.el("button", "btn secondary", "清空当前会议");
    clear.id = "mt-clear";
    clear.disabled = !hasMeeting;
    clear.addEventListener("click", A.ConsoleActions.clearMeeting);
    box.appendChild(clear);
    details.appendChild(box);
    host.appendChild(details);
  }

  A.DevToolsPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
