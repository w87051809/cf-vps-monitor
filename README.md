# 探针面板

这是 `w87051809/cf-vps-monitor` 的自用 Cloudflare Worker 探针面板。

当前版本：`v2.0.2`

最近更新详情看这里：[CHANGELOG.md](./CHANGELOG.md)

## 当前架构

- 前端、API、定时任务：Cloudflare Workers
- 实时状态：Cloudflare Durable Objects
- 数据库：Cloudflare D1
- 服务器探针：Go Agent
- 默认面板域名：`https://vpsjk.1089.ltd`

## Cloudflare 绑定

Worker 需要这些绑定：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `DB` | D1 Database | 面板数据库，当前数据库名 `cf-vps-monitor` |
| `LIVE_DATA` | Durable Object | 实时数据 |
| `RATE_LIMIT` | Durable Object | 限流 |
| `JWT_SECRET` | Worker Secret | 后台登录签名密钥，至少 32 字节 |

不需要 Supabase，不需要 `SUPABASE_URL`，也不需要 `SUPABASE_SECRET_KEY`。

## 部署

```bash
npm install
npm run build
npm run verify:cloudflare
npm run deploy
```

部署配置在 `wrangler.toml`：

- `workers_dev = false`
- `preview_urls = false`
- D1 绑定名必须是 `DB`

## 初始化数据库

首次部署后访问：

```text
https://vpsjk.1089.ltd/db-init
```

创建管理员后，初始化接口会自动锁定。

## 安装 Agent

后台创建服务器后，点“生成安装命令”，复制命令到 VPS 运行。

安装脚本默认从当前面板域名加载：

```text
https://vpsjk.1089.ltd/agent/install.sh
```

项目默认仓库已经改为：

```text
https://github.com/w87051809/cf-vps-monitor
```

## 安全建议

- 后台开启 MFA。
- 不要公开 Agent Token。
- 备份文件是加密备份，密码要单独保存。
- 自定义域名绑定后，继续保持 `workers.dev` 关闭。
- 国内服务器如果下载慢，可以在后台生成命令时配置自己的 GitHub 代理或自托管 Agent 二进制。
