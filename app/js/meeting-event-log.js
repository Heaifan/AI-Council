/* AI Council v0.1 — D1-R4
 * MeetingEventLog：会议事件日志（append-only）。
 *
 * 职责（计划 §13~§26）：
 *  - 任何会改变 Meeting 状态的内部动作都必须留下 Event。
 *  - 统一负责 seq / event_id / occurred_at 的生成，Runtime 不得各处手算 events.length+1。
 *  - 日志只读追加：Runtime 不得修改旧 Event、删除 Event、重新排序 Event。
 *  - occurred_at 时间来源可注入（测试注入固定时钟，保证确定性）。
 *  - Event 元数据（occurred_at / event_id）不得影响 Phase Transition 决策（§80）。
 */
(function (root) {
  "use strict";

  var C = root.AICouncil && root.AICouncil.Diagnostic && root.AICouncil.Diagnostic.CODE;

  var clockFn = function () { return new Date().toISOString(); };

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }

  function now() { return clockFn(); }

  /* 注入时钟（测试用）。传 null 恢复系统时钟。 */
  function setClock(fn) {
    clockFn = (typeof fn === "function") ? fn : function () { return new Date().toISOString(); };
  }

  /* 追加一条事件。meeting.events 必须已存在（Factory 创建时即初始化为空数组）。
   * options: { phaseId, actorType, actorId, payload } */
  function append(meeting, eventType, options) {
    options = options || {};
    if (!meeting || !Array.isArray(meeting.events)) {
      var e = new Error("MeetingEventLog.append：meeting.events 不存在，无法记录事件 " + eventType + "。");
      if (C) e.code = C.PERSISTENCE_EVENT_LOG_UNAVAILABLE;
      throw e;
    }
    var seq = meeting.events.length;
    var event = {
      seq: seq,
      event_id: "evt-" + pad(seq, 6),
      event_type: eventType,
      phase_id: (options.phaseId !== undefined ? options.phaseId : null),
      actor_type: options.actorType || "system",
      actor_id: (options.actorId !== undefined ? options.actorId : null),
      occurred_at: now(),
      payload: options.payload || {}
    };
    meeting.events.push(event);
    return event;
  }

  /* record 为 append 的语义别名（计划 §25 同时提到两种命名）。 */
  function record(meeting, eventType, options) { return append(meeting, eventType, options); }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.MeetingEventLog = Object.freeze({
    setClock: setClock,
    now: now,
    append: append,
    record: record
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
