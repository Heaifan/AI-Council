/* AI Council v0.1 — 浏览器真机验收（仅开发期工具）。
 * 用真实 Chrome / Edge 打开 file:// 下的 index.html，不启动任何服务器。
 * 依赖 playwright-core（开发期），正式应用运行不依赖它，也不依赖 Node.js。
 *
 * 覆盖范围：
 *  - D1-R1：Protocols Tab 的目录发现 / Schema 隔离 / 冻结不动。
 *  - D2：Meeting + Compiler 两个 Tab 的真实点击链路（创建 / Mock 单步 / Human Gate / 编译 / Save-Load）。
 *  - D3：网页中继 Manual Relay 全链路 + 中文 UI 审计（B01..B25）。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const repoRoot = path.resolve(__dirname, "..", "..");
const appUrl = "file:///" + path.join(repoRoot, "app", "index.html").replace(/\\/g, "/");
const testUrl = "file:///" + path.join(repoRoot, "app", "tests", "test-runner.html").replace(/\\/g, "/");
const fixtureDir = path.join(repoRoot, "app", "tests", "fixtures", "acceptance");
const schemaFile = path.join(repoRoot, "schema", "schemas", "protocol.schema.json");
const brokenFile = path.join(fixtureDir, "protocols", "broken-b", "protocol.json");
const shotDirD1 = path.join(repoRoot, "reports", "d1-r1-screenshots");
const shotDirD2 = path.join(repoRoot, "reports", "d2-f1-screenshots");
const shotDirD3 = path.join(repoRoot, "reports", "d3-web-relay-screenshots");

const checks = [];
function check(label, condition, detail) {
  checks.push({ label, ok: !!condition, detail: detail || "" });
  console.log((condition ? "PASS  " : "FAIL  ") + label + (condition ? "" : "  → " + detail));
}

const statusText = (page) => page.locator("#status").innerText();
const waitStatus = (page, re) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById("status").textContent), re.source, { timeout: 30000 });

/* F1：开发工具默认折叠（drawer）——点击 drawer 内按钮 = 展开 → 点击 → 立即折叠（避免 overlay 拦截工作区）。 */
const openDevTools = (page) =>
  page.evaluate(() => { const d = document.getElementById("dev-tools"); if (d && !d.open) d.open = true; });
const closeDevTools = (page) =>
  page.evaluate(() => { const d = document.getElementById("dev-tools"); if (d && d.open) d.open = false; });
const clickDevBtn = async (page, id) => { await openDevTools(page); await page.click(id); await closeDevTools(page); };

/* ---------- D1-R1：Protocols Tab ---------- */
async function runD1(page) {
  await page.goto(appUrl);
  /* D3 起默认 Tab 是「会议」（主工作区）；D1 断言议事规则页内容，先显式切回。 */
  await page.click("#tab-btn-protocols");
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  let text = await statusText(page);
  check("D1 · 仓库根目录：可用规则 1 / 已隔离 0", /可用规则 1 · 已隔离 0/.test(text), text);
  check("D1 · Schema 自动发现", (await page.locator(".card").first().innerText()).includes("schema/schemas/protocol.schema.json"));
  await page.screenshot({ path: path.join(shotDirD1, "01-repo-root.png"), fullPage: true });

  await page.setInputFiles("#dir-input", fixtureDir);
  await waitStatus(page, /未能初始化/);
  check("D1 · 缺少 Schema 时明确阻塞", (await page.locator("#output").innerText()).includes("SCHEMA_SOURCE_MISSING"));

  await page.setInputFiles("#schema-input", schemaFile);
  await waitStatus(page, /可用规则/);
  text = await statusText(page);
  check("D1 · 样例目录：可用规则 2 / 已隔离 4", /可用规则 2 · 已隔离 4/.test(text), text);
  const body = await page.locator("#output").innerText();
  ["JSON_PARSE_FAILED", "SCHEMA_VALIDATION_FAILED", "DUPLICATE_PROTOCOL"].forEach((code) =>
    check("D1 · 隔离区显示 " + code, body.includes(code)));
  check("D1 · 合法规则不受坏规则影响", body.includes("good-a") && body.includes("good-c"));
  await page.locator("#output details").first().click();
  await page.screenshot({ path: path.join(shotDirD1, "02-quarantine.png"), fullPage: true });

  const original = fs.readFileSync(brokenFile, "utf8");
  try {
    fs.writeFileSync(brokenFile, fs.readFileSync(path.join(fixtureDir, "protocols", "good-a", "protocol.json"), "utf8"));
    await page.waitForTimeout(2000);
    text = await statusText(page);
    check("D1 · 修改磁盘后 Registry 不变", /可用规则 2 · 已隔离 4/.test(text), text);
  } finally {
    fs.writeFileSync(brokenFile, original);
  }
}

/* ---------- D2：Meeting + Compiler Tab ---------- */
async function runD2(page) {
  await page.goto(appUrl);

  check("D2 · 顶部徽标 = 人工网页中继",
    (await page.locator(".badge").innerText()).includes("人工网页中继"));

  const caps = await page.locator("#capabilities .capability").evaluateAll((els) =>
    els.map((e) => ({ name: e.getAttribute("data-capability"), ok: e.getAttribute("data-ok") })));
  check("D2 · 六个能力灯全亮（Protocol/Runtime/Persistence/Compiler/Renderer/WebRelay）",
    caps.length === 6 && caps.every((c) => c.ok === "1"), JSON.stringify(caps));

  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  await page.click("#tab-btn-compiler");
  await page.waitForSelector("#cp-disabled");
  check("D2 · 无 Meeting 时 Compiler 禁用并要求先建会",
    (await page.locator("#cp-disabled").innerText()).includes("创建会议"));

  await page.click("#tab-btn-meeting");
  await clickDevBtn(page, "#mt-create");
  await page.waitForSelector("#mt-phase");
  let phase = await page.locator("#mt-phase").innerText();
  check("D2 · Create Demo 停在 opening", phase === "opening", phase);
  check("D2 · 创建后 Received=0（不预跑）",
    (await page.locator("#mt-received").innerText()).includes("（无）"),
    await page.locator("#mt-received").innerText());
  await page.screenshot({ path: path.join(shotDirD2, "01-create-demo.png"), fullPage: true });

  await clickDevBtn(page, "#mt-step");
  await page.waitForFunction(() => document.getElementById("mt-received").textContent.includes("agent-a1"));
  check("D2 · 单步后 Received 含 agent-a1",
    (await page.locator("#mt-received").innerText()).includes("agent-a1"));
  check("D2 · 单步后 Phase 仍为 opening（不越 Phase）",
    (await page.locator("#mt-phase").innerText()) === "opening");

  await page.click("#tab-btn-compiler");
  await page.waitForSelector("#cp-participant-select");
  const optCount = await page.locator("#cp-participant-select option").count();
  check("D2 · Participant 下拉严格 3 个（来自 participants[]）", optCount === 3, "option 数=" + optCount);
  const sel = page.locator("#cp-participant-select");
  await sel.selectOption({ value: "agent-a1" });
  await page.waitForSelector("#cp-packet-id");
  const promptA1 = await page.locator("#cp-prompt").inputValue();
  check("D2 · 编译 A1 产出 packet_id 与 Rendered Prompt",
    (await page.locator("#cp-packet-id").innerText()).length > 0 && promptA1.length > 200,
    "prompt 长度=" + promptA1.length);
  check("D2 · Packet Schema 校验通过",
    (await page.locator("#cp-schema-check").innerText()).includes("通过") ||
    (await page.locator("#cp-schema-check").getAttribute("class")).includes("ok"));
  check("D2 · Prompt 含 A1 角色名", promptA1.includes("战略支持方"));
  await page.screenshot({ path: path.join(shotDirD2, "02-compile-a1.png"), fullPage: true });

  await sel.selectOption({ value: "agent-b1" });
  await page.waitForFunction(() => {
    const t = document.getElementById("cp-prompt");
    return t && t.value.includes("风险挑战方");
  });
  const promptB1 = await page.locator("#cp-prompt").inputValue();
  check("D2 · 切换 B1 重编译出不同 Prompt 且用 B1 角色卡",
    promptB1 !== promptA1 && promptB1.includes("风险挑战方"));

  const readonly = await page.locator("#cp-prompt").getAttribute("readonly");
  check("D2 · Rendered Prompt 为只读 textarea（可键盘复制，无 Clipboard API）",
    readonly !== null && promptB1.length > 100);

  await page.click("#tab-btn-meeting");
  for (let i = 0; i < 20; i++) {
    if ((await page.locator("#mt-status-raw").innerText()) === "waiting_human") break;
    if (await page.locator("#mt-advance").count()) {   /* F1：收齐后显式进入下一阶段 */
      await page.click("#mt-advance");
      await page.waitForTimeout(150);
      continue;
    }
    const evBefore = await page.evaluate(() => window.AICouncil.HarnessStore.get().meeting.events.length);
    await clickDevBtn(page, "#mt-step");
    await page.waitForTimeout(200);
    const evAfter = await page.evaluate(() => window.AICouncil.HarnessStore.get().meeting.events.length);
    if (evAfter === evBefore) break;   /* Human Gate 或收齐：无效果即停 */
  }
  const finalStatus = await page.locator("#mt-status-raw").innerText();
  check("D2 · Mock 步进停在 Human Gate（waiting_human）", finalStatus === "waiting_human", finalStatus);
  check("D2 · Human Gate 上 Mock 不替人类决策",
    (await page.locator("#mt-status-raw").innerText()) === "waiting_human");
  check("D2 · Human Gate 按钮 Finish 启用", await page.locator("#mt-finish").isEnabled());
  await page.screenshot({ path: path.join(shotDirD2, "03-human-gate.png"), fullPage: true });

  const phaseBeforeSave = await page.locator("#mt-phase").innerText();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#mt-save")
  ]);
  const dlPath = await download.path();
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("#mt-load")
  ]);
  await fileChooser.setFiles(dlPath);
  await page.waitForFunction(() =>
    /恢复|成功|已加载/.test(document.getElementById("mt-msg").textContent), null, { timeout: 15000 });
  check("D2 · Save→Load 往返：恢复后 Phase 一致",
    (await page.locator("#mt-phase").innerText()) === phaseBeforeSave,
    "before=" + phaseBeforeSave + " after=" + (await page.locator("#mt-phase").innerText()));

  await page.click("#mt-finish");
  await page.waitForFunction(() => document.getElementById("mt-status-raw").textContent === "completed");
  check("D2 · 人工点 Finish 走向 completed（archive 自动终局）",
    (await page.locator("#mt-status-raw").innerText()) === "completed");
  await page.screenshot({ path: path.join(shotDirD2, "04-finished.png"), fullPage: true });

  await page.click("#tab-btn-compiler");
  await page.waitForSelector("#cp-disabled");
  check("D2 · 会议结束后 Compiler 禁用（不得编译不存在的相位）",
    (await page.locator("#cp-disabled").innerText()).length > 0);
}

