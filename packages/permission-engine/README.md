# @specforge/permission-engine

当前发布的内部权限库；生产部署通过仓库官方发布和安装器完成，不单独安装本包。产品边界由 SPS 与 Authority Registry 定义。

`src/index.ts` 导出 `PermissionEngine`、规则求值、策略加载、事件记录与插件加载校验。`src/write-decision.ts` 提供 Work Item 写入判定和受控产物写入边界。包运行依赖为共享 types、YAML 与 Zod，不反向依赖 daemon-core。

通用策略求值器不是产品执行授权入口。实际工具调用仍由 Daemon 的真实角色、Runtime 状态、受控 Tool Handler、Write Guard、HardStop 与审计共同约束；调用本库不能替代批准、Code Permission、Gate 或 Close。D18 `sf_safe_bash` 保持只读；D23 受控验证只在已批准的平台与 profile 内运行，由 `sf-orchestrator` 调用 `sf_verification_plan`、`sf-verifier` 调用 `sf_verification_run`。

从仓库根完成 `bun install --frozen-lockfile` 和 `bun scripts/build-workspace.ts` 后，在本包目录运行 `bun run test`。正式全量回归入口是根目录的 `bun scripts/test-workspace.ts`。其他开发脚本以本包 `package.json` 为准。`PROJECT_STRUCTURE.md` 是历史实施报告。
