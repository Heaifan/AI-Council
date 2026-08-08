/* AI Council v0.1 — D3 · WEB_RELAY · WebRelayView：人工网页中继面板渲染（只读投影，按钮行为全在 WebRelayActions）。
 * 四道闸门：①选中提示词 →②粘贴外部 AI 回答 →③校验 V01–V05 →④人工接受为正式发言。
 * 界面文案一律中文；内部机器状态另起一行小字显示，供开发调试。 */
(function (root) {
  "use strict";
  var A = root.AICouncil, Dom = A.Dom;
  function btn(id, label, secondary, disabled, onClick) {
    var b = Dom.el("button", "btn" + (secondary ? " secondary" : ""), label);
    b.id = id; b.disabled = !!disabled; if (!disabled) b.addEventListener("click", onClick); return b;
  }
  function row(box, id, label, value) { var f = Dom.field(label, value); f.lastChild.id = id; box.appendChild(f); }
  function tag(box, id, cls, text) { var n = Dom.el("p", cls, text); n.id = id; box.appendChild(n); return n; }

  function whoCard(state, req) {
    var box = Dom.el("div", "card");
    var opts = A.ParticipantBinding.options(state.meeting, state.roleRegistry, state.protocol);
    var cur = opts.filter(function (o) { return o.participant_id === req.participant_id; })[0];
    row(box, "relay-participant", "当前委员", cur ? cur.label : req.participant_id);
    row(box, "relay-role", "角色", (cur && cur.role_name) || "（未命中角色卡）");
    row(box, "relay-model", "模型引用", req.model_ref || "（未指定）");
    row(box, "relay-transport", "传输方式", A.UIText.transport(req.transport_kind));
    return box;
  }

  function idle(host, state) {
    if (!state.meeting) { tag(host, "relay-empty", "empty", "当前没有会议。请先在「会议」页创建网页中继会议。"); return; }
    var pid = A.RelayFlow.nextRelay(state.meeting);
    if (!pid) { tag(host, "relay-empty", "empty", "本阶段没有需要网页中继的委员。模拟 Agent 请用「执行下一步（模拟）」推进。"); return; }
    tag(host, "relay-hint", "note", "委员 " + pid + " 走网页中继：系统只搬运提示词与回答，绝不自动相信外部 AI。");
    host.appendChild(btn("relay-open", "生成提示词（" + pid + "）", false, false, function () { A.WebRelayActions.openRelay(); }));
  }

  /* 零权限：不调用 Clipboard API，按钮只做 focus+select，语义与真实行为一致。 */
  function promptCard(req) {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h3", null, "待发送提示词"));
    var ta = Dom.el("textarea", "relay-prompt");
    ta.id = "relay-prompt"; ta.readOnly = true; ta.rows = 10; ta.value = req.rendered_prompt || "";
    box.appendChild(ta);
    box.appendChild(btn("relay-select", "选中全部提示词", true, false, function () {
      ta.focus(); ta.select();
      A.WebRelayActions.say("提示词已全部选中，请按 Ctrl+C 复制。", "ok"); A.HarnessStore.notify();
    }));
    return box;
  }

  function responseCard() {
    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h3", null, "外部 AI 回答"));
    var pa = Dom.el("textarea", "relay-paste");
    pa.id = "relay-paste"; pa.rows = 8; pa.placeholder = "请把 ChatGPT / Claude / Gemini 的回答粘贴到这里……";
    box.appendChild(pa);
    box.appendChild(btn("relay-submit", "提交回答", false, false, function () { A.WebRelayActions.paste(pa.value); A.WebRelayActions.validate(); }));
    return box;
  }

  function checkList(box, check) {
    if (!check || !check.checks) return; var ul = Dom.el("ul", "checks");
    check.checks.forEach(function (c) { ul.appendChild(Dom.el("li", c.ok ? "ok" : "bad", c.id + (c.ok ? " ✅" : " ❌"))); }); box.appendChild(ul);
  }

  function verdictCard(active, check) {
    var box = Dom.el("div", "card");
    row(box, "relay-validation", "校验状态", check ? (check.ok ? "通过" : "未通过") : "尚未校验");
    row(box, "relay-state", "当前状态", A.UIText.relayState(active.state));
    tag(box, "relay-state-raw", "note", "内部状态：" + active.state);
    checkList(box, check);
    tag(box, "relay-not-official", "status warn", "注意：此回答尚未写入正式会议记录。");
    var bar = Dom.el("div", "controls");
    bar.appendChild(btn("relay-accept", "接受为正式发言", false, !(check && check.ok), function () { A.WebRelayActions.accept(); }));
    bar.appendChild(btn("relay-reject", "拒绝回答", true, !check, function () { A.WebRelayActions.reject(); }));
    bar.appendChild(btn("relay-retry", "重新请求", true, active.state !== "rejected" && active.state !== "failed", function () { A.WebRelayActions.retry(); }));
    bar.appendChild(btn("relay-cancel", "取消本次请求", true, false, function () { A.WebRelayActions.cancel(); }));
    box.appendChild(bar); return box;
  }

  function render(host, state) {
    if (!host) return; Dom.clear(host); state = state || {};
    host.appendChild(Dom.el("h2", null, "网页中继 · 人工模式"));
    var n = A.WebRelayActions.getNotice();
    if (n) tag(host, "relay-msg", "status " + n.kind, n.text);
    var active = state.meeting ? A.WebRelayActions.activeSession(state.meeting) : null;
    if (!active) { idle(host, state); return; }
    var req = active.request || {};
    host.appendChild(whoCard(state, req));
    host.appendChild(promptCard(req));
    host.appendChild(responseCard());
    host.appendChild(verdictCard(active, A.WebRelayActions.getCheck()));
  }

  A.WebRelayView = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