/* ---------- D3：网页中继 Manual Relay + 中文 UI 审计（B01..B25） ---------- */
async function runD3(page) {
  await page.goto(appUrl);

  /* B01-B04：中文 UI 审计 */
  check("B01 · 顶部标题为中文「AI 顾问委员会 · 开发验证台」",
    (await page.locator("h1").innerText()).includes("AI 顾问委员会 · 开发验证台"));
  check("B02 · 顶部徽标为中文「人工网页中继」",
    (await page.locator(".badge").innerText()).includes("人工网页中继"));
  const rs = await page.locator("#runtime-status").innerText();
  check("B03 · 独立「当前状态」行存在且为中文", rs.startsWith("当前状态："));
  const bodyText = await page.locator("body").innerText();
  check("B04 · 页面无过期 D2-F1 文案",
    !bodyText.includes("D2-F1 Integration Harness") && !bodyText.includes("Developer Harness"));

  /* B05-B06：能力灯 */
  const caps = await page.locator("#capabilities .capability").evaluateAll((els) =>
    els.map((e) => ({ name: e.getAttribute("data-capability"), ok: e.getAttribute("data-ok") })));
  check("B05 · 六个能力灯全亮（含 WebRelay）",
    caps.length === 6 && caps.every((c) => c.ok === "1"), JSON.stringify(caps));
  const relayCap = caps.find((c) => c.name === "WebRelay");
  check("B06 · WebRelay 能力灯为 ✅（模块已装载，不再红叉）",
    relayCap && relayCap.ok === "1");

  /* B07：空状态中文 */
  await page.click("#tab-btn-meeting");
  await page.waitForSelector("#mt-empty");
  check("B07 · 会议页空状态为中文",
    (await page.locator("#mt-empty").innerText()).includes("当前没有正在进行的会议"));

  /* B08-B20：网页中继生命周期（有效回答→接受） */
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.click("#tab-btn-meeting");
  await clickDevBtn(page, "#mt-create-relay");
  await page.waitForSelector("#mt-phase");
  check("B08 · 创建网页中继会议后状态为「进行中」",
    (await page.locator("#mt-status-raw").innerText()) === "running");
  check("B08b · 停在 opening 阶段",
    (await page.locator("#mt-phase").innerText()) === "opening");
  await page.screenshot({ path: path.join(shotDirD3, "01-create-relay.png"), fullPage: true });

  await page.waitForSelector("#relay-hint");
  check("B09 · 网页中继提示显示 agent-a1",
    (await page.locator("#relay-hint").innerText()).includes("agent-a1"));

  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  const promptVal = await page.locator("#relay-prompt").inputValue();
  check("B10 · 提示词 textarea 出现且非空", promptVal.length > 100);
  check("B10b · 提示词 textarea 为只读",
    (await page.locator("#relay-prompt").getAttribute("readonly")) !== null);

  const selectBtn = await page.locator("#relay-select").innerText();
  check("B11 · 按钮文案为「选中全部提示词」（非「复制 Prompt」）",
    selectBtn === "选中全部提示词");

  await page.fill("#relay-paste", "{\"position\":\"控制风险敞口\",\"reasons\":[\"分批建仓\"],\"risks\":[\"情报不足\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  check("B12 · 校验通过静默（F3-T03：无常驻校验块）",
    (await page.locator("#relay-validation").count()) === 0);
  check("B13 · 校验通过后无详情清单常驻",
    (await page.locator(".checks li").count()) === 0);

  check("B14 · 中继状态为中文「校验通过」",
    (await page.locator("#relay-state").innerText()) === "校验通过");
  check("B15 · 内部状态为机器值「validated」",
    (await page.locator("#relay-state-raw").innerText()).includes("validated"));
  check("B16 · 未提交时无「尚未写入」常驻块（F3-T04）",
    (await page.locator("#relay-not-official").count()) === 0);
  check("B17 · 「接受为正式发言」按钮可用",
    await page.locator("#relay-accept").isEnabled());

  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-msg");
    return el && el.textContent.includes("已接受为正式发言");
  });
  check("B18 · 接受后提示「已接受为正式发言并写入会议记录」",
    (await page.locator("#relay-msg").innerText()).includes("已接受为正式发言"));
  await page.screenshot({ path: path.join(shotDirD3, "02-accepted.png"), fullPage: true });

  await page.waitForFunction(() => {
    const el = document.getElementById("relay-empty");
    return el && el.textContent.includes("没有需要网页中继");
  });
  check("B19 · 接受后中继面板提示无待中继委员",
    (await page.locator("#relay-empty").innerText()).includes("没有需要网页中继"));
  check("B20 · 会议仍进行中，可继续推进 mock 委员",
    (await page.locator("#mt-status-raw").innerText()) === "running" &&
    await page.locator("#mt-step").isEnabled());

  /* B21-B24：错误处理（空响应→拒绝→重新生成→通过→接受） */
  await clickDevBtn(page, "#mt-create-relay");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "");
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-hint");
  check("B21 · 空响应后被拒，回到待中继提示（agent-a1 仍待响应）",
    (await page.locator("#relay-hint").innerText()).includes("agent-a1"));
  const errMsg = await page.locator("#relay-msg").innerText();
  check("B22 · 错误提示含中文解释 + 错误代码 EMPTY_RESPONSE",
    errMsg.includes("EMPTY_RESPONSE") && errMsg.includes("错误代码"), errMsg);

  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "x".repeat(20001));   /* 超长触发 V04 校验失败 */
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-validation");
  check("B23 · 校验失败才出现轻提示（F3-T03）",
    (await page.locator("#relay-validation").innerText()).includes("校验问题"));
  await page.click("#relay-verdict-toggle");
  const failItems = await page.locator(".checks li").count();
  check("B23b · 校验失败详情清单可见（含失败项）", failItems > 0, "items=" + failItems);

  await page.click("#relay-open");   /* V04 被拒后回 idle，需重新生成提示词 */
  await page.waitForSelector("#relay-paste");
  await page.fill("#relay-paste", "{\"position\":\"加强情报收集\",\"reasons\":[\"谨慎行事\"],\"risks\":[\"阵型不稳\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => document.getElementById("relay-validation") === null);
  check("B24 · 重新粘贴有效回答 → 校验通过静默（无校验块）",
    (await page.locator("#relay-validation").count()) === 0);
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-msg");
    return el && el.textContent.includes("已接受为正式发言");
  });
  check("B24b · 第二次接受成功并写入会议记录",
    (await page.locator("#relay-msg").innerText()).includes("已接受为正式发言"));

  /* B25：取消 */
  await clickDevBtn(page, "#mt-create-relay");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.click("#relay-cancel");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-msg");
    return el && el.textContent.includes("已取消");
  });
  check("B25 · 取消后提示「已取消本次请求」",
    (await page.locator("#relay-msg").innerText()).includes("已取消"));
  await page.screenshot({ path: path.join(shotDirD3, "03-cancelled.png"), fullPage: true });
}

/* ---------- D4：会议控制台（C01..C16，D3 · 会议控制台整改新增） ---------- */
async function runD4(page) {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.clear());   /* D2 的 mt-save 残留存档会恢复会议 → 建会按钮禁用 */
  await page.reload();
  await page.setViewportSize({ width: 1920, height: 1080 });

  /* C16：默认打开会议 Tab（方案 §17） */
  const mtTabClass = await page.locator("#tab-btn-meeting").getAttribute("class");
  check("C16 · 默认打开「会议」Tab（主工作区）", (mtTabClass || "").includes("active"));

  /* C12：三栏布局存在（方案 §三：320 | flexible | 320） */
  const cols = await page.locator("#console").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  check("C12 · 会议控制台为三栏 grid 布局", cols === 3, "列数=" + cols);

  /* C13/C14：Prompt / Response 是主工作区（1920 下中栏大幅宽） */
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.fill("#cfg-title", "玄域引擎战略评审");
  await page.dispatchEvent("#cfg-title", "change");
  await page.fill("#cfg-topic", "是否应该继续自研玄域引擎？");
  await page.dispatchEvent("#cfg-topic", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");   /* F1：正式建会先点名 */
  const pfDisabled = await page.locator("#preflight-start").isDisabled();
  check("S09b · 六席点名全部已入会（开始 Round 1 可用）", !pfDisabled);
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  const promptW = await page.locator("#relay-prompt").evaluate((el) => el.getBoundingClientRect().width);
  const respW = await page.locator("#relay-paste").evaluate((el) => el.getBoundingClientRect().width);
  check("C13 · Prompt 工作区为主区域（宽度 ≥ 500px）", promptW >= 500, "width=" + Math.round(promptW));
  check("C14 · Response 工作区为主区域（宽度 ≥ 500px）", respW >= 500, "width=" + Math.round(respW));

  /* C08/C09：议题进入会议与 Prompt（方案 §21 核心测试） */
  const meetingTopic = await page.evaluate(() => (AICouncil.HarnessStore.get().meeting || {}).topic || "");
  check("C08 · 创建会议使用编辑后的议题", meetingTopic === "是否应该继续自研玄域引擎？", meetingTopic);
  const promptVal = await page.locator("#relay-prompt").inputValue();
  check("C09 · Prompt 真实包含编辑后的议题", promptVal.includes("是否应该继续自研玄域引擎？"));

  /* C10：创建后核心配置冻结（会议名称/议题不可再编辑） */
  check("C10 · 创建后核心配置冻结（名称/议题输入禁用）",
    await page.locator("#cfg-title").isDisabled() && await page.locator("#cfg-topic").isDisabled());

  /* C11：Web URL 创建后仍允许修改（Transport 便利配置例外，方案 §11） */
  check("C11 · 创建后模型网页 URL 仍可编辑",
    !(await page.locator("#cfg-url-agent-a1").isDisabled()));

  /* C01/C02/C03：会议名称 / 议题 / 议事规则 可编辑（创建前） */
  await clickDevBtn(page, "#mt-clear");
  await page.waitForFunction(() => !document.getElementById("cfg-title").disabled);
  check("C01 · 会议名称可编辑", !(await page.locator("#cfg-title").isDisabled()));
  check("C02 · 议题可编辑", !(await page.locator("#cfg-topic").isDisabled()));
  check("C03 · 议事规则可选择",
    await page.locator("#cfg-protocol").evaluate((el) => el.options.length >= 1 && !el.disabled));

  /* C04/C05：model_ref / Web URL 可编辑（创建前） */
  check("C04 · model_ref 可编辑", !(await page.locator("#cfg-model-ref-agent-a1").isDisabled()));
  check("C05 · 模型网页 URL 可编辑", !(await page.locator("#cfg-url-agent-a1").isDisabled()));

  /* C06：非法 URL 时按钮禁用（非 http/https 不允许打开） */
  await page.fill("#cfg-url-agent-a1", "not-a-url");
  await page.dispatchEvent("#cfg-url-agent-a1", "change");
  check("C06 · 非法 URL 时「打开模型网页」禁用",
    await page.locator("#cfg-open-web-agent-a1").isDisabled());
  await page.fill("#cfg-url-agent-a1", "https://chatgpt.com/");
  await page.dispatchEvent("#cfg-url-agent-a1", "change");

  /* C07：打开模型网页参数正确（拦截 window.open，不真开互联网） */
  await page.evaluate(() => {
    window.__opened = [];
    const orig = window.open;
    window.open = function (u) { window.__opened.push(u); return null; };
  });
  await page.click("#cfg-open-web-agent-a1");
  const opened = await page.evaluate(() => window.__opened || []);
  check("C07 · 打开模型网页传参正确（window.open 收到配置 URL）",
    opened.length === 1 && opened[0] === "https://chatgpt.com/", JSON.stringify(opened));

  /* C15：Demo 不在主操作区（开发工具独立区块，主操作只有「创建会议」） */
  const demoInDevTools = await page.locator("#dev-tools #mt-create-relay").count();
  const primaryBtns = await page.locator("#console-config .btn.primary").allInnerTexts();
  check("C15 · Demo 按钮不在主操作区（位于开发工具区块）",
    demoInDevTools === 1 && primaryBtns.length === 1 && primaryBtns[0].includes("创建会议"), JSON.stringify(primaryBtns));

  await page.screenshot({ path: path.join(shotDirD3, "04-console.png"), fullPage: true });
}

