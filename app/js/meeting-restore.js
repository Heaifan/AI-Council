/* AI Council v0.1 — D1-R4
 * MeetingRestore：把通过 Schema + Restore 语义校验的存档 DTO 还原为 Runtime Meeting State。
 *
 * 设计（计划 §67~§72）：
 *  - 只映射状态，绝不调用 Runtime.start()（否则会重新 opening，破坏“不重复已完成 Phase”）。
 *  - 还原 status / currentPhaseId / completedPhaseIds / stateData / pendingAction / participants /
 *    roles / events / checkpoints。
 *  - 部分响应（receivedParticipantIds 子集）原样保留，Runtime 继续时只等待剩余参与者（§70）。
 *  - Event Log / Checkpoint 作为历史证据载入，不重新执行（§72）。
 */
(function (root) {
  "use strict";

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function restore(archive) {
    var parts = (archive.participants || []).map(function (p) {
      return {
        participant_id: p.participant_id,
        role_class: p.role_class,
        side_id: (p.side_id === undefined ? null : p.side_id),
        actor_type: p.actor_type || "agent",
        alias: p.alias || p.participant_id,
        role_id: p.role_id,
        model_ref: (p.model_ref === undefined ? null : p.model_ref),
        transport_kind: p.transport_kind || "mock"
      };
    });
    return {
      meetingId: archive.meeting_id,
      protocolId: archive.protocol_snapshot.protocol_id,
      protocolVersion: archive.protocol_snapshot.version,
      title: archive.title,
      visibilityMode: archive.visibility_mode,
      seed: (typeof archive.seed === "number" ? archive.seed : 0),
      status: archive.status,
      currentPhaseId: archive.current_phase_id,
      completedPhaseIds: (archive.completed_phase_ids || []).slice(),
      participants: parts,
      roles: (archive.roles || []).slice(),
      events: (archive.events || []).slice(),
      checkpoints: (archive.checkpoints || []).slice(),
      stateData: clone(archive.state_data || {}),
      pendingAction: archive.pending_action ? clone(archive.pending_action) : null,
      lastTransition: null,
      lastAction: null,
      error: null
    };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingRestore = Object.freeze({ restore: restore });
})(typeof globalThis !== "undefined" ? globalThis : this);
