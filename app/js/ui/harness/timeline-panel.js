/* AI Council v0.1 — MEETING-REPLAY-F1 · TimelinePanel：常驻底部会议时间轴（方案 T05）。
 * 常驻条：[◀ 上一步] — Round/Step 节点（横向滚动）— [下一步 ▶] [回到当前]
 * 展开：节点详情（当前查看位置 + 事件日志）。
 * 回放只改 cursor（ReplayCursor），不碰 Runtime（T01）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function btn(id, label, cls, disabled, onClick) {
    var b = Dom.el("button", "btn timeline-btn" + (cls ? " " + cls : ""), label);
    b.id = id; b.disabled = !!disabled;
    if (!disabled) b.addEventListener("click", onClick);
    return b;
  }

  function nodeDot(node, cur, latest) {
    var state = node.sequence < cur ? "past" : (node.sequence === cur ? "current" : "future");
    var d = Dom.el("span", "tl-node " + state, "●");
    d.title = node.label + (node.event_cursor > 0 ? "（事件 " + node.event_cursor + "）" : "");
    d.setAttribute("data-seq", node.sequence);
    return d;
  }

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    var ds = A.ReplayProvider.get(state);
    var nodes = ds.timeline || [];
    var cur = ds.cursor;
    var latest = ds.latest;
    /* 偏差 A 修正：显示「最后已重放」的节点（nodes[cur-1]），而非「下一个」节点（nodes[cur]）。 */
    var curNode = nodes[cur - 1] || nodes[nodes.length - 1] || null;

    var strip = Dom.el("div", "timeline-strip");
    var prevB = btn("tl-prev", "◀ 上一步", "secondary", cur <= 0 || !ds.meeting, function () { A.ReplayCursor.prev(state.meeting); });
    strip.appendChild(prevB);

    var track = Dom.el("div", "timeline-track");
    track.id = "timeline-track";
    (nodes || []).forEach(function (n) { track.appendChild(nodeDot(n, cur, latest)); });
    var label = Dom.el("span", "tl-current-label", curNode ? ("R" + curNode.round + " · " + curNode.label) : "");
    label.id = "tl-current-label";
    track.appendChild(label);
    strip.appendChild(track);

    var nextB = btn("tl-next", "下一步 ▶", "secondary", !ds.meeting || cur >= latest, function () { A.ReplayCursor.next(state.meeting); });
    strip.appendChild(nextB);
    var backB = btn("tl-back", "回到当前", "secondary", !ds.isReplay, function () { A.ReplayCursor.toLatest(state.meeting); });
    strip.appendChild(backB);
    host.appendChild(strip);

    /* 展开区：当前节点详情 + 事件日志（只读） */
    var details = Dom.el("details", "timeline-details");
    details.appendChild(Dom.el("summary", null, "会议时间线 / 审计日志"));
    var body = Dom.el("div", "timeline-body");
    if (curNode) {
      var info = Dom.el("p", "note", "当前查看：R" + curNode.round + " · " + curNode.label +
        (curNode.event_cursor ? "（事件游标 " + curNode.event_cursor + " / " + latest + "）" : "（尚未开始）") +
        (ds.isReplay ? " ⏱ 历史回放中" : " · 当前最新"));
      info.id = "tl-node-info";
      body.appendChild(info);
    }
    if (ds.meeting && ds.meeting.events) {
      ds.meeting.events.forEach(function (ev) {
        var line = Dom.el("div", "tl-line", (ev.occurred_at || "").slice(11, 19) + " · " + ev.event_type +
          (ev.actor_id ? " · " + ev.actor_id : "") + (ev.payload && ev.payload.choice ? " · " + ev.payload.choice : ""));
        body.appendChild(line);
      });
    }
    details.appendChild(body);
    host.appendChild(details);
  }

  A.TimelinePanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