/* ---------- D5：六席会议控制台（S01..S14，D3 · 六席重构新增） ---------- */
async function runD5(page) {
  await page.goto(appUrl);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* 布局：左/中/右三区 + 六席卡 */
  const seatCards = await page.locator(".seat-card").count();
  check("S01 · 左右两栏共 6 个席位卡", seatCards === 6, "seat-card 数=" + seatCards);
  const leftSeats = await page.locator("#console-left .seat-card").count();
  const rightSeats = await page.locator("#console-right .seat-card").count();
  check("S02 · 左 3 席 / 右 3 席", leftSeats === 3 && rightSeats === 3,
    "left=" + leftSeats + " right=" + rightSeats);
  const centerW = await page.locator("#console-center").evaluate((el) => el.getBoundingClientRect().width);
  const sideW = await page.locator("#console-left").evaluate((el) => el.getBoundingClientRect().width);
  check("S03 · 中央大屏宽度明显大于单侧栏", centerW > sideW * 1.8,
    "center=" + Math.round(centerW) + " side=" + Math.round(sideW));

  /* 底部日志折叠区存在 */
  check("S04 · 底部时间线/日志折叠区存在", await page.locator("#console-timeline summary").count() === 1);

  /* 席位卡点击选中 → 中央进入席位配置模式（One-Screen：点击卡片本身即选中） */
  await page.click("#seat-A2");
  await page.waitForSelector("#seat-config");
  check("S05 · 点击席位可选中并进入席位配置", await page.locator("#seat-config").isVisible());
  const seatIdText = await page.locator("#seat-config h2").innerText();
  check("S06 · 席位配置显示对应 seat_id（A2）", seatIdText.includes("A2"), seatIdText);

  /* 席位配置编辑器：web_url / 模型显示名可编辑（创建前；A1 为 web_relay 带默认 profile） */
  await page.click("#seat-A1");
  await page.waitForFunction(() => {
    const h = document.querySelector("#seat-config h2");
    return h && h.textContent.includes("A1");
  });
  check("S07 · web_url 可编辑", !(await page.locator("#cfg-url-agent-a1").isDisabled()));
  check("S08 · 模型显示名可编辑", !(await page.locator("#cfg-model-name-agent-a1").isDisabled()));

  /* 会议创建前议题可编辑 */
  check("S09 · 创建前议题可编辑", !(await page.locator("#cfg-topic").isDisabled()));

  /* 会议创建 → 议题只读 + 当前席位高亮 */
  await page.fill("#cfg-title", "六席控制台验收");
  await page.dispatchEvent("#cfg-title", "change");
  await page.fill("#cfg-topic", "六席议题进入提示词");
  await page.dispatchEvent("#cfg-topic", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");   /* F1：正式建会先点名 */
  const pfDisabled = await page.locator("#preflight-start").isDisabled();
  check("S09b · 六席点名全部已入会（开始 Round 1 可用）", !pfDisabled);
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  check("S10 · 创建后议题只读", await page.locator("#cfg-topic").isDisabled());
  check("S11 · 当前席位高亮（A1 当前轮次）",
    (await page.locator("#seat-A1").getAttribute("class")).includes("current"));

  /* 生成提示词仍含会议议题 */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  const promptVal = await page.locator("#relay-prompt").inputValue();
  check("S12 · 生成提示词仍含会议议题", promptVal.includes("六席议题进入提示词"));

  /* response 流程 + accept 仍成立 */
  await page.fill("#relay-paste", "{\"position\":\"同意继续自研\",\"reasons\":[\"六席验收\"],\"risks\":[\"周期长\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  check("S13 · response 流程仍成立（校验通过静默，F3-T03）",
    (await page.locator("#relay-validation").count()) === 0);
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-msg");
    return el && el.textContent.includes("已接受为正式发言");
  });
  check("S14 · accept 后仍进入正式记录", true);
  await page.screenshot({ path: path.join(shotDirD3, "05-six-seats.png"), fullPage: true });
}

/* ---------- D6：One-Screen + Clipboard（U17..U22 + 1792×856 无整体滚动门禁） ---------- */
async function runD6(page) {
  await page.goto(appUrl);
  await page.setViewportSize({ width: 1792, height: 856 });
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* One-Screen 门禁：六席全可见 + 无整体纵向滚动 */
  const scrollable = await page.evaluate(() => document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight);
  check("U16 · 1792×856 页面无整体纵向滚动", !scrollable);
  const seats = ["A1", "A2", "A3", "B1", "B2", "B3"];
  for (const s of seats) {
    const v = await page.locator("#seat-" + s).isVisible();
    check("U16b · 席位 " + s + " 可见", v);
    if (!v) break;
  }

  /* 创建网页中继会议，进入运行模式 */
  await clickDevBtn(page, "#mt-create-relay");
  await page.waitForSelector("#relay-open");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  const promptText = await page.locator("#relay-prompt").inputValue();

  /* U17：复制提示词按钮存在 */
  check("U17 · 复制提示词按钮存在", await page.locator("#relay-copy").count() === 1);

  /* U18：mock Clipboard 成功 — writeText 收到完整 Rendered Prompt */
  let copied = null;
  await page.evaluate(() => {
    window.__copied = null;
    navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
  });
  await page.click("#relay-copy");
  await page.waitForFunction(() => window.__copied !== null);
  copied = await page.evaluate(() => window.__copied);
  check("U18 · mock Clipboard 成功：writeText == 完整 Rendered Prompt", copied === promptText,
    "len " + (copied ? copied.length : 0) + " vs " + promptText.length);

  /* U19：成功后显示「提示词已复制」 */
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-msg");
    return el && el.textContent.includes("提示词已复制");
  });
  check("U19 · 成功后显示「提示词已复制」", true);

  /* U20：mock Clipboard 拒绝 → 自动 textarea.select() */
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
  });
  await page.click("#relay-copy");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-msg");
    return el && el.textContent.includes("Ctrl+C");
  });
  const selRange = await page.evaluate(() => {
    const ta = document.getElementById("relay-prompt");
    return [ta.selectionStart, ta.selectionEnd];
  });
  check("U20 · mock Clipboard 拒绝：自动执行 textarea.select()", selRange[0] === 0 && selRange[1] === promptText.length,
    "sel " + JSON.stringify(selRange));

  /* U21：fallback 提示「请按 Ctrl+C」 */
  const msg = await page.locator("#relay-msg").innerText();
  check("U21 · fallback 显示「请按 Ctrl+C」", msg.includes("请按 Ctrl+C"), msg);

  /* U22：Clipboard 失败不改变 Invocation 状态 */
  const stateBefore = await page.locator("#relay-state-raw").innerText();
  await page.waitForTimeout(300);
  const stateAfter = await page.locator("#relay-state-raw").innerText();
  check("U22 · Clipboard 失败：Invocation 状态不改变", stateBefore === stateAfter && stateAfter === "waiting_external",
    stateBefore + " -> " + stateAfter);
  await page.screenshot({ path: path.join(shotDirD3, "06-one-screen.png"), fullPage: true });
}

/* ---------- D7：MEETING-REPLAY-F1 时间轴（R01..R08，方案 T05/T06/T07） ---------- */
async function runD7(page) {
  await page.goto(appUrl);
  await page.setViewportSize({ width: 1792, height: 856 });
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* R01：底部时间轴常驻（上一步/下一步/回到当前 + 轨道） */
  check("R01 · 底部时间轴常驻（上一步/下一步/回到当前）",
    (await page.locator("#tl-prev").count()) === 1 &&
    (await page.locator("#tl-next").count()) === 1 &&
    (await page.locator("#tl-back").count()) === 1);

  /* R02：创建 Mock Demo 后时间轴节点 ≥1（先展开开发工具 drawer） */
  await page.click("#dev-tools summary");
  await page.click("#mt-create");
  await page.waitForSelector("#mt-phase");
  await page.waitForFunction(() => {
    const el = document.getElementById("tl-current-label");
    return el && el.textContent.length > 0;
  });
  const label0 = await page.locator("#tl-current-label").innerText();
  check("R02 · 创建会议后时间轴有节点", label0.length > 0, label0);
  const nodeCount0 = await page.locator(".tl-node").count();
  check("R02b · 时间轴节点数 ≥ 1", nodeCount0 >= 1, "nodes=" + nodeCount0);

  /* R03：执行下一步后节点增加 */
  await clickDevBtn(page, "#mt-step");
  await page.waitForFunction((n) => {
    const el = document.getElementById("tl-current-label");
    return el && el.textContent.length > 0;
  }, nodeCount0, { timeout: 5000 });
  await page.waitForFunction((n) => document.querySelectorAll(".tl-node").length > n, nodeCount0, { timeout: 5000 });
  const nodeCount1 = await page.locator(".tl-node").count();
  check("R03 · 执行步骤后时间轴节点增加", nodeCount1 > nodeCount0, nodeCount0 + " -> " + nodeCount1);

  /* R04：上一步进入回放模式（横幅 + 按钮禁用） */
  await page.click("#tl-prev");
  await page.waitForSelector("#replay-banner");
  check("R04 · 上一步进入回放模式（历史横幅出现）", await page.locator("#replay-banner").isVisible());
  check("R04b · 回放时无「进入下一阶段」入口", (await page.locator("#mt-advance").count()) === 0);
  check("R04c · 回放时保存/加载禁用", await page.locator("#mt-save").isDisabled() && await page.locator("#mt-load").isDisabled());

  /* R05：回放时席位卡状态来自 replay（B1 执行前：A1 已发言 / B1 待执行） */
  /* 先回到当前，再 step 一次让 A1、B1 都发言过，然后逐次 prev 回退到 B1 发言前的位置。 */
  await page.click("#tl-back");
  await page.waitForFunction(() => !document.getElementById("replay-banner"));
  await clickDevBtn(page, "#mt-step");
  let got = false;
  for (let i = 0; i < 5 && !got; i++) {
    const a1 = await page.locator("#seat-A1 .seat-state").innerText().catch(() => "");
    const b1 = await page.locator("#seat-B1 .seat-state").innerText().catch(() => "");
    if (a1.includes("已发言") && (b1.includes("当前发言") || b1.includes("等待"))) { got = true; break; }
    await page.click("#tl-prev");
    await page.waitForTimeout(150);
  }
  const a1Status = await page.locator("#seat-A1 .seat-state").innerText().catch(() => "");
  const b1Status = await page.locator("#seat-B1 .seat-state").innerText().catch(() => "");
  check("R05 · 回放时席位状态来自历史（A1 已发言 / B1 待执行）",
    got && a1Status.includes("已发言") && (b1Status.includes("当前发言") || b1Status.includes("等待")),
    "A1=" + a1Status + " B1=" + b1Status);

  /* R06：回到当前恢复 Live State */
  await page.click("#tl-back");
  await page.waitForFunction(() => !document.getElementById("replay-banner"));
  check("R06 · 回到当前后横幅消失", true);
  check("R06b · 回到当前后进入下一阶段恢复", !(await page.locator("#mt-advance").isDisabled()));

  /* R07：回放期间不产生新 Message/Event */
  await page.click("#tl-prev");
  await page.waitForSelector("#replay-banner");
  const evBefore = await page.evaluate(() => window.AICouncil.HarnessStore.get().meeting.events.length);
  await page.waitForTimeout(400);
  const evAfter = await page.evaluate(() => window.AICouncil.HarnessStore.get().meeting.events.length);
  check("R07 · 回放浏览不产生新事件（live 不变）", evBefore === evAfter, evBefore + " -> " + evAfter);
  await page.click("#tl-back");
  await page.screenshot({ path: path.join(shotDirD3, "07-replay.png"), fullPage: true });
}



/* ---------- F1-RT：六席真实闭环 E2E（MEETING-RUNTIME-F1，T17/T18） ---------- */
async function newSixMeeting(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.fill("#cfg-title", "F1-RT 六席闭环");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
}
const navText = (page) => page.locator("#seat-nav-current").innerText();
const mtAdvanceEnabled = (page) => page.locator("#mt-advance").isEnabled();
const currentCount = async (page) => (await page.locator(".seat-card .seat-state").allInnerTexts()).filter((t) => t.includes("当前发言")).length;
/* F4 invariant：running 且非配置/浏览模式时，selectedSeat 必须等于 activeSpeaker 席位，中央不得为配置页。 */
const invariantOK = (page) => page.evaluate(() => {
  const s = AICouncil.HarnessStore.get();
  if (!s.meeting || !s.meeting.activeSpeakerId) return true;
  if (AICouncil.ConsoleActions.getMode() !== "run") return true;
  const seats = AICouncil.SeatLayout.mapParticipants(s.meeting.participants, AICouncil.ConsoleActions.getStanceOverrides());
  let seatId = s.meeting.activeSpeakerId;
  for (const x of seats) if (x.participant_id === s.meeting.activeSpeakerId) { seatId = x.seat_id; break; }
  const seatWrap = document.getElementById("console-seat");
  return AICouncil.ConsoleActions.getSelectedSeatId() === seatId && (!seatWrap || seatWrap.style.display === "none");
});

