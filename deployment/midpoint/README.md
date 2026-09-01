# midPoint 本地部署

本目录使用 Docker Compose 启动 midPoint 4.9.8 和 PostgreSQL 16，默认仅监听本机地址。

首次使用前，将 `.env.example` 复制为 `.env`，并替换 `DB_PASSWORD`。随后执行 `start.cmd`，使用 `status.cmd` 查看状态，使用 `stop.cmd` 停止服务。

数据库和 midPoint home 保存在 Docker 命名卷中。普通停止不会删除数据；除非已确认永久清空并完成备份，否则不要执行 `docker compose down -v`。

