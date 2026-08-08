/* AI Council v0.1 — D3 · 会议控制台 · ConfigPanel：左栏「会议配置」总装（DOM 投影）。
 * 创建前：会议名称 / 议题 / 议事规则 → 与会者配置卡 → 创建会议（Primary）。
 * 创建后：核心配置冻结只读 +「会议配置已冻结」提示。
 * 开发工具（Demo 装载 / 清空会议）为独立折叠区，退出主流程。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function fieldRow(box, id, label, control) {
    var f = Dom.el("div", "cfg-field");
    f.appendChild(Dom.el("label", "cfg-label", label));
    control.id = id;
    f.appendChild(control);
    box.appendChild(f);
  }

  function protocolSelect(registry, current) {
    var sel = document.createElement("select");
    var avail = (registry && registry.available) || [];
    avail.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.protocolId; o.textContent = p.name + "（" + p.protocolId + "）";
      sel.appendChild(o);
    });
    sel.value = current || (avail[0] ? avail[0].protocolId : "");
    return sel;
  }

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var actions = A.ConsoleActions;
    var draft = actions.getDraft();
    var frozen = actions.isFrozen();

    var box = Dom.el("div", "card");
    box.appendChild(Dom.el("h2", null, "会议配置"));
    if (frozen) box.appendChild(Dom.el("p", "note", "会议配置已冻结：如需修改议题或委员配置，请结束当前会议后新建。"));
    var title = document.createElement("input");
    title.type = "text"; title.value = draft.title || ""; title.placeholder = "例如：玄域引擎战略评审";
    fieldRow(box, "cfg-title", "会议名称", title);
    var topic = document.createElement("textarea");
    topic.value = draft.topic || ""; topic.rows = 4;
    topic.placeholder = "请输入本次会议的议题……";
    fieldRow(box, "cfg-topic", "议题", topic);
    var proto = protocolSelect(state.registry, draft.protocolId);
    fieldRow(box, "cfg-protocol", "议事规则", proto);
    title.disabled = topic.disabled = proto.disabled = frozen;
    title.addEventListener("change", function () { actions.setField("title", title.value); });
    topic.addEventListener("change", function () { actions.setField("topic", topic.value); });
    proto.addEventListener("change", function () { actions.setField("protocolId", proto.value); });
    host.appendChild(box);

    var who = Dom.el("div", "card");
    who.appendChild(Dom.el("h2", null, "与会者配置"));
    var profiles = actions.getProfiles();
    draft.participants.forEach(function (pt) {
      var profile = A.RelayProfiles.findByModelRef(profiles, pt.model_ref);
      who.appendChild(A.ConfigParticipant.render(pt, profile, frozen, actions));
    });
    host.appendChild(who);

    var bar = Dom.el("div", "controls");
    var create = Dom.el("button", "btn primary", "创建会议");
    create.id = "cfg-create";
    create.disabled = frozen || !state.registry;
    create.addEventListener("click", function () {
      var r = actions.createMeeting();
      if (!r.ok) A.WebRelayActions.say(r.message || "创建失败。", "bad");
      A.HarnessStore.notify();
    });
    bar.appendChild(create);
    host.appendChild(bar);
    A.DevToolsPanel.render(host, !!state.registry, !!state.meeting);
  }

  A.ConfigPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
