# 部署说明

本上传仓库仅支持 Linux 公司服务器，使用 `deployment/linux/` 下的部署脚本和服务模板。

## 1. 准备配置

```bash
cp deployment/midpoint/.env.example deployment/midpoint/.env
cp portal/.env.example portal/.env.local
```

必须修改 `deployment/midpoint/.env` 中的 `DB_PASSWORD`。密码不得提交到 Git。

## 2. 安装和构建门户

```bash
cd portal
corepack enable
pnpm install --frozen-lockfile
pnpm run build
cd ..
```

## 3. 启动

```bash
bash deployment/linux/deploy.sh
```

门户地址：`http://localhost:3001`

midPoint 地址：`http://localhost:8080/midpoint/`

## 4. 管理员密码

首次启动后立即通过公司批准的 midPoint 管理流程修改管理员密码。不要把密码写入脚本、README、命令记录或 Git。

## 5. 停止与备份

在 `deployment/midpoint/` 中使用 `docker compose stop` 停止容器。普通的 `docker compose down` 不删除命名卷；除非已完成备份并明确需要清空数据，否则禁止执行 `docker compose down -v`。

业务数据备份应同时覆盖：

- PostgreSQL 数据库；
- midPoint home 命名卷；
- 门户运行数据（仅在使用 JSON 存储模式时）。

## 6. Linux 公司服务器

推荐 Ubuntu 22.04/24.04。服务器需预先安装 Docker Engine、Docker Compose 插件、Node.js 22、Python 3、Git、systemd 和 Nginx。

```bash
cp deployment/midpoint/.env.example deployment/midpoint/.env
cp portal/.env.example portal/.env.local
nano deployment/midpoint/.env
bash deployment/linux/deploy.sh
```

`deploy.sh` 不会覆盖已有环境配置或业务数据，也不会删除 Docker 命名卷。完成后按 `deployment/linux/README.md` 安装 systemd 服务与 Nginx 配置。

## 7. 公司环境建议

- 仓库设为私有仓库，并启用合并请求和代码审查。
- 生产密钥通过 CI/CD 受保护变量或密钥管理服务注入。
- 默认端口仅监听本机；对外访问时由公司反向代理统一提供 HTTPS、域名和访问控制。
- 生产部署前执行依赖漏洞扫描、镜像扫描和备份恢复演练。
