/* AI Council v0.1 — D3 · 会议控制台 · ConsoleActions：控制台动作层（无 DOM）。
 * 职责：
 *  - MeetingDraft 状态持有（创建前输入表单；不是事实源，创建后即弃）。
 *  - 创建会议（Draft → Meeting，一次性 SnapShot 冻结）。
 *  - 「打开模型网页」= window.open(url)，仅 http/https、由用户主动点击。
 *  - 清空当前会议（开发工具）。
 * 中继生命周期动作仍在 WebRelayActions；Demo 装载在 MeetingActions。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var draft = null;
  var profiles = null;
  var frozen = false;

  function s() { return A.HarnessStore.get(); }
  function go() { A.HarnessStore.notify(); }

  /* 草稿与 Profile 表随 Session 重置；Profile 默认表可被用户编辑（本地配置，不进 Schema）。 */
  function ensureDraft() {
    if (draft) return draft;
    var proto = s().registry && s().registry.available[0];
    draft = A.MeetingDraft.create(proto ? proto.protocolId : "");
    frozen = false;
    return draft;
  }
  function ensureProfiles() {
    if (!profiles) profiles = A.RelayProfiles.clone(A.RelayProfiles.DEFAULTS);
    return profiles;
  }
  function resetSessionState() { draft = null; profiles = null; frozen = false; }

  function getDraft() { return ensureDraft(); }
  function getProfiles() { return ensureProfiles(); }
  function isFrozen() { return frozen; }

  function setField(field, value) {
    var d = ensureDraft();
    if (frozen) return { ok: false, message: "会议已创建，核心配置已冻结。请先结束会议再新建。" };
    d[field] = value;
    go();
    return { ok: true };
  }

  /* 与会者单项配置（role/model_ref/transport_kind/model_name/web_url 均走这里）。 */
  function setParticipantField(participantId, field, value) {
    var d = ensureDraft();
    if (frozen) return { ok: false, message: "会议已创建，核心配置已冻结。请先结束会议再新建。" };
    var p = (d.participants || []).filter(function (x) { return x.participant_id === participantId; })[0];
    if (!p) return { ok: false, message: "找不到与会者：" + participantId };
    p[field] = value;
    go();
    return { ok: true };
  }

  /* Profile 表编辑：web_url 属于 Transport 配置，创建后仍可修改（model_ref 才冻结）。 */
  function updateProfile(profile) {
    profiles = A.RelayProfiles.upsert(ensureProfiles(), profile);
    go();
    return { ok: true };
  }

  function createMeeting() {
    var st = s();
    var proto = A.HarnessStore.availableProtocol(getDraft().protocolId);
    if (!proto) return { ok: false, message: "选中的议事规则不可用，请重新选择。" };
    var r = A.MeetingDraft.buildMeeting(getDraft(), proto);
    if (!r.ok) return r;
    A.HarnessStore.setMeeting(r.meeting, proto);
    frozen = true;               /* 创建后核心配置冻结（Draft 不再可改） */
    A.WebRelayActions.say("会议已创建，核心配置已冻结。议题已进入会议与提示词。", "ok");
    go();
    return { ok: true, meeting: r.meeting };
  }

  function clearMeeting() {
    frozen = false;
    A.HarnessStore.setMeeting(null, null);
    A.WebRelayActions.say("已清空当前会议。", "info");
    go();
  }

  /* 打开模型网页：用户主动点击，仅 http/https，window.open 不控制页面。 */
  function openWeb(modelRef) {
    var url = A.RelayProfiles.webUrlFor(getProfiles(), modelRef);
    if (!A.RelayProfiles.isSafeUrl(url)) return { ok: false, message: "没有可安全打开的模型网页（仅 http/https）。" };
    if (typeof window !== "undefined" && window.open) window.open(url, "_blank");
    return { ok: true, url: url };
  }

  A.ConsoleActions = Object.freeze({
    getDraft: getDraft, getProfiles: getProfiles, isFrozen: isFrozen,
    setField: setField, setParticipantField: setParticipantField, updateProfile: updateProfile,
    createMeeting: createMeeting, clearMeeting: clearMeeting, openWeb: openWeb,
    resetSessionState: resetSessionState
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
