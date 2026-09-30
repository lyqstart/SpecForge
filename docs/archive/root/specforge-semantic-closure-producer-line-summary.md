# Semantic Closure Producer Line Summary

| 文件 | 类型 | 说明 |
|---|---|---|
| `packages/daemon-core/src/tools/lib/semantic-closure-builder.ts` | 新增 | 语义闭包生成器 |
| `packages/daemon-core/src/tools/handlers/sf-semantic-closure-run.ts` | 新增 | 生成 `.semantic_closure.json` 的 tool handler |
| `packages/daemon-core/src/tools/index.ts` | 修改 | 注册 handler 和公开别名 |
| `packages/daemon-core/src/tools/lib/semantic-closure-core.ts` | 修改 | 稀疏证据按弱证据处理 |
| `packages/daemon-core/tests/unit/semantic-closure-builder.test.ts` | 新增 | builder 单元测试 |
| `packages/daemon-core/tests/unit/sf-semantic-closure-run.test.ts` | 新增 | handler 单元测试 |
| `setup/userlevel-opencode/agents/sf-orchestrator.md` | 修改 | close 前调用 `sf_semantic_closure_run` |
| `setup/userlevel-opencode/agents/sf-verifier.md` | 修改 | verifier 必须提供机器可读闭包来源 |
| `docs/specforge-semantic-closure-producer-result.md` | 新增 | 本包说明 |
| `docs/specforge-semantic-closure-producer-line-summary.md` | 新增 | 文件清单 |
