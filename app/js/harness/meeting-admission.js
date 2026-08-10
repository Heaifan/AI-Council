/* AI Council v0.1 — MEETING-RUNTIME-F1-T25-F2 · MeetingAdmission：席位入会检查（纯函数，无 DOM）。
 * T04/修正 11：Admission 只证明「配置就绪」（admitted/blocked），不假装 online。
 * T25-F2 冻结合同（用户裁定）：required 席位必须全部满足——
 *   seat exists / role exists / seat enabled / model name / model_ref / transport / model URL / safe URL。
 * 任一不成立 → blocked。transport=mock 绝不自动放行（正式会议禁止 Mock 掩盖缺失配置）；
 * 仅 dev_mode（开发/测试会议）且 transport=mock 时豁免模型检查（mock 是测试能力，不是兜底模型）。
 * externalReady 留接口（未来 Live Automation 扩展），F1 不实现。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  function isDevMock(meeting, p) {
    return (p.transport_kind || "mock") === "mock" &&
      !!(meeting.stateData && meeting.stateData.dev_mode === true);
  }

  /* 单席检查：profiles = [{model_ref, web_url, ...}]（RelayProfiles 本地配置）。 */
  function admissionOf(meeting, protocol, profiles, participantId) {
    var checks = [];
    function fail(reason) { checks.push(reason); return reason; }
    var parts = (meeting && meeting.participants) || [];
    var p = parts.filter(function (x) { return x.participant_id === participantId; })[0];
    if (!p) return { status: "blocked", reason: "席位不存在", checks: checks.concat("seat_exists") };
    var pa = meeting.pendingAction;
    if (!pa || !pa.requiredParticipantIds || pa.requiredParticipantIds.indexOf(participantId) < 0)
      return { status: "blocked", reason: "不属于本阶段发言名单", checks: checks.concat("roster_membership") };
    if (!p.role_class && !p.role_id) fail("角色未配置");
    var transport = p.transport_kind || "mock";
    if (transport !== "mock" && transport !== "web_relay") fail("传输方式无效：" + transport);
    /* T25-F2：mock 不豁免模型检查（仅 dev_mode 豁免）；web_relay 同样全查。 */
    if (!isDevMock(meeting, p)) {
      if (!p.model_ref) fail("未指定模型");
      else {
        var prof = A.RelayProfiles ? A.RelayProfiles.findByModelRef(profiles, p.model_ref) : null;
        if (!prof || !prof.display_name) fail("模型名称未配置");
        var url = A.RelayProfiles ? A.RelayProfiles.webUrlFor(profiles, p.model_ref) : null;
        if (!url || !A.RelayProfiles.isSafeUrl(url)) fail("模型网页未配置");
      }
    }
    return checks.length
      ? { status: "blocked", reason: checks[0], checks: checks }
      : { status: "admitted", reason: null, checks: [] };
  }

  /* Preflight：对当前 phase roster 全员检查。 */
  /* F5：协议必需角色（required_roles）必须在参会名单中齐备——如 summary 需要秘书，开会前就得知道。 */
  function checkRequiredRoles(meeting, protocol) {
    var doc = protocol && (protocol.document || protocol);
    var rr = doc && doc.required_roles;
    if (!rr || !meeting) return [];
    var out = [];
    rr.forEach(function (need) {
      var count = (meeting.participants || []).filter(function (p) { return p.role_class === need.role_class; }).length;
      if (need.min_count > 0 && count < need.min_count) out.push({ role_class: need.role_class, code: "REQUIRED_ROLE_MISSING",
        reason: "本场会议需要" + (need.role_class === "chair_secretary" ? "秘书席" : need.role_class) + "，但尚未指定。" });
      if (need.max_count != null && count > need.max_count) out.push({ role_class: need.role_class, code: "REQUIRED_ROLE_OVER",
        reason: "当前议事规则只允许一个" + (need.role_class === "chair_secretary" ? "秘书席" : need.role_class) + "。" });
    });
    return out;
  }

  function preflight(meeting, protocol, profiles) {
    var roster = (meeting && meeting.pendingAction && meeting.pendingAction.requiredParticipantIds) || [];
    var admitted = [], blocked = [];
    roster.forEach(function (id) {
      var r = admissionOf(meeting, protocol, profiles, id);
      (r.status === "admitted" ? admitted : blocked).push({ participant_id: id, reason: r.reason });
    });
    checkRequiredRoles(meeting, protocol).forEach(function (b) {   /* F5：整个协议必需角色齐备（如秘书） */
      blocked.push({ participant_id: null, reason: b.reason, roleBlock: true });
    });
    return { roster: roster.slice(), admitted: admitted, blocked: blocked };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingAdmission = Object.freeze({
    admissionOf: admissionOf, preflight: preflight, isDevMock: isDevMock, checkRequiredRoles: checkRequiredRoles
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
