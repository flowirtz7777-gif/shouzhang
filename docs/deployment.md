# 单服务器生产部署

## 部署结构

前端不由 Django 提供。Docker 会先运行 `npm run build`，再把生成的 `dist` 放入 Nginx 镜像；Nginx 提供静态页面，并将 `/api/`、`/admin/`、`/media/` 转发给 Gunicorn + Django。PostgreSQL 和上传媒体使用独立持久卷。

这套结构适合 2 核 2 GiB 的单机：生产覆盖文件将 PostgreSQL、Django、Nginx 的内存上限分别设为 512 MiB、640 MiB、96 MiB，并启用容器日志轮转。建议服务器额外配置 1 至 2 GiB swap 作为突发保护，但不要依赖 swap 承担常态负载。

## 前置条件

- 64 位 Linux 服务器，已安装 Docker Engine 与 Docker Compose v2.24 或更高版本。
- 一个已解析到服务器公网 IP 的域名。
- 防火墙只开放 SSH、80、443；应用、Django、PostgreSQL 端口保持本机监听。
- 至少预留 10 GiB 磁盘，并持续备份数据库和上传媒体。

## 首次部署

在服务器克隆仓库后，创建生产环境文件：

```bash
cp deploy/production.env.example deploy/production.env
chmod 600 deploy/production.env
chmod +x deploy/deploy.sh deploy/backup.sh
openssl rand -base64 48
openssl rand -hex 32
```

将第一条随机值写入 `DJANGO_SECRET_KEY`，第二条写入 `POSTGRES_PASSWORD`，并把示例域名替换为真实域名：

```dotenv
DJANGO_ALLOWED_HOSTS=journal.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://journal.example.com
APP_BIND=127.0.0.1
APP_PORT=8080
```

配置服务器已有的 Caddy、1Panel、宝塔或 Nginx，将 `https://journal.example.com` 反向代理到 `http://127.0.0.1:8080`。反向代理必须保留 `Host`，并将客户端协议写入 `X-Forwarded-Proto`。Caddy 的最小配置如下：

```caddyfile
journal.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

启动并执行生产检查：

```bash
./deploy/deploy.sh
```

创建后台管理员：

```bash
docker compose --env-file deploy/production.env \
  -f compose.yml -f compose.production.yml \
  exec backend python manage.py createsuperuser
```

访问 `https://journal.example.com/` 和 `https://journal.example.com/admin/`。不要直接把 `8000`、`5432` 或 `8080` 暴露到公网。

## 更新版本

更新前先备份，再拉取代码并重新部署：

```bash
./deploy/backup.sh
git pull --ff-only
./deploy/deploy.sh
```

启动脚本会重新构建前端和后端镜像、执行 Django 生产安全检查、运行数据库迁移，并等待全部容器健康。

## 备份与恢复

创建数据库与媒体备份：

```bash
./deploy/backup.sh
```

备份保存在 `backups/`，包含 PostgreSQL 自定义格式转储、媒体压缩包和 SHA-256 校验文件。请定期将它们同步到另一台机器或对象存储；同一块服务器磁盘上的备份不能应对磁盘损坏。

恢复前先停止网页和后端，保留数据库运行：

```bash
docker compose --env-file deploy/production.env \
  -f compose.yml -f compose.production.yml stop web backend

docker compose --env-file deploy/production.env \
  -f compose.yml -f compose.production.yml exec -T db \
  sh -c 'exec pg_restore --clean --if-exists --no-owner --exit-on-error \
  --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  < backups/database-YYYYMMDDTHHMMSSZ.dump

docker compose --env-file deploy/production.env \
  -f compose.yml -f compose.production.yml run --rm --no-deps \
  --entrypoint sh backend -c \
  'rm -rf /app/var/media/* && tar -C /app/var/media -xzf -' \
  < backups/media-YYYYMMDDTHHMMSSZ.tar.gz

./deploy/deploy.sh
```

恢复会覆盖现有数据，执行前应额外保存一份当前备份。数据库和媒体是两个独立备份；需要严格时间一致性时，应先短暂停止 `web` 和 `backend` 再执行备份。
