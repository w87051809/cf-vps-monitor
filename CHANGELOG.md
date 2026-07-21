# 更新说明

## v2.0.2 - Cloudflare D1 与 QQ 通知

更新时间：2026-07-21

这次版本主要把项目改成更适合在 Cloudflare Workers 上长期使用的探针面板，并补齐独立 QQ 通知能力。

### 主要更新

- 数据库改为 Cloudflare D1，不再依赖 Supabase。
- 后台通知方式支持多选，可以同时发送 Telegram、SMTP 邮件、Webhook、QQ。
- 新增独立的 QQ 通知通道，使用 NapCat WebUI 接口发送私聊或群消息。
- Webhook 保持原来的通用模式，不再混用 QQ 配置。
- 后台增加 QQ 通知配置卡片，支持接口地址、私聊/群、目标 QQ/群号、WebUI Token、重试次数和测试发送。
- QQ Token 属于敏感字段，后台不会回显，留空保存时不会覆盖已保存 Token。
- 默认项目名称、页面标题和后台显示统一改为“探针面板”。
- Agent 安装脚本默认仓库改为 `w87051809/cf-vps-monitor`。
- Linux、Windows、OpenWrt/iStoreOS 安装流程做了兼容改进，国内网络下载失败时更容易切换代理或备用方式。
- 部署脚本增加 Cloudflare D1、Durable Objects、Worker Secret 的检查，减少部署后才发现配置缺失的问题。

### Cloudflare 相关

- Worker 绑定的 D1 数据库名：`cf-vps-monitor`
- D1 binding 名称必须是：`DB`
- Durable Objects：`LIVE_DATA`、`RATE_LIMIT`
- 必须配置 Worker Secret：`JWT_SECRET`

### QQ 通知说明

QQ 通知现在是单独通道，不占用 Webhook。

后台路径：

```text
通知管理 -> 通知通道 -> 勾选 QQ -> QQ 通知
```

NapCat WebUI 接口示例：

```text
https://qq.1089.ltd/api/webqq/messages
```

支持 QQ 私聊、QQ群、独立测试发送、失败重试 1 到 3 次。

### Webhook 说明

Webhook 已恢复为通用配置，适合接入 Slack、Discord、飞书、钉钉、企业微信或自定义 HTTPS 回调。

QQ 不再走 Webhook，这样两个功能互不影响。

### 安全说明

- 仓库里没有提交真实 QQ WebUI Token。
- 仓库里没有提交 Cloudflare API Token。
- 仓库里没有提交 JWT_SECRET。
- 后台读取通知设置时，敏感字段只显示“已保存”，不返回明文。
- Webhook URL、Secret、Headers、Password 仍按敏感配置处理。

### 已验证

- 前端构建通过。
- Worker 构建通过。
- Cloudflare dry-run 通过。
- Cloudflare 正式部署成功。
- QQ 测试消息发送成功。
- 设置校验测试通过。
- 通知分发测试通过。
