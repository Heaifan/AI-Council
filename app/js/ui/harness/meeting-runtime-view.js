/* AI Council v0.1 — D2-F1
 * MeetingRuntimeView：Meeting Tab 的渲染。只读 MeetingStepFlow 的投影，不自行解释会议语义。
 * 按钮启用规则全部来自流程层：Mock 只在 collect_responses 时可点，
 * Finish / Continue / Battle 只在 waiting_human 且该 choice 合法时可点。
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

  function stateCard(s) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "Meeting Runtime"));
    if (!s) {
      var p = Dom.el("p", "empty", "（当前没有会议。点 Create Demo Meeting 开始。）");
      p.id = "mt-empty";
      box.appendChild(p);
      return box;
    }
    row(box, "mt-id", "Meeting ID", s.meetingId);
    row(box, "mt-protocol", "Protocol", s.protocol);
    row(box, "mt-status", "Status", s.status);
    row(box, "mt-phase", "Current Phase", s.currentPhaseId || "—");
    row(box, "mt-events", "Events", s.events);
    row(box, "mt-cp", "Checkpoints", s.checkpoints);
    row(box, "mt-pending", "Pending Action", s.pending ? s.pending.type : "—");
    if (s.pending) {
      row(box, "mt-required", "Required", s.pending.required.join(", ") || "—");
      row(box, "mt-received", "Received", s.pending.received.join(", ") || "（无）");
      if (s.pending.choices.length) row(box, "mt-choices", "Choices", s.pending.choices.join(" / "));
    }
    if (s.error) row(box, "mt-error", "Error", s.error);
    return box;
  }

  function gateBtn(id, label, gate, choice, state) {
    var off = !gate.enabled || gate.choices.indexOf(choice) < 0;
    return btn(id, label, true, off, function () { A.MeetingActions.decide(state, choice); });
  }

  function controls(state, s, gate) {
    var bar = Dom.el("div", "controls");
    var canStep = !!(s && s.pending && s.pending.type === A.MeetingAction.ACTION.COLLECT_RESPONSES);
    bar.appendChild(btn("mt-create", "Create Demo Meeting", false, !state.registry, A.MeetingActions.create));
    bar.appendChild(btn("mt-step", "执行下一步 Mock", false, !canStep, function () { A.MeetingActions.step(state); }));
    bar.appendChild(gateBtn("mt-finish", "Finish", gate, "finish", state));
    bar.appendChild(gateBtn("mt-continue", "Continue", gate, "continue", state));
    bar.appendChild(gateBtn("mt-battle", "Battle", gate, "battle", state));
    bar.appendChild(btn("mt-save", "Save Meeting JSON", true, !state.meeting, function () { A.MeetingActions.save(state); }));
    bar.appendChild(btn("mt-load", "Load Meeting JSON", true, !state.registry, function () { A.MeetingActions.load(state); }));
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
      "「执行下一步 Mock」每次只消费当前 Pending Action 的一个步骤（一个参与者一次响应），绝不自动越过 Human Gate。"));
  }

  A.MeetingRuntimeView = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
