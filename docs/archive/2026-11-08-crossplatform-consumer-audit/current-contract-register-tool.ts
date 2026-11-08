import {tool} from '@opencode-ai/plugin';
import {daemon} from './lib/thin-client';

export default tool({
  description:'sf-orchestrator 在当前 feature_spec Work Item 的可变 Candidate 阶段维护 Project Contract / namespace Candidate。add 新增，update 更新已有同 kind/ID 的 Project Contract，reset 从正式 Registry 重建当前 Candidate。Runtime 核验真实角色、StateManager 状态、HardStop、Schema 与既有 workflow_path；不切换工作流，不写正式 Registry。未启用工作流的 Promotion/迁移动作不可用。之后仍须 Gate、用户决策和受控 Merge。',
  args:{
    work_item_id:tool.schema.string().describe('当前 WI-NNNN'),
    action:tool.schema.enum(['add', 'update', 'reset']).optional(),
    kind:tool.schema.enum(['shared_enum','invariant','public_interface','extension_point','namespace_type']).optional().describe('add/update 必填；update 不支持 namespace_type'),
    entry:tool.schema.record(tool.schema.string(),tool.schema.any()).optional().describe('add/update 必填；严格按对应 Contract / namespace 合同提供条目'),
    workflow_path:tool.schema.string().optional().describe('可省略；提供时必须与当前 WI 元数据一致，不能据此切换工作流'),
  },
  async execute(args,context){
    const result=await daemon.invokeTool('sf_contract_register',args,{sessionID:context.sessionID,agent:context.agent,directory:context.directory,worktree:context.worktree});
    return typeof result==='string'?result:JSON.stringify(result,null,2);
  },
});
