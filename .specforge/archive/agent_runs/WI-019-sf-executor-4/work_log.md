## TASK-4 执行日志

### 修改内容
文件: `packages/daemon-core/src/tools/lib/sf_project_init_core.ts`

1. **新增 imports** (lines 20-24):
   - `import { exec } from "node:child_process"`
   - `import { promisify } from "node:util"`
   - `const execAsync = promisify(exec)`

2. **Node.js 版本探测** (line 304): `execSync` → `execAsync`
   - 旧: `const { execSync } = await import("node:child_process")` + `execSync(...)`
   - 新: `const { stdout: nodeOut } = await execAsync("node --version", { timeout: 5000 })`

3. **Bun 版本探测** (line 311): `execSync` → `execAsync`
   - 旧: `const { execSync } = await import("node:child_process")` + `execSync(...)`
   - 新: `const { stdout: bunOut } = await execAsync("bun --version", { timeout: 5000 })`

4. **Git 版本探测** (line 318): `execSync` → `execAsync`
   - 旧: `const { execSync } = await import("node:child_process")` + `execSync(...)`
   - 新: `const { stdout: gitOut } = await execAsync("git --version", { timeout: 5000 })`

### 验证结果
1. `npx tsc --noEmit` (cwd: packages/daemon-core) → **通过**, exit code 0, 无类型错误
2. `grep execSync` → **0 匹配**, 确认文件中无 execSync 残留
3. `grep execAsync` → **4 匹配** (1 声明 + 3 调用), 确认 execAsync 正确使用
4. 无相关单元测试

### 手动验证命令及输出
```
PS> npx tsc --noEmit 2>&1
(无输出, exit code 0)
```
