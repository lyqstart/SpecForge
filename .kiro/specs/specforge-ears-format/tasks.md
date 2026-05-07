# 实现计划：EARS 格式验证

## 概述

本实现计划将 SpecForge 的验收标准格式从自由文本迁移到 EARS（Easy Approach to Requirements Syntax）格式。实现分为四个阶段：类型定义、EARS 解析器核心逻辑、Gate 集成、Prompt/Skill 文本更新。使用 TypeScript 实现，Vitest + fast-check 进行测试。

## Tasks

- [ ] 1. 创建 EARS 类型定义和路径安全模块
  - [ ] 1.1 创建 `sf_ears_types.ts` 类型定义文件
    - 在 `.opencode/tools/lib/sf_ears_types.ts` 中定义所有 EARS 相关类型
    - 包含：`EarsPattern`、`ValidationMode`、`ACValidationResult`、`ACIssue`、`EarsIssueCode`、`EARS_KEYWORDS`、`VALID_PATTERN_LABELS`、`ExtractedAC`、`EarsGateDetails`
    - 定义正则表达式常量（RE_STRIP_NUMBER、RE_PATTERN_LABEL、RE_UBIQUITOUS 等）
    - strict mode 仅接受大写 EARS 关键词；legacy mode 对小写关键词给出 warning
    - 新增 `INVALID_LABEL` issue code（[Pattern-label] 不属于合法枚举）
    - _Requirements: 7.1-7.10, 2.1, 5.2_

  - [ ] 1.2 实现 `resolveRequirementsPath` 路径安全校验函数
    - 在 `sf_ears_parser.ts` 中实现路径安全校验
    - 拒绝绝对路径（`/`、`C:\`、`D:\` 等开头）
    - 拒绝包含 `..` 的路径
    - resolve 后验证仍位于 specDirectory 内
    - 错误消息仅返回相对路径，不暴露绝对路径
    - _Requirements: 10.2, 10.3_

  - [ ] 1.3 编写路径安全属性测试
    - **Property 14: 路径安全拒绝绝对路径和路径遍历**
    - **Validates: Requirements 10.2, 10.3**

- [ ] 2. 实现 EARS 解析器核心逻辑
  - [ ] 2.1 实现 `stripPrefixes` 函数
    - 从 AC 原始字符串中剥离编号前缀 `N.` 和 `[Pattern-label]`
    - 返回 `{ body, declaredPattern }` 结构
    - 处理编号后有/无空格、标签后有/无空格的情况
    - _Requirements: 7.7, 5.1_

  - [ ] 2.2 实现 `detectPattern` 分类算法（Complex 优先）
    - 先统计条件子句（WHERE/WHILE/WHEN/IF）数量和位置
    - 两个或以上条件子句时判定为 Complex，验证子句顺序（WHERE → WHILE → WHEN/IF）
    - WHEN 和 IF 不允许同时出现
    - 单条件子句或无条件时按基础模式分类（Optional-feature、State-driven、Event-driven、Unwanted-behavior、Ubiquitous）
    - strict mode 仅匹配大写关键词；legacy mode 大小写不敏感但对小写给 warning
    - _Requirements: 7.1-7.10_

  - [ ] 2.3 编写模式分类属性测试
    - **Property 1: 模式分类正确性**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 2.1**

  - [ ] 2.4 实现 `validateAC` 单条 AC 验证函数
    - 执行四步流水线：剥离前缀 → 检测模式 → 比较标签 → 生成结果
    - 检测结构性错误：缺少 SHALL、缺少 THE、IF 缺少 THEN、条件子句后缺少逗号
    - 检测空 AC、超长 AC（>2000 字符）
    - 根据 mode（strict/legacy）决定 issue 的 severity
    - 对 AC 内容中的特殊字符进行安全处理（不构造动态正则）
    - 对非法 [Pattern-label]（不属于 VALID_PATTERN_LABELS 枚举）返回 INVALID_LABEL 错误
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 8.1-8.6_

  - [ ] 2.5 编写结构性错误检测属性测试
    - **Property 7: 结构性错误检测**
    - **Validates: Requirements 8.1, 8.2, 8.4**

  - [ ] 2.6 编写 Complex 模式子句顺序属性测试
    - **Property 8: Complex 模式子句顺序验证**
    - **Validates: Requirements 7.8, 7.9, 7.10**

  - [ ] 2.7 实现 `extractAcceptanceCriteria` AC 提取函数
    - 只提取 `#### Acceptance Criteria` 小节下的顶层编号列表
    - fenced code block（` ``` `）内的内容一律忽略
    - 遇到下一个 `### Requirement` 或同级/更高级标题时停止
    - 多行 AC：续行（不以新编号开头）并入上一条 AC
    - 支持 CRLF 和 LF 换行符
    - 无 AC section 时返回空数组（不报错，由调用方根据 mode 决定行为）
    - 返回结构需能区分"无 AC section"和"有 AC section 但无 AC"：返回 `{ acs: ExtractedAC[], sections: { requirementId: string, lineStart: number, acCount: number }[] }`
    - _Requirements: 2.1, 9.2_

  - [ ] 2.8 编写 AC 提取 code block 忽略属性测试
    - **Property 11: AC 提取不读取 fenced code block**
    - **Validates: Requirements 2.1**

