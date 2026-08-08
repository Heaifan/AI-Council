/* AI Council v0.1 — D3 · 会议控制台 · RelayWorkarea：中央 Prompt / Response 双栏工作区（页面最大区域）。
 * 左：待发送提示词（只读大区 + [复制提示词] 主按钮 + [选中全部] 次级）｜右：外部 AI 回答（粘贴大区 + [提交回答]）。
 * 复制双路径（用户方案 §四）：优先 navigator.clipboard.writeText()，失败自动降级 textarea 全选 + Ctrl+C 提示。
 * 复制永远不推进会议状态（U22）。保留 Browser 契约 id：relay-prompt / relay-select / relay-paste / relay-submit。
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

  /* 一键复制：writeText 优先，失败降级 select + Ctrl+C 提示；任何路径都不触碰会议状态。 */
  function copyPrompt(ta) {
    var text = ta.value || "";
    if (!text) { A.WebRelayActions.say("没有可复制的提示词。", "warn"); A.HarnessStore.notify(); return; }
    function fallback() {
      /* 直接操作当前 DOM：select 保留在旧 textarea 上；提示消息手动更新（不触发全量重建，避免 selection 被清掉）。 */
      ta.focus(); ta.select();
      A.WebRelayActions.say("无法自动写入剪贴板，已为你选中全部提示词，请按 Ctrl+C。", "warn");
      var msg = document.getElementById("relay-msg");
      if (msg) { msg.textContent = A.WebRelayActions.getNotice().text; msg.className = "status warn"; }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        A.WebRelayActions.say("提示词已复制，可以直接前往 ChatGPT 粘贴。", "ok");
        A.HarnessStore.notify();
      }, fallback);
    } else {
      fallback();
    }
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
    bar.appendChild(btn("relay-copy", "复制提示词", "primary", !active, function () { copyPrompt(ta); }));
    bar.appendChild(btn("relay-select", "选中全部提示词", "secondary", !active, function () {
      ta.focus(); ta.select();
      A.WebRelayActions.say("提示词已全部选中，请按 Ctrl+C 复制。", "ok");
      A.HarnessStore.notify();
    }));
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

  function workarea(active) {
    var box = Dom.el("div", "workarea-pair");
    box.appendChild(promptCard(active));
    box.appendChild(responseCard(active));
    return box;
  }

  A.RelayWorkarea = Object.freeze({ promptCard: promptCard, responseCard: responseCard, workarea: workarea, copyPrompt: copyPrompt });
})(typeof globalThis !== "undefined" ? globalThis : this);
