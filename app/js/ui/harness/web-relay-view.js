/* AI Council v0.1 — D3 · WEB_RELAY · WebRelayView：Manual Relay 面板渲染（只读投影，按钮行为全在 WebRelayActions）。
 * 四道闸门的人眼呈现：①复制 Prompt（readonly textarea）→②粘贴 Response→③校验 V01–V05→④接受并写入会议。 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var Dom = A.Dom;
  function btn(id, label, secondary, disabled, onClick) {
    var b = Dom.el("button", "btn" + (secondary ? " secondary" : ""), label);
    b.id = id; b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }
  function nonTerminal(state) { return state !== "accepted" && state !== "cancelled" && state !== "rejected" && state !== "failed"; }
  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    host.appendChild(Dom.el("h2", null, "Manual Relay（WEB_RELAY）"));
    var m = state && state.meeting;
    if (!m) { host.appendChild(Dom.el("p", "empty", "（无会议。）")); return; }
    var sessions = A.RelayFlow.sessions(m);
    var active = null;
    for (var i = 0; i < sessions.length; i++) { if (sessions[i] && nonTerminal(sessions[i].state)) { active = sessions[i]; break; } }
    if (!active) {
      var pid = A.RelayFlow.nextRelay(m);
      if (pid) {
        host.appendChild(Dom.el("p", "note", "参与者 " + pid + " 为 web_relay：系统只搬运 Prompt/Response，绝不自动相信外部 AI。"));
        var b = btn("relay-open", "打开 Manual Relay（" + pid + "）", false, false, function () { A.WebRelayActions.openRelay(); });
        host.appendChild(b);
      } else {
        host.appendChild(Dom.el("p", "empty", "本阶段无待 relay 的 web_relay 参与者（mock 走「执行下一步 Mock」）。"));
      }
      return;
    }
    host.appendChild(Dom.el("p", "note", "复制下方 Prompt → 粘贴到外部 AI → 把回答粘回下方 → 校验 → 接受。"));
    var ta = Dom.el("textarea", "relay-prompt"); ta.readOnly = true; ta.rows = 10; ta.value = (active.request && active.request.rendered_prompt) || "";
    host.appendChild(ta);
    host.appendChild(btn("relay-copy", "复制 Prompt", true, false, function () { ta.select(); try { document.execCommand("copy"); } catch (e) {} }));
    var pa = Dom.el("textarea", "relay-paste"); pa.rows = 8; pa.placeholder = "在此粘贴外部 AI 的回答…"; pa.id = "relay-paste";
    host.appendChild(pa);
    host.appendChild(btn("relay-validate", "校验 V01–V05", false, false, function () { A.WebRelayActions.paste(pa.value); A.WebRelayActions.validate(); }));
    host.appendChild(Dom.el("p", "status", "状态：" + active.state));
    var check = A.WebRelayActions.getCheck();
    if (check) {
      var ul = Dom.el("ul", "checks");
      check.checks.forEach(function (c) { ul.appendChild(Dom.el("li", c.ok ? "ok" : "bad", c.id + (c.ok ? " ✅" : " ❌"))); });
      host.appendChild(ul);
    }
    var bar = Dom.el("div", "controls");
    var canAccept = !!(check && check.ok);
    bar.appendChild(btn("relay-accept", "接受并写入会议", false, !canAccept, function () { A.WebRelayActions.accept(); }));
    bar.appendChild(btn("relay-reject", "拒绝", true, !check, function () { A.WebRelayActions.reject(); }));
    bar.appendChild(btn("relay-retry", "重试", true, active.state !== "rejected" && active.state !== "failed", function () { A.WebRelayActions.retry(); }));
    bar.appendChild(btn("relay-cancel", "取消", true, false, function () { A.WebRelayActions.cancel(); }));
    host.appendChild(bar);
  }
  A.WebRelayView = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
