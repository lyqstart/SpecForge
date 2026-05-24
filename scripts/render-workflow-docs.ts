import * as fs from 'fs';
import * as path from 'path';

interface WorkflowStateDef {
  agent: string;
  skills: string[];
  produces: string | null;
  gate?: Record<string, unknown> | null;
  next?: string | Record<string, string>;
}

interface WorkflowDefinition {
  id: string;
  displayName: string;
  stateMachine: {
    initial: string;
    states: Record<string, WorkflowStateDef>;
  };
}

const WORKFLOW_DIR = 'configs/workflows/builtin';

const WORKFLOW_ORDER = [
  'feature_spec', 'bugfix_spec', 'feature_spec_design_first',
  'quick_change', 'change_request', 'refactor', 'ops_task', 'investigation',
];

const DISPLAY_NAMES: Record<string, string> = {
  feature_spec: 'Feature Spec',
  bugfix_spec: 'Bugfix Spec',
  feature_spec_design_first: 'Design-First',
  quick_change: 'Quick Change',
  change_request: 'Change Request',
  refactor: 'Refactor',
  ops_task: 'Ops Task',
  investigation: 'Investigation',
};

const SKILL_FILES: { relPath: string; workflowId: string }[] = [
  { relPath: '.opencode/skills/sf-workflow-feature-spec/SKILL.md', workflowId: 'feature_spec' },
  { relPath: '.opencode/skills/sf-workflow-design-first/SKILL.md', workflowId: 'feature_spec_design_first' },
  { relPath: '.opencode/skills/sf-workflow-bugfix-spec/SKILL.md', workflowId: 'bugfix_spec' },
  { relPath: '.opencode/skills/sf-workflow-quick-change/SKILL.md', workflowId: 'quick_change' },
  { relPath: '.opencode/skills/sf-workflow-change-request/SKILL.md', workflowId: 'change_request' },
  { relPath: '.opencode/skills/sf-workflow-refactor/SKILL.md', workflowId: 'refactor' },
  { relPath: '.opencode/skills/sf-workflow-ops-task/SKILL.md', workflowId: 'ops_task' },
  { relPath: '.opencode/skills/sf-workflow-investigation/SKILL.md', workflowId: 'investigation' },
];

const ORCHESTRATOR_PATH = '.opencode/agents/sf-orchestrator.md';

const NULL_PRODUCES_DISPLAY: Record<string, string> = {
  development: '代码文件',
  review: '审查意见',
  execution: '运维操作结果',
  research: '调查数据/中间产物',
};

function loadWorkflows(dir: string): Map<string, WorkflowDefinition> {
  const map = new Map<string, WorkflowDefinition>();
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
    try {
      const def: WorkflowDefinition = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      map.set(def.id, def);
    } catch (e) {
      console.error(`Failed to load ${f}:`, e);
    }
  }
  return map;
}

function buildStateSequence(def: WorkflowDefinition): string[] {
  const states = def.stateMachine.states;
  const seq: string[] = [];
  let cur = def.stateMachine.initial;
  const seen = new Set<string>();

  while (cur && cur !== 'completed' && cur !== 'blocked' && !seen.has(cur)) {
    seen.add(cur);
    seq.push(cur);
    const s = states[cur];
    if (!s?.next) break;
    cur = typeof s.next === 'string'
      ? s.next
      : (s.next as Record<string, string>).pass;
  }

  if (cur === 'completed') seq.push('completed');
  return seq;
}

function renderOrchestratorOverview(wfs: Map<string, WorkflowDefinition>): string {
  const parts: string[] = [];
  for (const id of WORKFLOW_ORDER) {
    const wf = wfs.get(id);
    if (!wf) continue;
    parts.push(
      `**${DISPLAY_NAMES[id]}：**\n\`\`\`\n${buildStateSequence(wf).join(' → ')}\n\`\`\``,
    );
  }
  return parts.join('\n\n');
}

function renderPhaseTable(def: WorkflowDefinition): string {
  const states = def.stateMachine.states;
  const seq = buildStateSequence(def);
  const lines = [
    '| 阶段 | 调度的子 Agent | 加载的 Skill | 产物 |',
    '|------|---------------|-------------|------|',
  ];

  for (const name of seq) {
    const s = states[name];
    if (!s) continue;

    const agent = s.agent || (name === 'intake' ? '—（Orchestrator 自行收集）' : '—');
    const skills = s.skills?.length ? s.skills.join(', ') : '—';

    let produces: string;
    if (s.gate) {
      if (typeof s.next === 'object' && s.next) {
        const branches = Object.entries(s.next as Record<string, string>)
          .map(([k, v]) => `${k}→${v}`)
          .join(', ');
        produces = `Gate 判定（${branches}）`;
      } else {
        produces = 'Gate 判定';
      }
    } else if (s.produces) {
      produces = s.produces === 'verification_report' ? '验证报告' : s.produces;
    } else {
      produces = NULL_PRODUCES_DISPLAY[name] || '—';
    }

    lines.push(`| ${name} | ${agent} | ${skills} | ${produces} |`);
  }

  return lines.join('\n');
}

