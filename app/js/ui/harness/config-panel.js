/* AI Council v0.1 — D3 · 六席会议控制台 · ConfigPanel：中央「会议配置」卡（DOM 投影）。
 * F2：会前/运行分离——无会议 = 可编辑表单 + 创建按钮；有会议 = 一行摘要 + 表单隐藏
 * （cfg-* 契约 DOM 保留 disabled，C10/S10 isDisabled 可查；创建按钮保留可见，C15 契约）。
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

  /* 表单字段（会前可编辑 / 运行态 disabled 但 DOM 常驻）。 */
  function buildForm(grid, draft, state, actions, frozen) {
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
  }

  function createButton(actions, state, frozen) {
    var create = Dom.el("button", "btn primary", "创建会议");
    create.id = "cfg-create";
    create.disabled = frozen || !state.registry;
    create.addEventListener("click", function () {
      var r = actions.createMeeting();
      if (!r.ok) A.WebRelayActions.say(r.message || "创建失败。", "bad");
      A.HarnessStore.notify();
    });
    return create;
  }

  function render(host, state) {
    if (!host) return;
    var actions = A.ConsoleActions;
    var draft = actions.getDraft();
    var frozen = actions.isFrozen();

    var box = Dom.el("div", "card config-card");
    box.id = "console-config";
    box.appendChild(Dom.el("h2", null, "会议配置"));

    var grid = Dom.el("div", "cfg-grid");
    buildForm(grid, draft, state, actions, frozen);
    if (frozen) {
      /* 运行态：一行摘要（表单隐藏但 DOM 保留）；中央空间交还会议内容（F2 T03）。 */
      var m = state.meeting;
      grid.style.display = "none";
      var sum = Dom.el("div", "config-summary");
      var nm = Dom.el("span", "cs-name", m ? (m.title || "—") : "—");
      nm.id = "config-summary-title";
      sum.appendChild(nm);
      var tp = Dom.el("span", "cs-topic", m && m.topic ? m.topic : "");
      tp.id = "config-summary-topic";
      sum.appendChild(tp);
      box.appendChild(sum);
    } else {
      var row = Dom.el("div", "controls span2");
      row.appendChild(createButton(actions, state, false));
      grid.appendChild(row);
    }
    box.appendChild(grid);
    if (frozen) box.appendChild(createButton(actions, state, true));
    host.appendChild(box);
  }

  A.ConfigPanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
