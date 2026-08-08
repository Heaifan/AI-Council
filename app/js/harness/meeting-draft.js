/* AI Council v0.1 — D3 · 会议控制台 · MeetingDraft：创建会议前的草稿模型（无 DOM，Node 可测）。
 * 设计边界（用户方案 §19/§20）：
 *  - Draft 只是「创建前输入表单」，不是事实源；创建成功后一切以 Meeting 为准。
 *  - 禁止 Runtime 运行中回读 Draft；Draft 只做一次性创建。
 *  - 不携带 web_url（那属于 WebRelayTargetProfile，见 relay-profiles.js）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;

  var TRANSPORTS = ["mock", "web_relay"];

  /* 默认与会者结构：保持现有 Participant 数量与结构（不做 D4 任意增删）。 */
  function defaultParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "mock", model_ref: "" },
      { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null, actor_type: "chair", alias: "Chair", role_id: "neutral-chair-secretary", transport_kind: "mock", model_ref: "" }
    ];
  }

  function create(protocolId) {
    return {
      title: "",
      topic: "",
      protocolId: protocolId || "",
      participants: defaultParticipants()
    };
  }

  /* 议题长度约束与 meeting.schema.json 的 topic 保持一致（minLength 1 / maxLength 2000；空串允许=未填）。 */
  function validate(draft) {
    var errors = [];
    draft = draft || {};
    if (!draft.title || !String(draft.title).trim()) errors.push("会议名称不能为空。");
    else if (String(draft.title).length > 200) errors.push("会议名称不能超过 200 字。");
    if (draft.topic && String(draft.topic).length > 2000) errors.push("议题不能超过 2000 字。");
    if (!draft.protocolId) errors.push("请选择议事规则。");
    var parts = draft.participants || [];
    if (!parts.length) errors.push("会议至少需要一名与会者。");
    parts.forEach(function (p) {
      if (!p || !p.participant_id) { errors.push("存在缺少编号的与会者。"); return; }
      if (!p.role_class) errors.push("与会者 " + p.participant_id + " 缺少角色。");
      if (TRANSPORTS.indexOf(p.transport_kind) < 0) errors.push("与会者 " + p.participant_id + " 的传输方式不合法。");
      if (p.transport_kind === "web_relay" && !p.model_ref) errors.push("与会者 " + p.participant_id + " 走网页中继，必须填写模型引用。");
    });
    return { ok: errors.length === 0, errors: errors };
  }

  /* 一次性创建：Draft → Meeting（SnapShot 冻结）。返回 { ok, meeting?, message? }。 */
  function buildMeeting(draft, protocol, meetingId) {
    var v = validate(draft);
    if (!v.ok) return { ok: false, message: v.errors[0] };
    if (!protocol) return { ok: false, message: "没有可用的议事规则，无法创建会议。" };
    var participants = (draft.participants || []).map(function (p) {
      /* 只把会议身份字段交给 MeetingFactory；web_url 永远不属于 Participant（Transport 配置）。 */
      return {
        participant_id: p.participant_id, role_class: p.role_class, side_id: p.side_id,
        actor_type: p.actor_type || "agent", alias: p.alias || p.participant_id,
        role_id: p.role_id || null, model_ref: p.model_ref || null, transport_kind: p.transport_kind || "mock"
      };
    });
    var m = A.MeetingFactory.createMeeting(protocol, {
      meetingId: meetingId || ("meeting-" + Date.now().toString(36)),
      title: String(draft.title).trim(),
      topic: (draft.topic && String(draft.topic).trim()) || "",
      participants: participants
    });
    if (m.status === A.MeetingState.STATUS.FAILED) return { ok: false, message: m.error ? m.error.message : "会议创建失败。" };
    var r = A.MeetingRuntime.start(m, protocol);
    if (!r.ok) return { ok: false, message: r.diagnostic ? r.diagnostic.message : "会议启动失败。" };
    return { ok: true, meeting: m };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingDraft = Object.freeze({
    create: create, validate: validate, buildMeeting: buildMeeting,
    defaultParticipants: defaultParticipants, TRANSPORTS: TRANSPORTS
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
