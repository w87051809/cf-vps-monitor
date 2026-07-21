# 更新说明

## v2.0.2 - D1 数据库与通知中心重构

更新时间：2026-07-21

v2.0.2 是一次面向长期运行的整理版本。数据层改用 Cloudflare D1，通知中心拆成独立通道，部署检查和 Agent 安装脚本也做了兼容性处理。

### 变更摘要

- 数据库迁移到 Cloudflare D1，Supabase 不再作为运行依赖。
- 通知中心支持多通道同时启用，可并行发送 Telegram、SMTP 邮件、Webhook 和 QQ。
- QQ 通知独立成单独通道，使用 NapCat WebUI 发送私聊或群消息。
- Webhook 回到通用回调定位，继续支持 Slack、Discord、飞书、钉钉、企业微信和自定义 HTTPS 接口。
- 后台新增 QQ 配置区，支持接口地址、发送类型、目标 QQ/群号、WebUI Token、重试次数和测试发送。
- 项目名称、页面标题、后台默认显示统一为“探针面板”。
- Agent 默认仓库切换为 `w87051809/cf-vps-monitor`。
- Linux、Windows、OpenWrt/iStoreOS 安装脚本补齐兼容逻辑，国内网络可配置 GitHub 代理或自托管二进制。

### 影响范围

- 原来的 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY` 不再需要。
- D1 binding 名称必须保持为 `DB`。
- 后台登录签名密钥必须通过 Worker Secret 配置为 `JWT_SECRET`。
- 旧 Webhook 配置可继续使用；QQ 需要在新的 QQ 通知区单独配置。
- 部署脚本会检查 D1、Durable Objects 和 `JWT_SECRET`，缺少关键绑定时会提前报错。

### Cloudflare 绑定

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `DB` | D1 Database | 面板数据库，当前数据库名 `cf-vps-monitor` |
| `LIVE_DATA` | Durable Object | 实时状态 |
| `RATE_LIMIT` | Durable Object | 接口限流 |
| `JWT_SECRET` | Worker Secret | 后台登录签名密钥 |

### QQ 通知接入

后台路径：

```text
通知管理 -> 通知通道 -> 勾选 QQ -> QQ 通知
```

NapCat WebUI 接口示例：

```text
https://qq.1089.ltd/api/webqq/messages
```

配置完成后，可在 QQ 配置区单独测试发送。发送失败会按设置重试，最多 3 次。

### Webhook 接入

Webhook 只负责通用回调，不再混用 QQ 配置。需要接第三方机器人或自己的接口时，在 Webhook 区填写 URL、请求格式、Headers、Secret 或 Basic Auth。

### 安全处理

敏感信息不写入仓库。QQ WebUI Token、Cloudflare API Token、`JWT_SECRET` 等内容通过后台配置或 Cloudflare Secret 保存。

后台读取通知设置时，Token、Secret、Password 这类字段不会返回明文；页面只显示是否已经保存，避免误泄露。留空保存不会覆盖已保存的敏感字段。

### 发布校验

本次版本发布前完成了以下检查：

- 前端生产构建
- Worker 类型检查
- Cloudflare dry-run
- Cloudflare Workers 正式部署
- QQ 通知测试发送
- 设置校验与通知分发测试
