/* AI Council v0.1 — D1-R4
 * MeetingArchive：把 Runtime Meeting 映射成 meeting.schema.json 兼容的存档文档。
 *
 * 设计（计划 §35~§41）：
 *  - 不负责生成保存文件（那是 MeetingPersistence 的事）。
 *  - Runtime Model ≠ Archive DTO：内部 camelCase 直接复用；role_id 为 null 时回退到 participant_id
 *    （meeting.schema 要求 role_id 为非空 pattern 字符串，而 D1 协议可能未提供 role card）。
 *  - D1 暂无 Role Registry，roles[] 如实为空数组（schema 无 minItems，合法）。
 *  - Future Arrays（messages/artifacts/annotations）当前为空；branch 为 null。
 *  - protocol_snapshot.sha256 由 Protocol Canonical Fingerprint 计算（异步）。
 */
(function (root) {
  "use strict";

  var FP = root.AICouncil.ProtocolFingerprint;
  var Log = root.AICouncil.MeetingEventLog;
  var FACTORY = root.AICouncil.MeetingFactory;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function docOf(protocol) {
    return (protocol && protocol.document) ? protocol.document : protocol;
  }

  /* seed → Archive DTO：meeting.schema 要求 integer + minimum:0 且 required，
   * 因此任何非法值一律规范化为 0，绝不写出 null（否则会产出无法通过 Schema 的存档）。 */
  function normalizeSeed(v) {
    if (typeof v !== "number" || !isFinite(v)) return 0;
    var n = Math.floor(v);
    return n < 0 ? 0 : n;
  }

  /* 参与者 → Archive DTO（补齐 8 个必填字段，role_id 为空时回退 participant_id）。 */
  function participantToDTO(p) {
    return {
      participant_id: p.participant_id,
      actor_type: p.actor_type || "agent",
      role_id: p.role_id || p.participant_id,
      role_class: p.role_class,
      side_id: (p.side_id === undefined ? null : p.side_id),
      alias: p.alias || p.participant_id,
      model_ref: (p.model_ref === undefined ? null : p.model_ref),
      transport_kind: p.transport_kind || "mock"
    };
  }

  /* 构建存档文档（异步：需要计算 Protocol 指纹）。返回 Promise<archive>。 */
  function build(meeting, protocol) {
    var doc = docOf(protocol);
    return FP.sha256Canonical(doc).then(function (sha) {
      var firstEvent = (meeting.events && meeting.events.length) ? meeting.events[0].occurred_at : Log.now();
      var archive = {
        schema_version: "0.1.0",
        meeting_id: meeting.meetingId,
        title: meeting.title,
        status: meeting.status,
        protocol_snapshot: {
          protocol_id: doc.protocol_id,
          version: doc.version,
          sha256: sha
        },
        visibility_mode: meeting.visibilityMode,
        seed: normalizeSeed(meeting.seed),
        roles: (meeting.roles || []).slice(),
        participants: (meeting.participants || []).map(participantToDTO),
        current_phase_id: meeting.currentPhaseId,
        completed_phase_ids: (meeting.completedPhaseIds || []).slice(),
        state_data: clone(meeting.stateData || {}),
        pending_action: meeting.pendingAction ? clone(meeting.pendingAction) : null,
        events: clone(meeting.events || []),
        messages: clone(meeting.messages || []),   /* F1-C：正式会议事实落库（不再恒空） */
        checkpoints: clone(meeting.checkpoints || []),
        artifacts: [],
        annotations: [],
        branch: null,
        created_at: firstEvent,
        updated_at: Log.now()
      };
      var t = (meeting.topic === undefined ? "" : meeting.topic);
      if (typeof t === "string" && t.trim()) archive.topic = t.trim();
      return archive;
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingArchive = Object.freeze({
    build: build,
    participantToDTO: participantToDTO
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
