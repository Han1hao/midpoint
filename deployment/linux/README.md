# Linux 公司服务器部署

本流程面向 Ubuntu 22.04/24.04。Windows 本地运行仍使用仓库根目录现有的 `start-all.cmd` 或 `start-all.ps1`，不受本目录影响。

## 1. 服务器依赖

- Git
- Docker Engine 与 Docker Compose 插件
- Node.js 22.13 或更高版本
- Python 3 与 `python3-venv`
- systemd
- Nginx 或公司统一反向代理

建议至少配置 4 核 CPU、8 GB 内存和 40 GB 可用磁盘。

## 2. 获取代码

建议使用独立的低权限服务账户，并将代码放在固定目录：

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin identity-governance
sudo mkdir -p /opt/identity-governance
sudo chown identity-governance:identity-governance /opt/identity-governance
sudo usermod -aG docker identity-governance
sudo -u identity-governance git clone git@github.com:COMPANY/REPOSITORY.git /opt/identity-governance/app
cd /opt/identity-governance/app
```

私有公司仓库应使用只读 Deploy Key 或公司认可的工作负载身份。不要把个人私钥复制到服务器。加入 `docker` 组等同于授予较高的主机权限；如果公司安全规范不允许，应改由受控的部署账户或 CI/CD 执行 Docker 步骤。

## 3. 配置与首次部署

```bash
cp deployment/midpoint/.env.example deployment/midpoint/.env
cp portal/.env.example portal/.env.local
nano deployment/midpoint/.env
bash deployment/linux/deploy.sh
```

必须将 `DB_PASSWORD` 替换为随机强密码。环境文件权限会由部署脚本收紧为 `600`，且不会进入 Git。

部署脚本将：

1. 校验 Docker、Compose、Node.js 与 Python；
2. 在仓库 `.venv` 中安装 Excel 导入依赖；
3. 使用锁文件安装门户依赖；
4. 执行生产构建和自动测试；
5. 拉取并启动 PostgreSQL 16 与 midPoint 4.9.8。

脚本不会执行 `docker compose down -v`，不会删除已有命名卷或业务数据。

## 4. 安装门户 systemd 服务

先确认 `node` 的实际路径；如果不是模板中的 `/usr/bin/env node` 可直接使用，则调整 `ExecStart`。

```bash
sudo cp deployment/linux/identity-governance-portal.service.example /etc/systemd/system/identity-governance-portal.service
sudo systemctl daemon-reload
sudo systemctl enable --now identity-governance-portal
sudo systemctl status identity-governance-portal
```

查看实时日志：

```bash
sudo journalctl -u identity-governance-portal -f
```

门户默认只监听 `127.0.0.1:3001`；midPoint、PostgreSQL 也只监听本机端口，不应直接暴露到公网。

## 5. Nginx 与 HTTPS

复制模板并替换域名：

```bash
sudo cp deployment/linux/nginx.conf.example /etc/nginx/sites-available/identity-governance
sudo nano /etc/nginx/sites-available/identity-governance
sudo ln -s /etc/nginx/sites-available/identity-governance /etc/nginx/sites-enabled/identity-governance
sudo nginx -t
sudo systemctl reload nginx
```

随后使用公司证书平台或 Certbot 配置 HTTPS。浏览器摄像头和扫码功能需要 HTTPS。防火墙只应按需开放 SSH、HTTP 和 HTTPS，不要开放 3001、8080 或 5432。

## 6. 更新

部署前先完成数据库、midPoint home 卷和门户业务数据备份：

```bash
cd /opt/identity-governance/app
sudo -u identity-governance git pull --ff-only
sudo -u identity-governance bash deployment/linux/deploy.sh
sudo systemctl restart identity-governance-portal
```

检查：

```bash
docker compose -f deployment/midpoint/docker-compose.yml ps
sudo systemctl status identity-governance-portal
curl --fail http://127.0.0.1:3001/
```

## 7. 停止与数据保护

```bash
sudo systemctl stop identity-governance-portal
cd /opt/identity-governance/app/deployment/midpoint
docker compose stop
```

普通 `stop` 或 `down` 不删除命名卷。除非已经完成备份并明确要求永久清空，否则禁止执行 `docker compose down -v`。
