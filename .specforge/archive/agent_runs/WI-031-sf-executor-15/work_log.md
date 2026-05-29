## 任务摘要
修复 `packages/daemon-core` 的 6 个 TypeScript 编译错误：
- SessionRegistry.ts 中的 4 个重复方法定义
- types.test.ts 中 HandshakeFile 类型字段名错误

## 执行过程

1. **读取 SessionRegistry.ts** – 确认 lines 161/188 有原始 `registerPluginSession` 和 `getActiveSessionCount`，lines 513/573 有重复定义
2. **删除重复方法**：
   - 删除 lines 499-527：重复的 `registerPluginSession`（含 JSDoc）
   - 删除 lines 568-575：重复的 `getActiveSessionCount`（含 JSDoc）
   - 保留中间的 `handleOpenCodeEvent` 方法（唯一实例）
3. **修复 types.test.ts**：
   - Line 63：`schemaVersion` -> `schema_version`（匹配 HandshakeFile 接口）
   - Line 67：`schemaVersion` -> `schema_version`（断言字段名）
   - 首次编辑误匹配了 line 34（Event.metadata.schemaVersion 是正确的），已回退
   - 补充 `version` 和 `serviceMode` 字段（HandshakeFile 要求）
4. **运行 `npx tsc --noEmit`**：0 错误通过

## 遇到的问题
- 第一次编辑 `schemaVersion: '1.0',` 匹配到 Event 的 metadata 行（非目标），导致 Line 34 错误变更。通过更具体的上下文匹配重新定位到 Line 63。
- HandshakeFile 缺少 `version` 和 `serviceMode` 字段，编译时报 TS2739 错误，补充后解决。

## 最终结论
✅ 编译通过，0 错误。
修改文件：
- `packages/daemon-core/src/session/SessionRegistry.ts` - 删除 2 处重复方法定义
- `packages/daemon-core/src/types.test.ts` - 修复字段名 + 补充缺失字段

## 工具调用统计
- read: 10 次
- edit: 6 次
- bash: 2 次