async function runF1RT(page) {
  await page.goto(appUrl);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* ============ 段 1：六席真实闭环（T17） ============ */
  await page.fill("#cfg-title", "F1-RT 六席闭环");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  const pfRoster = await page.locator(".preflight-list").innerText();
  check("R1T-01 · 点名列表 6 席全部已入会", (pfRoster.match(/✓/g) || []).length === 6, pfRoster.slice(0, 60));
  check("R1T-02 · 点名通过 → 开始 Round 1 可用", !(await page.locator("#preflight-start").isDisabled()));
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  check("R1T-03 · 点名后自动进入 A1 工作区", (await navText(page)).includes("A1"), await navText(page));
  check("R1T-03b · 开场唯一「当前发言」= A1（≤1 硬断言）", (await currentCount(page)) === 1 &&
    (await page.locator("#seat-A1 .seat-state").innerText()).includes("当前发言"), "count=" + await currentCount(page));

  /* A1（web_relay）：open → paste → submit → accept */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  check("R1T-03c · validated 后「提交回答」已禁用（无重复提交入口）",
    await page.locator("#relay-submit").isDisabled());
  check("R1T-03d · validated ≠ received（进度仍 0/5）", (await navText(page)).includes("0/5"), await navText(page));
  check("R1T-03e · validated 后存在「接受为正式发言」", await page.locator("#relay-accept").isVisible());
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("A2");
  });
  check("R1T-04 · A1 接受后自动轮转到 A2（无需手动寻找）", true);
  check("R1T-04b · 轮转后唯一「当前发言」= A2", (await currentCount(page)) === 1 &&
    (await page.locator("#seat-A2 .seat-state").innerText()).includes("当前发言"), "count=" + await currentCount(page));
  check("R1T-05 · A1 席位卡已发言", (await page.locator("#seat-A1 .seat-state").innerText()).includes("已发言"));
  check("R1T-06 · 进度 1/5", (await navText(page)).includes("1/5"), await navText(page));

  /* A2..B3（mock）逐步模拟 → 5/5（A3=秘书，opening 不含） */
  for (let i = 0; i < 6; i++) {
    if ((await navText(page)).includes("—")) break;
    await clickDevBtn(page, "#mt-step");
    await page.waitForTimeout(200);
  }
  check("R1T-07 · 五委员全部完成 → 5/5", (await navText(page)).includes("5/5"), await navText(page));
  check("R1T-07b · 全部完成后「当前发言」= 0（无一席误亮）", (await currentCount(page)) === 0, "count=" + await currentCount(page));
  check("R1T-08 · 5/5 后「进入下一阶段」可用（不自动切）", await mtAdvanceEnabled(page));
  const phaseBefore = await page.locator("#mt-phase").innerText();
  await page.click("#mt-advance");
  await page.waitForFunction((p0) => document.getElementById("mt-phase").textContent !== p0, phaseBefore);
  check("R1T-09 · 点击进入下一阶段 → 阶段真实推进", true);

  /* ============ 段 2：异常链（T18a） ============ */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.fill("#cfg-title", "F1-RT 异常链");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  const errMap = await page.evaluate(() => {
    const E = AICouncil.UIText.ERROR;
    return E.INVOCATION_STATE_TRANSITION_INVALID + "|" + E.VALIDATION_FAILED;
  });
  check("R1T-09b · INVOCATION 与校验失败文案独立（T49）",
    errMap.split("|")[0].indexOf("校验") < 0 && errMap.split("|")[0] !== errMap.split("|")[1], errMap);
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("A2");
  });
  /* 使 A2 阻塞：清空模型配置（T25-F2：mock 也不豁免，未配置模型 → blocked） */
  await page.evaluate(() => {
    const st = AICouncil.HarnessStore.get();
    const p = st.meeting.participants.filter((x) => x.participant_id === "agent-a2")[0];
    p.model_ref = "";
    AICouncil.HarnessStore.notify();
  });
  await page.waitForSelector("#relay-blocked");
  check("R1T-10 · A2 Blocked：中央阻塞卡出现（不跳 A3）", true);
  check("R1T-10b · 阻塞卡显示原因", (await page.locator("#relay-blocked").innerText()).includes("未指定模型"));
  check("R1T-10c · 停留 A2（activeSpeaker 不被跳过）", (await navText(page)).includes("A2"), await navText(page));
  check("R1T-10d · A2 席位卡显示无法入会", (await page.locator("#seat-A2 .seat-state").innerText()).includes("无法入会"));
  /* 修复配置 → 自动恢复（admission 派生） */
  await page.evaluate(() => {
    const st = AICouncil.HarnessStore.get();
    const p = st.meeting.participants.filter((x) => x.participant_id === "agent-a2")[0];
    p.model_ref = "claude-web";
    AICouncil.HarnessStore.notify();
  });
  await page.waitForFunction(() => !document.getElementById("relay-blocked"));
  check("R1T-11 · 修复后阻塞卡消失（可继续 A2）", true);
  await clickDevBtn(page, "#mt-step");
  await page.waitForTimeout(200);
  check("R1T-12 · 修复后 A2 可正常发言", (await navText(page)).includes("2/5"), await navText(page));

  /* ============ 段 3：撤回 + 修改（T18b/T18c） ============ */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.fill("#cfg-title", "F1-RT 撤回修改");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意 V1\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("A2");
  });
  /* 修改（dialog） */
  page.once("dialog", (d) => d.accept("A1 回答 V2（修改后）。"));
  await page.click("#seat-revise-A1");
  await page.waitForTimeout(300);
  const ctxV2 = await page.evaluate(() => {
    const m = AICouncil.HarnessStore.get().meeting;
    const msgs = m.messages.filter((x) => x.sender.actor_id === "agent-a1");
    return msgs.map((x) => x.extensions && x.extensions.response_status + ":" + (x.extensions.revision || 1) + ":" + x.content.raw_text).join(" | ");
  });
  check("R1T-13 · 修改后：V1 superseded + V2 official（上下文取 V2）",
    ctxV2.includes("superseded:1:") && ctxV2.includes("official:2:A1 回答 V2"), ctxV2);
  /* 撤回 A1 */
  await page.click("#seat-revoke-A1");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("0/5");
  });
  check("R1T-14 · 撤回 A1 → 完成度回 0/5（历史保留 revoked）", true);
  const revoked = await page.evaluate(() => {
    const m = AICouncil.HarnessStore.get().meeting;
    return m.messages.filter((x) => x.sender.actor_id === "agent-a1").map((x) => x.extensions.response_status).join(",");
  });
  check("R1T-15 · 历史不物理删除（A1 记录 revoked）", revoked.includes("revoked"), revoked);
  /* 完成 mock 席位（activeSpeaker 保持 A2 起步）→ 最后 A1（web_relay）由中继补答 */
  for (let i = 0; i < 6; i++) {
    const nav = await navText(page);
    if (nav.includes("A1") || nav.includes("—")) break;
    await clickDevBtn(page, "#mt-step");
    await page.waitForTimeout(200);
  }
  check("R1T-16 · mock 完成 → 调度回到 A1（撤回席补答入口）", (await navText(page)).includes("A1"), await navText(page));
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"最终支持自研\",\"reasons\":[\"补答\"],\"risks\":[\"周期\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("/5") && !el.textContent.includes("0/5");
  });
  check("R1T-17 · 撤回后补答 A1 成功（roster 顺序优先）", (await navText(page)).includes("2/5"), await navText(page));
  for (let i = 0; i < 6; i++) {   /* 完成剩余 mock 席位 */
    if ((await navText(page)).includes("—")) break;
    await clickDevBtn(page, "#mt-step");
    await page.waitForTimeout(200);
  }
  check("R1T-18 · 撤回补答后完成全部 → 重新 5/5", (await navText(page)).includes("5/5"), await navText(page));

  /* ============ 段 4：Replay 与 Live 一致（T18/T47：Accept+Revise+Revoke+Re-Accept 历史） ============ */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.fill("#cfg-title", "F1-RT Replay 一致");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  /* A1：Accept V1 → Revise V2 → Revoke → Re-Accept V3（历史：received, revised, revoked, received） */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意 V1\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("A2");
  });
  page.once("dialog", (d) => d.accept("A1 V2（修改）。"));
  await page.click("#seat-revise-A1");
  await page.waitForTimeout(300);
  await page.click("#seat-revoke-A1");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("0/5");
  });
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意 V3\",\"reasons\":[\"重发\"],\"risks\":[\"风险\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("1/5");
  });
  const liveState = await page.evaluate(() => {
    const s = AICouncil.HarnessStore.get();
    const m = s.meeting;
    const eff = AICouncil.MeetingTurnSelector.deriveCompleted(m);
    const msgs = m.messages.filter((x) => x.sender.actor_id === "agent-a1")
      .map((x) => x.extensions ? x.extensions.response_status + ":" + (x.extensions.revision || 1) : "official:1").join("|");
    return { phase: m.currentPhaseId, received: eff.join(","), completion: AICouncil.MeetingTurnSelector.phaseStatus(m, s.protocol), msgs: msgs };
  });
  /* 进入回放模式（tl-prev 上一步）→ 全量重建 Replay 状态与 Live 对比 */
  await page.click("#console-timeline summary");
  await page.click("#tl-prev");
  await page.waitForFunction(() => document.getElementById("replay-banner"));
  const replayState = await page.evaluate(() => {
    const s = AICouncil.HarnessStore.get();
    const ds = AICouncil.ReplayProvider.get(s);
    const m = ds.meeting;
    const rp = AICouncil.MeetingReplay.replayStateAt(s.meeting, s.protocol, s.meeting.events.length);
    return { phase: m.currentPhaseId, spoken: rp.spoken.join(","), completion: AICouncil.MeetingTurnSelector.phaseStatus(m, s.protocol) };
  });
  check("R1T-19 · Replay 最终 phase == Live", replayState.phase === liveState.phase, replayState.phase + " vs " + liveState.phase);
  check("R1T-20 · Replay 有效 received == Live（revoke 被事件正确重建）", replayState.spoken === liveState.received, replayState.spoken + " vs " + liveState.received);
  check("R1T-21 · Replay completion == Live（READY_TO_ADVANCE 一致）", replayState.completion === liveState.completion, replayState.completion);
  check("R1T-22 · Live 历史完整（V1 official→V2 修改→V3 重发链路可审计）", liveState.msgs.length >= 3, liveState.msgs);
  await page.click("#tl-back");
  await page.waitForFunction(() => !document.getElementById("replay-banner"));

  /* ============ 段 5：T25-F2 门禁 B01..B06（Admission 误放行 + 导航语义） ============ */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.fill("#cfg-title", "F2 门禁");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  /* B01/B02：A2 未配置模型（mock）→ Preflight blocked → 不得开始 */
  await page.evaluate(() => {
    const st = AICouncil.HarnessStore.get();
    const p = st.meeting.participants.filter((x) => x.participant_id === "agent-a2")[0];
    p.model_ref = "";
    AICouncil.HarnessStore.notify();
  });
  await page.waitForSelector("#preflight-blocked-note");
  const b01Note = await page.locator("#preflight-blocked-note").innerText().catch(() => "");
  check("B01 · A2 未配置模型 → Preflight 阻塞并显示原因", b01Note.includes("尚未就绪"), b01Note);
  check("B02 · 未就绪时「开始 Round 1」不可用", await page.locator("#preflight-start").isDisabled());
  const pfRow = await page.locator(".preflight-row").allInnerTexts();
  check("B02b · 点名行显示「⚠ A2 未指定模型 无法入会」",
    pfRow.some((t) => t.includes("A2") && t.includes("无法入会")), pfRow.join(" | "));
  /* B04：补齐配置 + 重新检查 → admitted */
  await page.evaluate(() => {
    const st = AICouncil.HarnessStore.get();
    st.meeting.participants.filter((x) => x.participant_id === "agent-a2")[0].model_ref = "claude-web";
    AICouncil.HarnessStore.notify();
  });
  await page.waitForFunction(() => !document.getElementById("preflight-blocked-note"));
  check("B04 · 补齐配置后重新检查 → 恢复可开始", !(await page.locator("#preflight-start").isDisabled()));
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  /* B05：1/6 时正式 UI 无「进入下一阶段」灰按钮 */
  check("B05 · 1/6 时无「进入下一阶段」入口（席位推进=自动）", (await page.locator("#mt-advance").count()) === 0);
  check("B05b · 底部显示当前发言与进度", (await navText(page)).includes("A1") && (await navText(page)).includes("0/5"), await navText(page));
  /* 完成 A1 → A2 blocked（运行中配置失效，B03） */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("A2");
  });
  await page.evaluate(() => {
    const st = AICouncil.HarnessStore.get();
    st.meeting.participants.filter((x) => x.participant_id === "agent-a2")[0].model_ref = "";
    AICouncil.HarnessStore.notify();
  });
  await page.waitForSelector("#relay-blocked");
  check("B03 · 运行中 A2 配置失效 → 阻塞停留（不跳 A3、不回 A1）", (await navText(page)).includes("A2"), await navText(page));
  check("B03b · 阻塞卡给原因与配置入口", (await page.locator("#relay-blocked").innerText()).includes("未指定模型") &&
    await page.locator("#relay-blocked-config").isVisible());
  /* 修复 → 恢复 */
  await page.evaluate(() => {
    const st = AICouncil.HarnessStore.get();
    st.meeting.participants.filter((x) => x.participant_id === "agent-a2")[0].model_ref = "claude-web";
    AICouncil.HarnessStore.notify();
  });
  await page.waitForFunction(() => !document.getElementById("relay-blocked"));
  check("B04b · 修复后 A2 可继续", true);
  /* B06：全部完成 → 唯一出现「进入下一阶段」 */
  for (let i = 0; i < 6; i++) {
    if ((await navText(page)).includes("—")) break;
    await clickDevBtn(page, "#mt-step");
    await page.waitForTimeout(200);
  }
  check("B06 · 6/6 时唯一出现「进入下一阶段」", (await page.locator("#mt-advance").count()) === 1 &&
    await page.locator("#mt-advance").isEnabled());
  check("B06b · 底部「全部完成」状态", (await navText(page)).includes("全部完成"), await navText(page));

  /* ============ 段 6：T25-F3 可变参会名单（M01..M05/M07） ============ */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  /* 1v1 场景：draft 中 A2..B3 未配置 → 建会默认只带 A1+B1 */
  await page.evaluate(() => {
    const d = AICouncil.ConsoleActions.getDraft();
    d.participants.forEach((p) => { if (p.participant_id === "agent-a2" || p.participant_id === "agent-b2" || p.participant_id === "agent-b3") p.model_ref = ""; });   /* F5：保留 A3 秘书席 */
    AICouncil.ConsoleActions.persistDraft();
  });
  await page.fill("#cfg-title", "F3 可变名单 1v1");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  const pfRows1 = await page.locator(".preflight-row").allInnerTexts();
  check("M01 · 1v1+秘书点名：A1/B1 参会 + A3 秘书就绪 + 3 席未参会", pfRows1.length === 6 &&
    pfRows1.some((t) => t.includes("✓ A1") && t.includes("已就绪")) &&
    pfRows1.some((t) => t.includes("✓ B1") && t.includes("已就绪")) &&
    pfRows1.some((t) => t.includes("A3")) &&
    pfRows1.filter((t) => t.includes("未参会")).length === 3, pfRows1.join(" | "));
  check("M04 · 空席不阻塞（无「无法入会」、开始可用）",
    (await page.locator(".preflight-row .bad").count()) === 0 && !(await page.locator("#preflight-start").isDisabled()));
  check("M01b · 标题「委员 2 · 秘书 1」（职责区分）", (await page.locator(".preflight h2").innerText()).includes("委员 2 · 秘书 1"), await page.locator(".preflight h2").innerText());
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  check("M07 · 1v1 开场 activeSpeaker=A1", (await navText(page)).includes("A1"));
  /* A1 relay accept → 自动 B1（绝不落空席 A2） */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("B1");
  });
  check("M02 · A1 后自动轮到 B1（空席 A2 不进入）", true);
  await clickDevBtn(page, "#mt-step");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("2/2");
  });
  check("M02b · 1v1 完成 2/2 → READY_TO_ADVANCE", (await page.locator("#mt-advance").count()) === 1);
  check("M07b · 1v1 全程 activeSpeaker ∈ [A1,B1]（nav 无 A2/A3/B2/B3）",
    !(await navText(page)).includes("A2"));

  /* M05/M03：勾选未配置席 → 阻塞；补配置 → 三人会议 3/3 */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.evaluate(() => {
    const d = AICouncil.ConsoleActions.getDraft();
    d.participants.forEach((p) => { if (p.participant_id === "agent-a2" || p.participant_id === "agent-b2" || p.participant_id === "agent-b3") p.model_ref = ""; });   /* F5：保留 A3 秘书席 */
    AICouncil.ConsoleActions.persistDraft();
  });
  await page.fill("#cfg-title", "F3 三人会议");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.check("#pf-check-A2");   /* 勾选 A2（draft 未配置） */
  await page.waitForSelector("#preflight-blocked-note");
  check("M05 · 勾选未配置席 → 无法入会 + 开始禁用", await page.locator("#preflight-start").isDisabled() &&
    (await page.locator(".preflight h2").innerText()).includes("委员 3 · 秘书 1"));
  /* 补配置 → 重新检查 → 三人可开始 */
  await page.evaluate(() => {
    const st = AICouncil.HarnessStore.get();
    st.meeting.participants.filter((x) => x.participant_id === "agent-a2")[0].model_ref = "claude-web";
    AICouncil.HarnessStore.notify();
  });
  await page.waitForFunction(() => !document.getElementById("preflight-blocked-note"));   /* 派生自动恢复（无需手动重查） */
  check("M03 · 补配置 → 三人就绪可开始（3 人参会）", !(await page.locator("#preflight-start").isDisabled()));
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("A2");
  });
  await clickDevBtn(page, "#mt-step");
  await page.waitForTimeout(200);
  await clickDevBtn(page, "#mt-step");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("3/3");
  });
  check("M03b · 三人 A1→A2→B1 完成 3/3", (await page.locator("#mt-advance").count()) === 1);
  check("W07b · 三人流程 invariant 保持（每次轮转 workspace==activeSpeaker）", await invariantOK(page));

  /* ============ 段 7：F4 activeSpeaker→Workspace 同步（W01..W07） ============ */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.evaluate(() => {
    const d = AICouncil.ConsoleActions.getDraft();
    d.participants.forEach((p) => { if (p.participant_id === "agent-a2" || p.participant_id === "agent-b2" || p.participant_id === "agent-b3") p.model_ref = ""; });   /* F5：保留 A3 秘书席 */
    AICouncil.ConsoleActions.persistDraft();
  });
  await page.fill("#cfg-title", "F4 同步");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("B1");
  });
  const w01 = await page.evaluate(() => ({
    activeSpeaker: AICouncil.HarnessStore.get().meeting.activeSpeakerId,
    selectedSeat: AICouncil.ConsoleActions.getSelectedSeatId()
  }));
  check("W01 · A1 accept 后 activeSpeaker=B1 && selectedSeat=B1（自动同步）",
    w01.activeSpeaker === "agent-b1" && w01.selectedSeat === "B1", JSON.stringify(w01));
  const w02diag = await page.evaluate(() => ({
    mode: AICouncil.ConsoleActions.getMode(),
    seatConfig: document.querySelectorAll("#seat-config").length,
    center: (document.getElementById("console-center") || {}).innerHTML ? document.getElementById("console-center").innerHTML.slice(0, 80) : "none"
  }));
  check("W02 · 中央无 A2 席位配置（B1 工作区上下文）", !(await page.locator("#seat-config").isVisible()), JSON.stringify(w02diag));
  check("W02b · invariant 成立", await invariantOK(page), JSON.stringify(w02diag));
  /* W06：手工回看不污染 activeSpeaker + 回到当前发言 */
  await page.click("#seat-A1");
  await page.waitForTimeout(200);
  const w06a = await page.evaluate(() => ({
    activeSpeaker: AICouncil.HarnessStore.get().meeting.activeSpeakerId,
    selectedSeat: AICouncil.ConsoleActions.getSelectedSeatId()
  }));
  check("W06 · 点 A1：selectedSeat=A1 但 activeSpeaker 仍 B1", w06a.activeSpeaker === "agent-b1" && w06a.selectedSeat === "A1", JSON.stringify(w06a));
  check("W06b · 「回到当前发言」出现", (await page.locator("#seat-follow").count()) === 1);
  await page.click("#seat-follow");
  await page.waitForFunction(() => AICouncil.ConsoleActions.getSelectedSeatId() === "B1");
  check("W06c · 回到当前发言 → selectedSeat=B1", true);
  check("W06d · invariant 恢复", await invariantOK(page));
  /* W05：1v1 自动链 A1→B1，无空席（navList 走 Phase Roster） */
  const navList = await page.evaluate(() => AICouncil.SeatNav.navList(AICouncil.HarnessStore.get().meeting));
  check("W05 · 1v1 导航列表=[A1,B1]（空席不参与）", navList.join(",") === "A1,B1", navList.join(","));

  /* W03/W04：B1 为 web_relay → accept 后自动生成 B1 Prompt（角色正确，不复用 A1） */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.evaluate(() => {
    const d = AICouncil.ConsoleActions.getDraft();
    d.participants.forEach((p) => {
      if (p.participant_id === "agent-b1") { p.transport_kind = "web_relay"; p.model_ref = "chatgpt-web"; }
      else if (p.participant_id !== "agent-a1" && p.participant_id !== "agent-a3") p.model_ref = "";   /* 保留 A1/A3（秘书） */
    });
    AICouncil.ConsoleActions.persistDraft();
  });
  await page.fill("#cfg-title", "F4 B1 中继");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"同意\",\"reasons\":[\"理由一\"],\"risks\":[\"风险一\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && !el.value.includes("战略支持方") && el.value.includes("风险挑战方");
  });
  check("W03 · B1 工作区自动出现且 Prompt 可见（复制按钮可用）", await page.locator("#relay-select").isEnabled());
  const b1Prompt = await page.locator("#relay-prompt").inputValue();
  check("W04 · B1 Prompt 身份正确（风险挑战方，非 A1 战略支持方）", b1Prompt.includes("风险挑战方") && !b1Prompt.includes("战略支持方"), b1Prompt.slice(0, 60));

  /* ============ 段 8：F5 秘书席位化 E2E（A1→B1→Secretary→1/1→Round3，全真实中继链） ============ */
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.evaluate(() => {
    const d = AICouncil.ConsoleActions.getDraft();
    d.participants.forEach((p) => {
      if (p.participant_id === "agent-b1") p.transport_kind = "web_relay";   /* B1 也走真实中继（秘书输入需真实 official） */
      else if (p.participant_id !== "agent-a1" && p.participant_id !== "agent-a3") p.model_ref = "";
    });
    AICouncil.ConsoleActions.persistDraft();
  });
  await page.fill("#cfg-title", "F5 秘书闭环");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  const pfSec = await page.locator(".preflight-row").allInnerTexts();
  check("F5-01 · 点名：委员 2 · 秘书 1（A3 参会且区分职责）", pfSec.filter((t) => t.includes("未参会")).length === 3 &&
    pfSec.some((t) => t.includes("A3")), pfSec.join(" | "));
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  /* A1 真实 accept */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  /* B1 自动开（autoOpenNext）→ 真实 accept */
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && el.value.includes("风险挑战方");
  });
  await page.fill("#relay-paste", "{\"position\":\"反对，风险过高\",\"reasons\":[\"成本压力\"],\"risks\":[\"进度失控\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("2/2");
  });
  check("F5-02 · 委员 2/2 → 进入下一阶段", (await page.locator("#mt-advance").count()) === 1);
  await page.click("#mt-advance");
  /* summary：A3 秘书自动开 + 秘书 Prompt 注入 A1/B1 有效正式发言 */
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && el.value.includes("上一阶段正式发言") && el.value.includes("{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}") && el.value.includes("{\"position\":\"反对，风险过高\",\"reasons\":[\"成本压力\"],\"risks\":[\"进度失控\"]}");
  });
  const secPrompt = await page.locator("#relay-prompt").inputValue();
  check("F5-03 · 秘书 Prompt = A1+B1 有效正式发言 + 来源引用",
    secPrompt.includes("source=") && !secPrompt.includes("{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}" + "A1"), secPrompt.slice(0, 80));
  const execLabel = await page.evaluate(() => {
    const el = document.getElementById("relay-exec-pid");
    const f = el && el.closest(".field");
    return f ? (f.querySelector(".field-key") || {}).textContent : "no-label";
  });
  check("F5-03b · 中央执行者=秘书（非普通委员）", execLabel.includes("秘书"), execLabel);
  check("F5-03c · 席位卡：A1 上阶段已发言 / A3 等待秘书回答",
    (await page.locator("#seat-A1 .seat-state").innerText()).includes("上阶段已发言") &&
    (await page.locator("#seat-A3 .seat-state").innerText()).includes("等待秘书回答"),
    (await page.locator("#seat-A3 .seat-state").innerText()));
  /* 秘书真实 accept → 1/1 */
  await page.fill("#relay-paste", "{\"supporting_points\":[\"自研理由充分\"],\"opposing_points\":[\"成本压力\"],\"conflicts\":[\"周期评估\"],\"open_questions\":[\"人力是否足够\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  check("F5-04 · 接受按钮=「接受为正式秘书汇总」", (await page.locator("#relay-accept").innerText()).includes("秘书汇总"));
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("1/1");
  });
  check("F5-05 · 秘书 1/1 → READY_TO_ADVANCE", (await page.locator("#mt-advance").count()) === 1);
  await page.click("#mt-advance");
  /* Round 3 critique：委员 Prompt 共享同一份秘书汇总 */
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && el.value.includes("上一阶段秘书汇总") && el.value.includes("{\"supporting_points\":[\"自研理由充分\"],\"opposing_points\":[\"成本压力\"],\"conflicts\":[\"周期评估\"],\"open_questions\":[\"人力是否足够\"]}");
  });
  check("F5-06 · Round3 委员 Prompt 含同一份秘书汇总（shared_context）", true);
  await page.screenshot({ path: path.join(shotDirD3, "08-runtime-f1-six-seats.png"), fullPage: true });
}


