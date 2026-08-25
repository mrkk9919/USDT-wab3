#!/bin/bash
set -e

echo "=== USTD Token 一键部署脚本 ==="

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo "请用 root 用户执行: sudo su - -c 'curl -fsSL https://raw.githubusercontent.com/mrkk9919/USDT-wab3/main/deploy.sh | bash'"
  exit 1
fi

# 1. 安装 Node.js 16（兼容 CentOS 7 glibc 2.17）, git, nginx
echo "[1/7] 安装 Node.js 16, git, nginx..."

# 清理之前失败的 Node.js 18 安装
rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx 2>/dev/null || true

# 检测架构
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "不支持的架构: $ARCH"; exit 1 ;;
esac

# Node.js 16 兼容 glibc 2.17 (CentOS 7)
NODE_VER="v16.20.2"
echo "下载 Node.js $NODE_VER linux-$NODE_ARCH..."
cd /tmp
curl -fsSL -o node.tar.xz "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-$NODE_ARCH.tar.xz"
tar -xf node.tar.xz -C /usr/local --strip-components=1
rm -f node.tar.xz
export PATH="/usr/local/bin:$PATH"
echo "Node.js 安装完成: $(node -v)"

# 安装 git 和 nginx
yum install -y git nginx 2>/dev/null || true

# 2. 克隆或更新项目
echo "[2/7] 克隆项目..."
cd /opt
rm -rf USDT-wab3
git clone https://github.com/mrkk9919/USDT-wab3.git
cd USDT-wab3

# 3. 安装后端依赖（前端已预构建在 client/dist 中）
echo "[3/7] 安装后端依赖..."
npm install --production 2>&1 | tail -5

# 4. 配置环境变量
echo "[4/7] 配置环境变量..."
cat > .env << 'EOF'
TRON_NETWORK=shasta
DEPLOYER_PRIVATE_KEY=b49e15b4eebbf9f5d02a7c7213c00c3618ec5a1ba3b1ce89c3fea01c402fa33d
INITIAL_SUPPLY=100000000
PORT=3001
WAB3_INITIAL_PRICE=0.99
WAB3_CONTRACT=TXQs7gk18BqwTeozuwBiUfZeCDARMBitkL
WAB3_OWNER=THFkAXUiavqA9pQ7zKUxtH2qwLud777vrK
EOF

# 5. 创建价格状态文件
echo "[5/7] 配置价格..."
NOW_MS=$(($(date +%s) * 1000))
cat > price-state.json << EOF
{"price":0.99,"history":[{"price":0.99,"timestamp":$NOW_MS}],"lastUpdateAt":$NOW_MS}
EOF

# 6. 配置 Nginx
echo "[6/7] 配置 Nginx..."
cat > /etc/nginx/conf.d/ustd.conf << 'EOF'
server {
    listen 80;
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
EOF
# 删除默认配置避免冲突
rm -f /etc/nginx/conf.d/default.conf /etc/nginx/sites-enabled/default 2>/dev/null || true
systemctl enable nginx
systemctl restart nginx

# 7. 配置 systemd 服务
echo "[7/7] 配置 systemd 服务..."
cat > /etc/systemd/system/ustd.service << 'EOF'
[Unit]
Description=USTD Token Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/USDT-wab3
ExecStart=/usr/local/bin/node server/src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ustd
systemctl restart ustd

# 等待服务启动
echo ""
echo "等待服务启动..."
sleep 15

# 测试
echo ""
echo "=== 测试部署 ==="
echo -n "后端价格 API: "
curl -s --max-time 5 http://localhost:3001/api/wab3/price || echo "失败"
echo ""
echo -n "前端页面: "
curl -s --max-time 5 -o /dev/null -w "HTTP %{http_code}" http://localhost/ || echo "失败"
echo ""
echo -n "Nginx 代理 API: "
curl -s --max-time 5 http://localhost/api/wab3/price || echo "失败"
echo ""
echo ""
echo "=== 部署完成 ==="
echo "访问地址: http://47.236.125.185"
echo "钱包页面: http://47.236.125.185 (点击'钱包'标签)"
echo ""
echo "服务管理命令:"
echo "  systemctl status ustd    # 查看状态"
echo "  systemctl restart ustd   # 重启服务"
echo "  journalctl -u ustd -f    # 查看日志"
