import os
import json
import asyncio
from playwright.async_api import async_playwright
import requests

# TG 通知函数
def send_tg(msg):
    token = os.getenv('TG_BOT_TOKEN')
    chat_id = os.getenv('TG_CHAT_ID')
    if token and chat_id:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        requests.post(url, json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"})

async def run_pella():
    # 解析账号
    account_raw = os.getenv('ACCOUNT_JSON', '[]')
    if account_raw.startswith('['):
        accounts = json.loads(account_raw)
    else:
        accounts = []
        for line in account_raw.strip().split('\n'):
            if '-----' in line:
                u, p = line.split('-----')
                accounts.append({"email": u.strip(), "password": p.strip()})

    async with async_playwright() as p:
        # 启动浏览器 (无头模式)
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        
        report = []

        for acc in accounts:
            page = await context.new_page()
            email = acc['email']
            pwd = acc['password']
            
            try:
                print(f"正在登录账号: {email}")
                # 1. 访问登录页面
                await page.goto("https://pella.app/login", wait_until="networkidle")
                
                # 2. 模拟输入 (根据 Pella 登录框的选择器，通常是 identifier 和 password)
                await page.fill('input[name="identifier"]', email)
                await page.fill('input[name="password"]', pwd)
                await page.click('button[type="submit"]')
                
                # 等待进入控制台
                await page.wait_for_url("**/dashboard**", timeout=10000)
                await asyncio.sleep(5) # 等待列表加载
                
                # 3. 查找所有 RESTART / REDEPLOY 按钮
                # 根据你之前的截图，按钮文字通常是 RESTART
                buttons = await page.query_selector_all('button:has-text("RESTART")')
                
                if not buttons:
                    # 如果没找到按钮，可能是离线状态显示的是 START
                    buttons = await page.query_selector_all('button:has-text("START")')
                
                click_count = 0
                for btn in buttons:
                    await btn.click()
                    click_count += 1
                    await asyncio.sleep(2) # 间隔点击
                
                report.append(f"👤 {email}: ✅ 成功点击 {click_count} 个按钮")
                
            except Exception as e:
                print(f"账号 {email} 操作失败: {str(e)}")
                report.append(f"👤 {email}: ❌ 失败: {str(e)[:50]}")
            
            await page.close()

        await browser.close()
        
        # 发送汇总通知
        if report:
            msg = "🚀 <b>Pella 浏览器模拟维护完成</b>\n\n" + "\n".join(report)
            send_tg(msg)

if __name__ == "__main__":
    asyncio.run(run_pella())