- [ ] 3. Checkpoint - 确保解析器核心逻辑测试通过
  - 确保所有测试通过。如测试失败，先自行定位并修复；仅遇到需求/设计矛盾且无法按本文档决策时才请求用户确认。

- [ ] 4. 实现验证模式选择和批量验证
  - [ ] 4.1 实现 `parseValidationMode` 函数
    - 解析 YAML front-matter 中的 `requirements_format` 字段
    - 值为 `ears` → 返回 strict mode
    - 值为 `legacy` → 返回 legacy mode
    - 无 front-matter 或无该字段 → 返回 legacy mode
    - 值既非 `ears` 也非 `legacy` → 返回错误，消息指明无效值
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 4.1, 4.4_

  - [ ] 4.2 编写验证模式选择属性测试
    - **Property 2: 验证模式选择正确性**
    - **Validates: Requirements 6.1, 6.2, 6.3, 4.1, 4.4**

  - [ ] 4.3 编写无效格式值拒绝属性测试
    - **Property 3: 无效格式值拒绝**
    - **Validates: Requirements 6.4**

  - [ ] 4.4 实现 `validateAllACs` 批量验证函数
    - 调用 `extractAcceptanceCriteria` 提取所有 AC
    - 逐条调用 `validateAC` 进行验证
    - strict mode 下，存在 AC section 但无 AC 时报告 blocking issue
    - legacy mode 下，存在 AC section 但无 AC 时报告 warning
    - 单条 AC 验证失败不影响其他 AC（异常隔离）
    - _Requirements: 2.1, 2.2, 2.5, 9.2_

  - [ ] 4.5 编写 strict 模式阻塞属性测试
    - **Property 4: Strict 模式对无效 EARS 的阻塞**
    - **Validates: Requirements 2.2, 2.4, 2.6**

  - [ ] 4.6 编写 legacy 模式非阻塞属性测试
    - **Property 5: Legacy 模式的非阻塞性**
    - **Validates: Requirements 2.5, 4.2**

  - [ ] 4.7 编写标签不匹配检测属性测试
    - **Property 6: 标签与检测模式不匹配检测**
    - **Validates: Requirements 8.5**

