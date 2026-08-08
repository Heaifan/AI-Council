/* AI Council v0.1 — D3 · 会议控制台 · RelayWorkarea：中栏 Prompt / Response 工作区（页面最大区域）。
 * 待发送提示词（只读大区 + 选中全部）+ 外部 AI 回答（粘贴大区 + 提交回答）。
 * 保留 Browser 契约 id：relay-prompt / relay-select / relay-paste / relay-submit。
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

  function promptCard(active) {
    var box = Dom.el("div", "card workarea");
    box.appendChild(Dom.el("h2", null, "待发送提示词"));
    var ta = document.createElement("textarea");
    ta.id = "relay-prompt"; ta.readOnly = true; ta.rows = 12;
    ta.value = (active && active.request && active.request.rendered_prompt) || "";
    ta.className = "big-textarea";
    box.appendChild(ta);
    var bar = Dom.el("div", "controls");
    bar.appendChild(btn("relay-select", "选中全部提示词", "secondary", !active, function () {
      ta.focus(); ta.select();
      A.WebRelayActions.say("提示词已全部选中，请按 Ctrl+C 复制。", "ok");
      A.HarnessStore.notify();
    }));
    bar.appendChild(Dom.el("p", "note", "已选中后，请按 Ctrl+C 复制并发送给外部 AI。"));
    box.appendChild(bar);
    return box;
  }

  function responseCard(active) {
    var box = Dom.el("div", "card workarea");
    box.appendChild(Dom.el("h2", null, "外部 AI 回答"));
    var pa = document.createElement("textarea");
    pa.id = "relay-paste"; pa.rows = 12;
    pa.className = "big-textarea";
    pa.placeholder = "请将 ChatGPT / Claude / Gemini 的完整回答粘贴到这里……";
    box.appendChild(pa);
    box.appendChild(btn("relay-submit", "提交回答", "primary", !active, function () {
      A.WebRelayActions.paste(pa.value);
      A.WebRelayActions.validate();
    }));
    return box;
  }

  A.RelayWorkarea = Object.freeze({ promptCard: promptCard, responseCard: responseCard });
})(typeof globalThis !== "undefined" ? globalThis : this);
