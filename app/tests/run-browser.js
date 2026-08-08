/* AI Council v0.1 — 浏览器真机验收（仅开发期工具）。
 * 用真实 Chrome / Edge 打开 file:// 下的 index.html，不启动任何服务器。
 * 依赖 playwright-core（开发期），正式应用运行不依赖它，也不依赖 Node.js。
 *
 * 覆盖范围：
 *  - D1-R1：Protocols Tab 的目录发现 / Schema 隔离 / 冻结不动（A01..A04 类）。
 *  - D2-F1：Meeting + Compiler 两个 Tab 的真实点击链路（创建 / Mock 单步 / Human Gate / 编译 / Save-Load）。
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

const checks = [];
function check(label, condition, detail) {
  checks.push({ label, ok: !!condition, detail: detail || "" });
  console.log((condition ? "PASS  " : "FAIL  ") + label + (condition ? "" : "  → " + detail));
}

const statusText = (page) => page.locator("#status").innerText();
const waitStatus = (page, re) =>
  page.waitForFunction((src) => new RegExp(src).test(document.getElementById("status").textContent), re.source, { timeout: 30000 });

/* ---------- D1-R1：Protocols Tab ---------- */
async function runD1(page) {
  // 1. 选择仓库根目录，自动发现 schema/schemas/protocol.schema.json
  await page.goto(appUrl);
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /Available 1 · Invalid 0/);
  let text = await statusText(page);
  check("D1 · 仓库根目录：Available 1 / Invalid 0", /Available 1 · Invalid 0/.test(text), text);
  check("D1 · Schema 自动发现", (await page.locator(".card").first().innerText()).includes("schema/schemas/protocol.schema.json"));
  await page.screenshot({ path: path.join(shotDirD1, "01-repo-root.png"), fullPage: true });

  // 2. 选择无 schemas/ 的样例目录 → Session 应被阻塞
  await page.setInputFiles("#dir-input", fixtureDir);
  await waitStatus(page, /未初始化/);
  check("D1 · 缺少 Schema 时明确阻塞", (await page.locator("#output").innerText()).includes("SCHEMA_SOURCE_MISSING"));

  // 3. 指定正式 Schema 文件 → 隔离与重复检测
  await page.setInputFiles("#schema-input", schemaFile);
  await waitStatus(page, /Available/);
  text = await statusText(page);
  check("D1 · 样例目录：Available 2 / Invalid 4", /Available 2 · Invalid 4/.test(text), text);
  const body = await page.locator("#output").innerText();
  ["JSON_PARSE_FAILED", "SCHEMA_VALIDATION_FAILED", "DUPLICATE_PROTOCOL"].forEach((code) =>
    check("D1 · 隔离区显示 " + code, body.includes(code)));
  check("D1 · 合法规则不受坏规则影响", body.includes("good-a") && body.includes("good-c"));
  await page.locator("#output details").first().click();
  await page.screenshot({ path: path.join(shotDirD1, "02-quarantine.png"), fullPage: true });

  // 4. 第42题：改磁盘不刷新页面，Registry 必须不变
  const original = fs.readFileSync(brokenFile, "utf8");
  try {
    fs.writeFileSync(brokenFile, fs.readFileSync(path.join(fixtureDir, "protocols", "good-a", "protocol.json"), "utf8"));
    await page.waitForTimeout(2000);
    text = await statusText(page);
    check("D1 · 修改磁盘后 Registry 不变", /Available 2 · Invalid 4/.test(text), text);
  } finally {
    fs.writeFileSync(brokenFile, original);
  }
}

