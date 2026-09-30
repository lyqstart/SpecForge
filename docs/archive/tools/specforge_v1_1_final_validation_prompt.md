# SpecForge v1.1 Final Validation 提示词

## 当前状态

当前分支：

```text
v1.1-daemon-opencode-e2e
```

已完成：

```text
Runtime execution chain fixed and merged
Production daemon write guard E2E completed
Full daemon startup integration verified
Extension Subflow E2E completed
```

当前未完成：

```text
Full v1.1 final-complete validation
```

本轮目标：

```text
只做最终验收，不做新功能，不做重构。
```

本轮通过后，才允许建议合并当前分支并打阶段性 tag。

---

## 一、本轮禁止事项

禁止：

```text
新增 Runtime 功能
重构 MergeRunner
重构 CloseGate
重构 Daemon
重构 Extension Subflow
修改 v1.1 标准结构
放宽测试断言
删除负向测试
把文档状态写成 production compliant
未完成验收前声明 v1.1 complete
```

---

## 二、最终验收范围

必须验证以下主链路全部成立：

```text
1. Runtime execution chain
2. Production daemon write guard
3. Full daemon startup integration
4. Extension Subflow
5. PathPolicy / legacy specs read-only
6. Installer no legacy write
7. OpenCode setup package consistency
8. bootstrap 文档状态一致性
```

---

## 三、必须执行的验收项

### V1 Runtime execution chain

验证：

```text
executeV11Merge 直接消费 candidate_manifest.entries
operation 只允许 replace
candidate_hash / target_base_hash / manifest_hash 必须校验
旧 candidates[] 结构必须被拒绝
operation=update 必须被拒绝
CloseGate.validateFromFileSystem 基于文件证据判断
code_only_fast_path 不允许 evidence / verification / trace 放水
```

### V2 Production daemon write guard

验证：

```text
ReconnectingDaemonClient 包含 checkWrite / bashGuard / changedFilesAudit / recordEscapedWrite
HTTPServer 完整启动后自动注册 write guard routes
daemon 不可达时 fail closed
无 active WI 时阻断写入
code_change_allowed=false 时阻断写入
allowed_write_files 外阻断写入
changed_files_audit failed 后 close_gate failed
```

### V3 Extension Subflow

验证：

```text
缺少扩展类型时写 extension_request.json
blocking_current_flow=true
sf-extension 生成 extension_delta.md
生成 extension_registry candidate
candidate_manifest 使用 v1.1 entries/replace/hash
extension_gate 使用标准 Gate Report
User Decision 结构化并绑定 hash
通过 executeV11Merge 合并 extension_registry
project_spec_version 递增
主流程恢复前重新读取 extension_registry
旧 Candidate 不被复用
```

### V4 PathPolicy / legacy specs read-only

验证：

```text
.specforge/project/** 只能由受控 merge 写入
普通 Agent 不能直接写 .specforge/project/extension_registry.json
旧 .specforge/specs/<WI-ID>/ 只能 legacy read-only
新流程不得向 .specforge/specs/<WI-ID>/ 写正式规格
PathPolicy 不能存在旧宽松入口绕过
```

### V5 Installer no legacy write

验证：

```text
installer 不再默认写 ~/.specforge
用户级 OpenCode 扩展安装到 ~/.config/opencode
sf-user / templates / install.json 路径正确
旧 agents/tools/plugins 残留清理逻辑正确
installer-no-legacy-write 测试通过
```

### V6 OpenCode setup package consistency

验证：

```text
setup/userlevel-opencode 中 plugin / tools / agents / skills 与生产代码一致
sf_specforge.ts 调用的方法在 ReconnectingDaemonClient 中真实存在
OpenCode plugin 不依赖不存在的 daemon client 方法
Plugin fail closed 行为明确
side-effect tool 进入 changed_files_audit
```

### V7 bootstrap 文档一致性

验证以下文件状态一致：

```text
docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
docs/bootstrap/specforge-v1.1-compliance-gap.md
docs/bootstrap/specforge-v1.1-runtime-execution-chain-merge-readiness.md
```

必须满足：

```text
Runtime Execution Chain：Fixed and merged
Production Daemon Write Guard E2E：Completed
Full Daemon Startup Integration：Verified
Extension Subflow E2E：Completed
Full v1.1 final validation：本轮完成前 pending
```

禁止存在互相矛盾状态，例如：

```text
同一事项既写 Fixed 又写 Not Fixed
同一事项既写 Completed 又写 Pending
写 v1.1 complete 但仍有阻断项
```

---

## 四、必须运行测试

按项目实际命令执行，至少覆盖：

