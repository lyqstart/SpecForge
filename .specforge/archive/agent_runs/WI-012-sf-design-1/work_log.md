## WI-012 sf-design 执行报告

### 状态
**成功** - `refactor_plan.md` 已生成

### 产出文件
- `.specforge/specs/WI-012/refactor_plan.md`（632 行）

### 文档结构

| Section | 内容 |
|---------|------|
| §1 重构策略 | 四阶段策略（防线建设 + 白名单驱动 + 自动生成 + 清扫清理），核心原则 |
| §2 不变行为声明 | IB-1~IB-6（测试通过、daemon 行为不变、目录结构一致、编译通过、安装器通过、零功能修改） |
| §3 步骤顺序 | 8 个精确步骤，每步含产出文件、功能规格、验证方式、不变行为检查 |
| §4 风险等级判定 | 最终风险等级：低，走低风险路径（跳过 review），含缓解措施表 |
| §5 产出文件汇总 | 新增文件（10 个）、修改文件（3 个）、可能修改/移动文件 |
| §6 关键参考文件 | 8 个关键输入文件的引用 |

### 8 个步骤概要

| Step | 内容 | 风险 |
|------|------|------|
| 1 | CI Lint 规则 `check-hardcoded-paths.ts` + `.lintrc-layout.json` + `lint:layout` script | 极低 |
| 2 | Architecture Test `directory-layout.test.ts` | 极低 |
| 3 | 存量违规清扫（预期 0 违规） | 低 |
| 4 | 填充 `docs/conventions/`（README + wi-lifecycle + glossary + workflow-types + agent-roles + meta-json-spec） | 极低 |
| 5 | 确认根目录残留临时文件已删除 | 极低 |
| 6 | 移动 `.kiro/specs/_archive/` → `docs/archive/kiro-specs/`（需用户确认） | 极低 |
| 7 | 更新 README.md 顶层导航 + 目录结构段 | 极低 |
| 8 | 全量回归测试（test + verify + lint + typecheck） | 无 |

### 自检清单
- [x] 每个问题点（P2-1~P2-6）都有对应步骤覆盖
- [x] 每个步骤都有 `refs` 和 `constrained_by` 标注
- [x] 8 个步骤顺序精确，每步后代码可运行
- [x] Step 6 标注"需用户确认"
- [x] 风险等级判定为"低"，走低风险路径
- [x] IB-1~IB-6 不变行为声明完整
- [x] 每步都有不变行为检查清单
- [x] 产出文件汇总表完整（新增 10 + 修改 3 + 可能修改/移动）
- [x] 关键参考文件列表完整