/* ---------- F3：Center Workspace Simplification（L01..L10 × 4 视口，方案 T01/T03/T04/T05/T07/T08） ---------- */
async function runF3(page, vp) {
  const [w, h] = vp, tag = "L@" + w + "x" + h;
  await page.goto(appUrl);
  await page.setViewportSize({ width: w, height: h });
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* L01 页面本体无整体滚动（只有中央 workspace 滚） */
  const docDelta = await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight);
  check(tag + " · L01 页面本体无主要纵向滚动", docDelta <= 2, "delta=" + docDelta);

  /* L02 Timeline 固定可见（不进中央滚动区） */
  const tlBox = await page.locator("#tl-prev").boundingBox();
  check(tag + " · L02 Timeline 固定可见", !!tlBox && tlBox.y + tlBox.height <= h + 2);

  /* L03 席位可见 */
  const seatBox = await page.locator("#seat-A1").boundingBox().catch(() => null);
  check(tag + " · L03 席位可见", !!seatBox && seatBox.y < h);

  /* L04 中央 workspace 是唯一滚动容器 */
  const ws = await page.evaluate(() => {
    const el = document.getElementById("meeting-workspace");
    if (!el) return null;
    return { oy: getComputedStyle(el).overflowY };
  });
  check(tag + " · L04 中央 workspace 独立滚动容器", !!ws && ws.oy === "auto", JSON.stringify(ws));

  /* L05 创建 Mock Demo：无 record 常驻块 + 无校验块（T03/T04） */
  await page.click("#dev-tools summary");
  await page.click("#mt-create");
  await page.waitForSelector("#mt-phase");
  const notOfficial = await page.locator("#relay-not-official").count();
  const validation = await page.locator("#relay-validation").count();
  check(tag + " · L05 无常驻「尚未写入」块 + 无校验块", notOfficial === 0 && validation === 0,
    "notOfficial=" + notOfficial + " validation=" + validation);

  /* L06 relay 场景：Prompt/Response 主体高度可读（T05） */
  await page.click("#mt-create-relay");
  await page.waitForSelector("#relay-hint");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  const ph = await page.locator("#relay-prompt").evaluate((el) => el.clientHeight);
  const rh = await page.locator("#relay-paste").evaluate((el) => el.clientHeight);
  check(tag + " · L06 Prompt/Response 主体可读（≥140/≥170）", ph >= 140 && rh >= 170,
    "prompt=" + ph + " response=" + rh);

  /* L07 校验失败才出现轻提示（T03）——超长文本触发 V04 */
  await page.fill("#relay-paste", "x".repeat(20001));
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-validation");
  const failText = await page.locator("#relay-validation").innerText();
  check(tag + " · L07 校验 FAIL 才出现轻提示", failText.includes("校验问题"), failText);

  /* L08 校验通过静默（T03）——V04 被拒后回 idle，重新生成 */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-paste");
  await page.fill("#relay-paste", "{\"position\":\"加强情报收集\",\"reasons\":[\"谨慎行事\"],\"risks\":[\"阵型不稳\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => document.getElementById("relay-validation") === null);
  check(tag + " · L08 校验 PASS 静默（无校验块）", true);

  /* L09 中央滚动后席位不随中央滚走（T07）——滚动前后同状态比较 */
  const seatBox1 = await page.locator("#seat-A1").boundingBox().catch(() => null);
  await page.evaluate(() => {
    const el = document.getElementById("meeting-workspace");
    if (el) el.scrollTop = el.scrollHeight;
  });
  const seatBox2 = await page.locator("#seat-A1").boundingBox().catch(() => null);
  check(tag + " · L09 席位不随中央滚动走", !!seatBox2 && !!seatBox1 && Math.abs(seatBox2.y - seatBox1.y) < 2);

  /* L10 控件 overlap = 0（workspace 内交互元素两两不相交，T08） */
  const overlaps = await page.evaluate(() => {
    const wsEl = document.getElementById("meeting-workspace");
    if (!wsEl) return -1;
    const els = Array.from(wsEl.querySelectorAll("button, textarea, select, input"))
      .filter((e) => e.offsetParent !== null);
    let bad = 0;
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
        if (!(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1)) bad++;
      }
    }
    return bad;
  });
  check(tag + " · L10 控件 overlap = 0", overlaps === 0, "overlaps=" + overlaps);
}


