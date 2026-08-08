/* AI Council v0.1 — D3 · WEB_RELAY · WebRelayActions：Manual Relay 面板的点击行为（无 DOM 渲染，只调用流程层）。
 * 与 WebRelayView 分离：视图只管画，本文件只管做。当前会话 handle 与最近一次校验结果存于模块内（不污染 Store）。 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var C = A.Diagnostic.CODE;
  var handle = null, lastCheck = null;
  function s() { return A.HarnessStore.get(); }
  function go() { A.HarnessStore.notify(); }
  function openRelay() {
    var st = s(); if (!st.meeting) return;
    var r = A.RelayFlow.open(st.meeting, st.protocol, { registry: st.roleRegistry, packetSchema: st.packetSchema });
    if (r.ok) { handle = r.handle; lastCheck = null; } else { handle = null; }
    go(); return r;
  }
  function paste(raw) { var st = s(); if (st.meeting && handle) A.RelayFlow.receive(st.meeting, handle, raw || ""); go(); }
  function validate() { var st = s(); if (st.meeting && handle) lastCheck = A.RelayFlow.validate(st.meeting, handle); go(); }
  function accept() {
    var st = s(); if (!st.meeting || !handle) return;
    var r = A.RelayFlow.accept(st.meeting, st.protocol, handle);
    if (r.ok) { handle = null; lastCheck = null; } else { lastCheck = null; }
    go(); return r;
  }
  function reject(code, msg) {
    var st = s(); if (!st.meeting || !handle) return;
    A.RelayFlow.reject(st.meeting, handle, code || C.INVALID_RESPONSE, msg || "人工拒绝该响应。");
    handle = null; lastCheck = null; go();
  }
  function retry() { var st = s(); if (st.meeting && handle) { A.RelayFlow.retry(st.meeting, handle); lastCheck = null; go(); } }
  function cancel() { var st = s(); if (st.meeting && handle) { A.RelayFlow.cancel(st.meeting, handle); handle = null; lastCheck = null; go(); } }
  function getHandle() { return handle; }
  function getCheck() { return lastCheck; }
  A.WebRelayActions = Object.freeze({
    openRelay: openRelay, paste: paste, validate: validate, accept: accept,
    reject: reject, retry: retry, cancel: cancel, getHandle: getHandle, getCheck: getCheck
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
