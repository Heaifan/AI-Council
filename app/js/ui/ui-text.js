/* AI Council v0.1 — D3 · WEB_RELAY · UIText：用户界面中文文案字典（唯一落点）。
 * 冻结边界：机器合同（transport_kind / web_relay / waiting_external / Schema enum / 类名 / 文件名）一律英文；
 * 本文件只把机器值翻译成用户可读中文。任何视图都不得自行硬编码状态或错误码的中文说法。 */
(function (root) {
  "use strict";

  /* 术语表（代码术语 → 界面中文）。新增界面文案必须先在这里登记。 */
  var TERM = Object.freeze({
    protocol: "议事规则",
    meeting: "会议",
    meeting_runtime: "会议运行时",
    persistence: "会议存档",
    compiler: "指令编译器",
    renderer: "提示词渲染器",
    web_relay: "网页中继",
    manual_relay: "人工网页中继",
    prompt: "提示词",
    response: "外部 AI 回答",
    participant: "与会者",
    role: "角色",
    role_card: "角色卡",
    message: "正式会议消息",
    mock_agent: "模拟 Agent",
    human_gate: "人工裁定点",
    battle: "对辩",
    validation: "校验"
  });

  /* WEB_RELAY 调用状态：内部机器值 → 界面中文。 */
  var RELAY_STATE = Object.freeze({
    created: "已创建",
    waiting_external: "等待外部 AI 回答",
    response_received: "已收到外部 AI 回答",
    validated: "校验通过",
    accepted: "已接受并写入会议",
    rejected: "已拒绝",
    failed: "执行失败",
    cancelled: "已取消"
  });

  /* 会议状态：内部机器值 → 界面中文。 */
  var MEETING_STATUS = Object.freeze({
    initialized: "已创建",
    running: "进行中",
    waiting_human: "等待人工裁定",
    paused: "已暂停",
    completed: "已结束",
    failed: "执行失败"
  });

  /* 人工裁定点的三个选项：内部 choice → 界面中文。 */
  var CHOICE = Object.freeze({ finish: "结束会议", continue: "继续会议", battle: "进入对辩" });

  /* 传输方式：内部 transport_kind → 界面中文。 */
  var TRANSPORT = Object.freeze({ mock: "模拟 Agent", web_relay: "网页中继" });

  /* 错误码人话解释。界面必须同时给出中文解释与内部错误代码，禁止只甩代码。 */
  var ERROR = Object.freeze({
    EMPTY_RESPONSE: "外部 AI 回答为空。请粘贴完整回答后重新提交。",
    INVOCATION_OUTPUT_CONTRACT_FAILED: "回答未通过输出合同校验（格式/字段不达标）。请按提示词要求的格式重新生成后粘贴。",
    INVALID_RESPONSE: "外部 AI 回答不合法（可能过长或格式异常）。请检查后重新粘贴。",
    VALIDATION_FAILED: "本次回答未通过校验，尚未写入正式会议记录。",
    CANCELLED: "本次请求已被取消。",
    TRANSPORT_FAILED: "中继通道执行失败。请重新发起本次请求。",
    STALE_INVOCATION: "本次请求已经过期，会议状态已经发生变化。请重新生成当前委员的请求。",
    PARTICIPANT_NOT_FOUND: "找不到对应的会议参与者。当前会议数据可能已经发生变化。",
    INVOCATION_REQUEST_INVALID: "调用请求不完整，无法发起网页中继。",
    INVOCATION_STATE_TRANSITION_INVALID: "当前状态不允许执行该操作。",
    TRANSPORT_KIND_UNSUPPORTED: "该传输方式尚未开放，当前仅支持模拟 Agent 与网页中继。"
  });

  function pick(map, key, fallback) {
    if (key === null || key === undefined) return fallback === undefined ? "—" : fallback;
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    return fallback === undefined ? String(key) : fallback;
  }

  function term(k) { return pick(TERM, k); }
  function relayState(v) { return pick(RELAY_STATE, v); }
  function meetingStatus(v) { return pick(MEETING_STATUS, v); }
  function choice(v) { return pick(CHOICE, v); }
  function transport(v) { return pick(TRANSPORT, v || "mock"); }
  /* 返回 { text, code }：text 给人看，code 给开发调试，两者都必须显示。 */
  function error(code) {
    return { text: pick(ERROR, code, "发生未预期的错误。"), code: String(code || "UNKNOWN") };
  }

  root.AICouncil = root.AICouncil || {};
  root.AICouncil.UIText = Object.freeze({
    TERM: TERM, RELAY_STATE: RELAY_STATE, MEETING_STATUS: MEETING_STATUS,
    CHOICE: CHOICE, TRANSPORT: TRANSPORT, ERROR: ERROR,
    term: term, relayState: relayState, meetingStatus: meetingStatus,
    choice: choice, transport: transport, error: error
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
