#!/bin/bash
echo "=== USTD 服务器更新脚本 ==="

cd /opt/USDT-wab3

# 1. 拉取最新代码
echo "[1/4] 拉取最新代码..."
git fetch --all
git reset --hard origin/main

# 2. 重新安装依赖（包含 node-fetch）
echo "[2/4] 更新依赖..."
/usr/local/bin/node /usr/local/bin/npm install --production 2>&1 | tail -5

# 3. 重启服务
echo "[3/4] 重启服务..."
systemctl restart ustd
sleep 10

# 4. 验证
echo "[4/4] 验证..."
echo "--- 服务状态 ---"
systemctl status ustd --no-pager | head -6
echo ""
echo "--- API 测试 ---"
echo -n "price: "; curl -s --max-time 10 http://127.0.0.1:3001/api/wab3/price
echo ""
echo -n "balance: "; curl -s --max-time 15 "http://127.0.0.1:3001/api/wab3/balance?address=THFkAXUiavqA9pQ7zKUxtH2qwLud777vrK" | head -c 200
echo ""
echo -n "transfers: "; curl -s --max-time 15 "http://127.0.0.1:3001/api/wab3/transfers?address=THFkAXUiavqA9pQ7zKUxtH2qwLud777vrK&limit=3" | head -c 300
echo ""
echo -n "nginx: "; curl -s --max-time 10 http://127.0.0.1/api/wab3/price
echo ""
echo ""
echo "=== 更新完成 ==="
echo "请清除手机浏览器缓存后访问: http://47.236.125.185"
