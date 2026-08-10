/* AI Council v0.1 — MEETING-INTEGRITY-F1-A · Phase Context Snapshot（TEST-218..225，S01..S08）。
 * 用户裁定（F1-A）：进入 Phase 的瞬间冻结可见上下文引用（snapshot 只存 message_id 引用，不复制文本）。
 *   opening → 完全独立；summary → 已完成阶段全部委员发言；critique → Opening + 秘书汇总（不见同阶段）；
 *   battle → 保持既有语义（每参与者最新 official + 秘书最新汇总）。
 * 挂载点 pendingAction.phase_context（checkpoint/存档自动携带 → S04 恢复后一致）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var RT = A.MeetingRuntime;
  var TS = A.MeetingTurnSelector;
  var PCS = A.PhaseContextSnapshot;

  /* 本地协议：opening(全员) → summary(秘书) → critique(全员) → human-decision（+ battle 变体） */
  function protoWith(battle) {
    var phases = [
      { phase_id: "opening", kind: "agent_turn", name: "独立陈述", actor: { selector: "all_advisors" },
        completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "summary" }] },
      { phase_id: "summary", kind: "secretary_summary", name: "秘书汇总", actor: { selector: "role_class", role_class: "chair_secretary" },
        completion: { mode: "secretary_respond" }, transitions: [{ trigger: "complete", target: "critique" }] },
      { phase_id: "critique", kind: "critique", name: "全员挑刺", actor: { selector: "all_advisors" },
        completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }] },
      { phase_id: "human-decision", kind: "human_gate", name: "主席裁定",
        transitions: [{ trigger: "human_choice", choice: "finish", target: "$end" }] }
    ];
    if (battle) {
      phases[3] = { phase_id: "human-decision", kind: "human_gate", name: "主席裁定",
        transitions: [{ trigger: "human_choice", choice: "battle", target: "battle" }, { trigger: "human_choice", choice: "finish", target: "$end" }] };
      phases.push({ phase_id: "battle", kind: "battle", name: "正反交锋", actor: { selector: "selected_participants", selection_key: "battle_participants" },
        completion: { mode: "all_selected_respond" }, transitions: [{ trigger: "complete", target: "human-decision" }] });
    }
    return { protocolId: "rt-f1a", document: {
      protocol_id: "rt-f1a", version: "0.1.0", name: "完整性", initial_phase_id: "opening",
      required_roles: [
        { role_class: "advisor", min_count: 2, max_count: 6 },
        { role_class: "chair_secretary", min_count: 1, max_count: 1 }
      ],
      phases: phases } };
  }

  function participants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "web_relay", model_ref: "claude-web" },
      { participant_id: "agent-a3", role_class: "chair_secretary", side_id: null, actor_type: "agent", alias: "A3", role_id: "meeting-secretary", seat_id: "A3", transport_kind: "web_relay", model_ref: "chatgpt-web" }
    ];
  }

  function openM(proto) {
    var m = A.MeetingFactory.createMeeting(proto, { meetingId: "rt-f1a-" + Date.now().toString(36), participants: participants() });
    RT.start(m, proto);
    return m;
  }
  /* 模拟 RelayFlow.accept 链的落库结果：正式消息 + received 推进（消息形状同 InvocationMessageFactory）。 */
  function acceptLike(m, proto, id, text) {
    if (!m.messages) m.messages = [];
    m.messages.push({ schema_version: "0.1.0", message_id: "msg-" + id + "-" + m.events.length,
      meeting_id: m.meetingId, phase_id: m.currentPhaseId,
      sender: { actor_type: "agent", actor_id: id, role_id: "advisor", alias: id },
      recipients: { scope: "meeting" }, content: { raw_text: text || ("回答 " + id) },
      validation: { status: "valid", errors: [] }, accepted_by_runtime: true,
      created_at: new Date().toISOString() });
    return RT.submitResult(m, proto, { participant_id: id, payload: { mock: false, participantId: id } });
  }
  function advanceTo(m, proto, phaseId) {
    var guard = 0;
    while (m.currentPhaseId !== phaseId && guard++ < 10) {
      if (TS.phaseStatus(m, proto) === "ready_to_advance") { var ad = RT.advancePhase(m, proto); if (!ad.ok) break; }
      else if (m.activeSpeakerId) acceptLike(m, proto, m.activeSpeakerId);
      else break;
    }
  }
  /* 模拟 RelayFlow.open 的消费路径：snapshot 引用 → 解析 → 编译。 */
  function compileViaSnapshot(m, proto, pid) {
    var pc = PCS.fromPending(m);
    T.assert(!!pc, "当前阶段存在 phase_context snapshot");
    var ex = PCS.resolve(m, pc);
    var c = A.CompileFlow.run({ protocol: proto, meeting: m, participantId: pid,
      roleRegistry: { ok: true, findRole: function () { return null; } }, packetSchema: null,
      previousResponses: ex.previousResponses, secretarySummary: ex.secretarySummary });
    T.assert(c.ok, "编译成功：" + pid);
    return c.prompt;
  }

  /* ============ S01/S02：Opening 完全独立 ============ */
  T.test("TEST-218", "S01 opening：A1 先答 → B1 Prompt 不含 A1 本轮内容（0 命中）", function () {
    var p = protoWith(false), m = openM(p);
    T.assertEqual(PCS.fromPending(m).source_message_ids.length, 0, "opening snapshot 空引用");
    acceptLike(m, p, "agent-a1", "A1 独家观点：必须继续自研核心引擎。");
    var prompt = compileViaSnapshot(m, p, "agent-b1");
    T.assert(prompt.indexOf("A1 独家观点") < 0, "B1 看不到 A1 本轮 Opening");
    T.assert(prompt.indexOf("上一阶段正式发言") < 0, "无注入区块");
    return Promise.resolve();
  });

  T.test("TEST-219", "S02 opening：B1 先答 → A1 Prompt 不含 B1 内容", function () {
    var p = protoWith(false), m = openM(p);
    acceptLike(m, p, "agent-b1", "B1 独家质疑：外购方案风险更低。");
    var prompt = compileViaSnapshot(m, p, "agent-a1");
    T.assert(prompt.indexOf("B1 独家质疑") < 0, "A1 看不到 B1 本轮 Opening");
    T.assert(PCS.fromPending(m).source_message_ids.length === 0, "snapshot 仍为空引用");
    return Promise.resolve();
  });

  /* ============ S03：Critique 只共享已完成阶段 ============ */
  T.test("TEST-220", "S03 critique：B1 可见 Opening+秘书汇总，不可见 A1 的 Critique", function () {
    var p = protoWith(false), m = openM(p);
    acceptLike(m, p, "agent-a1", "A1 正式回答：支持继续自研。");
    acceptLike(m, p, "agent-b1", "B1 正式回答：反对，风险过高。");
    advanceTo(m, p, "summary");
    acceptLike(m, p, "agent-a3", "秘书中立摘要：双方分歧在于风险评估。");
    advanceTo(m, p, "critique");
    var snap = PCS.fromPending(m);
    T.assertEqual(snap.source_message_ids.length, 2, "critique 引用 = 2 条 Opening");
    T.assert(snap.secretary_summary_id !== null, "critique 引用秘书汇总");
    acceptLike(m, p, "agent-a1", "A1 的批判意见：秘书摘要漏掉了成本风险。");
    var prompt = compileViaSnapshot(m, p, "agent-b1");
    T.assert(prompt.indexOf("A1 正式回答：支持继续自研。") >= 0, "B1 可见 A1 Opening 原文");
    T.assert(prompt.indexOf("秘书中立摘要") >= 0, "B1 可见秘书汇总");
    T.assert(prompt.indexOf("A1 的批判意见") < 0, "B1 不可见 A1 同阶段 Critique");
    return Promise.resolve();
  });

  /* ============ S04：存档恢复后 Snapshot 一致 ============ */
  T.test("TEST-221", "S04 存档恢复（刷新）后 Snapshot 引用一致，重复 S03 仍不泄漏同阶段", function () {
    var p = protoWith(false), m = openM(p);
    acceptLike(m, p, "agent-a1", "A1 正式回答：支持继续自研。");
    acceptLike(m, p, "agent-b1", "B1 正式回答：反对，风险过高。");
    advanceTo(m, p, "summary");
    acceptLike(m, p, "agent-a3", "秘书中立摘要：双方分歧在于风险评估。");
    advanceTo(m, p, "critique");   /* critique 刚进入（尚未有人发言）即存档 */
    var snapBefore = PCS.fromPending(m);
    return A.MeetingArchive.build(m, p).then(function (archive) {
      var restored = A.MeetingRestore.restore(archive);
      var snap2 = PCS.fromPending(restored);
      T.assert(!!snap2, "恢复后 snapshot 仍在");
      T.assertEqual(JSON.stringify(snap2), JSON.stringify(snapBefore), "Snapshot 对象逐字一致（引用集/秘书汇总/时间）");
      /* 恢复后重复 S03 的隔离语义：A1 先答 critique → B1 不可见同阶段 Critique
       * （注：恢复后「可见 Opening 原文/秘书汇总」依赖 messages 落库——F1-C 交付，跨轮依赖登记） */
      acceptLike(restored, p, "agent-a1", "A1 的批判意见：秘书摘要漏掉了成本风险。");
      var prompt = compileViaSnapshot(restored, p, "agent-b1");
      T.assert(prompt.indexOf("A1 的批判意见") < 0, "恢复后 B1 不可见 A1 同阶段 Critique");
      return Promise.resolve();
    });
  });

  /* ============ S05：Summary 秘书读到全部 Opening ============ */
  T.test("TEST-222", "S05 summary：秘书 Prompt 含全部 Opening（snapshot 解析路径）", function () {
    var p = protoWith(false), m = openM(p);
    acceptLike(m, p, "agent-a1", "A1 正式回答：支持继续自研。");
    acceptLike(m, p, "agent-b1", "B1 正式回答：反对，风险过高。");
    advanceTo(m, p, "summary");
    var snap = PCS.fromPending(m);
    T.assertEqual(snap.source_message_ids.length, 2, "秘书引用 = 2 条委员 Opening");
    T.assertEqual(snap.secretary_summary_id, null, "summary 进入时无秘书汇总");
    var prompt = compileViaSnapshot(m, p, "agent-a3");
    T.assert(prompt.indexOf("A1 正式回答：支持继续自研。") >= 0 && prompt.indexOf("B1 正式回答：反对，风险过高。") >= 0, "秘书含双方 Opening 原文");
    return Promise.resolve();
  });

  /* ============ S06：Battle 保持既有语义 ============ */
  T.test("TEST-223", "S06 battle：保持既有语义（每参与者最新 official + 秘书汇总）", function () {
    var p = protoWith(true), m = openM(p);
    acceptLike(m, p, "agent-a1", "A1 正式回答：支持继续自研。");
    acceptLike(m, p, "agent-b1", "B1 正式回答：反对，风险过高。");
    advanceTo(m, p, "summary");
    acceptLike(m, p, "agent-a3", "秘书中立摘要：双方分歧在于风险评估。");
    advanceTo(m, p, "critique");
    acceptLike(m, p, "agent-a1", "A1 批判：成本被低估。");
    acceptLike(m, p, "agent-b1", "B1 反驳：自研周期不可控。");
    advanceTo(m, p, "human-decision");
    m.stateData = m.stateData || {}; m.stateData.battle_participants = ["agent-a1", "agent-b1"];
    var r = RT.submitHumanDecision(m, p, { choice: "battle" });
    T.assert(r.ok, "进入 battle");
    var snap = PCS.fromPending(m);
    T.assertEqual(snap.source_message_ids.length, 2, "battle 引用 = 每参与者最新 official（Critique）");
    T.assert(snap.secretary_summary_id !== null, "battle 仍共享秘书汇总");
    var prompt = compileViaSnapshot(m, p, "agent-a1");
    T.assert(prompt.indexOf("A1 批判：成本被低估。") >= 0 && prompt.indexOf("B1 反驳：自研周期不可控。") >= 0, "battle 互见对方最新发言（现状）");
    T.assert(prompt.indexOf("秘书中立摘要") >= 0, "battle 含秘书汇总");
    return Promise.resolve();
  });

  /* ============ S07：旧存档兼容（无 snapshot 时 fromPending 返回 null） ============ */
  T.test("TEST-224", "S07 旧存档/回放投影无 snapshot → fromPending 返回 null（回退路径由 RelayFlow 处理）", function () {
    var p = protoWith(false), m = openM(p);
    delete m.pendingAction.phase_context;
    T.assertEqual(PCS.fromPending(m), null, "无 phase_context → null");
    T.assertEqual(PCS.fromPending(null), null, "无 meeting → null");
    return Promise.resolve();
  });

  /* ============ S08：critique 引用集不含同阶段消息（进入时刻冻结） ============ */
  T.test("TEST-225", "S08 snapshot 进入时刻冻结：同阶段新消息不改变引用集", function () {
    var p = protoWith(false), m = openM(p);
    acceptLike(m, p, "agent-a1", "A1 正式回答：支持继续自研。");
    acceptLike(m, p, "agent-b1", "B1 正式回答：反对，风险过高。");
    advanceTo(m, p, "critique");
    var snapBefore = JSON.stringify(PCS.fromPending(m).source_message_ids);
    acceptLike(m, p, "agent-a1", "A1 的批判意见：成本风险。");
    acceptLike(m, p, "agent-b1", "B1 的批判意见：周期风险。");
    T.assertEqual(JSON.stringify(PCS.fromPending(m).source_message_ids), snapBefore, "同阶段发言不改变引用集");
    return Promise.resolve();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
