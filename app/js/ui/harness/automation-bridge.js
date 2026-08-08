/* AI Council v0.1 — D3 · AutomationBridge：自动化模式桥（app 侧占位，无 DOM、无网络调用）。
 * 铁律：app/js 零网络纪律（TEST-10 静态审计）——本文件不含任何网络/轮询 API 调用。
 * 默认实现（file:// 手动模式）：request 返回「未在自动化模式」；onState/onResult 为 no-op。
 * localhost 自动化模式下，automation/ui/automation-ui.js 覆写为同源 API 实现。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  function isAutomationMode() {
    return false;   /* app 侧永远按手动模式编译；真实判定在 automation/ui 覆写实现中 */
  }

  function request(payload, onDone) {
    if (onDone) onDone({ ok: false, error: { zh: "未在自动化模式。请用 node automation/start.js 启动后访问 127.0.0.1。" } });
  }

  function pollStatus(invocationId, onStatus, onDone) {
    if (onDone) onDone({ ok: false, error: { zh: "未在自动化模式。" } });
  }

  A.AutomationBridge = Object.freeze({
    isAutomationMode: isAutomationMode, request: request, pollStatus: pollStatus
  });

  /* 自动化事件目标：app 侧只派发/订阅，不实现网络（实现由 automation/ui 注入）。 */
  var listeners = { state: [], result: [] };
  A.AutomationEvents = Object.freeze({
    onState: function (fn) { listeners.state.push(fn); },
    onResult: function (fn) { listeners.result.push(fn); },
    emitState: function (st) { listeners.state.forEach(function (fn) { try { fn(st); } catch (e) {} }); },
    emitResult: function (res) { listeners.result.forEach(function (fn) { try { fn(res); } catch (e) {} }); }
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
