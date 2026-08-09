/* AI Council v0.1 — F2 · MeetingHud：会议运行头（DOM 投影 + 局部时钟）。
 * 用户 MEETING-UX-F2 §T01/§T05：标题/议题/round/phase/计时器/状态固定顶部（≤68px）；
 * 计时器 1s 只更新 #meeting-timer 文本，绝不触发全量 render。
 * 本文件是 TEST-10 唯一 setInterval 白名单（本地 UI 时钟，非网络轮询；见 session 测试注释）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var Dom = A.Dom;
  var timerStartedAt = 0;
  var lastShownSec = -1;

  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
  }

  /* Round = 当前相位在协议 phases 中的序号；phase = 相位中文名。 */
  function roundInfo(vs) {
    var m = vs.meeting;
    if (!m) return { round: "Round —", phase: "—" };
    var phases = [];
    var avail = (vs.registry && vs.registry.available) || [];
    for (var i = 0; i < avail.length; i++) {
      if (avail[i].protocolId === m.protocolId) {
        phases = (avail[i].document && avail[i].document.phases) || [];
        break;
      }
    }
    for (var j = 0; j < phases.length; j++) {
      if (phases[j].phase_id === m.currentPhaseId) {
        return { round: "Round " + (j + 1) + " / " + phases.length, phase: phases[j].name || m.currentPhaseId };
      }
    }
    return { round: "Round —", phase: m.currentPhaseId || "—" };
  }

  /* 局部时钟：只改 timer 文本；会议不存在时归零。 */
  function tick() {
    var el = document.getElementById("meeting-timer");
    if (!el) return;
    var sec = timerStartedAt ? Math.floor((Date.now() - timerStartedAt) / 1000) : 0;
    if (sec !== lastShownSec) { el.textContent = fmt(sec * 1000); lastShownSec = sec; }
  }
  setInterval(tick, 1000);   /* TEST-10 白名单文件（唯一） */

  function render(host, state) {
    if (!host) return;
    Dom.clear(host);
    /* T04：HUD 统一消费 displayState（回放时显示历史 phase/status）。 */
    var ds = A.ReplayProvider.get(state);
    var vs = ds.isReplay ? Object.assign({}, state, { meeting: ds.meeting }) : state;
    var m = vs.meeting;
    var r = roundInfo(vs);

    var main = Dom.el("div", "hud-main");
    var title = Dom.el("span", "hud-title", m ? (m.title || "（未命名会议）") : "尚未创建会议");
    title.id = "hud-title"; title.title = m ? (m.title || "") : "";
    main.appendChild(title);
    var topic = Dom.el("span", "hud-topic", m && m.topic ? m.topic : "");
    topic.id = "hud-topic"; topic.title = m && m.topic ? m.topic : "";
    main.appendChild(topic);
    main.appendChild(Dom.el("span", "hud-gap"));
    var caps = Dom.el("div");
    caps.id = "capabilities";   /* 系统状态折叠容器（renderCapabilities 填充） */
    main.appendChild(caps);
    host.appendChild(main);

    var sub = Dom.el("div", "hud-sub");
    var round = Dom.el("span", "hud-round", r.round);
    round.id = "hud-round"; sub.appendChild(round);
    var phase = Dom.el("span", "hud-phase", r.phase);
    phase.id = "hud-phase"; sub.appendChild(phase);
    var timer = Dom.el("span", "hud-timer", "00:00:00");
    timer.id = "meeting-timer"; sub.appendChild(timer);
    var st = Dom.el("span", "hud-status" + (m ? " live" : ""),
      m ? ("● " + A.UIText.meetingStatus(m.status)) : "未开始");
    st.id = "hud-status"; sub.appendChild(st);
    var rs = Dom.el("span", "hud-rs");
    rs.id = "runtime-status"; sub.appendChild(rs);   /* 契约 id：B03 读 innerText */
    host.appendChild(sub);

    /* timer 起点 = 会议首个事件；清空/切换会议时重置。 */
    var start = 0;
    if (m && m.events && m.events.length) start = Date.parse(m.events[0].occurred_at) || 0;
    if (!start && m) start = Date.now();
    if (start !== timerStartedAt) { timerStartedAt = start; lastShownSec = -1; }
    tick();
  }

  A.MeetingHud = Object.freeze({ render: render, tick: tick });
})(typeof globalThis !== "undefined" ? globalThis : this);
