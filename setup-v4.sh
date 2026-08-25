#!/bin/bash
echo "=== USTD 依赖修复 v4 ==="

# 创建 node 符号链接
ln -sf /usr/local/bin/node /usr/bin/node
ln -sf /usr/local/bin/npm /usr/bin/npm
ln -sf /usr/local/bin/npx /usr/bin/npx

echo "[1/5] Node.js 版本:"
/usr/local/bin/node -v
/usr/local/bin/node /usr/local/bin/npm -v

cd /opt/USDT-wab3

echo "[2/5] 重新安装后端依赖..."
rm -rf node_modules package-lock.json
/usr/local/bin/node /usr/local/bin/npm install 2>&1 | tail -20

echo "[3/5] 验证依赖..."
ls node_modules/express/package.json 2>&1 && echo "express OK"
/usr/local/bin/node -e "import('express').then(()=>console.log('express load OK')).catch(e=>console.log('express FAIL:',e.message))"

echo "[4/5] 重启服务..."
systemctl restart ustd
sleep 10

echo "[5/5] 验证..."
echo "--- 服务状态 ---"
systemctl status ustd --no-pager | head -8
echo "--- 端口 ---"
ss -tlnp | grep 3001
echo "--- 日志 ---"
journalctl -u ustd --no-pager -n 8
echo "--- 测试 ---"
echo -n "health: "; curl -s --max-time 5 http://127.0.0.1:3001/health
echo ""
echo -n "price: "; curl -s --max-time 10 http://127.0.0.1:3001/api/wab3/price
echo ""
echo -n "nginx: "; curl -s --max-time 10 http://127.0.0.1/api/wab3/price
echo ""
echo "=== 完成 ==="
