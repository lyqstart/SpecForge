import { tool } from '@opencode-ai/plugin'
import { DaemonClient } from './lib/thin-client'
export default tool({
  description: 'D25: 显式冻结 filesystem 使用 plan/v2 与严格物理源身份，Git 保持 plan/v1；不 git init、不修改已批准 Task，源漂移必须拒绝。 sf-orchestrator 从已批准 Task 创建独立只读验证计划，或撤销计划、恢复中断的输入准备。Runtime 核验真实调用身份；不授予代码写权限。当前仅 Windows x64 固定 Node 24.19.0 单进程只读 profile；其他平台或不支持的命令保持 not_executed/blocked，不改用 Shell。D24 精确 CJS 单调计时须使用 v2 命令证明；仅字面量 perf_hooks 的 performance.now() 前后差值包围一次同步本地调用及数值上限断言，其他时钟/别名/逃逸拒绝。编译不等于执行通过。',
  args: {
    action: tool.schema.enum(['create','revoke','recover']),
    work_item_id: tool.schema.string(),
    task_id: tool.schema.string().optional(),
    verification_type: tool.schema.enum(['unit','property','integration','e2e','regression']).optional(),
    command_index: tool.schema.number().int().min(0).max(63).optional(),
    plan_id: tool.schema.string().optional(),
    preparation_id: tool.schema.string().optional(),
  },
  async execute(args, context) {
    return JSON.stringify(await new DaemonClient(180000).invokeTool('sf_verification_plan', args,
      {sessionID:context.sessionID,messageID:context.messageID,directory:context.directory,worktree:context.worktree,agent:context.agent},
      {signal:context.abort,retry:false}));
  },
})
