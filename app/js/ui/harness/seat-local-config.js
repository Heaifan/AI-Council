/* AI Council v0.1 — D3 · 六席会议控制台 · SeatLocalConfig：席位本地 UI 配置状态（无 DOM）。
 * 设计边界（用户方案 §九/§十）：立场（stance）与备注（note）是席位级本地配置，
 * 不污染 Participant Schema；创建后仍可修改。中央大屏模式与当前选中席位也在此。
 * F1：经 LocalStore 持久化（刷新后立场/备注/选中席位保持）。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var K = "seat-local";
  var mode = "seat";           /* run | seat | meeting */
  var selectedSeatId = "A1";   /* 当前选中席位（seat_id） */
  var stanceOverrides = {};    /* participant_id -> support|oppose|neutral */
  var notes = {};              /* participant_id -> 备注文本 */
  var runtimeConfig = {};      /* participant_id -> {model_ref, transport_kind}（F2-F1 席位运行配置持久化） */

  function go() { A.HarnessStore.notify(); }

  function save() { A.LocalStore.set(K, { mode: mode, selectedSeatId: selectedSeatId, stanceOverrides: stanceOverrides, notes: notes, runtimeConfig: runtimeConfig }); }

  function load() {
    var d = A.LocalStore.get(K);
    if (!d) return;
    if (d.mode === "run" || d.mode === "seat" || d.mode === "meeting") mode = d.mode;
    if (d.selectedSeatId) selectedSeatId = d.selectedSeatId;
    stanceOverrides = d.stanceOverrides || {};
    notes = d.notes || {};
    runtimeConfig = d.runtimeConfig || {};
  }

  function getRuntimeConfig(participantId) { return runtimeConfig[participantId] || null; }

  function setRuntimeConfig(participantId, modelRef, transportKind) {
    runtimeConfig[participantId] = { model_ref: modelRef, transport_kind: transportKind }; save(); go();
  }

  function getMode() { return mode; }
  function getSelectedSeatId() { return selectedSeatId; }
  function getStanceOverrides() { return stanceOverrides; }
  function getNotes() { return notes; }

  function setMode(m) {
    if (m === "run" || m === "seat" || m === "meeting") { mode = m; save(); go(); }
  }
  function setSelectedSeat(seatId) {
    if (A.SeatLayout.seatDef(seatId)) { selectedSeatId = seatId; mode = "seat"; save(); go(); }
  }
  /* F1（T11）：纯浏览——只改查看对象，不切配置模式（调度器不受影响）。 */
  function selectOnly(seatId) {
    if (A.SeatLayout.seatDef(seatId)) { selectedSeatId = seatId; save(); go(); }
  }
  function setStance(participantId, stance) {
    stanceOverrides[participantId] = stance; save(); go();
  }
  function setNote(participantId, text) {
    notes[participantId] = text; save(); go();
  }
  function reset() {
    /* 只重置内存默认值，不清 LocalStore：刷新/重选目录后配置仍保持（F1 T06 持久化验收）。 */
    mode = "seat"; selectedSeatId = "A1"; stanceOverrides = {}; notes = {};
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatLocalConfig = Object.freeze({
    getMode: getMode, getSelectedSeatId: getSelectedSeatId,
    getStanceOverrides: getStanceOverrides, getNotes: getNotes,
    getRuntimeConfig: getRuntimeConfig, setRuntimeConfig: setRuntimeConfig,
    setMode: setMode, setSelectedSeat: setSelectedSeat, selectOnly: selectOnly,
    setStance: setStance, setNote: setNote, load: load, reset: reset
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