/* ---------- F1：One-Screen 硬验收 + 席位编辑恢复（ONE-SCREEN-F1 方案） ---------- */
const PID_OF_SEAT = { A1: "agent-a1", A2: "agent-a2", A3: "agent-a3", B1: "agent-b1", B2: "agent-b2", B3: "agent-b3" };
const ALL_SEATS = ["A1", "A2", "A3", "B1", "B2", "B3"];
const seatConfigShows = (page, seatId) =>
  page.waitForFunction((id) => {
    const h = document.querySelector("#seat-config h2");
    return h && h.textContent.includes(id);
  }, seatId);

async function runF1(page) {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.clear());   /* 可重复运行：清上次遗留的席位配置 */
  await page.reload();                               /* 清后重载，确保 start() 读到干净存储 */
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* F01/F02：1366×768 主门禁——页面框架无滚动条（F3：中央内容由 meeting-workspace 滚动，不压内容） */
  await page.setViewportSize({ width: 1366, height: 768 });
  const noScrollFrame = await page.evaluate(() => {
    /* 无滚动条 = 页面本体不滚 + 左/右栏 overflow hidden（内容由各自容器裁剪，不产生滚动条）；中央由 workspace 滚动。 */
    const doc = document.scrollingElement;
    const oy = (id) => getComputedStyle(document.getElementById(id)).overflowY;
    return doc.scrollHeight <= doc.clientHeight + 1 &&
      oy("console-left") === "hidden" && oy("console-right") === "hidden" && oy("console") !== "auto";
  });
  const wsOverflow = await page.evaluate(() => {
    const el = document.getElementById("meeting-workspace");
    return !!el && getComputedStyle(el).overflowY === "auto";
  });
  check("F01 · 1366×768：页面/左/右无滚动条，中央 workspace 为滚动容器（F3）", noScrollFrame && wsOverflow);
  for (const s of ALL_SEATS) {
    const v = await page.locator("#seat-" + s).isVisible();
    check("F02 · 1366×768 席位 " + s + " 完整可见", v);
    if (!v) break;
  }

  /* F03：1920×1080 / 1600×900 无整体纵向滚动 */
  for (const vp of [[1920, 1080], [1600, 900]]) {
    await page.setViewportSize({ width: vp[0], height: vp[1] });
    const sc = await page.evaluate(() => document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight);
    check("F03 · " + vp[0] + "×" + vp[1] + " 无整体纵向滚动", !sc);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  const sc720 = await page.evaluate(() => document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight);
  check("F03b · 1280×720 无整体纵向滚动（compact）", !sc720);
  await page.setViewportSize({ width: 1366, height: 768 });

  /* F04：六席「配置」按钮逐一可进入（创建前） */
  for (const s of ALL_SEATS) {
    await page.click("#seat-" + s);
    await seatConfigShows(page, s);
    check("F04 · 席位 " + s + " 可进入配置", await page.locator("#seat-config").isVisible());
  }

  /* F05-F09：创建会议后字段级冻结——角色锁，模型/传输/立场/备注放开（T05） */
  await page.click("#seat-A1");
  await seatConfigShows(page, "A1");
  await page.fill("#cfg-title", "F1 冻结解耦验收");
  await page.dispatchEvent("#cfg-title", "change");
  await page.fill("#cfg-topic", "F1 席位热改议题");
  await page.dispatchEvent("#cfg-topic", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");   /* F1：正式建会先点名 */
  const pfDisabled = await page.locator("#preflight-start").isDisabled();
  check("S09b · 六席点名全部已入会（开始 Round 1 可用）", !pfDisabled);
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  await page.click("#seat-A1");
  await seatConfigShows(page, "A1");
  check("F05 · 创建后角色下拉冻结", await page.locator("#cfg-role-agent-a1").isDisabled());
  check("F06 · 创建后 model_ref 仍可编辑", !(await page.locator("#cfg-model-ref-agent-a1").isDisabled()));
  check("F07 · 创建后传输方式仍可编辑", !(await page.locator("#cfg-transport-agent-a1").isDisabled()));
  check("F08 · 创建后立场仍可编辑", !(await page.locator("#cfg-stance-agent-a1").isDisabled()));
  check("F09 · 创建后备注仍可编辑", !(await page.locator("#cfg-note-agent-a1").isDisabled()));

  /* F10-F13：热改保存 → 自动回运行 + 席位卡刷新 + 会议参与者更新且历史不受污染 */
  const evBefore = await page.evaluate(() => AICouncil.HarnessStore.get().meeting.events.length);
  await page.fill("#cfg-model-ref-agent-a1", "claude-web");
  await page.dispatchEvent("#cfg-model-ref-agent-a1", "change");
  await page.fill("#cfg-url-agent-a1", "https://claude.ai/");
  await page.dispatchEvent("#cfg-url-agent-a1", "change");
  await page.click("#seat-config-save");
  await page.waitForFunction(() => document.getElementById("console-relay").style.display !== "none");
  check("F10 · 保存后自动返回会议运行模式",
    (await page.locator("#mode-run").getAttribute("class")).includes("active"));
  check("F11 · 保存后席位卡摘要立即刷新（Claude · claude-web）",
    (await page.locator("#seat-A1").innerText()).includes("Claude"));
  const modelRefNow = await page.evaluate(() => AICouncil.HarnessStore.get().meeting.participants[0].model_ref);
  check("F12 · 创建后热改 model_ref 写入会议 participants", modelRefNow === "claude-web", modelRefNow);
  const evAfter = await page.evaluate(() => AICouncil.HarnessStore.get().meeting.events.length);
  check("F13 · 配置保存不产生会议事件（历史快照零污染）", evBefore === evAfter,
    evBefore + " -> " + evAfter);

  /* F14：六席逐一保存（含备注）→ 刷新 → 配置保持（T06 持久化验收） */
  await clickDevBtn(page, "#mt-clear");
  await page.waitForFunction(() => !document.getElementById("cfg-title").disabled);
  for (const s of ALL_SEATS) {
    await page.click("#seat-" + s);
    await seatConfigShows(page, s);
    await page.fill("#cfg-note-" + PID_OF_SEAT[s], "F1备注-" + s);
    await page.dispatchEvent("#cfg-note-" + PID_OF_SEAT[s], "change");
    await page.click("#seat-config-save");
    await page.waitForFunction(() => document.getElementById("console-relay").style.display !== "none");
  }
  await page.click("#seat-A1");
  await seatConfigShows(page, "A1");
  await page.fill("#cfg-model-name-agent-a1", "我的模型甲");
  await page.dispatchEvent("#cfg-model-name-agent-a1", "change");
  await page.click("#seat-config-save");
  await page.waitForFunction(() => document.getElementById("console-relay").style.display !== "none");

  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  check("F14 · 刷新后 A1 席位卡显示名保持（我的模型甲）",
    (await page.locator("#seat-A1").innerText()).includes("我的模型甲"));
  for (const s of ALL_SEATS) {
    await page.click("#seat-" + s);
    await seatConfigShows(page, s);
    const note = await page.locator("#cfg-note-" + PID_OF_SEAT[s]).inputValue();
    check("F14 · 刷新后席位 " + s + " 备注保持", note === "F1备注-" + s, note);
  }

  /* F15-F18：底部 drawer 默认折叠 + 展开不挤压工作区 */
  check("F15 · 开发工具默认折叠（32px 条）",
    (await page.evaluate(() => document.getElementById("dev-tools").open)) === false);
  check("F16 · 时间线/审计日志默认折叠",
    (await page.evaluate(() => document.querySelector("#console-timeline details").open)) === false);
  const hBefore = await page.locator("#console").evaluate((el) => el.getBoundingClientRect().height);
  await openDevTools(page);
  await page.waitForTimeout(120);
  const hAfter = await page.locator("#console").evaluate((el) => el.getBoundingClientRect().height);
  check("F17 · drawer 展开不挤压主工作区高度", Math.abs(hBefore - hAfter) < 2,
    Math.round(hBefore) + " -> " + Math.round(hAfter));
  check("F18 · drawer 展开后 Demo 按钮可见可点", await page.locator("#mt-create-relay").isVisible());
  await page.screenshot({ path: path.join(shotDirD3, "07-one-screen-f1.png"), fullPage: true });
}

/* ---------- F2：Meeting HUD + Seat Edit Draft（MEETING-UX-F2 方案） ---------- */
async function runF2(page) {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* G01：HUD 存在 + 无会议占位 + 高度 ≤68px */
  check("G01 · Meeting HUD 存在", await page.locator("#meeting-hud").isVisible());
  check("G01b · 无会议 HUD 显示占位标题",
    (await page.locator("#hud-title").innerText()).includes("尚未创建会议"));
  const hudH = await page.evaluate(() => document.getElementById("meeting-hud").getBoundingClientRect().height);
  check("G01c · HUD 高度 ≤ 68px", hudH <= 68, "h=" + Math.round(hudH));

  /* G02：系统状态折叠（能力灯收进「系统 ● 正常」） */
  check("G02 · 系统状态折叠 summary 正常",
    (await page.locator("#sys-status-summary").innerText()).includes("系统 ● 正常"));
  const caps = await page.locator("#capabilities .capability").evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-ok")));
  check("G02b · 折叠层内 6 灯 data-ok 全部 1", caps.length === 6 && caps.every((v) => v === "1"),
    JSON.stringify(caps));

  /* G03：创建会议 → HUD 标题/议题/Round/Phase/状态 */
  await page.fill("#cfg-title", "F2 HUD 验收");
  await page.dispatchEvent("#cfg-title", "change");
  await page.fill("#cfg-topic", "F2 议题文本");
  await page.dispatchEvent("#cfg-topic", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");   /* F1：正式建会先点名 */
  const pfDisabled = await page.locator("#preflight-start").isDisabled();
  check("S09b · 六席点名全部已入会（开始 Round 1 可用）", !pfDisabled);
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  check("G03 · HUD 显示会议标题", (await page.locator("#hud-title").innerText()).includes("F2 HUD 验收"));
  check("G03b · HUD 显示议题", (await page.locator("#hud-topic").innerText()).includes("F2 议题文本"));
  check("G03c · HUD 显示 Round/Phase", (await page.locator("#hud-round").innerText()).includes("Round 1"));
  check("G03d · HUD 显示运行状态", (await page.locator("#hud-status").innerText()).includes("●"));

  /* G04：运行态会议配置折叠为摘要行（表单隐藏但契约 DOM 保留） */
  check("G04 · 运行态 cfg-title 仍可查 disabled（表单隐藏）", await page.locator("#cfg-title").isDisabled());
  check("G04b · 运行态创建按钮仍可见（C15 契约）", await page.locator("#cfg-create").isVisible());
  check("G04c · 运行态显示会议摘要行",
    (await page.locator("#config-summary-title").innerText()).includes("F2 HUD 验收"));

  /* G05：Seat Draft 防覆盖——A2 编辑中，A1 relay 回答到达（状态变化）不重建表单 */
  await page.click("#relay-open");                 /* A1 进入 waiting_external */
  await page.waitForSelector("#relay-prompt");
  await page.click("#seat-A2");
  await seatConfigShows(page, "A2");
  await page.fill("#cfg-model-ref-agent-a2", "deepseek");
  await page.dispatchEvent("#cfg-model-ref-agent-a2", "change");
  const refHandle = await page.evaluateHandle(() => document.getElementById("cfg-model-ref-agent-a2"));
  await page.evaluate(() => {                       /* 模拟后台回答到达（既有动作层，不经 UI） */
    AICouncil.WebRelayActions.paste('{"position":"F2 防覆盖验收","reasons":["理由"],"risks":["风险"]}');
    AICouncil.WebRelayActions.validate();
  });
  await page.waitForFunction(() => {
    const s = AICouncil.WebRelayActions.activeSession(AICouncil.HarnessStore.get().meeting);
    return s && s.state === "validated";
  });
  const sameRef = await page.evaluate((h) => document.getElementById("cfg-model-ref-agent-a2") === h, refHandle);
  check("G05 · relay 状态变化后编辑框未被重建", sameRef);
  const valA = await page.locator("#cfg-model-ref-agent-a2").inputValue();
  check("G05b · 未保存输入保持（deepseek 不丢）", valA === "deepseek", valA);

  /* G06：timer 局部更新（只改文本，不重建表单） */
  const t1 = await page.locator("#meeting-timer").innerText();
  await page.waitForTimeout(2200);
  const t2 = await page.locator("#meeting-timer").innerText();
  check("G06 · timer 每秒局部更新", t1 !== t2, t1 + " -> " + t2);
  const sameRef2 = await page.evaluate((h) => document.getElementById("cfg-model-ref-agent-a2") === h, refHandle);
  check("G06b · timer 更新不重建编辑框", sameRef2);
  const valB = await page.locator("#cfg-model-ref-agent-a2").inputValue();
  check("G06c · timer 更新后输入仍保持", valB === "deepseek", valB);

  /* G07：dirty 草稿跨席位保留（切 A1 再回 A2 值不丢） */
  await page.click("#seat-A1");
  await seatConfigShows(page, "A1");
  await page.click("#seat-A2");
  await seatConfigShows(page, "A2");
  const valC = await page.locator("#cfg-model-ref-agent-a2").inputValue();
  check("G07 · 切席再回草稿保留", valC === "deepseek", valC);

  /* G08：保存 → 草稿清除 → 持久化值落库 */
  await page.click("#seat-config-save");
  await page.waitForFunction(() => document.getElementById("console-relay").style.display !== "none");
  await page.click("#seat-A2");
  await seatConfigShows(page, "A2");
  const valD = await page.locator("#cfg-model-ref-agent-a2").inputValue();
  check("G08 · 保存后回配置显示持久化值", valD === "deepseek", valD);
  check("G08b · 保存后草稿已清除",
    (await page.evaluate(() => AICouncil.SeatEditDraft.isDirty("agent-a2"))) === false);

  /* G09：创建前保存 model_ref → 刷新 → 保持（T07 持久化） */
  await clickDevBtn(page, "#mt-clear");
  await page.waitForFunction(() => !document.getElementById("cfg-title").disabled);
  await page.click("#seat-A2");
  await seatConfigShows(page, "A2");
  await page.fill("#cfg-model-ref-agent-a2", "deepseek-v3");
  await page.dispatchEvent("#cfg-model-ref-agent-a2", "change");
  await page.click("#seat-config-save");
  await page.waitForFunction(() => document.getElementById("console-relay").style.display !== "none");
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.click("#seat-A2");
  await seatConfigShows(page, "A2");
  const valE = await page.locator("#cfg-model-ref-agent-a2").inputValue();
  check("G09 · 刷新后 model_ref 持久化保持", valE === "deepseek-v3", valE);
  await page.screenshot({ path: path.join(shotDirD3, "08-meeting-hud-f2.png"), fullPage: true });
}

/* ---------- F2-F1：Seat Runtime Fields Unlock（MEETING-UX-F2-F1 真人路径） ---------- */
async function runF2F1(page) {
  await page.goto(appUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);

  /* H01：创建会议后六席全部「模型运行字段」可编辑（含无 profile 席位），角色 identity 冻结 */
  await page.fill("#cfg-title", "F2-F1 席位字段解锁");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");   /* F1：正式建会先点名 */
  const pfDisabled = await page.locator("#preflight-start").isDisabled();
  check("S09b · 六席点名全部已入会（开始 Round 1 可用）", !pfDisabled);
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");
  for (const sid of ["A1", "A2", "A3", "B1", "B2", "B3"]) {
    const pid = PID_OF_SEAT[sid];
    await page.click("#seat-" + sid);
    await seatConfigShows(page, sid);
    check("H01 · " + sid + " 模型名称可编辑", !(await page.locator("#cfg-model-name-" + pid).isDisabled()));
    check("H01b · " + sid + " 模型网页可编辑", !(await page.locator("#cfg-url-" + pid).isDisabled()));
    check("H01c · " + sid + " 模型引用可编辑", !(await page.locator("#cfg-model-ref-" + pid).isDisabled()));
    check("H01d · " + sid + " 传输方式可编辑", !(await page.locator("#cfg-transport-" + pid).isDisabled()));
    check("H01e · " + sid + " 角色冻结（identity）", await page.locator("#cfg-role-" + pid).isDisabled());
  }

  /* H02：A2 三字段输入 → timer 2.5s + relay 回答到达 → 值/元素保持 */
  await page.click("#seat-config-cancel");   /* 退出 H01 遗留的 seat 配置，回运行 */
  await page.waitForFunction(() => document.getElementById("console-relay").style.display !== "none");
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.click("#seat-A2");
  await seatConfigShows(page, "A2");
  await page.fill("#cfg-model-name-agent-a2", "DeepSeek V4 Flash");
  await page.dispatchEvent("#cfg-model-name-agent-a2", "change");
  await page.fill("#cfg-model-ref-agent-a2", "deepseek");
  await page.dispatchEvent("#cfg-model-ref-agent-a2", "change");
  await page.fill("#cfg-url-agent-a2", "https://chat.deepseek.com/");
  await page.dispatchEvent("#cfg-url-agent-a2", "change");
  const nmHandle = await page.evaluateHandle(() => document.getElementById("cfg-model-name-agent-a2"));
  const urlHandle = await page.evaluateHandle(() => document.getElementById("cfg-url-agent-a2"));
  const t1 = await page.locator("#meeting-timer").innerText();
  await page.waitForTimeout(2500);
  const t2 = await page.locator("#meeting-timer").innerText();
  check("H02 · timer 持续变化", t1 !== t2, t1 + " -> " + t2);
  await page.evaluate(() => {
    AICouncil.WebRelayActions.paste('{"position":"F2-F1 验收","reasons":["理由"],"risks":["风险"]}');
    AICouncil.WebRelayActions.validate();
  });
  await page.waitForFunction(() => {
    const s = AICouncil.WebRelayActions.activeSession(AICouncil.HarnessStore.get().meeting);
    return s && s.state === "validated";
  });
  check("H02b · 模型名称元素未重建",
    await page.evaluate((h) => document.getElementById("cfg-model-name-agent-a2") === h, nmHandle));
  check("H02c · 模型网页元素未重建",
    await page.evaluate((h) => document.getElementById("cfg-url-agent-a2") === h, urlHandle));
  check("H02d · 模型名称值保持",
    (await page.locator("#cfg-model-name-agent-a2").inputValue()) === "DeepSeek V4 Flash");
  check("H02e · 模型引用值保持",
    (await page.locator("#cfg-model-ref-agent-a2").inputValue()) === "deepseek");
  check("H02f · 模型网页值保持",
    (await page.locator("#cfg-url-agent-a2").inputValue()) === "https://chat.deepseek.com/");

  /* H03：保存 → profile 自动创建 → 席位卡刷新 → 刷新页面三字段保持 */
  await page.click("#seat-config-save");
  await page.waitForFunction(() => document.getElementById("console-relay").style.display !== "none");
  const profs = await page.evaluate(() => {
    const p = AICouncil.RelayProfiles.findByModelRef(AICouncil.ConsoleActions.getProfiles(), "deepseek");
    return p ? { display_name: p.display_name, web_url: p.web_url } : null;
  });
  check("H03 · deepseek profile 自动创建并落库",
    !!profs && profs.display_name === "DeepSeek V4 Flash" && profs.web_url === "https://chat.deepseek.com/",
    JSON.stringify(profs));
  check("H03b · 席位卡立即刷新显示新模型名",
    (await page.locator("#seat-A2").innerText()).includes("DeepSeek V4 Flash"));
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.click("#seat-A2");
  await seatConfigShows(page, "A2");
  check("H03c · 刷新后模型名称保持",
    (await page.locator("#cfg-model-name-agent-a2").inputValue()) === "DeepSeek V4 Flash");
  check("H03d · 刷新后模型引用保持",
    (await page.locator("#cfg-model-ref-agent-a2").inputValue()) === "deepseek");
  check("H03e · 刷新后模型网页保持",
    (await page.locator("#cfg-url-agent-a2").inputValue()) === "https://chat.deepseek.com/");
  await page.screenshot({ path: path.join(shotDirD3, "09-seat-runtime-unlock.png"), fullPage: true });
}

/* ---------- MEETING-INTEGRITY-F1-B：Response Validation Pipeline E2E（M01 合法 / M02 尾巴 / M03 缺字段 / M04 修正恢复 / M05 battle 缺小节） ---------- */
async function runF1B(page) {
  const OK_OPEN = '{"position":"支持自研","reasons":["架构可控"],"risks":["周期长"]}';
  const OK_SUM = '{"supporting_points":["自研理由充分"],"opposing_points":["成本压力"],"conflicts":["周期评估"],"open_questions":["人力是否足够"]}';
  const OK_CRIT = '{"challenges":["成本被低估"]}';
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.evaluate(() => {
    const d = AICouncil.ConsoleActions.getDraft();
    d.participants.forEach((p) => { if (p.participant_id !== "agent-a1" && p.participant_id !== "agent-a3" && p.participant_id !== "agent-b1") p.model_ref = ""; });
    AICouncil.ConsoleActions.persistDraft();
  });
  await page.fill("#cfg-title", "F1B 校验管线");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");

  /* M01：合法 JSON → accepted 并推进 */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", OK_OPEN);
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  check("F1B-M01 · 合法 JSON → validated（V01–V06 全过）", true);
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("1/2");
  });
  check("F1B-M01b · accepted 后 1/2 正常推进", true);
  await clickDevBtn(page, "#mt-step");   /* B1 mock（dev-tools drawer 内） */
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("2/2");
  });
  await page.click("#mt-advance");

  /* summary：A3 秘书自动开 → M02：JSON+尾巴 → V06 拦截，不推进 */
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", OK_SUM + "\n\n这就是我的总结。");
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-validation");
  check("F1B-M02 · JSON+尾巴 → ⚠ 校验问题卡出现", true);
  const navAfterBad = await page.locator("#seat-nav-current").innerText();
  check("F1B-M02b · 不推进（秘书仍 0/1）", navAfterBad.includes("0/1"), navAfterBad);
  check("F1B-M02c · 无「进入下一阶段」按钮", (await page.locator("#mt-advance").count()) === 0);

  /* M03：缺字段 → Schema FAIL（V06 被拒后回 idle，重新 relay-open 再提交） */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-paste");
  await page.fill("#relay-paste", '{"supporting_points":["自研理由充分"],"opposing_points":["成本压力"],"conflicts":["周期评估"]}');
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-validation");
  check("F1B-M03 · 缺 open_questions → 校验问题卡出现", true);

  /* M04：修正后重新提交 → 合法 → accepted → 1/1 → 推进 */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-paste");
  await page.fill("#relay-paste", OK_SUM);
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  check("F1B-M04 · 修正后 validated", true);
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("1/1");
  });
  check("F1B-M04b · 秘书 accepted → 1/1", true);
  await page.click("#mt-advance");

  /* critique：A1 自动开 → 合法 → accept → B1 mock → 2/2 → human gate */
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", OK_CRIT);
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("1/2");
  });
  await clickDevBtn(page, "#mt-step");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("2/2");
  });
  await page.click("#mt-advance");
  await page.waitForSelector("#mt-battle");
  check("F1B-M04c · Human Gate 出现且可进入对辩", true);
  await page.click("#mt-battle");

  /* M05：battle text contract——缺 rebuttal → V06 拦截，不推进（battle 经 human gate 进入，手动 open） */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "claim\n自研可行。\n\nremaining_uncertainty\n周期未定。");
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-validation");
  check("F1B-M05 · battle 缺 rebuttal → 校验问题卡出现", true);
  const navBattle = await page.locator("#seat-nav-current").innerText();
  check("F1B-M05b · battle 不推进（0/2）", navBattle.includes("0/2"), navBattle);
  check("F1B-M05c · 详情含 V06", (await page.locator("#relay-verdict-toggle").count()) === 1);
}

