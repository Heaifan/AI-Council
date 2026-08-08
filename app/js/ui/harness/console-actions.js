/* AI Council v0.1 — D3 · 六席会议控制台 · ConsoleActions：控制台动作层（无 DOM）。
 * MeetingDraft 持有（创建前表单，非事实源）；席位配置委托 SeatLocalConfig；
 * 创建会议（核心冻结）；打开模型网页 = window.open 仅 http/https。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var draft = null, profiles = null, frozen = false;

  function s() { return A.HarnessStore.get(); }
  function go() { A.HarnessStore.notify(); }
  function local() { return A.SeatLocalConfig; }

  function ensureDraft() {
    if (draft) return draft;
    var proto = s().registry && s().registry.available[0];
    draft = A.MeetingDraft.create(proto ? proto.protocolId : "");
    draft.participants = A.SeatLayout.sixSeatParticipants();
    frozen = false;
    return draft;
  }
  function ensureProfiles() {
    if (!profiles) profiles = A.RelayProfiles.clone(A.RelayProfiles.DEFAULTS);
    return profiles;
  }
  function resetSessionState() {
    draft = null; profiles = null; frozen = false;
    if (A.SeatLocalConfig) A.SeatLocalConfig.reset();
  }

  function getDraft() { return ensureDraft(); } function getProfiles() { return ensureProfiles(); }
  function isFrozen() { return frozen; } function getMode() { return local().getMode(); }
  function getSelectedSeatId() { return local().getSelectedSeatId(); } function getStanceOverrides() { return local().getStanceOverrides(); }
  function getNotes() { return local().getNotes(); } function setMode(m) { local().setMode(m); }
  function setSelectedSeat(seatId) { local().setSelectedSeat(seatId); } function setStance(pid, stance) { local().setStance(pid, stance); }
  function setNote(pid, text) { local().setNote(pid, text); }

  function setField(field, value) {
    var d = ensureDraft();
    if (frozen) return { ok: false, message: "会议已创建，核心配置已冻结。请先结束会议再新建。" };
    d[field] = value;
    go();
    return { ok: true };
  }

  function setParticipantField(participantId, field, value) {
    var d = ensureDraft();
    if (frozen) return { ok: false, message: "会议已创建，核心配置已冻结。请先结束会议再新建。" };
    var p = (d.participants || []).filter(function (x) { return x.participant_id === participantId; })[0];
    if (!p) return { ok: false, message: "找不到与会者：" + participantId };
    p[field] = value;
    go();
    return { ok: true };
  }
  function updateProfile(profile) {
    profiles = A.RelayProfiles.upsert(ensureProfiles(), profile);
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
    local().setMode("run");    /* 创建后默认进入运行模式 */
    A.WebRelayActions.say("会议已创建，核心配置已冻结。议题已进入会议与提示词。", "ok");
    go();
    return { ok: true, meeting: r.meeting };
  }

  function clearMeeting() {
    frozen = false;
    local().setMode("seat");
    A.HarnessStore.setMeeting(null, null);
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
    createMeeting: createMeeting, clearMeeting: clearMeeting, openWeb: openWeb,
    resetSessionState: resetSessionState
  });
})(typeof globalThis !== "undefined" ? globalThis : this);