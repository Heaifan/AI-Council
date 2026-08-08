/* AI Council v0.1 — D3 · 六席会议控制台 · SeatLayout：六席映射纯逻辑（无 DOM，Node 可测）。
 * 设计边界（用户方案 §三/§四/§九）：
 *  - 六席 = 会议室外壳：左 A1..A3（支持侧）、右 B1..B3（质疑侧）；seat_id 与 participant_id 是两套标识，映射稳定。
 *  - 立场（stance）是席位级本地配置（支持/反对/中立），不污染 Participant Schema；
 *    默认按 side_id 派生（A→支持、B→反对、无→中立），可被用户覆盖。
 *  - 底层仍跑 D3 单席位能力：六席只做展示与配置壳，不做并发调度。
 */
(function (root) {
  "use strict";

  /* 六席固定顺序：左 A1..A3，右 B1..B3。side_id 映射立场默认值。 */
  var SEATS = [
    { seat_id: "A1", side: "A", stance: "support" },
    { seat_id: "A2", side: "A", stance: "support" },
    { seat_id: "A3", side: "A", stance: "support" },
    { seat_id: "B1", side: "B", stance: "oppose" },
    { seat_id: "B2", side: "B", stance: "oppose" },
    { seat_id: "B3", side: "B", stance: "oppose" }
  ];

  var STANCE_TEXT = { support: "支持", oppose: "反对", neutral: "中立" };

  function defaultStanceFor(side) {
    if (side === "A") return "support";
    if (side === "B") return "oppose";
    return "neutral";
  }

  /* 参与者 → 席位卡数据（含 stance 覆盖表 override: {participant_id: stance}）。
   * 映射规则：同 side 的参与者按声明顺序填 A/B 席位；不足显示空席（participant_id=null）。 */
  function mapParticipants(participants, overrides) {
    participants = participants || [];
    overrides = overrides || {};
    var bySide = { A: [], B: [] };
    participants.forEach(function (p) {
      var side = (p.side_id === undefined || p.side_id === null) ? "" : String(p.side_id);
      var key = (side === "A" || side === "B") ? side : "";
      if (key) bySide[key].push(p);
    });
    return SEATS.map(function (seat) {
      var pool = seat.side === "A" ? bySide.A : bySide.B;
      var p = pool.shift() || null;
      var stance = p ? (overrides[p.participant_id] || defaultStanceFor(seat.side)) : null;
      return {
        seat_id: seat.seat_id,
        side: seat.side,
        participant_id: p ? p.participant_id : null,
        stance: stance,
        stance_text: p ? (STANCE_TEXT[stance] || stance) : null,
        occupied: !!p
      };
    });
  }

  /* seat_id → 稳定座位定义（不含参与者绑定）。 */
  function seatDef(seatId) {
    for (var i = 0; i < SEATS.length; i++) if (SEATS[i].seat_id === seatId) return SEATS[i];
    return null;
  }

  /* participant_id → seat_id（未占用返回 null）。 */
  function seatIdOf(participantId, seats) {
    seats = seats || [];
    for (var i = 0; i < seats.length; i++) if (seats[i].participant_id === participantId) return seats[i].seat_id;
    return null;
  }

  /* 六席默认参与者模板（主流程「创建会议」用；保留 3 人版 defaultParticipants 供既有测试/开发工具）。 */
  function sixSeatParticipants() {
    return [
      { participant_id: "agent-a1", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A1", role_id: "strategic-advocate", transport_kind: "web_relay", model_ref: "chatgpt-web" },
      { participant_id: "agent-a2", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A2", role_id: "strategic-advocate", transport_kind: "mock", model_ref: "" },
      { participant_id: "agent-a3", role_class: "advisor", side_id: "A", actor_type: "agent", alias: "A3", role_id: "strategic-advocate", transport_kind: "mock", model_ref: "" },
      { participant_id: "agent-b1", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B1", role_id: "risk-challenger", transport_kind: "mock", model_ref: "" },
      { participant_id: "agent-b2", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B2", role_id: "risk-challenger", transport_kind: "mock", model_ref: "" },
      { participant_id: "agent-b3", role_class: "advisor", side_id: "B", actor_type: "agent", alias: "B3", role_id: "risk-challenger", transport_kind: "mock", model_ref: "" }
    ];
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.SeatLayout = Object.freeze({
    SEATS: SEATS, STANCE_TEXT: STANCE_TEXT,
    defaultStanceFor: defaultStanceFor, mapParticipants: mapParticipants,
    seatDef: seatDef, seatIdOf: seatIdOf, sixSeatParticipants: sixSeatParticipants
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
