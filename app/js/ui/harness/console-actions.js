/* AI Council v0.1 — D3 · 六席会议控制台 · ConsoleActions：控制台动作层（无 DOM）。
 * F1 冻结语义：role_class 创建后冻结，model_ref/transport_kind 可热改；draft/profiles 经 SeatSessionStore 持久化。 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var draft = null, profiles = null, frozen = false;

  function s() { return A.HarnessStore.get(); }
  function go() { A.HarnessStore.notify(); } function local() { return A.SeatLocalConfig; }

  function ensureDraft() {
    if (draft) return draft;
    var proto = s().registry && s().registry.available[0];
    var saved = A.SeatSessionStore.loadDraft(proto ? proto.protocolId : "");
    if (saved) { draft = saved; }
    else { draft = A.MeetingDraft.create(proto ? proto.protocolId : ""); draft.participants = A.SeatLayout.sixSeatParticipants(); }
    frozen = false;
    return draft;
  }
  function persistDraft() { if (!frozen) A.SeatSessionStore.saveDraft(draft); }

  function ensureProfiles() {
    if (!profiles) profiles = A.SeatSessionStore.loadProfiles();
    return profiles;
  }
  function setProfiles(list) { profiles = list; A.SeatSessionStore.saveProfiles(list); }

  function resetSessionState() {
    draft = null; profiles = null; frozen = false;   /* 不清 SeatLocalConfig：立场/备注随 LocalStore 持久化 */
  }

  function getDraft() { return ensureDraft(); } function getProfiles() { return ensureProfiles(); }
  function isFrozen() { return frozen; } function getMode() { return local().getMode(); }
  function getSelectedSeatId() { return local().getSelectedSeatId(); }
  function getStanceOverrides() { return local().getStanceOverrides(); } function getNotes() { return local().getNotes(); }
  function setMode(m) { local().setMode(m); } function setSelectedSeat(seatId) { local().setSelectedSeat(seatId); }
  function setStance(pid, stance) { local().setStance(pid, stance); } function setNote(pid, text) { local().setNote(pid, text); }

  function setField(field, value) {
    var d = ensureDraft();
    if (frozen) return { ok: false, message: "会议已创建，核心配置已冻结。请先结束会议再新建。" };
    d[field] = value;
    persistDraft();
    go();
    return { ok: true };
  }

  function setParticipantField(participantId, field, value) {
    var d = ensureDraft();
    if (!A.SeatConfigRules.canEdit(frozen, field)) {
      return { ok: false, message: "会议已创建，角色身份已冻结；模型引用与传输方式仍可修改。" };
    }
    var p = (d.participants || []).filter(function (x) { return x.participant_id === participantId; })[0];
    if (!p) return { ok: false, message: "找不到与会者：" + participantId };
    p[field] = value;
    persistDraft();
    go();
    return { ok: true };
  }

  function updateProfile(profile) {
    profiles = A.RelayProfiles.upsert(ensureProfiles(), profile);
    A.SeatSessionStore.saveProfiles(profiles);
    go();
    return { ok: true };
  }

  function createMeeting() {
    var proto = A.HarnessStore.availableProtocol(getDraft().protocolId);
    if (!proto) return { ok: false, message: "选中的议事规则不可用，请重新选择。" };
    var r = A.MeetingDraft.buildMeeting(getDraft(), proto);
    if (!r.ok) return r;
    A.HarnessStore.setMeeting(r.meeting, proto);
    frozen = true;
    A.SeatSessionStore.clearDraft();   /* Draft 一次性创建，刷新后回默认模板 */
    local().setMode("run");            /* 创建后默认进入运行模式 */
    A.WebRelayActions.say("会议已创建，角色身份与会议配置已冻结；席位运行配置仍可修改。", "ok");
    go();
    return { ok: true, meeting: r.meeting };
  }

  function clearMeeting() {
    frozen = false;
    local().setMode("seat");
    A.HarnessStore.setMeeting(null, null);
    A.SeatSessionStore.clearDraft();
    A.WebRelayActions.say("已清空当前会议。", "info");
    go();
  }

  function openWeb(modelRef) {
    var url = A.RelayProfiles.webUrlFor(getProfiles(), modelRef);
    if (!A.RelayProfiles.isSafeUrl(url)) return { ok: false, message: "没有可安全打开的模型网页（仅 http/https）。" };
    if (typeof window !== "undefined" && window.open) window.open(url, "_blank");
    return { ok: true, url: url };
  }

  A.ConsoleActions = Object.freeze({
    getDraft: getDraft, getProfiles: getProfiles, isFrozen: isFrozen,
    getMode: getMode, getSelectedSeatId: getSelectedSeatId,
    getStanceOverrides: getStanceOverrides, getNotes: getNotes,
    setMode: setMode, setSelectedSeat: setSelectedSeat,
    setStance: setStance, setNote: setNote,
    setField: setField, setParticipantField: setParticipantField, updateProfile: updateProfile,
    persistDraft: persistDraft, setProfiles: setProfiles,
    createMeeting: createMeeting, clearMeeting: clearMeeting, openWeb: openWeb,
    resetSessionState: resetSessionState
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
