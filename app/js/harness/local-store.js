/* AI Council v0.1 — F1 · LocalStore：本地持久化封装（无 DOM）。
 * localStorage JSON 读写；不可用（隐私模式/file:// 异常）时静默降级为空实现，不抛错。
 * 键统一前缀 ai-council:v1:，避免与其他应用冲突。
 */
(function (root) {
  "use strict";

  var PREFIX = "ai-council:v1:";

  function storage() {
    try { return (typeof localStorage !== "undefined") ? localStorage : null; } catch (e) { return null; }
  }

  function get(key) {
    var s = storage();
    if (!s) return null;
    try {
      var raw = s.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function set(key, value) {
    var s = storage();
    if (!s) return;
    try { s.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) {}
  }

  function remove(key) {
    var s = storage();
    if (!s) return;
    try { s.removeItem(PREFIX + key); } catch (e) {}
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.LocalStore = Object.freeze({ get: get, set: set, remove: remove });
})(typeof globalThis !== "undefined" ? globalThis : this);
