import { tool } from '@opencode-ai/plugin'
import { DaemonClient } from './lib/thin-client'
export default tool({
  description: 'sf-verifier 使用严格动作参数：prepare 只传 action、work_item_id、plan_id；run/cancel/recover 只传 action、work_item_id、attempt_record_id，禁止携带 plan_id。先 prepare 再 run；cancel/recover 只取消或回收该 Attempt。仅固定单进程只读隔离，不推进工作流。',
  args: {
    action: tool.schema.enum(['prepare','run','cancel','recover']),
    work_item_id: tool.schema.string(),
    plan_id: tool.schema.string().optional().describe('仅 prepare 必填；run/cancel/recover 必须省略，不能同时传两个身份字段。'),
    attempt_record_id: tool.schema.string().optional().describe('run/cancel/recover 必填；prepare 必须省略。使用 prepare 返回的 attempt_record_id，不是 attempt_id。'),
  },
  async execute(args, context) {
    return JSON.stringify(await new DaemonClient(180000).invokeTool('sf_verification_run', args,
      {sessionID:context.sessionID,messageID:context.messageID,directory:context.directory,worktree:context.worktree,agent:context.agent},
      {signal:context.abort,retry:false}));
  },
})
