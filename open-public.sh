#!/bin/bash
# 一键开启公网访问（放开 80 端口 + 清除 IP 限制）
# 在阿里云 Workbench 以 root 执行
set +e

echo "========================================"
echo "  USTD 站点 - 一键开启公网访问"
echo "========================================"

echo
echo ">>> [1/6] 清除 nginx 中的 IP 白名单/deny 规则..."
# 备份
cp -f /etc/nginx/conf.d/ustd.conf /etc/nginx/conf.d/ustd.conf.bak.$(date +%s) 2>/dev/null
sed -i '/^\s*deny\s/d; /^\s*allow\s/d' /etc/nginx/conf.d/ustd.conf 2>/dev/null
# 全局 nginx.conf 里的也清
sed -i '/^\s*deny\s\(all\|[0-9]\)/d' /etc/nginx/nginx.conf 2>/dev/null
echo "    完成"

echo
echo ">>> [2/6] 确认 nginx 监听 80 端口..."
if ! grep -q "listen 80" /etc/nginx/conf.d/ustd.conf 2>/dev/null; then
  echo "    警告: ustd.conf 未配置 listen 80，请检查"
else
  echo "    listen 80 已配置"
fi

echo
echo ">>> [3/6] 测试并重载 nginx..."
if nginx -t 2>/dev/null; then
  systemctl reload nginx && echo "    nginx 已重载"
else
  echo "    nginx 配置有误，尝试重启..."
  systemctl restart nginx
fi

echo
echo ">>> [4/6] 放行系统防火墙 80 端口..."
# firewalld
if systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --add-service=http 2>/dev/null
  firewall-cmd --permanent --add-port=80/tcp 2>/dev/null
  firewall-cmd --reload 2>/dev/null
  echo "    firewalld 已放行 80"
else
  echo "    firewalld 未运行，跳过"
fi
# iptables
if command -v iptables >/dev/null 2>&1; then
  iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null
  echo "    iptables 已放行 80"
fi

echo
echo ">>> [5/6] 检查 fail2ban（如在运行，解封本机外 IP）..."
if systemctl is-active --quiet fail2ban 2>/dev/null; then
  fail2ban-client unban --all 2>/dev/null && echo "    fail2ban 已解封所有 IP" || echo "    fail2ban 运行中，但无法自动解封"
else
  echo "    无 fail2ban"
fi

echo
echo ">>> [6/6] 本机自测..."
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/)
echo "    本机 80 端口返回 HTTP: $code"
pubip=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "47.236.125.185")

echo
echo "========================================"
echo "  完成！"
echo "  公网访问地址: http://$pubip"
echo "========================================"
echo
echo "如果公网仍打不开，最后检查阿里云【安全组】:"
echo "  ECS实例 -> 安全组 -> 入方向 -> 添加规则"
echo "  协议: HTTP(80)   源: 0.0.0.0/0"
