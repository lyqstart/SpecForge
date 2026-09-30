# SpecForge Semantic Closure Producer Result

## 目标

本包补齐 `.semantic_closure.json` 的生产者，避免 close gate 已经强制要求语义闭包，但流程中没有稳定生成入口。

## 完成内容

### 新增 runtime/tool 代码

- `packages/daemon-core/src/tools/lib/semantic-closure-builder.ts`
  - 从显式语义材料生成 `.semantic_closure.json`。
  - 支持来源：
    1. `verification_report.md` 中 fenced JSON `semantic_closure`；
    2. `evidence/evidence_manifest.json` 中的 `semantic_closure` 或结构化 sections；
    3. `trace_delta.md` 中明确 `OUT -> REQ -> DD -> TASK -> EV` 链。
  - 不从 prose、文件存在、编译通过中猜测语义完成。

- `packages/daemon-core/src/tools/handlers/sf-semantic-closure-run.ts`
  - 注册内部工具：`sf_v11_semantic_closure_run`。
  - 写入：
    - `.semantic_closure.json`
    - `semantic_closure_report.md`
  - 不推进状态，不修改代码，不修改项目级真相源。

- `packages/daemon-core/src/tools/index.ts`
  - 导入 handler。
  - 增加公开别名：`sf_semantic_closure_run -> sf_v11_semantic_closure_run`。

### 更新校验核心

- `packages/daemon-core/src/tools/lib/semantic-closure-core.ts`
  - 更新注释：核心已由 producer 生成、close gate 消费。
  - 稀疏证据 `{ id, status }` 不得作为完成证据；既无 `level` 又无 `type/evidence_type` 时按弱证据处理。

### 新增测试

- `packages/daemon-core/tests/unit/semantic-closure-builder.test.ts`
- `packages/daemon-core/tests/unit/sf-semantic-closure-run.test.ts`

覆盖：

1. 显式 `OUT -> REQ -> DD -> TASK -> EV` 链可以生成通过的语义闭包；
2. 没有显式链时失败，不从 prose 猜测；
3. compile-only / file-only 弱证据不能证明完成；
4. verification_report 中 curated JSON 优先；
5. handler 能写入 `.semantic_closure.json` 和 `semantic_closure_report.md`；
6. 已有 `.semantic_closure.json` 默认不覆盖，除非 `force=true`。

### 更新 Agent 文档

- `setup/userlevel-opencode/agents/sf-orchestrator.md`
  - close gate 前必须调用 `sf_semantic_closure_run`。
  - 如果 `semantic_closure_valid=false`，不得继续 close。

- `setup/userlevel-opencode/agents/sf-verifier.md`
  - verifier 必须提供机器可读语义闭包来源。
  - 不能只用“文件存在、编译通过、测试跑过”作为用户目标完成证明。

## 正确调用顺序

```text
verification_report + evidence_manifest + trace_delta 完成
→ sf_semantic_closure_run(work_item_id=WI-XXXX)
→ 若 semantic_closure_valid=true，再调用 sf_close_gate
→ 若 semantic_closure_valid=false，回退给 verifier/requirements/design/tasks 修复语义缺口
```

## 关键原则

`sf_semantic_closure_run` 是生产者，不是豁免器。它只把显式语义关系转为机器可读 manifest；如果上游没有显式关系，它会生成失败诊断，而不是猜测一个通过结果。
