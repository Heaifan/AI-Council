/* AI Council v0.1 — F1 · SeatSessionStore：创建前草稿与 Transport Profile 的本地持久化（无 DOM）。
 * 经 LocalStore 落 localStorage：刷新/重选目录后六席配置（角色/引用/传输/显示名/URL）保持（T06 验收）。
 * Draft 一次性创建：createMeeting 成功后 clearDraft，下次刷新回默认六席模板。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var K_DRAFT = "draft", K_PROFILES = "profiles";

  function loadDraft(fallbackProtocolId) {
    var saved = A.LocalStore.get(K_DRAFT);
    if (!saved || !saved.participants || !saved.participants.length) return null;
    var d = A.MeetingDraft.create(fallbackProtocolId || "");
    d.title = saved.title || "";
    d.topic = saved.topic || "";
    d.protocolId = saved.protocolId || d.protocolId;
    d.participants = saved.participants;
    return d;
  }

  function saveDraft(d) { A.LocalStore.set(K_DRAFT, d); }
  function clearDraft() { A.LocalStore.remove(K_DRAFT); }

  function loadProfiles() {
    var s = A.LocalStore.get(K_PROFILES);
    return A.RelayProfiles.clone(s && s.length ? s : A.RelayProfiles.DEFAULTS);
  }
  function saveProfiles(list) { A.LocalStore.set(K_PROFILES, list); }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatSessionStore = Object.freeze({
    loadDraft: loadDraft, saveDraft: saveDraft, clearDraft: clearDraft,
    loadProfiles: loadProfiles, saveProfiles: saveProfiles
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
