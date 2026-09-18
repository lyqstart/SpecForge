# @specforge/scope-gate

`@specforge/scope-gate` 是 SpecForge 当前发布的 **Release / Build Governance** 门禁，不属于业务 Runtime。

## 当前产品权威

当前唯一产品规格：

- `docs/product-specification/specforge-product-specification.md`

Authority Registry：

- `docs/product-specification/authority-registry.md`

Scope Gate 从 Product Specification 内的 `SPECFORGE_RELEASE_AUTHORITY_ITEMS` 机器投影读取批准的 release set，并把投影绑定到 Product Specification 当前字节 SHA256。

它不得从 `.kiro/**`、implementation matrix、package 存在性、测试、feature flag 或 runtime registry 推导产品范围。

## 当前职责

- 从唯一 Product Specification 投影 current release set；
- 归一化 release authority 与 artifact inventory；
- 枚举 package export、clean build、dynamic registry、installer asset、release manifest、runtime entry 等发布表面；
- 比较批准集合与实际候选集合；
- 对 missing、unexpected、非法依赖、来源漂移和证据不完整执行 fail closed；
- 为正式 release precheck 提供 Scope Gate 判断内核。

## 非职责

Scope Gate 不负责：

- 业务 Runtime capability registry；
- P1/P2 runtime feature flag；
- 产品需求或模块范围定义；
- workflow state；
- Permission / Write Guard；
- 通过“默认关闭”把范围外能力留在正式 artifact。

产品范围变化必须先由产品负责人更新 Product Specification，再由 Scope Gate 验证新的 release mapping。

## 历史资料

`docs/cli.md`、`docs/error-codes.md`、`docs/developer-guide.md` 中仍保留早期 runtime scope / feature-flag 模型，作为历史设计证据。其旧命令、REQ-25 和 Kiro 路径不得作为当前操作指南。
