/* AI Council v0.1 — WEB_AUTOMATION · automation-ui.js：自动化模式 UI 实现（仅 localhost 注入）。
 * 由 automation/server/static-server.js 在自动化模式下注入 <body> 末尾；file:// 手动模式不加载。
 * 覆写 A.AutomationBridge 为同源 API 实现（fetch /api/automate + 轮询 /api/status）。
 * app 侧 UI 触发 'ai-council:automate' 事件 → 本文件发起调用 → 状态/结果写回 AutomationEvents。
 */
(function () {
  "use strict";

  var A = (window.AICouncil = window.AICouncil || {});
  var activeInvocation = null;

  function isAutomationMode() {
    return /^https?:$/.test(location.protocol) && /^127\.0\.0\.1(:\d+)?$/.test(location.hostname);
  }

  function request(payload, onDone) {
    if (!isAutomationMode()) {
      if (onDone) onDone({ ok: false, error: { zh: "未在自动化模式（需 node automation/start.js）" } });
      return;
    }
    fetch("/api/automate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (onDone) onDone(data.ok ? { ok: true, invocationId: data.invocationId } : { ok: false, error: { zh: data.error || "启动失败" } });
    }).catch(function (e) {
      if (onDone) onDone({ ok: false, error: { zh: "无法连接自动化 Worker：" + e.message } });
    });
  }

  function pollStatus(invocationId, onStatus, onDone) {
    var iv = setInterval(function () {
      fetch("/api/status/" + encodeURIComponent(invocationId))
        .then(function (r) { return r.json(); })
        .then(function (st) {
          if (onStatus) onStatus(st);
          if (st.stage === "completed" || st.stage === "failed" || st.errorCode) {
            clearInterval(iv);
            fetch("/api/result/" + encodeURIComponent(invocationId))
              .then(function (r) { return r.json(); })
              .then(function (res) { if (onDone) onDone(res); })
              .catch(function () {});
          }
        }).catch(function () {});
    }, 800);
  }

  A.AutomationBridge = Object.freeze({
    isAutomationMode: isAutomationMode, request: request, pollStatus: pollStatus
  });

  document.addEventListener("ai-council:automate", function (ev) {
    var detail = ev.detail || {};
    if (activeInvocation) {
      A.AutomationEvents.emitState({ stage: "busy", errorCode: null, errorZh: "已有自动化在进行中" });
      return;
    }
    A.AutomationBridge.request(
      { prompt: detail.prompt, siteId: detail.siteId || "chatgpt", target: detail.target || "https://chatgpt.com/" },
      function (res) {
        if (!res.ok) {
          A.AutomationEvents.emitState({ stage: "failed", errorCode: "AUTOMATION_START_FAILED", errorZh: res.error && res.error.zh });
          return;
        }
        activeInvocation = res.invocationId;
        A.AutomationBridge.pollStatus(res.invocationId,
          function (st) { A.AutomationEvents.emitState(st); },
          function (result) {
            activeInvocation = null;
            A.AutomationEvents.emitResult(result);
          });
      });
  });
})();
