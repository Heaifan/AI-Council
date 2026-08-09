/* AI Council v0.1 — MEETING-REPLAY-F1 · ReplayCursor：回放游标（无 DOM，Node 可测）。
 * 只存 cursor；-1 表示「未回放，跟随最新」。上一步/下一步/回到当前只改 cursor，
 * 绝不触碰 Meeting Runtime（方案 T01）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var cursor = -1;   /* -1 = live（跟随最新）；0..latest-1 = 回放位置 */

  function latest(meeting) {
    return (meeting && meeting.events) ? meeting.events.length : 0;
  }
  function get() { return cursor; }
  function isReplay(meeting) { return cursor >= 0 && cursor < latest(meeting); }
  function prev(meeting) {
    if (cursor < 0) cursor = latest(meeting);
    if (cursor > 0) { cursor -= 1; A.HarnessStore.notify(); }
    return cursor;
  }
  function next(meeting) {
    if (cursor < 0) return cursor;   /* 已在最新 */
    if (cursor < latest(meeting) - 1) { cursor += 1; A.HarnessStore.notify(); }
    else { cursor = -1; A.HarnessStore.notify(); }   /* 走到末尾即回到 live */
    return cursor;
  }
  function toLatest(meeting) { cursor = -1; A.HarnessStore.notify(); return cursor; }
  function reset() { cursor = -1; }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.ReplayCursor = Object.freeze({
    get: get, latest: latest, isReplay: isReplay, prev: prev, next: next, toLatest: toLatest, reset: reset
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
