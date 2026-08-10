/* AI Council v0.1 — D3 · RelayFlow：Harness 的 Manual Relay 编排层（无 DOM）。 * CompileFlow + WebRelayController 接线；accept 后交 MeetingRuntime.submitResult 推进。 * 依赖项（WC/CompileFlow/Runtime）调用时取 A.*；F1-RT：accept 先做席位绑定校验（T07）。 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var ACTION = A.MeetingAction.ACTION, C = A.Diagnostic.CODE, D = A.Diagnostic;
  function WC() { return A.WebRelayController; }
  function nextRelay(meeting) {
    var pa = meeting.pendingAction; if (!pa || pa.action_type !== ACTION.COLLECT_RESPONSES) return null;
    /* F1：从调度目标（activeSpeaker 优先）开始找未完成的 web_relay 席位。 */
    var TS = A.MeetingTurnSelector;
    var ids = pa.requiredParticipantIds.slice();
    var t = TS ? TS.nextTarget(meeting) : null;
    if (t && ids.indexOf(t) >= 0) { ids = [t].concat(ids.filter(function (x) { return x !== t; })); }
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (pa.receivedParticipantIds.indexOf(id) >= 0) continue;
      var p = meeting.participants.filter(function (x) { return x.participant_id === id; })[0];
      if (p && (p.transport_kind || "mock") === "web_relay") return p.participant_id;
    }
    return null;
  }
  /* 供 MeetingStepFlow.step 委托：web_relay 参与者必须停下交人工。 */
  function routeStep(meeting) {
    var pa = meeting && meeting.pendingAction;
    if (!pa || pa.action_type !== ACTION.COLLECT_RESPONSES) return { auto: true };
    var next = null;
    var TS = A.MeetingTurnSelector;
    var target = TS ? TS.nextTarget(meeting) : null;
    if (target && pa.receivedParticipantIds.indexOf(target) < 0) next = target;
    if (next === null) {
      for (var i = 0; i < pa.requiredParticipantIds.length && next === null; i++) {
        var id = pa.requiredParticipantIds[i];
        if (pa.receivedParticipantIds.indexOf(id) < 0) next = id;
      }
    }
    if (next === null) return { auto: true };
    var p = meeting.participants.filter(function (x) { return x.participant_id === next; })[0];
    if (p && (p.transport_kind || "mock") === "web_relay")
      return { auto: false, participantId: next, message: "参与者 " + next + " 需要 Manual Relay：复制 Prompt → 粘贴 Response → 校验 → 接受。" };
    return { auto: true };
  }
  /* 生成含一个 web_relay 参与者的演示会议（agent-a1=web_relay，其余 mock）。 */
  function createRelayDemo(protocol, meetingId) {
    if (!protocol) return { ok: false, message: "没有可用的 Protocol，无法创建会议。" };
    var participants = [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "mock" },
      { participant_id: "chair-secretary-1", role_class: "chair_secretary", side_id: null, actor_type: "chair", alias: "Chair", role_id: "neutral-chair-secretary", transport_kind: "mock" }
    ];
    var m = A.MeetingFactory.createMeeting(protocol, { meetingId: meetingId || ("relay-demo-" + Date.now().toString(36)), participants: participants });
    if (m.status === A.MeetingState.STATUS.FAILED) return { ok: false, message: m.error ? m.error.message : "会议创建失败。" };
    var r = A.MeetingRuntime.start(m, protocol);
    if (!r.ok) return { ok: false, message: r.diagnostic ? r.diagnostic.message : "会议启动失败。" };
    m.stateData = m.stateData || {}; m.stateData.preflight_confirmed = true; m.stateData.dev_mode = true;   /* F1：demo=开发测试模式（跳过点名 + mock 豁免模型检查） */
    return { ok: true, meeting: m };
  }
  /* 打开一次 relay：优先用调用方已编译的 prompt/packet；否则经 CompileFlow 编译（需 roleRegistry）。 */
  function open(meeting, protocol, inputs) {
    inputs = inputs || {};
    var pid = inputs.participantId || nextRelay(meeting);
    if (!pid) return { ok: false, message: "没有待 relay 的 web_relay 参与者。" };
    var prompt, packet;
    if (inputs.prompt && inputs.packet) { prompt = inputs.prompt; packet = inputs.packet; }
    else {
      /* F1-A：上下文来自进入阶段时冻结的 Snapshot（只存引用，同阶段发言不再泄漏）；
       * 旧存档/回放投影无 snapshot 时回退实时提取（兼容旧行为）。 */
      var PCS = A.PhaseContextSnapshot;
      var pc = PCS ? PCS.fromPending(meeting) : null;
      var extras = pc ? PCS.resolve(meeting, pc)
        : { previousResponses: A.MeetingResponseState.effectiveResponses(meeting), secretarySummary: A.MeetingResponseState.secretarySummary(meeting) };
      var c = A.CompileFlow.run({ protocol: protocol, meeting: meeting, participantId: pid, roleRegistry: inputs.registry || null, packetSchema: inputs.packetSchema || null,
        previousResponses: extras.previousResponses, secretarySummary: extras.secretarySummary });
      if (!c.ok) return { ok: false, message: c.message };
      prompt = c.prompt; packet = c.packet;
    }
    return WC().open(meeting, { participantId: pid, prompt: prompt, packet: packet });
  }
  /* accept → 交回 Runtime 推进会议；Runtime 接受后把正式 Message 写入 meeting.messages（accepted_by_runtime=true）。
   * F1-B：runtime_accepted = transport_success AND validation_success——状态机已保证 validated 才 accepted，
   * 此处显式断言 validation 记录（旧会话无记录时放行兼容，新会话必有）。 */
  function accept(meeting, protocol, handle) {
    var pa = meeting.pendingAction;
    if (pa && pa.action_type === ACTION.COLLECT_RESPONSES) {
      var rec = WC().state(meeting, handle);
      var pid = rec && rec.request && rec.request.participant_id;
      /* T07：接受对象必须属于本阶段 required 且当前有效未完成——防串席/重复接受。 */
      if (pid && (pa.requiredParticipantIds.indexOf(pid) < 0 || pa.receivedParticipantIds.indexOf(pid) >= 0))
        return { ok: false, diagnostics: [D.create({ code: C.INVOCATION_STATE_TRANSITION_INVALID, message: "该回答不属于当前阶段可接收的委员（" + pid + "）。" })] };
      if (rec && rec.validation && !rec.validation.is_valid)
        return { ok: false, diagnostics: [D.create({ code: C.INVOCATION_OUTPUT_CONTRACT_FAILED, message: "回答未通过输出合同校验，不能接受为正式发言。" })] };
    }
    var a = WC().accept(meeting, handle); if (!a.ok) return a;
    var r = A.MeetingRuntime.submitResult(meeting, protocol, a.submission);
    if (!r.ok) return { ok: false, message: r.diagnostic.message, diagnostic: r.diagnostic, submitFailed: true, accepted: a };
    var mf = A.InvocationMessageFactory.create({ meeting: meeting, handle: handle, result: a.submission.payload.result });
    if (mf.ok) A.InvocationMessageFactory.append(meeting, mf.message);
    return { ok: true, state: "accepted", submission: a.submission, message: mf.ok ? mf.message : null };
  }
  function receive(meeting, handle, raw) { return WC().receive(meeting, handle, raw); }
  function validate(meeting, handle) { return WC().validate(meeting, handle); }
  function reject(meeting, handle, code, msg) { return WC().reject(meeting, handle, code, msg); }
  function retry(meeting, handle) { return WC().retry(meeting, handle); }
  function cancel(meeting, handle) { return WC().cancel(meeting, handle); }
  function state(meeting, handle) { return WC().state(meeting, handle); }
  function sessions(meeting) { return WC().sessions(meeting); }
  function hydrate(meeting) { return WC().hydrate(meeting); }
  A.RelayFlow = Object.freeze({ open: open, nextRelay: nextRelay, routeStep: routeStep, createRelayDemo: createRelayDemo, receive: receive, validate: validate, accept: accept, reject: reject, retry: retry, cancel: cancel, state: state, sessions: sessions, hydrate: hydrate });
})(typeof globalThis !== "undefined" ? globalThis : this);
