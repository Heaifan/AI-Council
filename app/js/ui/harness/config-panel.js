/* AI Council v0.1 — D3 · 六席会议控制台 · ConfigPanel：中央大屏「会议配置」卡（DOM 投影）。
 * 无会议：会议名称 / 议题 / 议事规则（可编辑）+ 创建会议（Primary）。
 * 有会议：冻结摘要（只读）+ 创建按钮 disabled（保留文本与 id，Browser 契约 cfg-* 不回归）。
 * 与会者/席位配置已移至 SeatConfigPanel；开发工具移至 DevToolsPanel。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function fieldRow(box, id, label, control, span2) {
    var f = Dom.el("div", "cfg-field" + (span2 ? " span2" : ""));
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
    var actions = A.ConsoleActions;
    var draft = actions.getDraft();
    var frozen = actions.isFrozen();

    var box = Dom.el("div", "card config-card");
    box.id = "console-config";
    box.appendChild(Dom.el("h2", null, "会议配置"));
    if (frozen) box.appendChild(Dom.el("p", "note", "会议配置已冻结：如需修改议题或委员配置，请结束当前会议后新建。"));

    var grid = Dom.el("div", "cfg-grid");
    var title = document.createElement("input");
    title.type = "text"; title.value = draft.title || ""; title.placeholder = "例如：玄域引擎战略评审";
    fieldRow(grid, "cfg-title", "会议名称", title);
    var proto = protocolSelect(state.registry, draft.protocolId);
    fieldRow(grid, "cfg-protocol", "议事规则", proto);
    var topic = document.createElement("textarea");
    topic.value = draft.topic || ""; topic.rows = 2;
    topic.placeholder = "请输入本次会议的议题……";
    fieldRow(grid, "cfg-topic", "议题", topic, true);
    title.disabled = topic.disabled = proto.disabled = frozen;
    title.addEventListener("change", function () { actions.setField("title", title.value); });
    topic.addEventListener("change", function () { actions.setField("topic", topic.value); });
    proto.addEventListener("change", function () { actions.setField("protocolId", proto.value); });

    var create = Dom.el("button", "btn primary", "创建会议");
    create.id = "cfg-create";
    create.disabled = frozen || !state.registry;
    create.addEventListener("click", function () {
      var r = actions.createMeeting();
      if (!r.ok) A.WebRelayActions.say(r.message || "创建失败。", "bad");
      A.HarnessStore.notify();
    });
    var row = Dom.el("div", "controls span2");
    row.appendChild(create);
    grid.appendChild(row);
    box.appendChild(grid);
    host.appendChild(box);
  }

  A.ConfigPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
