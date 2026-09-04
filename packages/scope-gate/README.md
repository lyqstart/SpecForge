# @specforge/scope-gate

`@specforge/scope-gate` 是 SpecForge V6 当前发布的构建期/发布期一致性门禁。

它从 V6 requirements、design 和当前 release matrix 投影发布权威，并校验 package exports、clean build、运行时产物、安装清单、插件资产、动态 registry 与各 owner snapshot 是否属于同一个候选版本和同一份权威字节。

## 当前职责

- 投影并绑定当前发布权威文件的 SHA256；
- 归一化发布权威和 artifact inventory；
- 构建 package、build artifact 和 owner snapshot 表面报告；
- 对 missing、unexpected、重复、来源漂移和证据不完整执行 fail closed；
- 为正式 release precheck 提供唯一 Scope Gate 判断入口。

## 非职责

本包不进入业务 Runtime，不管理 capability registry，不提供 P1/P2 runtime feature flags，也不提供 scope-context、feature-flag 或 scope-tag CLI。范围外能力必须在构建/发布阶段退出 artifact，不能依赖“默认关闭”实现隔离。

当前权威边界见：

- `.kiro/specs/v6-architecture-overview/requirements.md`
- `.kiro/specs/v6-architecture-overview/design.md`
- `docs/implementation/architecture-consistency/current-release-module-and-change-disposition-matrix.md`
- `docs/adr/ADR-013-current-release-boundary-and-no-legacy-compatibility.md`

历史 `docs/` 与 `artifacts/` 记录保留用于审计，不代表当前可执行产品表面。
