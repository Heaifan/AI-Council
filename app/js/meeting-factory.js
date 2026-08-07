/* AI Council v0.1 — D1-R3
 * MeetingFactory：仅从“已通过 Schema + Semantic 校验的 Available Protocol”创建会议初始状态。
 * 工厂只负责创建，绝不推进会议、绝不修改 Protocol。
 */
(function (root) {
  "use strict";

  var MS = root.AICouncil.MeetingState;
  var STATUS = MS.STATUS;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function docOf(protocol) {
    return (protocol && protocol.document) ? protocol.document : protocol;
  }

  function buildPhaseMap(doc) {
    var m = Object.create(null);
    (doc.phases || []).forEach(function (p) { if (p && p.phase_id) m[p.phase_id] = p; });
    return m;
  }

  function normalizeParticipant(p) {
    return {
      participant_id: p.participant_id,
      role_class: p.role_class,
      side_id: (p.side_id === undefined ? null : p.side_id),
      actor_type: p.actor_type || null,
      alias: p.alias || null,
      role_id: p.role_id || null,
      model_ref: (p.model_ref === undefined ? null : p.model_ref),
      transport_kind: p.transport_kind || "mock"
    };
  }

  /* protocol：Available Protocol 记录（含 .document）或原始已校验 document。
   * config：{ meetingId?, title?, visibilityMode?, seed?, participants:[...], stateData? } */
  function createMeeting(protocol, config) {
    config = config || {};
    var doc = docOf(protocol);
    var meeting = {
      meetingId: config.meetingId || ("meeting-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36)),
      protocolId: doc.protocol_id,
      protocolVersion: doc.version,
      title: config.title || (doc.name || doc.protocol_id),
      visibilityMode: config.visibilityMode || doc.default_visibility_mode || null,
      seed: (typeof config.seed === "number") ? config.seed : null,
      status: STATUS.INITIALIZED,
      currentPhaseId: doc.initial_phase_id || null,
      completedPhaseIds: [],
      participants: (config.participants || []).map(normalizeParticipant),
      stateData: config.stateData ? clone(config.stateData) : {},
      pendingAction: null,
      lastTransition: null,
      lastAction: null,
      error: null
    };

    /* 防御性检查：会议创建必须基于合法 Available Protocol */
    var pm = buildPhaseMap(doc);
    if (!doc.initial_phase_id || !pm[doc.initial_phase_id]) {
      MS.markFailed(meeting, "RUNTIME_PHASE_NOT_FOUND",
        "initial_phase_id(" + doc.initial_phase_id + ") 不存在，无法创建会议。");
    }
    if (meeting.participants.length === 0) {
      MS.markFailed(meeting, "RUNTIME_PARTICIPANT_NOT_FOUND",
        "Meeting 配置未提供任何 participants，无法解析任何 actor。");
    }
    return meeting;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingFactory = Object.freeze({
    createMeeting: createMeeting,
    buildPhaseMap: buildPhaseMap,
    docOf: docOf
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
