/* AI Council v0.1 — D3 · WEB_RELAY
 * MeetingRuntimeView：会议页的渲染。只读 MeetingStepFlow 的投影，不自行解释会议语义。
 * 按钮启用规则全部来自流程层：「执行下一步（模拟）」只在 collect_responses 时可点，
 * 结束会议 / 继续会议 / 进入对辩只在 waiting_human 且该 choice 合法时可点。
 * 界面文案一律中文；机器状态值经 UIText 翻译，视图不自己硬编码中文状态名。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function row(box, id, label, value) {
    var f = Dom.field(label, value);
    f.lastChild.id = id;
    box.appendChild(f);
  }

  function btn(id, label, secondary, disabled, onClick) {
    var b = Dom.el("button", "btn" + (secondary ? " secondary" : ""), label);
    b.id = id;
    b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }

  function emptyCard(box) {
    var p = Dom.el("p", "empty", "当前没有正在进行的会议。你可以创建模拟会议，或创建网页中继会议进行真实 AI 测试。");
    p.id = "mt-empty";
    box.appendChild(p);
    box.appendChild(Dom.el("p", "note",
      "创建模拟会议：使用模拟 Agent 自动生成测试响应，用于验证会议流程，不调用真实 AI。" +
      "创建网页中继会议：轮到 AI 委员时生成提示词，由你复制到 ChatGPT / Claude / Gemini，再把回答粘贴回来。"));
    return box;
  }

  function stateCard(s) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "会议运行状态"));
    if (!s) return emptyCard(box);
    row(box, "mt-id", "会议编号", s.meetingId);
    row(box, "mt-protocol", "议事规则", s.protocol);
    row(box, "mt-status", "会议状态", A.UIText.meetingStatus(s.status));
    row(box, "mt-status-raw", "内部状态", s.status);
    row(box, "mt-phase", "当前阶段", s.currentPhaseId || "—");
    row(box, "mt-events", "事件数", s.events);
    row(box, "mt-cp", "检查点数", s.checkpoints);
    row(box, "mt-pending", "待办动作", s.pending ? s.pending.type : "—");
    if (s.pending) {
      row(box, "mt-required", "本轮应发言", s.pending.required.join(", ") || "—");
      row(box, "mt-received", "已收到发言", s.pending.received.join(", ") || "（无）");
      if (s.pending.choices.length) {
        row(box, "mt-choices", "可选裁定", s.pending.choices.map(A.UIText.choice).join(" / "));
      }
    }
    if (s.error) row(box, "mt-error", "错误", s.error);
    return box;
  }

  function gateBtn(id, label, gate, choice, state) {
    var off = !gate.enabled || gate.choices.indexOf(choice) < 0;
    return btn(id, label, true, off, function () { A.MeetingActions.decide(state, choice); });
  }

  function controls(state, s, gate) {
    var bar = Dom.el("div", "controls");
    var canStep = !!(s && s.pending && s.pending.type === A.MeetingAction.ACTION.COLLECT_RESPONSES);
    bar.appendChild(btn("mt-create", "创建模拟会议", false, !state.registry, A.MeetingActions.create));
    bar.appendChild(btn("mt-create-relay", "创建网页中继会议", true, !state.registry, A.MeetingActions.createRelay));
    bar.appendChild(btn("mt-step", "执行下一步（模拟）", false, !canStep, function () { A.MeetingActions.step(state); }));
    bar.appendChild(gateBtn("mt-finish", "结束会议", gate, "finish", state));
    bar.appendChild(gateBtn("mt-continue", "继续会议", gate, "continue", state));
    bar.appendChild(gateBtn("mt-battle", "进入对辩", gate, "battle", state));
    bar.appendChild(btn("mt-save", "保存会议 JSON", true, !state.meeting, function () { A.MeetingActions.save(state); }));
    bar.appendChild(btn("mt-load", "加载会议 JSON", true, !state.registry, function () { A.MeetingActions.load(state); }));
    return bar;
  }

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var s = A.MeetingStepFlow.summary(state.meeting);
    var gate = A.MeetingStepFlow.humanGateState(state.meeting);
    host.appendChild(stateCard(s));
    host.appendChild(controls(state, s, gate));
    var m = A.MeetingActions.message();
    var note = Dom.el("div", "status " + m.kind, m.text);
    note.id = "mt-msg";
    host.appendChild(note);
    host.appendChild(Dom.el("p", "note",
      "「执行下一步（模拟）」每次只消费当前待办动作的一个步骤（一位委员一次响应），绝不自动越过人工裁定点。"));
  }

  A.MeetingRuntimeView = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
