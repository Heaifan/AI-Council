/* AI Council v0.1 — D3 · 会议控制台 · TimelinePanel：底部「会议时间线 / 审计日志」折叠区。
 * 只读投影 meeting.events 尾部 20 条；开发详情（Event Type / request_id / participant_id）随折叠展开。
 * 与右栏状态卡分离：时间线不再散落，统一沉底。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;

  function line(box, ev) {
    var l = Dom.el("div", "tl-line");
    l.appendChild(Dom.el("span", "tl-time", String(ev.occurred_at || "").slice(11, 19) || "—"));
    l.appendChild(Dom.el("span", "tl-type", ev.event_type));
    if (ev.payload && ev.payload.participant_id) l.appendChild(Dom.el("span", "tl-pid", ev.payload.participant_id));
    box.appendChild(l);
  }

  function render(host, meeting) {
    if (!host) return;
    Dom.clear(host);
    var box = Dom.el("div", "card timeline");
    var details = document.createElement("details");
    var sum = Dom.el("summary", null, "会议时间线 / 审计日志");
    sum.id = "tl-toggle";
    details.appendChild(sum);
    var list = Dom.el("div", "tl-list");
    var events = (meeting && meeting.events) || [];
    if (!events.length) {
      list.appendChild(Dom.el("p", "empty", "（暂无事件）"));
    } else {
      events.slice(-20).forEach(function (ev) { line(list, ev); });
    }
    details.appendChild(list);
    box.appendChild(details);
    host.appendChild(box);
  }

  A.TimelinePanel = Object.freeze({ render: render });
})(typeof globalThis !== "undefined" ? globalThis : this);