/* ---------- MEETING-INTEGRITY-F1-A：Phase Context Snapshot E2E（S01 opening 独立 / S03 critique 只共享已完成阶段） ---------- */
async function runF1A(page) {
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /可用规则 1 · 已隔离 0/);
  await page.evaluate(() => {
    const d = AICouncil.ConsoleActions.getDraft();
    d.participants.forEach((p) => {
      if (p.participant_id === "agent-b1") p.transport_kind = "web_relay";   /* B1 也走真实中继 */
      else if (p.participant_id !== "agent-a1" && p.participant_id !== "agent-a3") p.model_ref = "";
    });
    AICouncil.ConsoleActions.persistDraft();
  });
  await page.fill("#cfg-title", "F1A 上下文冻结");
  await page.dispatchEvent("#cfg-title", "change");
  await page.click("#cfg-create");
  await page.waitForSelector("#preflight-start");
  await page.click("#preflight-start");
  await page.waitForSelector("#relay-hint");

  /* S01：A1 accept 后 B1 自动开 → Prompt 不含 A1 本轮 Opening（snapshot 空引用） */
  await page.click("#relay-open");
  await page.waitForSelector("#relay-prompt");
  await page.fill("#relay-paste", "{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && el.value.includes("风险挑战方");
  });
  const b1PromptS01 = await page.locator("#relay-prompt").inputValue();
  check("F1A-S01 · opening：B1 Prompt 不含 A1 本轮 Opening（0 命中）",
    !b1PromptS01.includes("支持继续自研") && !b1PromptS01.includes("上一阶段正式发言"), b1PromptS01.slice(0, 60));

  /* B1 完成 Opening → 2/2 → advance */
  await page.fill("#relay-paste", "{\"position\":\"反对，风险过高\",\"reasons\":[\"成本压力\"],\"risks\":[\"进度失控\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("2/2");
  });
  check("F1A-S01b · Opening 2/2 → READY_TO_ADVANCE", (await page.locator("#mt-advance").count()) === 1);
  await page.click("#mt-advance");

  /* summary：A3 秘书自动开 → 仍注入双方 Opening 原文（F5 链保留） */
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && el.value.includes("{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}") && el.value.includes("{\"position\":\"反对，风险过高\",\"reasons\":[\"成本压力\"],\"risks\":[\"进度失控\"]}");
  });
  const secPrompt = await page.locator("#relay-prompt").inputValue();
  check("F1A-S01c · 秘书 Prompt 仍含双方 Opening 原文",
    secPrompt.includes("{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}") && secPrompt.includes("{\"position\":\"反对，风险过高\",\"reasons\":[\"成本压力\"],\"risks\":[\"进度失控\"]}"), secPrompt.slice(0, 60));
  await page.fill("#relay-paste", "{\"supporting_points\":[\"自研理由充分\"],\"opposing_points\":[\"成本压力\"],\"conflicts\":[\"周期评估\"],\"open_questions\":[\"人力是否足够\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("seat-nav-current");
    return el && el.textContent.includes("1/1");
  });
  await page.click("#mt-advance");

  /* critique：A1 先答 critique → B1 可见 Opening+秘书汇总、不可见 A1 的 Critique */
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && el.value.includes("上一阶段秘书汇总") && el.value.includes("{\"supporting_points\":[\"自研理由充分\"],\"opposing_points\":[\"成本压力\"],\"conflicts\":[\"周期评估\"],\"open_questions\":[\"人力是否足够\"]}");
  });
  await page.fill("#relay-paste", "{\"challenges\":[\"秘书摘要漏掉了成本风险\"]}");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-state-raw");
    return el && el.textContent.includes("validated");
  });
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-prompt");
    return el && el.value && el.value.includes("风险挑战方");
  });
  const b1PromptS03 = await page.locator("#relay-prompt").inputValue();
  check("F1A-S03 · critique：B1 可见 Opening 原文 + 秘书汇总",
    b1PromptS03.includes("{\"position\":\"支持继续自研\",\"reasons\":[\"架构可控\"],\"risks\":[\"周期长\"]}") && b1PromptS03.includes("{\"supporting_points\":[\"自研理由充分\"],\"opposing_points\":[\"成本压力\"],\"conflicts\":[\"周期评估\"],\"open_questions\":[\"人力是否足够\"]}"), b1PromptS03.slice(0, 60));
  check("F1A-S03b · critique：B1 不可见 A1 同阶段 Critique",
    !b1PromptS03.includes("A1 的批判意见"), b1PromptS03.slice(0, 60));
}

