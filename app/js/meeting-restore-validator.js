/* AI Council v0.1 — D1-R4
 * MeetingRestoreValidator：存档恢复前的语义校验（Schema 校验由 MeetingSchemaValidator 单独负责）。
 *
 * 原则（计划 §47~§60）：Schema PASS 只证明“文件长得对”；这里证明“存档与当前 Protocol / Runtime 能对得上”。
 * 任何不一致一律 Reject + Diagnostic，绝不自动修复（§60）。
 */
(function (root) {
  "use strict";

  var D = root.AICouncil.Diagnostic;
  var C = D.CODE;
  var FP = root.AICouncil.ProtocolFingerprint;

  function add(list, code, jsonPath, message) {
    list.push(D.create({ code: code, jsonPath: jsonPath || null, message: message }));
  }

  function buildPhaseMap(doc) {
    var m = Object.create(null);
    (doc.phases || []).forEach(function (p) { if (p && p.phase_id) m[p.phase_id] = p; });
    return m;
  }

  /* archive：已通过 Schema 校验的存档对象。
   * availableProtocols：当前 Available Protocol 记录数组（每个含 .protocolId / .version / .document）。
   * 返回 Promise<{ ok, diagnostics }>。 */
  function validate(archive, availableProtocols) {
    var diags = [];

    var snap = archive.protocol_snapshot || {};
    /* 1) Protocol 必须存在（id + version） */
    var proto = (availableProtocols || []).filter(function (p) {
      return p.protocolId === snap.protocol_id && p.version === snap.version;
    })[0];
    if (!proto) {
      add(diags, C.RESTORE_PROTOCOL_NOT_FOUND, "$.protocol_snapshot",
        "存档引用的 Protocol（" + snap.protocol_id + "@" + snap.version + "）不在当前 Available Registry 中，禁止从 Quarantine 恢复。");
      return Promise.resolve({ ok: false, diagnostics: diags });
    }

    var pm = buildPhaseMap(proto.document);

    /* 2) Protocol Canonical Fingerprint 必须一致（异步） */
    return FP.sha256Canonical(proto.document).then(function (fp) {
      if (fp !== snap.sha256) {
        add(diags, C.RESTORE_PROTOCOL_FINGERPRINT_MISMATCH, "$.protocol_snapshot.sha256",
          "Protocol 内容指纹不一致：存档 " + snap.sha256 + "，当前 " + fp + "。同名同版本但内容已被改动，禁止恢复。");
        return { ok: false, diagnostics: diags };
      }

      /* 3) Phase 存在性 */
      if (archive.current_phase_id != null && !pm[archive.current_phase_id]) {
        add(diags, C.RESTORE_PHASE_NOT_FOUND, "$.current_phase_id",
          "current_phase_id(" + archive.current_phase_id + ") 不存在于当前 Protocol。");
      }
      (archive.completed_phase_ids || []).forEach(function (pid) {
        if (!pm[pid]) add(diags, C.RESTORE_PHASE_NOT_FOUND, "$.completed_phase_ids",
          "completed_phase_ids 含不存在的 phase(" + pid + ")。");
      });

      /* 4) Event Sequence 连续 */
      (archive.events || []).forEach(function (ev, i) {
        if (ev.seq !== i) add(diags, C.RESTORE_EVENT_SEQUENCE_INVALID, "$.events[" + i + "].seq",
          "Event seq 不连续：期望 " + i + "，实际 " + ev.seq + "。");
      });

      /* 5) Event ID 唯一 */
      var seenIds = {};
      (archive.events || []).forEach(function (ev, i) {
        if (seenIds[ev.event_id]) add(diags, C.RESTORE_DUPLICATE_EVENT_ID, "$.events[" + i + "].event_id",
          "重复 Event ID：" + ev.event_id + "。");
        seenIds[ev.event_id] = true;
      });

      /* 6) Checkpoint 引用有效 */
      (archive.checkpoints || []).forEach(function (cp, i) {
        if (cp.at_event_seq < 0 || cp.at_event_seq >= (archive.events || []).length)
          add(diags, C.RESTORE_CHECKPOINT_EVENT_NOT_FOUND, "$.checkpoints[" + i + "].at_event_seq",
            "checkpoint(" + cp.checkpoint_id + ") 的 at_event_seq(" + cp.at_event_seq + ") 指向不存在的 Event。");
        if (!pm[cp.phase_id]) add(diags, C.RESTORE_PHASE_NOT_FOUND, "$.checkpoints[" + i + "].phase_id",
          "checkpoint(" + cp.checkpoint_id + ") 的 phase_id(" + cp.phase_id + ") 不存在于 Protocol。");
        if (cp.state_snapshot && cp.state_snapshot.current_phase_id != null && !pm[cp.state_snapshot.current_phase_id])
          add(diags, C.RESTORE_PHASE_NOT_FOUND, "$.checkpoints[" + i + "].state_snapshot.current_phase_id",
            "checkpoint(" + cp.checkpoint_id + ") 快照的 current_phase_id 不存在于 Protocol。");
      });

      /* 7) Participant ID 唯一 */
      var seenPids = {};
      (archive.participants || []).forEach(function (p, i) {
        if (seenPids[p.participant_id]) add(diags, C.RESTORE_DUPLICATE_PARTICIPANT_ID,
          "$.participants[" + i + "].participant_id", "重复 participant_id：" + p.participant_id + "。");
        seenPids[p.participant_id] = true;
      });

      /* 8) Role 引用（仅当存档携带 roles 时校验；D1 无 Role Registry 时 roles 为空，跳过） */
      if ((archive.roles || []).length > 0) {
        var roleById = {};
        (archive.roles || []).forEach(function (r) { roleById[r.role_id] = r; });
        (archive.participants || []).forEach(function (p, i) {
          var r = roleById[p.role_id];
          if (!r) add(diags, C.RESTORE_ROLE_NOT_FOUND, "$.participants[" + i + "].role_id",
            "participant(" + p.participant_id + ") 的 role_id(" + p.role_id + ") 不在 roles[] 中。");
          else if (r.role_class !== p.role_class) add(diags, C.RESTORE_ROLE_CLASS_MISMATCH,
            "$.participants[" + i + "].role_class",
            "participant(" + p.participant_id + ") 的 role_class(" + p.role_class + ") 与 role(" + p.role_id + ") 的 role_class(" + r.role_class + ") 不一致。");
        });
      }

      /* 9) State 一致性（running / waiting_human / completed） */
      var cur = archive.current_phase_id;
      if (archive.status === "running" && cur == null)
        add(diags, C.RESTORE_STATE_INCONSISTENT, "$.current_phase_id", "status=running 但 current_phase_id 为 null。");
      if (archive.status === "waiting_human") {
        var cp2 = cur ? pm[cur] : null;
        if (!cp2 || cp2.kind !== "human_gate")
          add(diags, C.RESTORE_STATE_INCONSISTENT, "$.current_phase_id",
            "status=waiting_human 但当前 phase 不是 human_gate。");
        if (!(archive.pending_action && archive.pending_action.action_type === "await_human_decision"))
          add(diags, C.RESTORE_STATE_INCONSISTENT, "$.pending_action",
            "status=waiting_human 但 pending_action 不是 await_human_decision。");
      }
      if (archive.status === "completed") {
        if (cur != null) add(diags, C.RESTORE_STATE_INCONSISTENT, "$.current_phase_id",
          "status=completed 但 current_phase_id 非 null。");
        if (archive.pending_action != null) add(diags, C.RESTORE_STATE_INCONSISTENT, "$.pending_action",
          "status=completed 但 pending_action 非 null。");
      }

      /* 10) Pending Action 一致性 */
      var pa = archive.pending_action;
      if (pa != null) {
        if (cur != null && pa.phaseId !== cur)
          add(diags, C.RESTORE_PENDING_ACTION_INVALID, "$.pending_action.phaseId",
            "pending_action.phaseId(" + pa.phaseId + ") 不等于 current_phase_id(" + cur + ")。");
        var pidSet = {};
        (archive.participants || []).forEach(function (p) { pidSet[p.participant_id] = true; });
        (pa.requiredParticipantIds || []).forEach(function (pid) {
          if (!pidSet[pid]) add(diags, C.RESTORE_PENDING_ACTION_INVALID, "$.pending_action.requiredParticipantIds",
            "requiredParticipantIds 含不存在的参与者：" + pid + "。");
        });
        var reqSet = {};
        (pa.requiredParticipantIds || []).forEach(function (pid) { reqSet[pid] = true; });
        (pa.receivedParticipantIds || []).forEach(function (pid) {
          if (!reqSet[pid]) add(diags, C.RESTORE_PENDING_ACTION_INVALID, "$.pending_action.receivedParticipantIds",
            "receivedParticipantIds 含不在 requiredParticipantIds 中的参与者：" + pid + "（可能丢失上下文）。");
        });
      }

      return { ok: diags.length === 0, diagnostics: diags };
    });
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingRestoreValidator = Object.freeze({ validate: validate });
})(typeof globalThis !== "undefined" ? globalThis : this);
