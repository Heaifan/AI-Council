/* AI Council v0.1 — F2 · SeatEditDraft：席位编辑草稿（无 DOM）。
 * 用户 MEETING-UX-F2 §T04：独立 Seat Edit Draft——runtime 状态刷新（timer/relay/meeting
 * 事件）不得覆盖用户尚未保存的输入。表单值从 draft 初始化，change 写入 draft；
 * dirty 时中央 seat 面板禁止重建（harness-shell 守卫）。保存/取消后 clear。
 */
(function (root) {
  "use strict";

  var drafts = {};   /* participant_id -> { dirty: bool, values: {...} } */

  /* 取草稿（不存在返回 null）；初始化返回草稿（不覆盖已有 dirty 草稿）。 */
  function get(participantId) {
    return drafts[participantId] || null;
  }

  function init(participantId, values) {
    if (!drafts[participantId]) drafts[participantId] = { dirty: false, values: values };
    return drafts[participantId];
  }

  function set(participantId, field, value) {
    var d = drafts[participantId] || init(participantId, {});
    d.values[field] = value;
    d.dirty = true;
  }

  function isDirty(participantId) {
    var d = drafts[participantId];
    return !!(d && d.dirty);
  }

  /* 任一席位存在未保存草稿（守卫用：draft 按 pid 存，UI 守卫只需知道「有 dirty」）。 */
  function anyDirty() {
    for (var pid in drafts) if (drafts[pid].dirty) return true;
    return false;
  }

  function clear(participantId) { delete drafts[participantId]; }

  function resetAll() { drafts = {}; }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatEditDraft = Object.freeze({
    get: get, init: init, set: set, isDirty: isDirty, anyDirty: anyDirty,
    clear: clear, resetAll: resetAll
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
