/* AI Council v0.1 — MEETING-REPLAY-F1 · MeetingReplay 用例（TEST-173..，方案 T09 防御性门禁 12 项）。
 * 覆盖：timeline 单调 / 上一步不碰 live / replay 不产 Message / replay 不产 PendingAction /
 * 下一步恢复 / 回到当前 / mutating 标记 / B1 before-after seat 状态 / 跨阶段回放 /
 * save-load 后 timeline 一致 / live 不被浏览污染 / displayState 统一出口。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var REPLAY = A.MeetingReplay;

  /* 造一场 1vs1 会议：A1 mock、B1 mock，走完 opening（A1→B1）到 chair 阶段。 */
  function buildMeeting() {
    var proto = { protocolId: "committee-mvp", document: {
      protocol_id: "committee-mvp", version: "0.1.0", name: "委员会 MVP", initial_phase_id: "opening",
      phases: [
        { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
          completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "summary" }] },
        { phase_id: "summary", kind: "secretary_summary", name: "秘书汇总", actor: { selector: "participant_ids", participant_ids: ["chair-1"] },
          completion: { mode: "secretary_respond" }, transitions: [{ trigger: "complete", target: "$end" }] }
      ] } };
    var d = A.MeetingDraft.create("committee-mvp");
    d.title = "回放测试"; d.topic = "议题";
    d.participants = [
      { participant_id: "agent-a1", actor_type: "advisor", role_class: "advisor", side_id: "A", transport_kind: "mock" },
      { participant_id: "agent-b1", actor_type: "advisor", role_class: "advisor", side_id: "B", transport_kind: "mock" },
      { participant_id: "chair-1", actor_type: "chair_secretary", role_class: "chair_secretary", side_id: null, transport_kind: "mock" }
    ];
    var r = A.MeetingDraft.buildMeeting(d, proto, "mtg-replay-1");
    if (!r.ok) throw new Error("建会失败：" + r.message);
    A.ReplayCursor.reset();   /* 测试间游标隔离（UI 由 resetSessionState 负责） */
    return { meeting: r.meeting, protocol: proto };
  }

  function stepTo(state, phaseId) {
    var guard = 0;
    while (state.meeting.currentPhaseId !== phaseId && guard++ < 20) {
      var r = A.MeetingStepFlow.step(state.meeting, state.protocol);
      if (!r.ok || state.meeting.status === "completed") break;
    }
    return state;
  }

  T.test("TEST-173", "T09-1 timeline 顺序单调（sequence/event_cursor 严格递增）", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    var nodes = REPLAY.buildTimeline(state.meeting, state.protocol);
    T.assert(nodes.length >= 4, "节点数 >= 4（创建/进入/A1/B1），实际 " + nodes.length);
    for (var i = 1; i < nodes.length; i++) {
      T.assert(nodes[i].sequence === nodes[i - 1].sequence + 1, "sequence 单调");
      T.assert(nodes[i].event_cursor > nodes[i - 1].event_cursor, "event_cursor 单调");
    }
    return Promise.resolve();
  });

  T.test("TEST-174", "T09-2 上一步不改变 live event count", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    var nBefore = state.meeting.events.length;
    A.ReplayCursor.prev(state.meeting);
    A.ReplayCursor.prev(state.meeting);
    T.assertEqual(state.meeting.events.length, nBefore, "events 数不变");
    T.assertEqual((state.meeting.messages || []).length, 0, "messages 数不变");
    return Promise.resolve();
  });

  T.test("TEST-175", "T09-3 replay 不产生新 Message", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    var n = (state.meeting.messages || []).length;
    A.ReplayCursor.prev(state.meeting);
    var ds = A.ReplayProvider.get(state);
    T.assert(ds.isReplay, "应处于回放");
    T.assertEqual((state.meeting.messages || []).length, n, "live messages 不变");
    T.assertEqual((ds.meeting.messages || []).length, 0, "回放视图 messages 为空（不投影未来）");
    return Promise.resolve();
  });

  T.test("TEST-176", "T09-4 replay 不产生新 PendingAction", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    var paBefore = state.meeting.pendingAction;
    A.ReplayCursor.prev(state.meeting);
    T.assertEqual(state.meeting.pendingAction, paBefore, "live pendingAction 引用不变");
    return Promise.resolve();
  });

  T.test("TEST-177", "T09-5 下一步可恢复（cursor+1 后 replay 视图推进）", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.ReplayCursor.toLatest(state.meeting); A.ReplayCursor.prev(state.meeting);
    var ds1 = A.ReplayProvider.get(state);
    A.ReplayCursor.next(state.meeting);
    var ds2 = A.ReplayProvider.get(state);
    T.assert(ds1.cursor === ds2.cursor - 1, "cursor 前进一步");
    return Promise.resolve();
  });

  T.test("TEST-178", "T09-6 回到当前恢复 Live State", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.ReplayCursor.toLatest(state.meeting); A.ReplayCursor.prev(state.meeting);
    T.assert(A.ReplayProvider.get(state).isReplay, "先进入回放");
    A.ReplayCursor.toLatest(state.meeting);
    var ds = A.ReplayProvider.get(state);
    T.assert(!ds.isReplay, "回到当前后不再回放");
    T.assertEqual(ds.meeting, state.meeting, "displayState.meeting === live meeting");
    return Promise.resolve();
  });

  T.test("TEST-179", "T09-7 replay 下 mutating 判定为真（controls disabled 的依据）", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.ReplayCursor.toLatest(state.meeting); A.ReplayCursor.prev(state.meeting);
    T.assert(A.ReplayProvider.mutatingDisabled(state), "回放时 mutatingDisabled=true");
    A.ReplayCursor.toLatest(state.meeting);
    T.assert(!A.ReplayProvider.mutatingDisabled(state), "最新时 mutatingDisabled=false");
    return Promise.resolve();
  });

  T.test("TEST-180", "T09-8 B1 before/after seat 状态正确（replay 派生）", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);   /* A1 发言 */
    A.MeetingStepFlow.step(state.meeting, state.protocol);   /* B1 发言 */
    var nodes = REPLAY.buildTimeline(state.meeting, state.protocol);
    /* B1 发言前的节点：cursor = B1 的 agent_output_received 事件 index */
    var b1Evt = -1;
    state.meeting.events.forEach(function (ev, i) { if (ev.event_type === "agent_output_received" && ev.actor_id === "agent-b1") b1Evt = i; });
    T.assert(b1Evt > 0, "应存在 B1 发言事件");
    A.ReplayCursor.toLatest(state.meeting);
    var rBefore = REPLAY.replayStateAt(state.meeting, state.protocol, b1Evt);
    T.assert(rBefore.received.indexOf("agent-b1") < 0, "B1 执行前 received 不含 b1");
    T.assert(rBefore.received.indexOf("agent-a1") >= 0, "B1 执行前 A1 已发言");
    var rAfter = REPLAY.replayStateAt(state.meeting, state.protocol, b1Evt + 1);
    T.assert(rAfter.received.indexOf("agent-b1") >= 0, "B1 执行后 received 含 b1");
    T.assertEqual(rAfter.spoken.join(","), "agent-a1,agent-b1", "spoken 集合正确");
    return Promise.resolve();
  });

  T.test("TEST-181", "T09-9 Round1→Round2 可跨阶段回放", function (ctx) {
    var state = buildMeeting();
    stepTo(state, "summary");   /* 推进到 Round2（秘书汇总） */
    T.assertEqual(state.meeting.currentPhaseId, "summary", "live 在 summary");
    var nodes = REPLAY.buildTimeline(state.meeting, state.protocol);
    var rounds = {};
    nodes.forEach(function (n) { rounds[n.round] = (rounds[n.round] || 0) + 1; });
    T.assert(rounds[1] > 0 && rounds[2] > 0, "时间轴含 R1 与 R2");
    A.ReplayCursor.toLatest(state.meeting);
    A.ReplayCursor.prev(state.meeting);
    A.ReplayCursor.prev(state.meeting);
    var ds = A.ReplayProvider.get(state);
    T.assert(ds.replay && ds.replay.phase_id === "opening", "回放可回到 opening：" + (ds.replay && ds.replay.phase_id));
    T.assertEqual(state.meeting.currentPhaseId, "summary", "live 仍停留在 summary（不倒退）");
    return Promise.resolve();
  });

  T.test("TEST-182", "T09-10 save/load 后 timeline 一致（T08 Persist）", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    var nodesBefore = REPLAY.buildTimeline(state.meeting, state.protocol);
    return A.MeetingArchive.build(state.meeting, state.protocol).then(function (archive) {
      var restored = A.MeetingRestore.restore(JSON.parse(JSON.stringify(archive)));
      T.assert(restored && restored.meetingId === state.meeting.meetingId, "恢复应返回 meeting");
      var nodesAfter = REPLAY.buildTimeline(restored, state.protocol);
      T.assertEqual(nodesAfter.length, nodesBefore.length, "节点数一致");
      T.assertEqual(nodesAfter[nodesAfter.length - 1].event_cursor, nodesBefore[nodesBefore.length - 1].event_cursor, "末节点 cursor 一致");
      T.assertEqual(nodesAfter[nodesAfter.length - 1].label, nodesBefore[nodesBefore.length - 1].label, "末节点 label 一致");
    });
  });

  T.test("TEST-183", "T09-11 live Runtime 在回放浏览期间保持原状态（无任何写操作）", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    var snapshot = JSON.stringify(state.meeting);
    A.ReplayCursor.prev(state.meeting);
    A.ReplayProvider.get(state);
    REPLAY.replayStateAt(state.meeting, state.protocol, 0);
    T.assertEqual(JSON.stringify(state.meeting), snapshot, "回放浏览后 live meeting 字节级不变");
    return Promise.resolve();
  });

  T.test("TEST-184", "T09-12 全部核心视图统一消费 displayState（ReplayProvider.get 幂等一致）", function (ctx) {
    var state = buildMeeting();
    A.MeetingStepFlow.step(state.meeting, state.protocol);
    A.ReplayCursor.prev(state.meeting);
    var ds = A.ReplayProvider.get(state);
    var ds2 = A.ReplayProvider.get(state);
    T.assertEqual(ds.cursor, ds2.cursor, "同一 cursor");
    T.assertEqual(ds.isReplay, ds2.isReplay, "同一 isReplay");
    T.assertEqual(ds.meeting.currentPhaseId, ds2.meeting.currentPhaseId, "同一回放视图 phase");
    T.assertEqual(JSON.stringify(ds.meeting.pendingAction), JSON.stringify(ds2.meeting.pendingAction), "同一回放 pendingAction");
    T.assert(ds.meeting !== state.meeting, "回放视图是独立只读投影（非 live 引用）");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
