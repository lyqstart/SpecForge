import { tool } from '@opencode-ai/plugin'
import { daemon } from './lib/thin-client'
export default tool({
  description: '由 sf-orchestrator 管理项目运行时 JSON 配置：读取身份、校验、更新、按历史哈希恢复。活动任务期间只允许恢复已接受配置；不修改用户凭据。',
  args: {
    action: tool.schema.enum(['read', 'validate', 'update', 'restore']),
    content: tool.schema.string().optional().describe('完整 JSON 对象，仅 validate/update 使用，最多 64 KiB'),
    expected_sha256: tool.schema.string().optional().describe('update/restore 必须提供 read 返回的当前文档哈希'),
    restore_sha256: tool.schema.string().optional().describe('restore 使用此前成功更新返回的 previous_sha256'),
  },
  async execute(args, context) {
    return JSON.stringify(await daemon.invokeTool('sf_project_config', args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree }));
  },
})
