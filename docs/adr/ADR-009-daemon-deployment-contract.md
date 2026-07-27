# ADR-009: Daemon 作为独立共享服务，由部署环境管理生命周期

- Status: Accepted
- Date: 2026-07-27
- Scope: SpecForge daemon / OpenCode Plugin / 部署与运行

## 背景

SpecForge 的 daemon 不是单个 OpenCode 实例的附属进程。

目标运行模式包括：

1. 本地环境先启动 daemon，再启动 OpenCode。
2. 服务器环境长期运行一个 daemon。
3. 多个 OpenCode 实例可以连接同一个 daemon，由 daemon 统一提供治理运行时服务。

因此，daemon 的生命周期属于部署层，不属于 OpenCode Plugin。

当前 README 曾写成“安装后直接打开 OpenCode，无需额外操作”，而 Plugin 在 daemon 不可用时会连接失败。这两个表述造成了运行方式上的歧义。

## 决策

### 1. daemon 生命周期由部署环境负责

daemon 的启动、停止、重启和服务化由用户、服务器服务管理器或 SpecForge CLI 负责。

OpenCode Plugin 不负责：

- 自动启动 daemon；
- 自动停止 daemon；
- 自动重启 daemon；
- 因版本判断而替换一个已经运行的 daemon。

### 2. OpenCode Plugin 只负责连接

Plugin 的职责是：

1. 连接已经运行的 daemon；
2. 注册当前项目；
3. 通过 daemon 执行 SpecForge 治理 Tool；
4. daemon 不可用时失败关闭并报告错误。

Plugin 不得为了“提高易用性”绕过 daemon。

### 3. 支持共享 daemon

服务器部署允许：

```text
                 ┌─ OpenCode 实例 A
共享 daemon  ────┼─ OpenCode 实例 B
                 └─ OpenCode 实例 C
```

daemon 是统一治理服务端；每个 OpenCode 是客户端。

因此不得由任何一个 OpenCode 实例擅自控制共享 daemon 的生命周期。

### 4. 正确启动顺序

正常运行顺序为：

```text
启动/确认 daemon
        ↓
启动 OpenCode
        ↓
Plugin 连接 daemon
        ↓
注册项目
        ↓
进入 SpecForge 治理流程
```

安装或升级 OpenCode 侧共享组件后，需要重启 OpenCode 以加载新版 Plugin。

是否重启 daemon，由 daemon 自身的部署和升级计划决定，不能由 Plugin 自动决定。

## 失败策略

如果 daemon 未运行或不可连接：

```text
Plugin
  ↓
连接失败
  ↓
治理写操作失败关闭
  ↓
向用户报告 daemon 连接问题
```

不得自动退化为“无 daemon 治理”。

## 对 Phase 11 的影响

“全新项目首次治理自举”真实端到端验证必须在 daemon 已正常运行的前提下执行。

测试顺序：

```text
启动 daemon
↓
创建全新项目
↓
启动 OpenCode
↓
Plugin 注册项目
↓
首次需求
↓
Architecture / Data Model / Module / Contract / Trace
↓
Gate / Merge / Verification / Close
```

## 被否决方案

### OpenCode Plugin 自动启动 daemon

否决。

原因：

- 破坏 daemon 独立服务边界；
- 一个 OpenCode 实例可能影响其他实例；
- 不适用于服务器统一 daemon；
- 升级时存在客户端擅自替换共享服务进程的风险。

### Plugin 自动判断版本并终止旧 daemon

否决。

daemon 升级属于服务端部署行为，不属于客户端权限。

## 实施要求

1. 撤销“Plugin 自动启动/替换 daemon”的实验性修改。
2. README 明确 daemon 必须先由部署环境启动。
3. 保持 Plugin 当前 fail-closed 连接模型。
4. 后续如完善 daemon 的 systemd、Windows Service 或其他服务管理能力，应在 daemon/CLI 部署体系内实现，不进入 OpenCode Plugin。
