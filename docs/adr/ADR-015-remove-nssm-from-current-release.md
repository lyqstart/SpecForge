# ADR-015: 当前发布移除 NSSM 与 Windows 系统服务注册

- Status: Accepted / Implemented
- Date: 2026-10-02
- Decision owner: SpecForge 产品负责人
- Scope: Service Management、Windows 部署边界、CLI 服务命令与发布验证

## Context

当前实现把 NSSM 作为 Windows 服务宿主，并假定其位于 `<OpenCode config>/sf-user/bin/nssm.exe`。当前安装器和发布清单并未提供该二进制，产品规格此前也没有选择 NSSM、规定其供应链或要求 Windows 系统服务注册。把既有实现反推为产品依赖会越过产品权威。

## Decision

1. NSSM 不属于当前产品、安装器、发布物或运行依赖，删除其生产代码、CLI 分支、类型、错误码和测试消费者。
2. 当前 OS service registration 仅支持 Linux `systemd --user`。
3. Windows 保留由 user/operator、SpecForge CLI 或受控部署进程直接启动独立 Daemon 进程的能力，但当前不提供 Windows 系统服务注册或开机自启动。
4. Windows 上调用 OS service 管理命令必须明确返回平台不支持，不得静默改用其他宿主。
5. 未来若需要 Windows 系统服务，必须重新进行产品裁决、宿主选型、供应链审查、安装部署设计和真实环境验收。

## Consequences

- Thin Plugin 仍然只连接 Daemon，不获得生命周期所有权。
- Linux systemd 用户服务路径保持不变。
- 删除 NSSM 环境预检和 Windows NSSM 生命周期测试；发布验证不再以 NSSM 或管理员会话为前提。
- ADR、ERR、审计与归档中的既有 NSSM 记录继续作为历史证据保留，不代表当前产品依赖。
