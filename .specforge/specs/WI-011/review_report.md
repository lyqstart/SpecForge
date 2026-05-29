# WI-011 Review Report — SpecForge V6 目录结构治理 P1

**work_item_id**: WI-011
**workflow_type**: change_request
**reviewer**: sf-reviewer
**结论**: **PASS** ✅（经修复后）

---

## 审查结果

| 类别 | 数量 | 状态 |
|------|------|------|
| BLOCKING 发现 | 5 | 全部已修复 |
| WARNING 发现 | 4 | 已记录，不阻塞 |
| 通过的审查项 | 10 | ✅ |

---

## BLOCKING 发现（已修复）

### B1: 部署态 tools/lib/ 路径未切换
- **状态**: ✅ 已修复
- 15 个文件添加内联 `SPEC_DIR_NAME` 常量并替换所有硬编码路径

### B2: thin-client.ts handshake 路径
- **状态**: ✅ 已修复

### B3: SKILL.md 路径未修正
- **状态**: ✅ 已修复
- 11 个 SKILL.md 中 42 处 `specforge/` → `.specforge/`

### B4: Agent prompt 路径未修正
- **状态**: ✅ 已修复
- 10 个 Agent prompt 文件中 20 处路径修正

### B5: scripts/lib 部署态路径
- **状态**: ✅ 已修复
- 7 个文件（project_runtime.ts 等）添加常量并替换路径

---

## WARNING 发现（不阻塞）

### W1: sf_doctor_core.ts 错误消息
- daemon-core 版本中 L41 错误消息仍含 `specforge/`
- 功能不影响，仅消息文本

### W2: sf_knowledge_base_core.ts getGlobalStoreDir
- `~/.config/opencode/specforge/knowledge` 是 OpenCode 框架约定
- 不属于 SpecForge 项目级目录

### W3: render-specs-readme.ts 未集成到 daemon
- specs/README.md 需手动运行脚本更新
- 后续 WI 可集成

### W4: sf-installer.ts getSpecForgeUserDir() 硬编码
- 功能不影响（值相同）

---

## 已验证通过

1. ✅ daemon-core 15 个 tools/lib 文件路径切换正确
2. ✅ daemon-core 4 个 daemon/handler 文件路径切换正确
3. ✅ directory-layout.ts 用户级扩展（SPEC_USER_DIR_NAME, USER_LAYOUT, resolveUserPath）
4. ✅ permission-engine 7 个文件路径切换正确
5. ✅ setup/ 目录结构正确（userlevel-opencode, userlevel-scripts-lib, userlevel-templates）
6. ✅ sf-installer.ts 安装源路径切换正确
7. ✅ 数据迁移完成（specforge/ 已合并到 .specforge/ 并删除）
8. ✅ 废弃文件已清理
9. ✅ render-layout.ts 和 render-specs-readme.ts 已实现
10. ✅ 单元测试恢复 baseline（266 pass / 5 pre-existing fail）

---

## 已知 Pre-existing 问题

1. daemon-core SessionRegistry 5 个测试失败（与本 WI 无关）
2. permission-engine PermissionDecision 导出缺失（与本 WI 无关）
