## TASK-5 执行日志

### 修改文件
- `setup/userlevel-opencode/tools/lib/thin-client.ts`

### 修改内容

1. **新增 `isConnectionError` 函数**（第55-72行）：模块级私有函数，检测连接级错误（fetch failed, ECONNREFUSED, ECONNRESET, ENOTFOUND, ECONNABORTED），判定是否需要 reload handshake。

2. **修改 catch 块**（第131-155行）：在 AbortError 处理之后，新增连接级错误检测 → reload handshake → 重试一次的逻辑。reload 失败静默忽略，重试仍失败抛出 retryErr。

### 验证结果

1. **node 内容检查**：✅ 通过
   ```
   node -e "..." → OK: connection retry logic present
   ```

2. **npx tsc --noEmit**（packages/daemon-core）：✅ 通过，无类型错误
   ```
   exitCode: 0, no stderr output
   ```

### R7 检查结果
- IP: `127.0.0.1` (预存的 localhost，正常)
- Port: 动态读取 handshake.json，无硬编码
- 绝对路径: 无
- 新依赖: 无

### 关键约束验证
- ✅ `isConnectionError` 不导出（模块级函数）
- ✅ `AbortError` 不触发 reload
- ✅ reload 失败静默忽略
- ✅ retry 仍失败抛出 retryErr
