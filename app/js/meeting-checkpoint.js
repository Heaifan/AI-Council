/* AI Council v0.1 — D1-R4
 * MeetingCheckpoint：可恢复 Runtime 执行状态的快照（非整文件复制）。
 *
 * 设计（计划 §27~§33）：
 *  - 创建时机：Runtime 正式进入一个 checkpoint=true 的 Phase，且稳定 State / pendingAction 已建立之后。
 *  - 快照必须是 Deep Copy（JSON-safe 前提下用 JSON 往返），后续 Meeting 变化不得影响旧 Checkpoint。
 *  - 每个 Checkpoint 关联一条 checkpoint_created Event，at_event_seq 指向该 Event 的 seq。
 *  - id 用简单连续编号 checkpoint-NNNNNN，不引入 UUID 依赖。
 */
(function (root) {
  "use strict";

  var MS = root.AICouncil.MeetingState;
  var Log = root.AICouncil.MeetingEventLog;

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }

  /* 深拷贝：依赖 MeetingState 已通过 JSON-safe 审计（计划 T06）。 */
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 构造当前 Runtime 状态快照（仅存档必要的可恢复字段）。 */
  function snapshotOf(meeting) {
    return {
      status: meeting.status,
      current_phase_id: meeting.currentPhaseId,
      completed_phase_ids: (meeting.completedPhaseIds || []).slice(),
      state_data: deepClone(meeting.stateData || {}),
      pending_action: meeting.pendingAction ? deepClone(meeting.pendingAction) : null
    };
  }

  /* 在 Runtime 进入 checkpoint=true 的 Phase 之后调用。
   * options: { phaseKind, pendingActionType, selectedParticipantIds }（仅用于事件 payload 备注） */
  function create(meeting, options) {
    options = options || {};
    if (!meeting || !Array.isArray(meeting.checkpoints)) {
      throw new Error("MeetingCheckpoint.create：meeting.checkpoints 不存在。");
    }
    var checkpointId = "checkpoint-" + pad(meeting.checkpoints.length, 6);
    /* 1) 先追加 checkpoint_created 事件，拿到其 seq 作为 at_event_seq */
    var ev = Log.append(meeting, "checkpoint_created", {
      phaseId: meeting.currentPhaseId,
      payload: {
        checkpoint_id: checkpointId,
        phase_id: meeting.currentPhaseId,
        phase_kind: options.phaseKind || null,
        pending_action_type: options.pendingActionType || null,
        selected_participant_ids: options.selectedParticipantIds || null
      }
    });
    var checkpoint = {
      checkpoint_id: checkpointId,
      at_event_seq: ev.seq,
      phase_id: meeting.currentPhaseId,
      state_snapshot: snapshotOf(meeting),
      created_at: Log.now()
    };
    meeting.checkpoints.push(checkpoint);
    return checkpoint;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingCheckpoint = Object.freeze({
    create: create,
    snapshotOf: snapshotOf
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
