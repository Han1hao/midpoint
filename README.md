# IT 账号与资产管理平台

公司内部身份治理、账号台账与设备资产管理平台。门户使用 Node.js/Vinext，身份治理核心使用 midPoint 4.9.8，数据存储使用 PostgreSQL 16。

## 仓库结构

- `portal/`：门户前端、服务端接口、数据库结构和测试。
- `deployment/midpoint/`：midPoint 与 PostgreSQL 的 Docker Compose 配置。
- `docs/`：部署和仓库安全说明。

真实密码、令牌、运行日志、构建产物和业务数据不会提交到仓库。

## 本地启动

运行环境：Node.js 22、pnpm 11、Docker Engine/Compose。

1. 将 `deployment/midpoint/.env.example` 复制为 `.env`，设置随机数据库密码。
2. 将 `portal/.env.example` 复制为 `.env.local`；一般无需修改默认本机地址。
3. 在 `portal/` 执行 `pnpm install --frozen-lockfile` 和 `pnpm run build`。
4. 在仓库根目录执行 `start-all.cmd`。
5. 访问 `http://localhost:3001`。

详细步骤见 [部署说明](docs/DEPLOYMENT.md)。

## 验证

在 `portal/` 目录执行：

```text
pnpm run build
pnpm run test
```

## 数据与密钥

- `.env` 和 `.env.local` 只能保存在部署机器上。
- `portal/data/*.json` 属于运行数据，不进入 Git。
- PostgreSQL 和 midPoint 数据保存在 Docker 命名卷中，不进入 Git。
- 正式环境密钥应由公司的密钥管理系统或 CI/CD 变量注入。

