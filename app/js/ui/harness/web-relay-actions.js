/* AI Council v0.1 — D3 · WEB_RELAY · WebRelayActions：人工网页中继面板的点击行为（不渲染 DOM，只调用流程层）。
 * 与 WebRelayView 分离：视图只管画，本文件只管做。当前会话 handle / 最近一次校验结果 / 提示文字存于模块内（不污染 Store）。
 * 失败一律翻成「中文解释 + 内部错误代码」，禁止 alert，禁止静默失败。 */
(function (root) {
  "use strict";
  var A = root.AICouncil;
  var C = A.Diagnostic.CODE;
  var handle = null, lastCheck = null, notice = null;
  function s() { return A.HarnessStore.get(); }
  function go() { A.HarnessStore.notify(); }
  function nonTerminal(st) { return st !== "accepted" && st !== "cancelled" && st !== "rejected" && st !== "failed"; }

  /* 仍在进行中的那一次中继会话（终态不算）。顶部状态行与面板共用同一判定，避免两处各说各话。 */
  function activeSession(meeting) {
    if (!meeting || !A.RelayFlow) return null;
    var list = A.RelayFlow.sessions(meeting) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && nonTerminal(list[i].state)) return list[i];
    return null;
  }

  function say(text, kind) { notice = text ? { text: text, kind: kind || "info" } : null; }
  function fail(r) {
    var d = r && r.diagnostics && r.diagnostics[0];
    if (d && d.code) { var e = A.UIText.error(d.code); say(e.text + "（错误代码：" + e.code + "）", "bad"); return; }
    say((r && r.message) || "操作未成功。", "bad");
  }

  function openRelay() {
    var st = s(); if (!st.meeting) { say("当前没有会议，无法发起网页中继。", "warn"); go(); return; }
    var r = A.RelayFlow.open(st.meeting, st.protocol, { registry: st.roleRegistry, packetSchema: st.packetSchema });
    if (r.ok) { handle = r.handle; lastCheck = null; say("已生成提示词，请复制给外部 AI。", "ok"); }
    else { handle = null; fail(r); }
    go(); return r;
  }
  function paste(raw) {
    var st = s(); if (!st.meeting || !handle) return;
    var r = A.RelayFlow.receive(st.meeting, handle, raw || "");
    if (!r.ok) fail(r);
    go();
  }
  function validate() {
    var st = s(); if (!st.meeting || !handle) return;
    lastCheck = A.RelayFlow.validate(st.meeting, handle);
    if (lastCheck.ok) say("校验通过。此回答尚未写入正式会议记录，需人工接受。", "ok");
    else fail(lastCheck);
    go();
  }
  function accept() {
    var st = s(); if (!st.meeting || !handle) return;
    var r = A.RelayFlow.accept(st.meeting, st.protocol, handle);
    if (r.ok) {
      handle = null; lastCheck = null; say("已接受为正式发言并写入会议记录。", "ok");
      autoOpenNext(st);   /* T09：接受后自动轮转到下一 web_relay 席位的工作区 */
      A.ConsoleActions.followActiveSpeaker();   /* F4：selectedSeat 同步到新发言人（含 mock 席位） */
    }
    else { lastCheck = null; fail(r); }
    go(); return r;
  }
  function autoOpenNext(st) {   /* T09：下一席 web_relay → 自动打开工作区 */
    var TS = A.MeetingTurnSelector;
    var next = TS ? TS.nextSpeaker(st.meeting) : null;
    if (!next || activeSession(st.meeting)) return;
    var p = st.meeting.participants.filter(function (x) { return x.participant_id === next; })[0];
    if (p && (p.transport_kind || "mock") === "web_relay") {
      var r = A.RelayFlow.open(st.meeting, st.protocol, { registry: st.roleRegistry, packetSchema: st.packetSchema });
      if (r.ok) handle = r.handle;
    }
  }
  function reject(code, msg) {
    var st = s(); if (!st.meeting || !handle) return;
    A.RelayFlow.reject(st.meeting, handle, code || C.INVALID_RESPONSE, msg || "人工拒绝该回答。");
    handle = null; lastCheck = null; say("已拒绝该回答，未写入会议记录。", "warn"); go();
  }
  function retry() {
    var st = s(); if (!st.meeting || !handle) return;
    A.RelayFlow.retry(st.meeting, handle); lastCheck = null; say("已重新请求，请再次复制提示词。", "info"); go();
  }
  function cancel() {
    var st = s(); if (!st.meeting || !handle) return;
    A.RelayFlow.cancel(st.meeting, handle); handle = null; lastCheck = null;
    say("已取消本次请求。会议本身不受影响。", "warn"); go();
  }
  function getHandle() { return handle; }
  function getCheck() { return lastCheck; }
  function getNotice() { return notice; }

  A.WebRelayActions = Object.freeze({
    autoOpenNext: autoOpenNext,
    openRelay: openRelay, paste: paste, validate: validate, accept: accept,
    reject: reject, retry: retry, cancel: cancel,
    getHandle: getHandle, getCheck: getCheck, getNotice: getNotice, say: say, activeSession: activeSession
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
