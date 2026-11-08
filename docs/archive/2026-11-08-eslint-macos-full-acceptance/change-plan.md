# ESLint与macOS全量验收计划

模式CODEX_DIRECT。先保留并重现完整lint，逐包核对实际版本、配置继承、声明范围、规则和诊断；责任层为开发工具/Workspace编排/CI消费者，不改变SPS产品能力。统一可执行工具链，保留各包已承诺规则的有效语义，逐项修复源码/格式问题，不能通过关闭规则、跳过源码、放宽错误预算取得绿色。批量格式修复仅在明确范围/原始哈希/语法结构对照后执行。

Mac全量使用真实macos-latest CI，正式当前12包构建、11个有测试包及Root入口；保留真实平台排除并分别报告，模拟平台不计。CI扩大到Windows/Linux/macOS全量及完整lint。所有失败先分类、保留原始回执再修复。受影响运行代码变化后按风险重建发布/部署并核验真实加载与原闭合交付保护，不重跑原业务或模型。单维护者codex分支验证后快进main并带expected-old lease推送，不建PR。

四类实际写入分别记录：TRUTH_SOURCE_WRITES仅唯一状态与必要产品版本标识；REPOSITORY_TRACKED_WRITES为批准工具链/当前包源码测试/文档/CI；RUNTIME_OBSERVER_WRITES为自有build/test/release/CI/部署运行日志；EXTERNAL_EVIDENCE_WRITES为本根回执/快照/报告。禁止访问D:/code/t2、t3，禁止手改原业务真相源、启用未来能力或扩大D23范围。
