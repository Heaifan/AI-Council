/* AI Council v0.1 — D3 · 六席会议控制台 · SeatLocalConfig：席位本地 UI 配置状态（无 DOM）。
 * 设计边界（用户方案 §九/§十）：立场（stance）与备注（note）是席位级本地配置，
 * 不污染 Participant Schema；创建后仍可修改。中央大屏模式与当前选中席位也在此。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var mode = "seat";           /* run | seat | meeting */
  var selectedSeatId = "A1";   /* 当前选中席位（seat_id） */
  var stanceOverrides = {};    /* participant_id -> support|oppose|neutral */
  var notes = {};              /* participant_id -> 备注文本 */

  function go() { A.HarnessStore.notify(); }

  function getMode() { return mode; }
  function getSelectedSeatId() { return selectedSeatId; }
  function getStanceOverrides() { return stanceOverrides; }
  function getNotes() { return notes; }

  function setMode(m) {
    if (m === "run" || m === "seat" || m === "meeting") { mode = m; go(); }
  }
  function setSelectedSeat(seatId) {
    if (A.SeatLayout.seatDef(seatId)) { selectedSeatId = seatId; mode = "seat"; go(); }
  }
  function setStance(participantId, stance) {
    stanceOverrides[participantId] = stance; go();
  }
  function setNote(participantId, text) {
    notes[participantId] = text; go();
  }
  function reset() {
    mode = "seat"; selectedSeatId = "A1"; stanceOverrides = {}; notes = {};
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatLocalConfig = Object.freeze({
    getMode: getMode, getSelectedSeatId: getSelectedSeatId,
    getStanceOverrides: getStanceOverrides, getNotes: getNotes,
    setMode: setMode, setSelectedSeat: setSelectedSeat,
    setStance: setStance, setNote: setNote, reset: reset
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