- [ ] 5. 实现 Gate 集成
  - [ ] 5.1 实现 `checkEarsCompliance` 函数
    - 在 `sf_ears_parser.ts` 中实现，返回 `{ blocking_issues, warnings, details: EarsGateDetails }`
    - 调用 `parseValidationMode` 确定模式
    - 调用 `validateAllACs` 执行验证
    - 根据 mode 将 issues 分类为 blocking_issues 或 warnings
    - 返回 `EarsGateDetails`（mode、total_acs、passed、warnings、failed、results）供测试使用
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [ ] 5.2 集成 EARS 验证到 `sf_requirements_gate_core.ts`
    - 在 `existingRequirementsGateCheck` 函数中集成 EARS 验证
    - 在现有检查（用户故事、验收标准、术语表）之后执行
    - 先调用 `resolveRequirementsPath` 校验路径安全
    - 检查文件大小（>1MB 拒绝处理）
    - 调用 `checkEarsCompliance` 执行 EARS 验证
    - 合并 blocking_issues 和 warnings 到 GateResult
    - 有 blocking_issues 时设置 `next_action: "revise"`
    - 保持向后兼容：无 front-matter 的文档默认 legacy mode，不阻塞
    - _Requirements: 2.1-2.6, 4.1, 4.2, 4.4, 9.4, 10.4_

  - [ ] 5.3 编写 Gate 集成单元测试
    - 测试向后兼容性（无 front-matter 文档通过）
    - 测试 strict mode 下格式错误阻塞
    - 测试 legacy mode 下仅产生 warning
    - 测试文件大小超限拒绝
    - 测试 EarsGateDetails 返回结构
    - _Requirements: 2.3, 4.1, 4.2, 9.4, 10.4_

  - [ ] 5.4 编写解析器鲁棒性属性测试
    - **Property 9: 解析器对特殊字符的鲁棒性**
    - **Validates: Requirements 9.3, 10.5**

  - [ ] 5.5 编写错误消息不暴露绝对路径属性测试
    - **Property 10: 错误消息不暴露绝对路径**
    - **Validates: Requirements 10.3**

  - [ ] 5.6 编写 strict 模式结构不完整 AC 属性测试
    - **Property 12: strict mode 下结构不完整的 AC 必须 blocking**
    - 覆盖：缺少编号、缺少 [Pattern-label]、非法 [Pattern-label]（INVALID_LABEL）
    - strict mode 下均为 blocking；legacy mode 下均为 warning
    - **Validates: Requirements 2.6, 5.1, 5.2**

  - [ ] 5.7 编写空 subject/response 属性测试
    - **Property 13: THE subject 和 SHALL response 为空时报告结构错误**
    - **Validates: Requirements 8.1, 8.2**

  - [ ] 5.8 编写空文档/无 AC section 属性测试
    - **Property 15: 空文档 / front-matter only / 无 AC section**
    - **Validates: Requirements 2.1, 4.1**

  - [ ] 5.9 编写性能基准测试
    - 构造 200KB 且 500 条 AC 的 requirements.md 测试文件
    - 验证 EARS validation 在 1 秒内完成
    - 构造 >200KB 或 >500 AC 但 <=1MB 的文档
    - 验证在 5 秒内返回 validation result 或 limit issue
    - 验证不崩溃、不挂起
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 6. Checkpoint - 确保 Gate 集成测试通过
  - 确保所有测试通过。如测试失败，先自行定位并修复；仅遇到需求/设计矛盾且无法按本文档决策时才请求用户确认。

- [ ] 7. 更新 Prompt 和 Skill 文本
  - [ ] 7.1 更新 `sf-requirements.md` Agent prompt
    - 在 `.opencode/agents/sf-requirements.md` 中新增 EARS 格式编写指令
    - 添加六种 EARS Pattern 的格式说明和示例
    - 添加 AC 标准输出格式规范：`N. [Pattern-label] EARS句式.`
    - 添加 `requirements_format: ears` 元数据声明指令
    - 添加条件子句末尾逗号规则
    - 添加 Glossary 规则：每条 AC 中 `THE <system>` 的 system subject 必须在 Glossary 中定义；重复 system subject 只定义一次
    - _Requirements: 1.1-1.9, 4.3, 5.1-5.4_

  - [ ] 7.2 更新 `superpowers-brainstorming/SKILL.md`
    - 在 `.opencode/skills/superpowers-brainstorming/SKILL.md` 中新增第 8 维度"EARS 模式覆盖"
    - 引导考虑六种 EARS Pattern：Ubiquitous、Event-driven、State-driven、Optional-feature、Unwanted-behavior、Complex
    - 确保在"需求编写"步骤之前展示 EARS 模式引导
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 8. Final checkpoint - 确保所有测试通过
  - 确保所有测试通过。如测试失败，先自行定位并修复；仅遇到需求/设计矛盾且无法按本文档决策时才请求用户确认。

## Notes

- 所有 Property 测试均为必做验收任务，不可跳过
- 若需要加速 MVP，可减少 fast-check 迭代次数（最低 50 次），但不能跳过 Property 测试
- 每个 task 引用了具体的 requirements 编号以确保可追溯性
- Checkpoints 确保增量验证
- Property tests 验证正确性属性的普遍性
- 单元测试验证具体示例和边界情况
- 设计文档使用 TypeScript，所有代码示例和实现均使用 TypeScript
- `detectPattern` 必须使用 Complex 优先算法，避免多子句句式被错误分类为基础模式
- `checkEarsCompliance` 返回 `details: EarsGateDetails` 以支持可测试性
- `resolveRequirementsPath` 必须在 EARS 验证之前调用
- strict mode 仅接受大写 EARS 关键词；legacy mode 对小写给 warning
- 多行 AC 续行并入上一条 AC

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.7"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.8"] },
    { "id": 4, "tasks": ["2.5", "2.6", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 6, "tasks": ["4.5", "4.6", "4.7", "5.1"] },
    { "id": 7, "tasks": ["5.2"] },
    { "id": 8, "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7", "5.8"] },
    { "id": 9, "tasks": ["7.1", "7.2"] }
  ]
}
```
