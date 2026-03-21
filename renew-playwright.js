import { chromium } from "playwright";
import fetch from "node-fetch";

// ===== TG 配置 =====
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

async function sendTG(message) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: message
      })
    });
  } catch (e) {
    console.log("TG发送失败:", e.message);
  }
}

const ACCOUNT_JSON = process.env.ACCOUNT_JSON;

async function processAccount(account) {
  console.log("\n====================");
  console.log("📧 账号:", account.email);

  let claimCount = 0;

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ===== 1. 登录 =====
    await page.goto("https://www.pella.app/login", {
      waitUntil: "networkidle"
    });

    await page.getByLabel("Email address").fill(account.email);
    await page.click('button.cl-formButtonPrimary');

    await page.waitForSelector('input[name="password"]', { timeout: 20000 });
    await page.fill('input[name="password"]', account.password);
    await page.click('button.cl-formButtonPrimary');

    await page.waitForLoadState("networkidle");

    try {
      await page.waitForSelector("text=Your Projects", { timeout: 15000 });
    } catch {
      console.log("⚠️ 项目列表加载慢，延时兜底");
      await page.waitForTimeout(8000);
    }

    console.log("✅ 登录成功");

    // ===== 2. 点击项目 =====
    const project = page.locator('div:has-text("Your Projects") ~ div >> div').first();

    if (await project.isVisible()) {
      await project.click();
      console.log("📂 进入项目");
    }

    await page.waitForTimeout(5000);

    // ===== 3. 进入 renew 页面 =====
    await page.goto("https://www.pella.app/renew", {
      waitUntil: "networkidle"
    });

    console.log("🔄 进入 renew 页面");

    await page.waitForTimeout(8000);

    // ===== 4. 查找 Claim 按钮 =====
    const claimButtons = page.locator('button:has-text("Claim"), a:has-text("Claim")');
    const count = await claimButtons.count();

    if (count === 0) {
      console.log("⚠️ 没有可用广告");

      await sendTG(`⚠️ Pella无广告
账号: ${account.email}
状态: 没有Claim按钮`);

      await browser.close();
      return;
    }

    console.log(`🎯 找到 ${count} 个 Claim`);

    // ===== 5. 点击所有 Claim =====
    for (let i = 0; i < count; i++) {
      const btn = claimButtons.nth(i);

      console.log(`👉 点击第 ${i + 1} 个`);

      try {
        const [newPage] = await Promise.all([
          context.waitForEvent("page"),
          btn.click()
        ]);

        await newPage.waitForLoadState();
        await newPage.waitForTimeout(8000);
        await newPage.close();

      } catch (e) {
        console.log("⚠️ 新窗口失败，尝试直接点击");

        try {
          await btn.click();
          await page.waitForTimeout(8000);
        } catch {
          console.log("❌ 点击失败");
        }
      }

      claimCount++;
    }

    console.log("🎯 成功点击:", claimCount);

    // ===== 6. TG 通知 =====
    await sendTG(`✅ Pella完成
账号: ${account.email}
可用广告: ${count}
成功点击: ${claimCount}`);

  } catch (e) {
    console.log("❌ 错误:", e.message);

    await sendTG(`❌ Pella失败
账号: ${account.email}
错误: ${e.message}`);
  }

  await browser.close();
}

// ===== 入口 =====
(async () => {
  if (!ACCOUNT_JSON) {
    console.log("❌ 没有 ACCOUNT_JSON");
    return;
  }

  const accounts = ACCOUNT_JSON
    .split("\n")
    .filter(line => line.includes("-----"))
    .map(line => {
      const [email, password] = line.split("-----");
      return {
        email: email.trim(),
        password: password.trim()
      };
    });

  for (const acc of accounts) {
    await processAccount(acc);
  }

  console.log("\n🎉 全部账号执行完成");
})();
