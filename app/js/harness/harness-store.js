/* AI Council v0.1 — D2 HarnessStore（D3 沿用）
 * 开发验证台的唯一共享状态容器（无 DOM，可在 Node 中直接测试）。
 *
 * 设计边界：
 *  - 只持有状态与订阅，不做任何判定、不编译、不推进会议（那是 participant-binding / *-flow 的事）。
 *  - 不访问 document / window UI；视图层订阅本模块，绝不反过来被本模块引用。
 *  - Session 冻结语义（第42题）不变：资产同样只在目录选择那一刻从 Snapshot 读一次。
 */
(function (root) {
  "use strict";

  var SCHEMA_PACK_PATHS = {
    meeting: "schema/schemas/meeting.schema.json",
    role: "schema/schemas/role.schema.json",
    message: "schema/schemas/message.schema.json",
    artifact: "schema/schemas/artifact.schema.json",
    annotation: "schema/schemas/annotation.schema.json"
  };
  var PACKET_SCHEMA_PATH = "schema/schemas/instruction-packet.schema.json";
  var ROLE_CARD_PATH = /^roles\/[^/]+\.json$/;

  var state = {
    snapshot: null, registry: null, session: null,
    roleCards: [], roleRegistry: null, schemaPack: null, packetSchema: null,
    meeting: null, protocol: null
  };
  var listeners = [];

  function assetMap(snapshot) {
    var by = Object.create(null);
    ((snapshot && snapshot.assetFiles) || []).forEach(function (a) {
      if (a && typeof a.text === "string") by[a.path] = a.text;
    });
    return by;
  }

  function parseJson(text) { try { return JSON.parse(text); } catch (e) { return null; } }

  /* roles/*.json → 按路径升序装入 RoleCardRegistry，保证同 role_class 的 pick 可复现。 */
  function readRoleCards(by) {
    return Object.keys(by).filter(function (p) { return ROLE_CARD_PATH.test(p); }).sort()
      .map(function (p) { return parseJson(by[p]); })
      .filter(function (c) { return c !== null; });
  }

  function readSchemaPack(by) {
    var pack = {};
    var keys = Object.keys(SCHEMA_PACK_PATHS);
    for (var i = 0; i < keys.length; i++) {
      var doc = parseJson(by[SCHEMA_PACK_PATHS[keys[i]]] || "");
      if (!doc) return null;
      pack[keys[i]] = doc;
    }
    return pack;
  }

  function notify() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) { /* 视图异常不得污染状态 */ } });
  }

  function subscribe(fn) { if (typeof fn === "function") listeners.push(fn); }
  function get() { return state; }

  /* 目录选择完成后由 app.js 调用一次：把 Session 与其随行资产固化进 Store。 */
  function setSession(snapshot, session) {
    var by = assetMap(snapshot);
    var cards = readRoleCards(by);
    state.snapshot = snapshot;
    state.session = session || null;
    state.registry = (session && session.registry) || null;
    state.roleCards = cards;
    state.roleRegistry = cards.length ? root.AICouncil.RoleCardRegistry.create(cards) : null;
    state.schemaPack = readSchemaPack(by);
    state.packetSchema = parseJson(by[PACKET_SCHEMA_PATH] || "");
    state.meeting = null;   /* 换目录 = 换 Session，旧会议不得跨 Session 残留 */
    state.protocol = null;
    notify();
  }

  function setMeeting(meeting, protocol) {
    state.meeting = meeting || null;
    if (protocol !== undefined) state.protocol = protocol || null;
    notify();
  }

  function availableProtocol(protocolId) {
    var list = (state.registry && state.registry.available) || [];
    for (var i = 0; i < list.length; i++) if (list[i].protocolId === protocolId) return list[i];
    return null;
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.HarnessStore = Object.freeze({
    SCHEMA_PACK_PATHS: SCHEMA_PACK_PATHS,
    PACKET_SCHEMA_PATH: PACKET_SCHEMA_PATH,
    subscribe: subscribe, get: get, notify: notify,
    setSession: setSession, setMeeting: setMeeting,
    availableProtocol: availableProtocol
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
