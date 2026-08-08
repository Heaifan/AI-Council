/* AI Council v0.1 — D3 · 会议控制台 · DevToolsPanel：开发工具折叠区（退出主流程，次级视觉）。
 * 保留 D2/D3 Browser 契约 id：mt-create / mt-create-relay / mt-clear。
 * 默认展开：基线 Browser 测试直接点击 Demo 按钮（可见性契约）；样式已降级为独立次级区块。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function render(host, hasRegistry, hasMeeting) {
    if (!host) return;
    A.Dom.clear(host);
    var details = document.createElement("details");
    details.className = "dev-tools";
    details.id = "dev-tools";
    details.open = true;
    details.appendChild(Dom.el("summary", null, "开发工具 ▾"));
    var box = Dom.el("div", "dev-tools-body");
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