```bash
# workflow-runtime
cd packages/workflow-runtime
npx vitest run tests/v11/e2e
npx vitest run tests/v11/unit/path-policy-permissions.test.ts

# daemon-core
cd ../daemon-core
npx vitest run tests/v11-full-daemon-startup-writeguard-e2e.test.ts
npx vitest run tests/v11-production-daemon-writeguard-e2e.test.ts
npx vitest run tests/v11-live-daemon-protocol-prototype.test.ts
npx vitest run tests/v11-daemon-opencode-writeguard-e2e.test.ts

# installer
cd ../..
npx vitest run scripts/tests/installer-no-legacy-write.test.ts
```

如果实际命令不同，按实际项目结构执行，但必须汇报完整命令和结果。

---

## 五、必须执行 grep / 静态检查

至少执行：

```bash
grep -R "operation.*update" packages/workflow-runtime/tests/v11 packages/workflow-runtime/src || true
grep -R "candidates\[" packages/workflow-runtime/tests/v11 packages/workflow-runtime/src || true
grep -R "notApplicableFlags" packages/workflow-runtime/tests/v11 packages/workflow-runtime/src || true
grep -R "\.specforge/specs" packages setup scripts docs/bootstrap || true
grep -R "Live daemon integration E2E completed" docs/bootstrap || true
grep -R "Installer Legacy Write | NOT Fixed" docs/bootstrap || true
grep -R "v1.1 complete" docs/bootstrap packages setup scripts || true
grep -R "daemonClient\.checkWrite" setup packages || true
grep -R "checkWrite(" packages/daemon-core setup || true
```

检查要求：

```text
operation=update 只能出现在负向测试中
candidates[] 旧结构只能出现在负向测试或 legacy migration 中
notApplicableFlags 不得用于 evidence / verification / trace 放水
.specforge/specs 不得作为新正式规格写入路径
docs/bootstrap 不得存在过期矛盾状态
plugin 调用的方法必须有生产实现
```

---

## 六、必须新增最终验收报告

新增文件：

```text
docs/bootstrap/specforge-v1.1-final-validation-report.md
```

内容必须包括：

```text
1. 分支
2. commit
3. 验收范围
4. 测试命令与结果
5. grep / 静态检查结果
6. Runtime execution chain 验收结论
7. Production daemon write guard 验收结论
8. Extension Subflow 验收结论
9. PathPolicy / legacy read-only 验收结论
10. Installer no legacy write 验收结论
11. OpenCode setup consistency 验收结论
12. bootstrap 文档一致性结论
13. 仍未完成项
14. 是否建议合并
15. 是否建议打 tag
```

---

## 七、完成后状态规则

如果全部验收通过：

```text
可以建议合并 v1.1-daemon-opencode-e2e 到 main
可以建议打 tag：v1.1-bootstrap-complete
```

不能自动执行合并，除非用户明确要求。

不建议直接打：

```text
v1.1-complete
production-compliant
```

除非最终报告确认没有任何 pending / blocker / unverified 项。

---

## 八、汇报格式

完成后只按以下格式汇报：

```text
## 分支与 commit

## 修改文件

## 测试命令与结果

## grep / 静态检查结果

## Final Validation 结论

### V1 Runtime execution chain
- 结论：
- 证据：

### V2 Production daemon write guard
- 结论：
- 证据：

### V3 Extension Subflow
- 结论：
- 证据：

### V4 PathPolicy / legacy specs read-only
- 结论：
- 证据：

### V5 Installer no legacy write
- 结论：
- 证据：

### V6 OpenCode setup consistency
- 结论：
- 证据：

### V7 bootstrap 文档一致性
- 结论：
- 证据：

## 新增最终验收报告

## 仍未完成项

## 合并建议

## tag 建议
```

---

## 九、失败规则

出现以下任意一项，本轮失败：

```text
任何测试失败
Runtime 正向流程仍使用 candidates[] 旧结构
Runtime 正向流程仍使用 operation=update
candidate_hash / target_base_hash / manifest_hash 未校验
CloseGate 不基于文件系统证据
code_only_fast_path 使用 notApplicableFlags 放水
daemon 不可达时允许写入
HTTPServer 完整启动后 write guard route 不可用
plugin 调用不存在的方法
changed_files_audit failed 后 close_gate 通过
Extension Subflow 不经过 extension_gate
Extension Subflow 不经过 User Decision
Extension Subflow 不经过 executeV11Merge
extension_registry 合并后 project_spec_version 未递增
普通 Agent 可直接写 .specforge/project/extension_registry.json
新流程向 .specforge/specs/<WI-ID>/ 写正式规格
installer 默认写 ~/.specforge
bootstrap 文档存在互相矛盾状态
final validation report 未生成
未验收完就声明 v1.1 complete
```

---

## 十、完成标准

本轮通过后只能声明：

```text
Full v1.1 final validation completed
Recommended tag: v1.1-bootstrap-complete
```

不要声明：

```text
production compliant
```

除非最终报告确认没有任何 pending / blocker / unverified 项。
