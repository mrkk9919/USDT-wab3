#!/bin/bash
set -e

echo "=== USTD 综合修复脚本 ==="

# 1. 注释掉 nginx.conf 中的默认 server 块
echo "[1/6] 修复 Nginx 主配置..."
cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
# 用 sed 注释掉从第一个 server { 到对应的 } 之间的内容
# 更安全的方式：直接重写 nginx.conf，去掉默认 server 块
cat > /etc/nginx/nginx.conf << 'NGINXCONF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 只加载 conf.d 目录下的配置
    include /etc/nginx/conf.d/*.conf;
}
NGINXCONF
echo "Nginx 主配置已修复"

# 2. 确保 ustd.conf 正确
echo "[2/6] 写入 USTD Nginx 配置..."
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
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

# 3. 杀掉占用 3001 端口的旧进程
echo "[3/6] 清理 3001 端口..."
fuser -k 3001/tcp 2>/dev/null || true
sleep 2

# 4. 修复 systemd 服务（使用完整 node 路径）
echo "[4/6] 更新 systemd 服务..."
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
Environment=NODE_PATH=/opt/USDT-wab3/node_modules

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

# 5. 重启所有服务
echo "[5/6] 重启服务..."
nginx -t
systemctl restart nginx
systemctl restart ustd
echo "等待后端启动..."
sleep 15

# 6. 验证
echo "[6/6] 验证..."
echo ""
echo "=== 端口监听 ==="
ss -tlnp | grep -E ':80|:3001'
echo ""
echo "=== 后端服务状态 ==="
systemctl status ustd --no-pager | head -12
echo ""
echo "=== 后端日志 ==="
journalctl -u ustd --no-pager -n 15
echo ""
echo "=== 本地测试 ==="
echo -n "health: "; curl -s --max-time 5 http://127.0.0.1:3001/health
echo ""
echo -n "price: "; curl -s --max-time 10 http://127.0.0.1:3001/api/wab3/price
echo ""
echo -n "nginx代理: "; curl -s --max-time 10 http://127.0.0.1/api/wab3/price
echo ""
echo -n "前端标题: "; curl -s http://127.0.0.1/ | grep -o '<title>[^<]*</title>'
echo ""
echo ""
echo "=== 修复完成 ==="
echo "访问: http://47.236.125.185"