/* ---------- 测试页（TEST PAGE） ---------- */
async function runTestPage(page) {
  await page.goto(testUrl);
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /总计/);
  const text = await statusText(page);
  const m = /总计 (\d+) · 通过 (\d+) · 失败 (\d+)/.exec(text);
  const total = m ? +m[1] : 0, passed = m ? +m[2] : 0, failed = m ? +m[3] : 0;
  const badDetail = failed ? await page.locator("#output .entry.bad").allInnerTexts() : [];
  check("D1 测试页：通过数 ≥ 15 且失败 0", passed >= 15 && failed === 0,
    text + (badDetail.length ? "\n   失败项：" + badDetail.join(" | ") : ""));
  await page.screenshot({ path: path.join(shotDirD1, "03-tests.png"), fullPage: true });
}

async function runChannel(channel) {
  console.log("\n=== " + channel + " ===");
  const browser = await chromium.launch({ channel, headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  page.on("pageerror", (e) => check(channel + " · 页面无 JS 错误", false, String(e.message)));
  page.on("console", (msg) => { if (msg.type() === "error") check(channel + " · 控制台无 error", false, msg.text()); });

  await runD1(page);
  await runD2(page);
  await runD3(page);
  await runD4(page);
  await runD5(page);
  await runD6(page);
  await runD7(page);
  await runF1RT(page);
  for (const vp of [[1366, 768], [1440, 900], [1792, 856], [1920, 1080]]) await runF3(page, vp);
  await runF1(page);
  await runF2(page);
  await runF2F1(page);
  await runF1A(page);
  await runF1B(page);
  await runTestPage(page);

  await browser.close();
}

(async () => {
  fs.mkdirSync(shotDirD1, { recursive: true });
  fs.mkdirSync(shotDirD2, { recursive: true });
  fs.mkdirSync(shotDirD3, { recursive: true });
  for (const channel of ["chrome"]) await runChannel(channel);
  const failed = checks.filter((c) => !c.ok);
  console.log("\n总计 " + checks.length + " · 通过 " + (checks.length - failed.length) + " · 失败 " + failed.length);
  process.exit(failed.length ? 1 : 0);
})();
