/* AI Council v0.1 — D3 · AutomationView：中央大屏自动化模式面板（DOM 投影，网络全走 AutomationBridge）。
 * 方案 §二十六/§二十七：
 *  - 等待 A1 时显示 [自动发送给 ChatGPT]（Primary）+ [切换为人工中继]。
 *  - 自动化执行中：进度步骤（✓ 浏览器已启动 / ● 等待 AI 回答 …）。
 *  - 完成：回答写入 Response 区（不自动 Accept）；失败：原因 + [重试自动化] + [切换人工中继]。
 * 触发链路：点击 → AutomationBridge.request（file:// 下 no-op 提示；localhost 下 automation-ui.js 覆写为真实 API）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function btn(id, label, cls, onClick) {
    var b = Dom.el("button", "btn" + (cls ? " " + cls : ""), label);
    b.id = id;
    b.addEventListener("click", onClick);
    return b;
  }

  var state = { stage: "idle", errorCode: null, errorZh: null, steps: [] };
  var lastResult = null;

  A.AutomationEvents.onState(function (st) {
    state = { stage: st.stage, errorCode: st.errorCode, errorZh: st.errorZh, steps: st.steps || state.steps };
    A.HarnessStore.notify();
  });
  A.AutomationEvents.onResult(function (res) {
    lastResult = res;
    state.stage = res.ok ? "completed" : "failed";
    if (res.ok) {
      /* 自动回答只进 Response 区，绝不自动 Accept（方案 §一/§二十二）。 */
      var pa = document.getElementById("relay-paste");
      if (pa) { pa.value = res.responseText; }
      A.WebRelayActions.say("已自动获取外部 AI 回答（未经校验），请人工确认。", "ok");
    } else if (res.error) {
      state.errorCode = res.error.code; state.errorZh = res.error.zh;
    }
    A.HarnessStore.notify();
  });

  function fire(prompt) {
    document.dispatchEvent(new CustomEvent("ai-council:automate", { detail: { prompt: prompt } }));
  }

  function stepList() {
    var box = Dom.el("div", "auto-steps");
    (state.steps || []).forEach(function (s) { box.appendChild(Dom.el("p", "note", "✓ " + s.text)); });
    if (state.stage === "waiting_response" || state.stage === "extracting") {
      box.appendChild(Dom.el("p", "note", "● " + (state.stage === "waiting_response" ? "等待 AI 回答…" : "提取结果…")));
    }
    return box;
  }

  function build(active, modelRef) {
    var host = Dom.el("details", "card auto-card");
    host.appendChild(Dom.el("summary", null, "网页自动化 ▾"));   /* F2：默认折叠 */
    if (!active) {
      host.appendChild(Dom.el("p", "note", "当前没有待发送的网页中继请求。"));
      return host;
    }
    var body = Dom.el("div");
    var running = state.stage !== "idle" && state.stage !== "completed" && state.stage !== "failed";
    if (running) {
      body.appendChild(stepList());
      body.appendChild(btn("auto-cancel", "取消自动化", "secondary", function () {
        A.AutomationEvents.emitState({ stage: "cancelled", errorCode: "AUTOMATION_CANCELLED", errorZh: "已取消", steps: state.steps });
      }));
      host.appendChild(body);
      return host;
    }
    if (state.stage === "failed" || state.errorCode) {
      body.appendChild(Dom.el("p", "status bad", "自动化失败：" + (state.errorZh || state.errorCode || "未知")));
      var bar = Dom.el("div", "controls");
      bar.appendChild(btn("auto-retry", "重试自动化", "secondary", function () { fire(active.request.rendered_prompt); }));
      bar.appendChild(btn("auto-fallback", "切换人工中继", "secondary", function () {
        state = { stage: "idle", errorCode: null, errorZh: null, steps: [] };
        A.HarnessStore.notify();
      }));
      body.appendChild(bar);
      host.appendChild(body);
      return host;
    }
    var main = btn("auto-send", "自动发送给 ChatGPT", "primary", function () { fire(active.request.rendered_prompt); });
    body.appendChild(main);
    var fb = btn("auto-fallback", "切换为人工中继", "secondary", function () {
      state = { stage: "idle", errorCode: null, errorZh: null, steps: [] };
      A.WebRelayActions.say("已切换为人工中继：请复制提示词并粘贴外部 AI 回答。", "info");
      A.HarnessStore.notify();
    });
    body.appendChild(fb);
    if (!A.AutomationBridge.isAutomationMode()) {
      body.appendChild(Dom.el("p", "note", "提示：当前为手动模式（file://）。自动化请用 node automation/start.js 启动后访问 127.0.0.1。"));
    }
    host.appendChild(body);
    return host;
  }

  A.AutomationView = Object.freeze({ build: build });
})(typeof globalThis !== "undefined" ? globalThis : this);
