import { tool } from '@opencode-ai/plugin';
import { daemon } from './lib/thin-client';

export default tool({
  description:
    '检查 legacy/损坏的 Project Spec，或在 spec_migration_path 的 candidate_preparing 阶段根据显式架构证据生成修复 Candidates。' +
    '该工具不直接写 .specforge/project/**；prepare_repair 后仍必须运行 Gate、记录用户审批并由 Merge Runner 合并。',
  args: {
    work_item_id: {
      description: '承载迁移或修复过程的 Work Item ID',
      type: 'string',
    },
    action: {
      description:
        'inventory/plan 用于 legacy specs；inspect_repair 检查 Project Spec；prepare_repair 生成受控修复 Candidates',
      type: 'string',
      enum: ['inventory', 'plan', 'inspect_repair', 'prepare_repair'],
    },
    repair_preparation: {
      description:
        'prepare_repair 必填的 JSON 字符串：包含 expected_manifest_sha256、expected_project_spec_version、evidence_paths 和显式 modules 映射。不得根据源码目录推断模块。',
      type: 'string',
    },
  },
  async execute(args, context) {
    const result = await daemon.invokeTool('sf_v11_spec_migration', args, context);
    if (typeof result === 'string') return result;
    return JSON.stringify(result, null, 2);
  },
});
