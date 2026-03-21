import { chromium } from "playwright";
import fetch from "node-fetch";

// ===== 环境变量 =====
const ACCOUNT = process.env.ACCOUNT; // 邮箱-----密码
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// ===== 工具函数 =====
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function sendTG(msg) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;

  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text: msg
    })
  });
}

// ===== 获取 token（核心）=====
async function getToken(page) {
  return await page.evaluate(() => {
    for (let key in localStorage) {
      try {
        const obj = JSON.parse(localStorage[key]);
        if (obj?.lastActiveSession?.lastActiveToken?.jwt) {
          return obj.lastActiveSession.lastActiveToken.jwt;
        }
      } catch {}
    }
    return null;
  });
}

// ===== API =====
async function getServers(token) {
  const res = await fetch("https://api.pella.app/user/servers", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();
  return data.servers || [];
}

async function renewServer(token, link) {
  const id = link.split("/renew/")[1];
  if (!id) return false;

  const res = await fetch(`https://api.pella.app/server/renew?id=${id}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await res.json();
  return data.success;
}

// ===== 核心逻辑 =====
async function processAccount(account) {
  console.log("处理账号:", account.email);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let total = 0;

  try {
    // ===== 登录 =====
    await page.goto("https://www.pella.app/login");

    await page.getByLabel("Email address").fill(account.email);
    await page.click("button.cl-formButtonPrimary");

    await page.waitForSelector('input[name="password"]');
    await page.fill('input[name="password"]', account.password);
    await page.click("button.cl-formButtonPrimary");

    await page.waitForLoadState("networkidle");

    console.log("✅ 登录成功");

    // ===== 获取 token =====
    const token = await getToken(page);

    if (!token) throw new Error("获取 token 失败");

    console.log("✅ Token OK");

    // ===== 获取服务器 =====
    const servers = await getServers(token);

    if (servers.length === 0) {
      console.log("⚠️ 没有服务器");
    }

    // ===== 续期 =====
    for (const server of servers) {
      const links = server.renew_links || [];
      const available = links.filter(l => !l.claimed);

      console.log(`服务器 ${server.id} 可用: ${available.length}`);

      if (available.length === 0) continue;

      for (const link of available) {
        const ok = await renewServer(token, link.link);

        if (ok) {
          total++;
          console.log("✔ 续期成功");
        } else {
          console.log("❌ 续期失败");
        }

        await delay(2000);
      }
    }

    await sendTG(`✅ Pella完成
账号: ${account.email}
续期次数: ${total}`);

  } catch (e) {
    console.log("❌ 错误:", e.message);

    await sendTG(`❌ Pella失败
账号: ${account.email}
错误: ${e.message}`);
  }

  await browser.close();
}

// ===== 解析账号 =====
function parseAccounts() {
  return ACCOUNT.split("\n")
    .filter(l => l.includes("-----"))
    .map(l => {
      const [email, password] = l.split("-----");
      return { email: email.trim(), password: password.trim() };
    });
}

// ===== 入口 =====
(async () => {
  const accounts = parseAccounts();

  for (const acc of accounts) {
    await processAccount(acc);
    await delay(3000);
  }

  console.log("🎉 全部完成");
})();
