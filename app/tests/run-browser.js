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

  await page.click("#mt-step");
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
  for (let i = 0; i < 10; i++) {
    if (!(await page.locator("#mt-step").isEnabled())) break;
    await page.locator("#mt-step").click();
    await page.waitForTimeout(150);
  }
  const finalStatus = await page.locator("#mt-status-raw").innerText();
  check("D2 · Mock 步进停在 Human Gate（waiting_human）", finalStatus === "waiting_human", finalStatus);
  check("D2 · Human Gate 上 Mock 按钮已禁用（不替人类决策）",
    !(await page.locator("#mt-step").isEnabled()));
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

  await page.fill("#relay-paste", "建议：控制风险敞口，分批建仓，关注情报收集。");
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-validation");
  check("B12 · 校验状态为「通过」",
    (await page.locator("#relay-validation").innerText()).includes("通过"));

  const checkItems = await page.locator(".checks li").evaluateAll((els) =>
    els.map((e) => ({ id: e.textContent.trim().split(" ")[0], ok: e.className.includes("ok") })));
  check("B13 · V01–V05 五条校验全亮",
    checkItems.length === 5 && checkItems.every((c) => c.ok), JSON.stringify(checkItems));

  check("B14 · 中继状态为中文「校验通过」",
    (await page.locator("#relay-state").innerText()) === "校验通过");
  check("B15 · 内部状态为机器值「validated」",
    (await page.locator("#relay-state-raw").innerText()).includes("validated"));
  check("B16 · 存在「尚未写入正式会议记录」警告",
    (await page.locator("#relay-not-official").innerText()).includes("尚未写入正式会议记录"));
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
  await page.fill("#relay-paste", "建议：加强情报收集，谨慎行事，保持阵型稳定。");
  await page.click("#relay-submit");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-validation");
    return el && el.textContent.includes("通过");
  });
  check("B23 · 被拒后重新生成提示词并粘贴有效回答 → 校验通过",
    (await page.locator("#relay-validation").innerText()).includes("通过"));
  await page.click("#relay-accept");
  await page.waitForFunction(() => {
    const el = document.getElementById("relay-msg");
    return el && el.textContent.includes("已接受为正式发言");
  });
  check("B24 · 第二次接受成功并写入会议记录",
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
  await page.fill("#relay-paste", "六席验收回答：同意继续自研。");
  await page.click("#relay-submit");
  await page.waitForSelector("#relay-validation");
  check("S13 · response 流程仍成立（校验通过）",
    (await page.locator("#relay-validation").innerText()).includes("通过"));
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

  /* F01/F02：1366×768 主门禁——页面/三栏/控制台无纵向滚动 + 六席同时完整可见 */
  await page.setViewportSize({ width: 1366, height: 768 });
  const noScrollAll = await page.evaluate(() => {
    const ok = (el) => el.scrollHeight <= el.clientHeight + 1;
    return ok(document.scrollingElement) && ok(document.getElementById("console")) &&
      ok(document.getElementById("console-left")) && ok(document.getElementById("console-center")) &&
      ok(document.getElementById("console-right"));
  });
  check("F01 · 1366×768：页面/控制台/左/中/右均无纵向滚动条", noScrollAll);
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

/* ---------- 自动测试页（D1-R1 用例） ---------- */
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
  await runF1(page);
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
