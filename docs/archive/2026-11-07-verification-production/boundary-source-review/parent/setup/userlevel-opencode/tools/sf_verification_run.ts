import { tool } from '@opencode-ai/plugin'
import { DaemonClient } from './lib/thin-client'
export default tool({
  description: 'sf-verifier 先 prepare 取得不可变 Attempt，再 run；cancel/recover 只取消或回收该 Attempt。仅使用固定单进程只读隔离，保留真实退出和中断，不推进工作流。',
  args: {
    action: tool.schema.enum(['prepare','run','cancel','recover']),
    work_item_id: tool.schema.string(),
    plan_id: tool.schema.string().optional(),
    attempt_record_id: tool.schema.string().optional(),
  },
  async execute(args, context) {
    return JSON.stringify(await new DaemonClient(180000).invokeTool('sf_verification_run', args,
      {sessionID:context.sessionID,messageID:context.messageID,directory:context.directory,worktree:context.worktree,agent:context.agent},
      {signal:context.abort,retry:false}));
  },
})
