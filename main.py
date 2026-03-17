import os
import json
import time
import requests

def process_pella():
    # 1. 从环境变量读取账号信息
    account_raw = os.getenv('ACCOUNT_JSON', '[]')
    try:
        if account_raw.startswith('['):
            accounts = json.loads(account_raw)
        else:
            # 兼容 邮箱-----密码 格式
            accounts = []
            for line in account_raw.strip().split('\n'):
                if '-----' in line:
                    u, p = line.split('-----')
                    accounts.append({"email": u.strip(), "password": p.strip()})
    except Exception as e:
        print(f"❌ 账号解析失败: {e}")
        return

    for acc in accounts:
        email = acc.get('email')
        password = acc.get('password')
        print(f"\n👤 正在处理账号: {email}")

        try:
            # 2. 登录 Clerk 获取 JWT Token
            login_url = "https://clerk.pella.app/v1/client/sign_ins?__clerk_api_version=2025-11-10"
            login_data = {
                "identifier": email,
                "password": password,
                "strategy": "password"
            }
            login_res = requests.post(login_url, data=login_data)
            login_res.raise_for_status()
            
            token = login_res.json().get('client', {}).get('sessions', [{}])[0].get('last_active_token', {}).get('jwt')
            if not token:
                print(f"  ❌ 登录成功但未能获取 Token")
                continue
            
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

            # 3. 获取服务器列表
            server_res = requests.get("https://api.pella.app/user/servers", headers=headers)
            servers = server_res.json().get('servers', [])
            print(f"  ✅ 成功获取 {len(servers)} 个服务器")

            for s in servers:
                s_id = s.get('id')
                s_name = s.get('name', '未命名')
                status = s.get('status', '').lower()
                
                # 4. 判定动作：离线用 start，在线但异常用 redeploy (Restart)
                is_offline = status == 'offline' or s.get('suspended') is True
                action = "start" if is_offline else "redeploy"
                
                print(f"  -> 服务器 [{s_name}] 状态: {status.upper()} | 执行动作: {action}")
                
                action_url = f"https://api.pella.app/server/{action}?id={s_id}"
                res = requests.post(action_url, headers=headers, json={})
                
                if res.status_code == 200:
                    print(f"    ✨ 执行成功")
                else:
                    print(f"    ⚠️ 执行反馈: {res.text}")
                
                time.sleep(2) # 避免请求频率过快

        except Exception as e:
            print(f"  ❌ 处理过程中出错: {e}")

if __name__ == "__main__":
    process_pella()
