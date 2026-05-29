# 验证报告

## 结果汇总

| 指标 | 数值 |
|------|------|
| 总检查数 | 17 |
| 通过 | 17 |
| 失败 | 0 |
| 结论 | pass |

## 验证命令

| 命令 | 状态 | 输出摘要 |
|------|------|----------|
| `bun test scripts/lint/__tests__/check-hardcoded-paths.test.ts` | ✅ pass | 6 pass / 0 fail / 6 expect() calls |
| `bun run scripts/lint/check-hardcoded-paths.ts` | ✅ pass | ✓ No hardcoded path violations found. (exit 0) |
| `故意触发: .tmp/bad-trigger.md 含 'specforge/runtime/foo.json'` | ✅ pass | VIOLATION detected, lint exit 1 — subpath 匹配正确 |
| `render-layout SHA-256 幂等性验证` | ✅ pass | README.md: MATCH, AGENTS.md: MATCH, directory-layout.md: MATCH |
| `bun test tests/architecture/` | ✅ pass | 28 pass / 0 fail / 178 expect() calls |
| `sf-verifier 模板检查: 端到端文件系统冒烟` | ✅ pass | 3 处匹配确认 |
| `CI YAML: lint-hardcoded-paths + render-layout-consistency` | ✅ pass | 两个 job 存在且结构正确 |

## 验收标准

| 需求 | 名称 | 状态 | 证据 |
|------|------|------|------|
| C1 | lint 正则泛化 + 测试 | ✅ pass | 6 个测试全部 pass；故意触发 subpath 违规 → lint exit 1 |
| C2 | .md 扫描 + 白名单 | ✅ pass | lint exit 0，白名单覆盖全部合法引用 |
| C3 | marker + render | ✅ pass | README.md 和 AGENTS.md 包含 marker 且内容已注入；SHA-256 幂等性验证通过；时间戳已移除 |
| C4 | verifier 冒烟模板 | ✅ pass | sf-verifier.md 含完整 4 步冒烟流程 + 5 条不变性断言 + 运行期警告 |
| C5 | CI 集成 | ✅ pass | code-quality.yml 含 2 个新 job，结构正确 |

## 端到端测试

| 测试名称 | 状态 | 证据 |
|----------|------|------|
| lint 单元测试（6 cases） | ✅ pass | T1-T6 全部 pass |
| lint 全仓扫描 | ✅ pass | exit 0, 无违规 |
| 故意触发 subpath 违规 | ✅ pass | exit 1, 正确检测 |
| render-layout 幂等性 | ✅ pass | SHA-256 三文件 MATCH |
| 架构测试回归 | ✅ pass | 28 pass / 0 fail |

## 副作用

无副作用。marker 修复后所有验证通过。

## 回归测试覆盖

回归测试覆盖了 `impact_analysis.md` 声明的全部受影响区域：

| 受影响区域 | 回归测试 | 结果 |
|------------|----------|------|
| scripts/lint/check-hardcoded-paths.ts | bun test scripts/lint/__tests__/ (6 cases) | ✅ pass |
| .lintrc-layout.json 白名单 | bun run scripts/lint/check-hardcoded-paths.ts (exit 0) | ✅ pass |
| scripts/render-layout.ts | SHA-256 幂等性验证 | ✅ pass |
| README.md / AGENTS.md markers | grep BEGIN:directory-layout + render-layout 注入 | ✅ pass |
| setup/userlevel-opencode/agents/sf-verifier.md | grep 端到端文件系统冒烟 | ✅ pass |
| .github/workflows/code-quality.yml | YAML 结构验证 + job 存在检查 | ✅ pass |
| tests/architecture/ (整体回归) | bun test tests/architecture/ (28 pass) | ✅ pass |

## 受影响区域验证

根据 impact_analysis.md 的变更范围，逐项验证：

1. **C1 正则泛化**：两个正则已更新，6 个测试用例覆盖向后兼容（T1）、单段 subpath（T2）、多段 subpath（T3）、npm scope 排除（T4/T5）、注释跳过（T6）→ ✅
2. **C2 .md 扫描 + 白名单**：collectTargetFiles 同时收集 .ts 和 .md；shouldSkipLine 支持 Markdown 注释和代码块；白名单扩展覆盖所有合法引用；lint exit 0 → ✅
3. **C3 marker 注入**：README.md 和 AGENTS.md 包含 marker 对；render-layout 注入内容正确；SHA-256 幂等性验证通过；时间戳已移除 → ✅
4. **C4 verifier 冒烟模板**：sf-verifier.md 含完整 4 步流程 + 5 条不变性断言 + 运行期无残留警告 → ✅
5. **C5 CI 集成**：code-quality.yml 含 lint-hardcoded-paths 和 render-layout-consistency 两个 job → ✅

## 结论

**结论：pass**

WI-014 全部 5 个修改项验证通过，回归测试覆盖 impact_analysis.md 声明的全部受影响区域。

WI-014 全部 5 个修改项验证通过。C1 lint 正则泛化（6 测试 + 故意触发）；C2 .md 扫描 + 白名单（lint exit 0）；C3 marker 注入 + render-layout 幂等（SHA-256 MATCH）；C4 verifier 冒烟模板（完整）；C5 CI 集成（2 job）。