#!/bin/bash
echo "=== USTD 依赖修复脚本 v3 ==="

# 创建 node 符号链接
ln -sf /usr/local/bin/node /usr/bin/node
ln -sf /usr/local/bin/npm /usr/bin/npm
ln -sf /usr/local/bin/npx /usr/bin/npx

# 验证 node 可用
echo "[1/5] Node.js 版本:"
/usr/local/bin/node -v
/usr/local/bin/node /usr/local/bin/npm -v

cd /opt/USDT-wab3

# 2. 清理并重新安装依赖
echo "[2/5] 重新安装后端依赖..."
rm -rf node_modules package-lock.json
/usr/local/bin/node /usr/local/bin/npm install 2>&1 | tail -20

# 3. 验证 express 已安装
echo "[3/5] 验证依赖..."
ls node_modules/express/package.json 2>&1 && echo "express 已安装"
/usr/local/bin/node -e "import('express').then(() => console.log('express 加载成功')).catch(e => console.log('express 加载失败:', e.message))"

# 4. 重启服务
echo "[4/5] 重启服务..."
systemctl restart ustd
echo "等待启动..."
sleep 10

# 5. 验证
echo "[5/5] 验证..."
echo ""
echo "=== 服务状态 ==="
systemctl status ustd --no-pager | head -10
echo ""
echo "=== 端口监听 ==="
ss -tlnp | grep 3001
echo ""
echo "=== 后端日志 ==="
journalctl -u ustd --no-pager -n 10
echo ""
echo "=== 本地测试 ==="
echo -n "health: "; curl -s --max-time 5 http://127.0.0.1:3001/health
echo ""
echo -n "price: "; curl -s --max-time 10 http://127.0.0.1:3001/api/wab3/price
echo ""
echo -n "info: "; curl -s --max-time 10 http://127.0.0.1:3001/api/wab3/info | head -c 300
echo ""
echo -n "nginx代理: "; curl -s --max-time 10 http://127.0.0.1/api/wab3/price
echo ""
echo ""
echo "=== 修复完成 ==="
echo "访问: http://47.236.125.185"
