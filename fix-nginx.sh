#!/bin/bash
set -e

echo "=== USTD Nginx 修复脚本 ==="

if [ "$EUID" -ne 0 ]; then
  echo "请用 root 执行: sudo bash fix-nginx.sh"
  exit 1
fi

# 1. 删除所有旧配置
echo "[1/5] 清理旧 Nginx 配置..."
rm -f /etc/nginx/conf.d/*.conf
rm -f /etc/nginx/sites-enabled/* 2>/dev/null || true

# 2. 写入 USTD 配置
echo "[2/5] 写入 USTD Nginx 配置..."
cat > /etc/nginx/conf.d/ustd.conf << 'NGINX'
server {
    listen 80 default_server;
    server_name _;
    root /opt/USDT-wab3/client/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

# 3. 测试并重载 Nginx
echo "[3/5] 重启 Nginx..."
nginx -t
systemctl restart nginx

# 4. 重启后端服务
echo "[4/5] 重启后端服务..."
systemctl restart ustd
sleep 8

# 5. 测试
echo "[5/5] 测试..."
echo ""
echo "=== 后端 health ==="
curl -s http://localhost:3001/health
echo ""
echo "=== 后端价格 API ==="
curl -s --max-time 10 http://localhost:3001/api/wab3/price
echo ""
echo "=== Nginx 代理 API ==="
curl -s --max-time 10 http://localhost/api/wab3/price
echo ""
echo "=== 前端页面标题 ==="
curl -s http://localhost/ | grep -o '<title>[^<]*</title>'
echo ""
echo "=== 后端服务状态 ==="
systemctl status ustd --no-pager | head -10
echo ""
echo "=== 修复完成 ==="
echo "访问: http://47.236.125.185"
