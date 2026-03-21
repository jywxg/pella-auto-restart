import { chromium } from "playwright";
import fetch from "node-fetch";
import FormData from "form-data";

// ===== 环境变量 =====
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;
const ACCOUNT_JSON = process.env.ACCOUNT_JSON;

// ===== TG发图 =====
async function sendTGPhoto(buffer, caption) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  const form = new FormData();
  form.append("chat_id", TG_CHAT_ID);
  form.append("caption", caption);
  form.append("photo", buffer, {
    filename: "screenshot.png",
    contentType: "image/png"
  });

  const res = await fetch(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`,
    {
      method: "POST",
      headers: form.getHeaders(),
      body: form
    }
  );

  console.log("📨 TG返回:", await res.text());
}

// ===== 主逻辑 =====
async function processAccount(account) {
  console.log("\n====================");
  console.log("📧 账号:", account.email);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  try {
    // ===== 1. 登录 =====
    await page.goto("https://www.pella.app/login", {
      waitUntil: "networkidle"
    });

    await page.getByLabel("Email address").fill(account.email);
    await page.click("button.cl-formButtonPrimary");

    await page.waitForSelector('input[name="password"]', { timeout: 20000 });
    await page.fill('input[name="password"]', account.password);
    await page.click("button.cl-formButtonPrimary");

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    console.log("✅ 登录成功");

    // ===== 2. 进入项目 =====
    const cards = page.locator('[class*="cursor-pointer"]');
    const count = await cards.count();

    console.log("📦 项目数量:", count);

    if (count === 0) throw new Error("没有项目");

    await cards.first().click();
    console.log("📂 已进入项目");

    await page.waitForTimeout(8000);

    // ===== 3. 截图（点击前）=====
    const beforeShot = await page.screenshot({ fullPage: true });

    // ===== 4. 查找 Claim 按钮 =====
    const buttons = page.locator("button");
    const btnCount = await buttons.count();

    let claimClicked = 0;

    for (let i = 0; i < btnCount; i++) {
      const btn = buttons.nth(i);
      const text = await btn.innerText();

      if (text.includes("Claim")) {
        console.log("👉 点击:", text);

        claimClicked++;

        try {
          const [popup] = await Promise.all([
            context.waitForEvent("page").catch(() => null),
            btn.click()
          ]);

          if (popup) {
            await popup.waitForLoadState();
            await popup.waitForTimeout(8000);
            await popup.close();
          } else {
            await page.waitForTimeout(8000);
          }

          console.log("✅ Claim完成");

        } catch (e) {
          console.log("❌ 点击失败");
        }

        await page.waitForTimeout(3000);
      }
    }

    console.log("🎯 点击广告数量:", claimClicked);

    // ===== 5. 截图（点击后）=====
    const afterShot = await page.screenshot({ fullPage: true });

    // ===== 6. TG发送 =====
    await sendTGPhoto(
      beforeShot,
      `📋 Pella Before\n账号: ${account.email}\n点击数: ${claimClicked}`
    );

    await sendTGPhoto(
      afterShot,
      `📋 Pella After\n账号: ${account.email}\n点击数: ${claimClicked}`
    );

  } catch (err) {
    console.log("❌ 错误:", err.message);
  }

  await browser.close();
}

// ===== 入口 =====
(async () => {
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
})();