function replaceBetweenMarkers(
  content: string,
  startMarker: string,
  endMarker: string,
  newContent: string,
): string {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return content;

  return (
    content.substring(0, startIdx + startMarker.length) +
    '\n' + newContent + '\n' +
    content.substring(endIdx)
  );
}

function extractBetweenMarkers(
  content: string,
  startMarker: string,
  endMarker: string,
): string | null {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return null;
  return content.substring(startIdx + startMarker.length, endIdx);
}

function processFile(
  absPath: string,
  relPath: string,
  wfs: Map<string, WorkflowDefinition>,
  workflowId: string | undefined,
  checkOnly: boolean,
): boolean {
  let content = fs.readFileSync(absPath, 'utf-8').replace(/\r\n/g, '\n');
  const wf = workflowId ? wfs.get(workflowId) : undefined;
  let modified = false;
  let ok = true;

  const M_START = (type: string) => `<!-- AUTO-GENERATED:START:${type} -->`;
  const M_END = (type: string) => `<!-- AUTO-GENERATED:END:${type} -->`;

  if (content.includes(M_START('workflows'))) {
    const expected = renderOrchestratorOverview(wfs);
    const sm = M_START('workflows');
    const em = M_END('workflows');
    if (checkOnly) {
      const current = extractBetweenMarkers(content, sm, em);
      if (current !== '\n' + expected + '\n') {
        console.error(`MISMATCH: ${relPath} [workflows]`);
        ok = false;
      } else {
        console.log(`  OK: ${relPath} [workflows]`);
      }
    } else {
      content = replaceBetweenMarkers(content, sm, em, expected);
      modified = true;
      console.log(`  Updated: ${relPath} [workflows]`);
    }
  }

  const hasPhaseTable = content.includes(M_START('phase-table'));
  const hasSkillMatrix = content.includes(M_START('skill-matrix'));

  if (hasPhaseTable && wf) {
    const seq = buildStateSequence(wf);
    const seqBlock = '```\n' + seq.join(' → ') + '\n```';
    const expected = hasSkillMatrix
      ? seqBlock
      : seqBlock + '\n\n## Skill 绑定矩阵\n\n' + renderPhaseTable(wf);

    const sm = M_START('phase-table');
    const em = M_END('phase-table');
    if (checkOnly) {
      const current = extractBetweenMarkers(content, sm, em);
      if (current !== '\n' + expected + '\n') {
        console.error(`MISMATCH: ${relPath} [phase-table]`);
        ok = false;
      } else {
        console.log(`  OK: ${relPath} [phase-table]`);
      }
    } else {
      content = replaceBetweenMarkers(content, sm, em, expected);
      modified = true;
      console.log(`  Updated: ${relPath} [phase-table]`);
    }
  }

  if (hasSkillMatrix && wf) {
    const expected = '## Skill 绑定矩阵\n\n' + renderPhaseTable(wf);
    const sm = M_START('skill-matrix');
    const em = M_END('skill-matrix');
    if (checkOnly) {
      const current = extractBetweenMarkers(content, sm, em);
      if (current !== '\n' + expected + '\n') {
        console.error(`MISMATCH: ${relPath} [skill-matrix]`);
        ok = false;
      } else {
        console.log(`  OK: ${relPath} [skill-matrix]`);
      }
    } else {
      content = replaceBetweenMarkers(content, sm, em, expected);
      modified = true;
      console.log(`  Updated: ${relPath} [skill-matrix]`);
    }
  }

  if (modified) {
    fs.writeFileSync(absPath, content, 'utf-8');
  }

  return ok;
}

function main(): void {
  const checkOnly = process.argv.slice(2).includes('--check');
  const root = path.resolve(__dirname, '..');
  const wfs = loadWorkflows(path.join(root, WORKFLOW_DIR));

  if (wfs.size === 0) {
    console.error('No workflow definitions found.');
    process.exit(1);
  }

  console.log(`Loaded ${wfs.size} workflow definitions.\n`);
  if (checkOnly) {
    console.log('Checking markdown files match JSON definitions...\n');
  } else {
    console.log('Rendering workflow docs...\n');
  }

  const targets = [
    { abs: path.join(root, ORCHESTRATOR_PATH), workflowId: undefined as string | undefined },
    ...SKILL_FILES.map(s => ({
      abs: path.join(root, s.relPath),
      workflowId: s.workflowId,
    })),
  ];

  let allOk = true;
  for (const { abs, workflowId } of targets) {
    if (!fs.existsSync(abs)) {
      console.error(`MISSING: ${abs}`);
      allOk = false;
      continue;
    }
    const relPath = path.relative(root, abs);
    const ok = processFile(abs, relPath, wfs, workflowId, checkOnly);
    if (!ok) allOk = false;
  }

  if (checkOnly) {
    if (allOk) {
      console.log('\nAll files are in sync.');
    } else {
      console.error('\nSome files are out of sync. Run without --check to update.');
      process.exit(1);
    }
  } else {
    console.log('\nDone.');
  }
}

main();
