# 部署说明

## 1. 准备配置

```powershell
Copy-Item deployment/midpoint/.env.example deployment/midpoint/.env
Copy-Item portal/.env.example portal/.env.local
```

必须修改 `deployment/midpoint/.env` 中的 `DB_PASSWORD`。密码不得提交到 Git。

## 2. 安装和构建门户

```powershell
Set-Location portal
corepack enable
pnpm install --frozen-lockfile
pnpm run build
Set-Location ..
```

## 3. 启动

```powershell
.\start-all.ps1
```

门户地址：`http://localhost:3001`

midPoint 地址：`http://localhost:8080/midpoint/`

## 4. 管理员密码

首次启动后，在 `deployment/midpoint/` 中使用 `reset-administrator.ps1` 设置不少于 12 位的管理员密码。不要把密码写入脚本、README、命令记录或 Git。

## 5. 停止与备份

使用 `deployment/midpoint/stop.cmd` 停止容器。普通的 `docker compose down` 不删除命名卷；除非已完成备份并明确需要清空数据，否则禁止执行 `docker compose down -v`。

业务数据备份应同时覆盖：

- PostgreSQL 数据库；
- midPoint home 命名卷；
- 门户运行数据（仅在使用 JSON 存储模式时）。

## 6. 公司环境建议

- 仓库设为私有仓库，并启用合并请求和代码审查。
- 生产密钥通过 CI/CD 受保护变量或密钥管理服务注入。
- 默认端口仅监听本机；对外访问时由公司反向代理统一提供 HTTPS、域名和访问控制。
- 生产部署前执行依赖漏洞扫描、镜像扫描和备份恢复演练。

