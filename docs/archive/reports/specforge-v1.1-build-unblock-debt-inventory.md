# SpecForge v1.1 build / test unblock 债务清单

版本：v1.0  
阶段：Post-P0 Hardening / 工作包 A  
目标分支：`hardening/v1.1-post-p0-cleanup`

## 1. 结论

P0 governance regression test 已经固化并通过局部测试，`bun run build` 也已通过。当前全量 `bun test` 失败不应再归因到 P0 测试，而应进入 build/test 债务治理。

当前全量测试失败集中在以下几类：

1. 测试引用 `.opencode` 运行时目录，但仓库当前没有该目录。
2. 测试仍按旧架构断言，例如 `EventLogger`、18 个 handler、旧 handshake 字符串位置。
3. 测试引用已经不存在的导出名，例如 `USER_LAYOUT`、`toNative`。
4. WAL integrity 返回结构与测试断言不一致。
5. workflow JSON / 状态机契约与测试预期不一致。
6. 测试运行会产生未跟踪污染产物，例如 `tests/unit/artifacts/`、`tests/integration/fixtures/sf_v6_arch_check/backup/`。

## 2. 债务清单

| 类别 | 代表失败 | 当前放宽/失败方式 | 风险 | 建议修复 | 是否影响运行时安全 | 优先级 |
|---|---|---|---|---|---|---|
| `.opencode` 路径依赖 | `plugin-integrity.test.ts`、`skill-autoload-strategies.test.ts`、`tool-dispatcher-e2e.test.ts`、`tool-http-shells.test.ts` | 测试直接读取仓库根目录 `.opencode` | 仓库源码与安装产物边界混乱，CI 不稳定 | 改为读取 `setup/userlevel-opencode` 源产物，或先运行 installer fixture 再验证安装结果 | 间接影响发布验证 | P1 |
| 旧架构断言 | `daemon-wiring.test.ts` 仍断言 `EventLogger`、`handshake.json` 文本位置、18 handlers | 测试断言硬编码旧结构 | 测试不能反映真实架构 | 改为验证 public API / path-resolver 行为，不直接扫字符串 | 否 | P1 |
| 导出名变化 | `USER_LAYOUT`、`toNative` 不存在 | 测试引用已删除导出 | 全量测试无法启动 | 同步测试到当前 `directory-layout.ts`、`scripts/lib/paths.ts` 的真实导出 | 否 | P1 |
| WAL 返回结构变化 | `committedEventCount` 为 `undefined` | 测试断言旧字段 | 崩溃恢复测试失真 | 先确认 `verifyWalIntegrity` 当前返回结构，再改断言或补兼容字段 | 可能影响恢复可信度 | P0/P1 |
| workflow 契约漂移 | `feature_spec.json`、`bugfix_spec.json` 无法从 initial 到 completed | 测试假设旧状态机 | workflow path 可信度下降 | 建立 workflow_path contract 测试，按当前 v1.1 标准统一状态路径 | 可能影响流程治理 | P1 |
| 测试污染产物 | `tests/unit/artifacts/`、`tests/integration/fixtures/sf_v6_arch_check/backup/` | 测试输出进入工作区未跟踪 | commit 容易混入垃圾文件 | 加入 `.gitignore`，后续修测试 teardown | 否 | P0 |

## 3. 本工作包处理范围

本工作包只做两件事：

1. 固化 build/test 债务清单。
2. 忽略确认过的测试污染产物目录。

不做：

1. 不改业务逻辑。
2. 不修所有全量测试。
3. 不删除现有测试。
4. 不调整 Skill。
5. 不修改 daemon 状态模型。

## 4. 下一步建议

后续按以下顺序推进：

1. 修复 `.opencode` 测试源路径，把测试从安装后产物迁移到仓库源产物或 installer fixture。
2. 修复导出名变化导致的测试启动失败。
3. 修 WAL integrity 返回结构与测试断言。
4. 重写 workflow_path contract 测试，替代旧 happy path 字符串扫描。
5. 最后再跑全量 `bun test` 作为稳定化验收。
