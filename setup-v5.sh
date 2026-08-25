#!/bin/bash
echo "=== USTD 修复 v5 - Node.js 18 glibc-217 ==="

# 1. 下载安装 Node.js 18 (glibc 2.17 兼容版)
echo "[1/6] 安装 Node.js 18 (glibc-217)..."
cd /tmp
rm -rf /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx /usr/local/lib/node_modules
curl -fsSL -o node18.tar.xz "https://unofficial-builds.nodejs.org/download/release/v18.20.4/node-v18.20.4-linux-arm64-glibc-217.tar.xz"
tar -xf node18.tar.xz -C /usr/local --strip-components=1
rm -f node18.tar.xz
ln -sf /usr/local/bin/node /usr/bin/node
ln -sf /usr/local/bin/npm /usr/bin/npm
ln -sf /usr/local/bin/npx /usr/bin/npx
echo "Node: $(/usr/local/bin/node -v)"
echo "npm: $(/usr/local/bin/npm -v)"

# 2. 重新安装依赖
cd /opt/USDT-wab3
echo "[2/6] 安装后端依赖..."
rm -rf node_modules package-lock.json
/usr/local/bin/npm install 2>&1 | tail -10

# 3. 验证
echo "[3/6] 验证依赖..."
/usr/local/bin/node -e "import('express').then(()=>console.log('express OK')).catch(e=>console.log('FAIL:',e.message))"

# 4. 更新 systemd 服务
echo "[4/6] 更新服务..."
cat > /etc/systemd/system/ustd.service << 'EOF'
[Unit]
Description=USTD Token Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/USDT-wab3
ExecStart=/usr/local/bin/node /opt/USDT-wab3/server/src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

# 5. 重启
echo "[5/6] 重启服务..."
systemctl restart ustd
sleep 12

# 6. 验证
echo "[6/6] 验证..."
echo "--- 服务状态 ---"
systemctl status ustd --no-pager | head -8
echo "--- 端口 ---"
ss -tlnp | grep 3001
echo "--- 日志 ---"
journalctl -u ustd --no-pager -n 10
echo "--- 测试 ---"
echo -n "health: "; curl -s --max-time 5 http://127.0.0.1:3001/health
echo ""
echo -n "price: "; curl -s --max-time 10 http://127.0.0.1:3001/api/wab3/price
echo ""
echo -n "info: "; curl -s --max-time 10 http://127.0.0.1:3001/api/wab3/info | head -c 200
echo ""
echo -n "nginx: "; curl -s --max-time 10 http://127.0.0.1/api/wab3/price
echo ""
echo "=== 完成 ==="
