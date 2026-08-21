# @seekdock/dsh-client-ui-agent-backend

[English](README.md) | 中文

用于选择并标识 `ctx.agentLoop` 中已注册 Agent loop 后端的 Web 界面。本包只拥有呈现与浏览器侧暂存；校验、持久化和首轮锁定由 Host 负责。

## 界面

- General 设置行写入 `agent-loop.defaultBackend`，影响后续 Session，但不改变已有 Session。
- New Session hero 选择器为当前空白 Session 调用 `agentBackend.select`。Session 尚不存在时所作选择会保持暂存，并在 Host 创建的空白 Session 进入客户端列表后应用。
- Session 页头标签呈现 `SessionSummary.agentBackend`，优先使用名单中的显示名称，并以持久 id 作为回退。

三处界面都读取 `agentBackend.list`，因此贡献的新提供方无需修改客户端包即可出现。选择被拒绝或发生竞态时，界面恢复 Host 报告的后端并显示业务错误。部署未报告后端时选择器隐藏；设置不可写时控件只读。

## 模型体验

无，因为本包选择 Host loop 实现，但不增加提示词文本、schema、消息或模型调用。

#### KV Cache 影响

无直接影响。Host 仅允许在首轮前更换后端，因此该界面无法在模型历史存在后改变 Session 请求前缀。

## 已知限制与延期工作

- **只能为空白 Session 选择** — 尚无已启动 Session 的迁移流程；应使用其历史记录中的后端继续执行，或创建新 Session。
- **后端能力仅作描述** — 名单公开 id、名称和说明，不公开功能协商矩阵。共享的 DSH Agent、工具、审批与持久化约定仍是兼容边界。
