/* AI Council v0.1 — D3 · 会议控制台 · MeetingDraft 与 WebRelayTargetProfile 用例（TEST-147..）。
 * 覆盖：草稿默认结构 / 校验规则（名称、议题长度、协议、与会者、web_relay 必填 model_ref）/
 * 一次性创建（Draft → Meeting，含 title/topic 落库）/ Profile 默认表 / URL 安全校验 / upsert / 按 model_ref 查找。
 */
(function (root) {
  "use strict";

  var A = root.AICouncil;
  var T = A.TestSuite;
  var D = A.MeetingDraft;
  var P = A.RelayProfiles;

  function protoDoc() {
    return { protocol_id: "committee-mvp", version: "0.1.0", name: "委员会 MVP",
      initial_phase_id: "opening",
      phases: [{ phase_id: "opening", kind: "agent_turn", name: "开场陈述",
        actor: { selector: "all_advisors" }, completion: { mode: "all_selected_respond" },
        transitions: [{ trigger: "complete", target: "$end" }] }] };
  }
  function protocol() { return { protocolId: "committee-mvp", document: protoDoc() }; }

  T.test("TEST-147", "MeetingDraft.create：默认结构含 3 名与会者，A1 默认 web_relay 且带 model_ref", function () {
    var d = D.create("committee-mvp");
    T.assertEqual(d.protocolId, "committee-mvp", "协议 ID");
    T.assertEqual(d.title, "", "标题默认空");
    T.assertEqual(d.topic, "", "议题默认空");
    T.assertEqual(d.participants.length, 3, "默认 3 名与会者");
    var a1 = d.participants[0];
    T.assertEqual(a1.transport_kind, "web_relay", "A1 默认网页中继");
    T.assertEqual(a1.model_ref, "chatgpt-web", "A1 默认模型引用");
    return Promise.resolve();
  });

  T.test("TEST-148", "validate：名称必填 / 议题 2000 上限 / 协议必选 / web_relay 必填 model_ref", function () {
    var d = D.create("committee-mvp");
    var v = D.validate(d);
    T.assert(!v.ok && v.errors.some(function (e) { return e.indexOf("会议名称") >= 0; }), "空名称应报错");
    d.title = "玄域引擎战略评审";
    d.topic = new Array(2002).join("长");
    v = D.validate(d);
    T.assert(!v.ok && v.errors.some(function (e) { return e.indexOf("2000") >= 0; }), "超长议题应报错");
    d.topic = "是否继续自研玄域引擎？";
    d.protocolId = "";
    v = D.validate(d);
    T.assert(!v.ok && v.errors.some(function (e) { return e.indexOf("议事规则") >= 0; }), "缺协议应报错");
    d.protocolId = "committee-mvp";
    d.participants[0].model_ref = "";
    v = D.validate(d);
    T.assert(!v.ok && v.errors.some(function (e) { return e.indexOf("模型引用") >= 0; }), "web_relay 缺 model_ref 应报错");
    d.participants[0].model_ref = "chatgpt-web";
    T.assert(D.validate(d).ok, "合法草稿应通过");
    return Promise.resolve();
  });

  T.test("TEST-149", "buildMeeting：Draft 一次性创建 Meeting，title/topic 落库且参与者不含 web_url", function () {
    var d = D.create("committee-mvp");
    d.title = "玄域引擎战略评审";
    d.topic = "是否应该继续自研玄域引擎？";
    var r = D.buildMeeting(d, protocol(), "mtg-draft-1");
    T.assert(r.ok, "创建应成功：" + (r.message || ""));
    T.assertEqual(r.meeting.title, "玄域引擎战略评审", "title 落库");
    T.assertEqual(r.meeting.topic, "是否应该继续自研玄域引擎？", "topic 落库");
    T.assertEqual(r.meeting.participants.length, 2, "2 名与会者（T25-F3：B1 未配置模型 → 默认不参会，点名页可勾选）");
    r.meeting.participants.forEach(function (p) {
      T.assert(!Object.prototype.hasOwnProperty.call(p, "web_url"), "Participant 不得携带 web_url（Transport 配置）");
    });
    var a1 = r.meeting.participants[0];
    T.assertEqual(a1.model_ref, "chatgpt-web", "model_ref 保留在 Participant 上");
    return Promise.resolve();
  });

  T.test("TEST-150", "buildMeeting：非法草稿拒绝创建，会议不产生", function () {
    var d = D.create("committee-mvp");
    var r = D.buildMeeting(d, protocol(), "mtg-draft-bad");
    T.assert(!r.ok, "空名称草稿应拒绝");
    T.assert(r.message && r.message.length > 0, "拒绝时给出中文消息");
    return Promise.resolve();
  });

  T.test("TEST-151", "RelayProfiles：默认表含 ChatGPT/Claude/Gemini 且 URL 安全", function () {
    T.assertEqual(P.DEFAULTS.length, 3, "默认 3 个 Profile");
    var c = P.findByModelRef(P.DEFAULTS, "chatgpt-web");
    T.assertEqual(c.display_name, "ChatGPT", "按 model_ref 命中");
    T.assert(P.isSafeUrl(c.web_url), "默认 URL 安全");
    T.assert(P.isSafeUrl("https://chatgpt.com/") && P.isSafeUrl("http://local.example/"), "http/https 允许");
    T.assert(!P.isSafeUrl("javascript:alert(1)") && !P.isSafeUrl("ftp://x") && !P.isSafeUrl(""), "非 http/https 拒绝");
    return Promise.resolve();
  });

  T.test("TEST-152", "validateUrl：空串允许（未配置）、非法协议报错", function () {
    T.assert(P.validateUrl("").ok, "空串 = 未配置，允许");
    T.assert(P.validateUrl("https://claude.ai/").ok, "合法 URL 通过");
    var v = P.validateUrl("not-a-url");
    T.assert(!v.ok && v.message.indexOf("http") >= 0, "非法 URL 中文报错");
    return Promise.resolve();
  });

  T.test("TEST-153", "webUrlFor / displayName / upsert：按 model_ref 关联，upsert 更新不重复", function () {
    T.assertEqual(P.webUrlFor(P.DEFAULTS, "chatgpt-web"), "https://chatgpt.com/", "按 model_ref 取 URL");
    T.assertEqual(P.webUrlFor(P.DEFAULTS, "unknown-ref"), "", "未命中返回空");
    T.assertEqual(P.displayName(P.DEFAULTS, "claude-web"), "Claude", "显示名命中");
    T.assertEqual(P.displayName(P.DEFAULTS, ""), "（未指定模型）", "空 model_ref 兜底文案");
    var ups = P.upsert(P.DEFAULTS, { profile_id: "chatgpt", display_name: "ChatGPT 新版", model_ref: "chatgpt-web", web_url: "https://chat.openai.com/" });
    T.assertEqual(ups.length, 3, "更新不新增");
    T.assertEqual(P.findByModelRef(ups, "chatgpt-web").web_url, "https://chat.openai.com/", "更新生效");
    var add = P.upsert(P.DEFAULTS, { profile_id: "grok", display_name: "Grok", model_ref: "grok-web", web_url: "https://grok.com/" });
    T.assertEqual(add.length, 4, "新增追加");
    return Promise.resolve();
  });

  T.test("TEST-154", "buildMeeting：web_relay 参与者 model_ref 冻结进 Meeting；Restore 往返后 topic 仍在", function () {
    var d = D.create("committee-mvp");
    d.title = "往返测试";
    d.topic = "议题必须随存档往返";
    var r = D.buildMeeting(d, protocol(), "mtg-draft-2");
    T.assert(r.ok, "创建成功");
    return A.MeetingArchive.build(r.meeting, protocol()).then(function (archive) {
      T.assertEqual(archive.topic, "议题必须随存档往返", "存档携带 topic");
      var rr = A.MeetingRestore.restore(archive);
      T.assertEqual(rr.topic, "议题必须随存档往返", "恢复后 topic 仍在");
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
