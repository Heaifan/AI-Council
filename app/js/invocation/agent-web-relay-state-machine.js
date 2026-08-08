/* AI Council v0.1 — D3-D0
 * WebRelayStateMachine：Manual WEB_RELAY 单一调用的生命周期（纯函数、可复现、可审计）。
 *
 * 冻结边界：
 *  - 最小状态集：created → waiting_external → response_received → validated → accepted
 *    旁支：validated/rejected → (RETRY) → waiting_external；failed → (RETRY)；cancelled 终止。
 *  - 只回答「这个 Manual Relay 调用现在处于什么状态、下一步允许什么」，绝不发起任何网络请求，
 *    绝不持有 UI 状态（按钮/Tab/textarea）。Transport 负责持有运行期实例，本机只管状态合法性。
 *  - 关键红线：accepted 才是「可被 Runtime 接受为正式发言」的前置；rejected / failed / cancelled 都不是。
 *  - Reload 恢复：replay(history) 校验存储的 (event) 序列自 created 起每一步都合法，保证断点续传可审计。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var D = A.Diagnostic;
  var C = D.CODE;

  var STATES = Object.freeze([
    "created", "waiting_external", "response_received",
    "validated", "accepted", "rejected", "failed", "cancelled"
  ]);

  var EVENTS = Object.freeze({
    BEGIN_EXTERNAL: "BEGIN_EXTERNAL",
    RESPONSE_RECEIVED: "RESPONSE_RECEIVED",
    VALIDATE_OK: "VALIDATE_OK",
    VALIDATE_FAIL: "VALIDATE_FAIL",
    ACCEPT: "ACCEPT",
    REJECT: "REJECT",
    CANCEL: "CANCEL",
    TRANSPORT_FAILED: "TRANSPORT_FAILED",
    RETRY: "RETRY"
  });

  /* from → { event → to }。这是唯一被冻结的合法转移表。 */
  var TRANSITIONS = Object.freeze({
    created: { BEGIN_EXTERNAL: "waiting_external" },
    waiting_external: {
      RESPONSE_RECEIVED: "response_received",
      CANCEL: "cancelled",
      TRANSPORT_FAILED: "failed"
    },
    response_received: {
      VALIDATE_OK: "validated",
      VALIDATE_FAIL: "rejected"
    },
    validated: {
      ACCEPT: "accepted",
      REJECT: "rejected"
    },
    rejected: { RETRY: "waiting_external" },
    failed: { RETRY: "waiting_external" },
    accepted: {},
    cancelled: {}
  });

  /* 终止态：accepted / cancelled 之后不再有合法转移（除非从 rejected/failed RETRY）。 */
  function isTerminal(state) { return state === "accepted" || state === "cancelled"; }

  function canTransition(from, event) {
    var row = TRANSITIONS[from];
    return !!(row && Object.prototype.hasOwnProperty.call(row, event));
  }

  /* 单步推进：返回 { ok, next } 或 { ok:false, error }（INVOCATION_STATE_TRANSITION_INVALID）。 */
  function apply(from, event) {
    if (STATES.indexOf(from) < 0) return { ok: false, error: diagInvalid("未知状态：" + String(from)) };
    if (!canTransition(from, event))
      return { ok: false, error: diagInvalid("非法转移：" + from + " --" + event + "--> ?") };
    return { ok: true, next: TRANSITIONS[from][event] };
  }

  /* 重放一段事件序列（自 created 起），逐跳校验合法性。用于断点续传/审计恢复。 */
  function replay(history) {
    history = history || [];
    var state = "created", trace = [];
    for (var i = 0; i < history.length; i++) {
      var ev = history[i];
      var step = apply(state, ev);
      if (!step.ok) return { ok: false, error: step.error, atIndex: i, from: state, event: ev };
      trace.push({ event: ev, from: state, to: step.next });
      state = step.next;
    }
    return { ok: true, finalState: state, trace: trace };
  }

  function diagInvalid(message) {
    return D.create({ code: C.INVOCATION_STATE_TRANSITION_INVALID, message: message });
  }

  A.WebRelayStateMachine = Object.freeze({
    STATES: STATES, EVENTS: EVENTS, TRANSITIONS: TRANSITIONS,
    isTerminal: isTerminal, canTransition: canTransition, apply: apply, replay: replay
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
