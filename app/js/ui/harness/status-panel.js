/* AI Council v0.1 — D3 · 会议控制台 · StatusPanel：右栏「会议状态」（DOM 投影，语义来自 MeetingStepFlow.summary）。
 * 普通用户看中文，机器值小字单列；「查看完整运行状态」折叠区放开发详情。
 * 保留 D2/D3 Browser 契约 id：mt-status-raw / mt-phase / mt-received / mt-msg 等。
 * 时间线已独立为 TimelinePanel（底部折叠区）。
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

  function gateBtn(box, id, label, gate, choice, state) {
    var off = !gate.enabled || gate.choices.indexOf(choice) < 0;
    var b = Dom.el("button", "btn secondary", label);
    b.id = id; b.disabled = off;
    if (!off) b.addEventListener("click", function () { A.MeetingActions.decide(state, choice); });
    box.appendChild(b);
  }

  function fullState(s) {
    var details = document.createElement("details");
    details.className = "full-state";
    details.appendChild(Dom.el("summary", null, "查看完整运行状态"));
    var pre = document.createElement("pre");
    pre.textContent = JSON.stringify(s, null, 2);
    details.appendChild(pre);
    return details;
  }

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var s = A.MeetingStepFlow.summary(state.meeting);
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "会议状态"));
    if (!s) {
      var e = Dom.el("p", "empty", "当前没有正在进行的会议。");
      e.id = "mt-empty";
      box.appendChild(e);
      host.appendChild(box);
      return;
    }
    row(box, "mt-status", "状态", A.UIText.meetingStatus(s.status));
    row(box, "mt-status-raw", "内部状态", s.status);
    row(box, "mt-phase", "当前阶段", s.currentPhaseId || "—");
    row(box, "mt-id", "会议编号", s.meetingId);
    row(box, "mt-protocol", "议事规则", s.protocol);
    if (s.pending) {
      row(box, "mt-required", "本轮应发言", s.pending.required.join(", ") || "—");
      row(box, "mt-received", "已收到发言", s.pending.received.join(", ") || "（无）");
    }
    row(box, "mt-events", "事件数", s.events);
    row(box, "mt-cp", "检查点数", s.checkpoints);
    var gate = A.MeetingStepFlow.humanGateState(state.meeting);
    var bar = Dom.el("div", "controls");
    var step = Dom.el("button", "btn secondary", "执行下一步（模拟）");
    step.id = "mt-step";
    var canStep = !!(s.pending && s.pending.type === A.MeetingAction.ACTION.COLLECT_RESPONSES);
    step.disabled = !canStep;
    if (canStep) step.addEventListener("click", function () { A.MeetingActions.step(state); });
    bar.appendChild(step);
    gateBtn(bar, "mt-finish", "结束会议", gate, "finish", state);
    gateBtn(bar, "mt-continue", "继续会议", gate, "continue", state);
    gateBtn(bar, "mt-battle", "进入对辩", gate, "battle", state);
    var save = Dom.el("button", "btn secondary", "保存会议 JSON");
    save.id = "mt-save"; save.disabled = !state.meeting;
    save.addEventListener("click", function () { A.MeetingActions.save(state); });
    bar.appendChild(save);
    var load = Dom.el("button", "btn secondary", "加载会议 JSON");
    load.id = "mt-load"; load.disabled = !state.registry;
    load.addEventListener("click", function () { A.MeetingActions.load(state); });
    bar.appendChild(load);
    box.appendChild(bar);
    host.appendChild(box);
    var m = A.MeetingActions.message();
    var note = Dom.el("div", "status " + m.kind, m.text);
    note.id = "mt-msg";
    host.appendChild(note);
    host.appendChild(fullState(s));
  }

  A.StatusPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
