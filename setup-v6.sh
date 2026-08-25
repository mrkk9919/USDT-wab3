#!/bin/bash
echo "=== USTD 修复 v6 - Node 16 + npm 6 ==="

# 1. 重新安装 Node.js 16 arm64
echo "[1/7] 安装 Node.js 16..."
cd /tmp
rm -rf /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx /usr/local/lib/node_modules /usr/local/include/node
curl -fsSL -o node16.tar.xz "https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-arm64.tar.xz"
tar -xf node16.tar.xz -C /usr/local --strip-components=1
rm -f node16.tar.xz
ln -sf /usr/local/bin/node /usr/bin/node
echo "Node: $(/usr/local/bin/node -v)"

# 2. 手动安装 npm 6 (更稳定)
echo "[2/7] 安装 npm 6..."
cd /tmp
curl -fsSL -o npm6.tgz "https://registry.npmjs.org/npm/-/npm-6.14.18.tgz"
tar -xzf npm6.tgz
mkdir -p /usr/local/lib/node_modules
rm -rf /usr/local/lib/node_modules/npm
mv package /usr/local/lib/node_modules/npm
rm -f npm6.tgz
ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
chmod +x /usr/local/bin/npm /usr/local/bin/npx
echo "npm: $(/usr/local/bin/node /usr/local/bin/npm --version)"

# 3. 安装后端依赖
cd /opt/USDT-wab3
echo "[3/7] 安装后端依赖..."
rm -rf node_modules package-lock.json
/usr/local/bin/node /usr/local/bin/npm install --production 2>&1 | tail -15

# 4. 验证
echo "[4/7] 验证..."
/usr/local/bin/node -e "require('express'); console.log('express OK')" 2>&1

# 5. 更新 systemd 服务
echo "[5/7] 更新服务..."
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

# 6. 重启
echo "[6/7] 重启服务..."
systemctl restart ustd
sleep 12

# 7. 验证
echo "[7/7] 验证..."
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