/* ---------- D2-F1：Meeting + Compiler Tab ---------- */
async function runD2F1(page) {
  await page.goto(appUrl);

  // A01：顶部徽标
  check("D2-F1 · 顶部徽标 = D2-F1 Integration Harness",
    (await page.locator(".badge").innerText()).includes("D2-F1 Integration Harness"));

  // A15：五个能力灯全亮
  const caps = await page.locator("#capabilities .capability").evaluateAll((els) =>
    els.map((e) => ({ name: e.getAttribute("data-capability"), ok: e.getAttribute("data-ok") })));
  check("D2-F1 · 五个能力灯（Protocol/Runtime/Persistence/Compiler/Renderer）全亮",
    caps.length === 5 && caps.every((c) => c.ok === "1"), JSON.stringify(caps));

  // 选择仓库根目录
  await page.setInputFiles("#dir-input", repoRoot);
  await waitStatus(page, /Available 1 · Invalid 0/);

  // A09：无 Meeting 时 Compiler Tab 必须禁用
  await page.click("#tab-btn-compiler");
  await page.waitForSelector("#cp-disabled");
  check("D2-F1 · 无 Meeting 时 Compiler 禁用并要求先建会",
    (await page.locator("#cp-disabled").innerText()).includes("Meeting"));

  // A03：Meeting Tab → Create Demo Meeting，停在 opening
  await page.click("#tab-btn-meeting");
  await page.waitForSelector("#mt-create");
  await page.click("#mt-create");
  await page.waitForSelector("#mt-phase");
  let phase = await page.locator("#mt-phase").innerText();
  check("D2-F1 · Create Demo 停在 opening", phase === "opening", phase);
  check("D2-F1 · 创建后 Received=0（不预跑）",
    (await page.locator("#mt-received").innerText()).includes("（无）"),
    await page.locator("#mt-received").innerText());
  await page.screenshot({ path: path.join(shotDirD2, "01-create-demo.png"), fullPage: true });

  // A04：执行下一步 Mock 一次，只消费一个步骤
  await page.click("#mt-step");
  await page.waitForFunction(() => document.getElementById("mt-received").textContent.includes("agent-a1"));
  check("D2-F1 · 单步后 Received 含 agent-a1",
    (await page.locator("#mt-received").innerText()).includes("agent-a1"));
  check("D2-F1 · 单步后 Phase 仍为 opening（不越 Phase）",
    (await page.locator("#mt-phase").innerText()) === "opening");

  // A10/A11：Compiler Tab 列出 3 个与会者并编译 A1
  await page.click("#tab-btn-compiler");
  await page.waitForSelector("#cp-participant-select");
  const optCount = await page.locator("#cp-participant-select option").count();
  check("D2-F1 · Participant 下拉严格 3 个（来自 participants[]）", optCount === 3, "option 数=" + optCount);
  const sel = page.locator("#cp-participant-select");
  await sel.selectOption({ value: "agent-a1" });
  await page.waitForSelector("#cp-packet-id");
  const promptA1 = await page.locator("#cp-prompt").inputValue();
  check("D2-F1 · 编译 A1 产出 packet_id 与 Rendered Prompt",
    (await page.locator("#cp-packet-id").innerText()).length > 0 && promptA1.length > 200,
    "prompt 长度=" + promptA1.length);
  check("D2-F1 · Packet Schema 校验通过",
    (await page.locator("#cp-schema-check").innerText()).includes("通过") ||
    (await page.locator("#cp-schema-check").getAttribute("class")).includes("ok"));
  check("D2-F1 · Prompt 含 A1 角色名", promptA1.includes("战略支持方"));
  await page.screenshot({ path: path.join(shotDirD2, "02-compile-a1.png"), fullPage: true });

  // A12：切换 B1 重编译，产物不同
  await sel.selectOption({ value: "agent-b1" });
  await page.waitForFunction(() => {
    const t = document.getElementById("cp-prompt");
    return t && t.value.includes("风险挑战方");
  });
  const promptB1 = await page.locator("#cp-prompt").inputValue();
  check("D2-F1 · 切换 B1 重编译出不同 Prompt 且用 B1 角色卡",
    promptB1 !== promptA1 && promptB1.includes("风险挑战方"));

  // A13：Rendered Prompt 用只读 textarea（Ctrl+A/Ctrl+C 复制，不破坏 local-first）
  const readonly = await page.locator("#cp-prompt").getAttribute("readonly");
  check("D2-F1 · Rendered Prompt 为只读 textarea（可键盘复制，无 Clipboard API）",
    readonly !== null && promptB1.length > 100);

  // A05/A06：回到 Meeting，一直步进到 Human Gate
  await page.click("#tab-btn-meeting");
  for (let i = 0; i < 10; i++) {
    if (!(await page.locator("#mt-step").isEnabled())) break;
    await page.locator("#mt-step").click();
    await page.waitForTimeout(150);
  }
  const finalStatus = await page.locator("#mt-status").innerText();
  check("D2-F1 · Mock 步进停在 Human Gate（waiting_human）", finalStatus === "waiting_human", finalStatus);
  check("D2-F1 · Human Gate 上 Mock 按钮已禁用（不替人类决策）",
    !(await page.locator("#mt-step").isEnabled()));
  check("D2-F1 · Human Gate 按钮 Finish 启用", await page.locator("#mt-finish").isEnabled());
  await page.screenshot({ path: path.join(shotDirD2, "03-human-gate.png"), fullPage: true });

  // A14：Save / Load 真实往返（下载 → 重新选择文件 → 恢复）
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
  check("D2-F1 · Save→Load 往返：恢复后 Phase 一致",
    (await page.locator("#mt-phase").innerText()) === phaseBeforeSave,
    "before=" + phaseBeforeSave + " after=" + (await page.locator("#mt-phase").innerText()));

  // A08：人工点 Finish → 终局 completed
  await page.click("#mt-finish");
  await page.waitForFunction(() => document.getElementById("mt-status").textContent === "completed");
  check("D2-F1 · 人工点 Finish 走向 completed（archive 自动终局）",
    (await page.locator("#mt-status").innerText()) === "completed");
  await page.screenshot({ path: path.join(shotDirD2, "04-finished.png"), fullPage: true });

  // 终局后 Compiler 应禁用
  await page.click("#tab-btn-compiler");
  await page.waitForSelector("#cp-disabled");
  check("D2-F1 · 会议结束后 Compiler 禁用（不得编译不存在的相位）",
    (await page.locator("#cp-disabled").innerText()).length > 0);
}

/* ---------- 自动测试页（D1-R1 用例，现 15 条） ---------- */
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
  await runD2F1(page);
  await runTestPage(page);

  await browser.close();
}

(async () => {
  fs.mkdirSync(shotDirD1, { recursive: true });
  fs.mkdirSync(shotDirD2, { recursive: true });
  for (const channel of ["chrome"]) await runChannel(channel);
  const failed = checks.filter((c) => !c.ok);
  console.log("\n总计 " + checks.length + " · 通过 " + (checks.length - failed.length) + " · 失败 " + failed.length);
  process.exit(failed.length ? 1 : 0);
})();
