import { tool } from "@opencode-ai/plugin"
import { daemon } from "./lib/thin-client"
const TOOL_NAME = "sf_git_auth_profile_config"
export default tool({
  description: "Git 用户级认证配置：写入 OpenCode 用户目录下的 Git auth profile，只保存 token 环境变量名或 SSH key 路径引用，不保存 token 明文。",
  args: {
    profile_name: tool.schema.string().describe("认证 profile 名称"),
    provider: tool.schema.string().optional().describe("github/gitlab/gitee/generic_git 等"),
    method: tool.schema.string().describe("认证方式：ssh、token_env 或 none"),
    ssh_key_path: tool.schema.string().optional().describe("SSH key 路径引用"),
    ssh_host_alias: tool.schema.string().optional().describe("SSH host alias"),
    token_env_var: tool.schema.string().optional().describe("token 环境变量名，不保存 token 明文"),
    git_user_name: tool.schema.string().optional().describe("Git 用户名"),
    git_user_email: tool.schema.string().optional().describe("Git 邮箱"),
    confirmed: tool.schema.boolean().describe("用户是否确认写入用户级认证配置，必须为 true"),
  },
  async execute(args, context) {
    const result = await daemon.invokeTool(TOOL_NAME, args, { sessionID: context.sessionID, agent: context.agent, directory: context.directory, worktree: context.worktree })
    if (typeof result === 'string') return result
    return JSON.stringify(result, null, 2)
  },
})
