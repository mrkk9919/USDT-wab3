#!/bin/bash
echo "=== USTD 服务诊断 ==="

echo ""
echo "=== 1. 监听端口 ==="
ss -tlnp | grep -E ':80|:3001|:3000'

echo ""
echo "=== 2. ustd 服务状态 ==="
systemctl status ustd --no-pager 2>&1 | head -20

echo ""
echo "=== 3. ustd 服务日志 ==="
journalctl -u ustd --no-pager -n 30 2>&1

echo ""
echo "=== 4. Nginx 主配置中的 server 块 ==="
grep -n "server\|listen\|include" /etc/nginx/nginx.conf | head -20

echo ""
echo "=== 5. 所有 Nginx 配置文件 ==="
find /etc/nginx -name "*.conf" -exec echo "--- {} ---" \; -exec cat {} \;

echo ""
echo "=== 6. Node.js 版本 ==="
/usr/local/bin/node -v 2>&1
which node 2>&1

echo ""
echo "=== 7. 项目目录 ==="
ls -la /opt/USDT-wab3/server/src/index.js 2>&1
ls -la /opt/USDT-wab3/.env 2>&1
