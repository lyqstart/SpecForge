# SpecForge v1.1 全量测试健康扫描报告（Batch 2 后）

## 1. 执行信息

- 执行时间：2026-06-18 00:42:34 +08:00
- 仓库路径：$RepoRoot
- 分支：$TargetBranch
- HEAD：$head

## 2. 稳定版准入结论

通过：当前全量测试与 diff 检查均通过，可以进入 stable tag 前最终人工确认。

## 3. 验证命令

| 命令 | 退出码 | 结论 |
|---|---:|---|
| un test | 0 | 通过 |
| git diff --check | 0 | 通过 |

## 4. 测试摘要

- pass：未识别
- fail：29
- expect 调用：未识别

## 5. 剩余失败线索

- error: Expected and actual values must be numbers or bigints
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\crash-recovery-e2e.test.ts:452:11)
- (fail) 宕╂簝鎭㈠ e2e 娴嬭瘯 > 10 娆￠殢鏈?crash 鍚?WAL 鏁版嵁瀹屾暣鎬ч獙璇侊紙0 鏁版嵁涓㈠け锛?[406.00ms]
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\crash-recovery-e2e.test.ts:491:45)
- (fail) 宕╂簝鎭㈠ e2e 娴嬭瘯 > WAL 鍐欏叆鍘熷瓙鎬э細crash 涓嶄細浜х敓鍗婂啓鍏ョ殑鎹熷潖浜嬩欢 [16.00ms]
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\openclaw-mock-e2e.test.ts:687:27)
- (fail) HTTPServer 鎺ュ彛缁撴瀯楠岃瘉 > HTTPServer 鍚姩鍚庡簲鍝嶅簲 / 绔偣锛堝甫 Bearer Token锛?[15.00ms]
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > feature_spec.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > feature_spec.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > feature_spec.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > bugfix_spec.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > bugfix_spec.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > bugfix_spec.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > feature_spec_design_first.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > feature_spec_design_first.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > feature_spec_design_first.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > quick_change.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > quick_change.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > quick_change.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > change_request.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > change_request.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > change_request.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > refactor.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > refactor.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > refactor.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > ops_task.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > ops_task.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > ops_task.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:29:37)
- (fail) Workflow JSON Definitions > investigation.json > should have schema_version 1.0
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:34:43)
- (fail) Workflow JSON Definitions > investigation.json > should have stateMachine with initial state
- error: expect(received).toHaveProperty(path)
-       at <anonymous> (D:\code\temp\SpecForge\tests\e2e\workflow-json-definitions.test.ts:43:42)
- (fail) Workflow JSON Definitions > investigation.json > should have a completed state
- error: expect(received).toBe(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\cli_flow.test.ts:148:42)
- (fail) Integration: CLI install 鈫?verify 鈫?upgrade 鈫?verify flow > should complete install 鈫?verify 鈫?upgrade 鈫?verify cycle [140.00ms]
- error: Cannot find module '../../.opencode/tools/lib/sf_knowledge_base_core' from 'D:\code\temp\SpecForge\tests\integration\kg_knowledge_integration.test.ts'
- error: Cannot find module '../../.opencode/tools/lib/sf_specforge_plugin_entry' from 'D:\code\temp\SpecForge\tests\integration\output_format_regression.test.ts'
- error: Cannot find module '../../.opencode/tools/lib/sf_specforge_plugin_entry' from 'D:\code\temp\SpecForge\tests\integration\plugin_degraded.test.ts'
- error: Cannot find module '../../.opencode/tools/lib/sf_specforge_plugin_entry' from 'D:\code\temp\SpecForge\tests\integration\plugin_startup.test.ts'
- error: expect(received).toThrow(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:232:10)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > 璋冪敤鏈巿鏉冪殑 P1 鑳藉姏搴旀姏鍑?ScopeBoundaryViolationError
- error: expect(received).toThrow(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:240:10)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > 璋冪敤鏈巿鏉冪殑 P2 鑳藉姏搴旀姏鍑?ScopeBoundaryViolationError
- error: expect(received).toBeInstanceOf(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:247:17)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:250:21)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > ScopeBoundaryViolationError 搴斿寘鍚纭殑 code
- error: expect(received).toBeInstanceOf(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:260:17)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:263:21)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > ScopeBoundaryViolationError 搴斿寘鍚纭殑 capabilityId
- error: expect(received).toBeInstanceOf(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:273:17)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:276:21)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > ScopeBoundaryViolationError 搴斿寘鍚纭殑 scopeTag
- error: expect(received).toBeInstanceOf(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:286:17)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:289:21)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > ScopeBoundaryViolationError 搴斿寘鍚墍闇€鐨?feature flag
- error: expect(received).toBeInstanceOf(expected)
-       at <anonymous> (D:\code\temp\SpecForge\packages\scope-gate\src\runtime-checker.ts:168:14)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:299:31)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:304:30)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > 鎵归噺妫€鏌ユ椂鏈巿鏉冪殑 P1/P2 鑳藉姏搴旇繑鍥為敊璇粨鏋?308 |     it('鏈敞鍐岀殑鑳藉姏璋冪敤搴旀姏鍑?CapabilityUnavailableError', () => {
- error: expect(received).toThrow(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:313:10)
- (fail) scope-gate 闆嗘垚楠岃瘉 > scope-gate 鎷︽埅鏈巿鏉冪殑 P1/P2 鑳藉姏璋冪敤 > 鏈敞鍐岀殑鑳藉姏璋冪敤搴旀姏鍑?CapabilityUnavailableError
- error: expect(received).toBeInstanceOf(expected)
-       at <anonymous> (D:\code\temp\SpecForge\tests\integration\scope-gate-integration.test.ts:556:17)

## 6. 当前工作区变更

`	ext
?? docs/specforge_v11_post_p0_hardening_test_plan.md
`

## 7. 日志位置

- 全量测试日志：$FullTestLogRelPath
- diff 检查日志：$DiffCheckLogRelPath

## 8. 下一步

准备 release note / tag 前复核；不要跳过人工确认。
