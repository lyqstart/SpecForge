/**
 * directory-layout.test.ts — T3 单元测试
 *
 * 验证 `packages/types/src/directory-layout.ts` 的所有公共导出：
 * - `SPEC_DIR_NAME` 常量字面量值
 * - `LAYOUT` 字典所有顶层 key 与嵌套 configFiles 子键
 * - `resolveProjectPath` / `specPath` / `agentRunArchivePath` 三个路径构造函数
 *
 * 测试设计原则：
 * - 期望路径用 `path.join` 构造（避免硬编码平台分隔符 `/` 或 `\\`）
 * - 每个 `LAYOUT` key 至少 1 个 assertion 验证常量值与构造结果
 * - 每个路径构造函数覆盖 happy path + edge case
 *
 * 关联：refactor_plan.md T3 / 方案 A §6.3。
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

import {
  SPEC_DIR_NAME,
  LAYOUT,
  resolveProjectPath,
  specPath,
  agentRunArchivePath,
  type LayoutKey,
  SPEC_USER_DIR_NAME,
  USER_LAYOUT,
  resolveUserPath,
  type UserLayoutKey,
} from '../src/directory-layout';

// 平台无关的测试根目录（在 Windows 上变为 `\proj`，Unix 上为 `/proj`）
const PROJ = path.join(path.sep, 'proj');

describe('SPEC_DIR_NAME', () => {
  it('must equal literal string ".specforge"', () => {
    expect(SPEC_DIR_NAME).toBe('.specforge');
  });

  it('must be a non-empty string', () => {
    expect(typeof SPEC_DIR_NAME).toBe('string');
    expect(SPEC_DIR_NAME.length).toBeGreaterThan(0);
  });
});

describe('LAYOUT — top-level keys (committed area)', () => {
  it('manifest === "manifest.json"', () => {
    expect(LAYOUT.manifest).toBe('manifest.json');
  });

  it('config === "config"', () => {
    expect(LAYOUT.config).toBe('config');
  });

  it('specs === "specs"', () => {
    expect(LAYOUT.specs).toBe('specs');
  });

  it('specsReadme === "specs/README.md"', () => {
    expect(LAYOUT.specsReadme).toBe('specs/README.md');
  });

  it('knowledge === "knowledge"', () => {
    expect(LAYOUT.knowledge).toBe('knowledge');
  });

  it('knowledgeGraph === "knowledge/graph.json"', () => {
    expect(LAYOUT.knowledgeGraph).toBe('knowledge/graph.json');
  });
});

describe('LAYOUT — top-level keys (gitignored area)', () => {
  it('runtime === "runtime"', () => {
    expect(LAYOUT.runtime).toBe('runtime');
  });

  it('runtimeWal === "runtime/wal.jsonl"', () => {
    expect(LAYOUT.runtimeWal).toBe('runtime/wal.jsonl');
  });

  it('runtimeState === "runtime/state.json"', () => {
    expect(LAYOUT.runtimeState).toBe('runtime/state.json');
  });

  it('runtimeCheckpoints === "runtime/checkpoints"', () => {
    expect(LAYOUT.runtimeCheckpoints).toBe('runtime/checkpoints');
  });

  it('logs === "logs"', () => {
    expect(LAYOUT.logs).toBe('logs');
  });

  it('logsTelemetry === "logs/telemetry.jsonl"', () => {
    expect(LAYOUT.logsTelemetry).toBe('logs/telemetry.jsonl');
  });

  it('logsTrace === "logs/trace.jsonl"', () => {
    expect(LAYOUT.logsTrace).toBe('logs/trace.jsonl');
  });

  it('logsToolCalls === "logs/tool_calls.jsonl"', () => {
    expect(LAYOUT.logsToolCalls).toBe('logs/tool_calls.jsonl');
  });

  it('logsCost === "logs/cost.jsonl"', () => {
    expect(LAYOUT.logsCost).toBe('logs/cost.jsonl');
  });

  it('logsConversations === "logs/conversations.jsonl"', () => {
    expect(LAYOUT.logsConversations).toBe('logs/conversations.jsonl');
  });

  it('archive === "archive"', () => {
    expect(LAYOUT.archive).toBe('archive');
  });

  it('archiveAgentRuns === "archive/agent_runs"', () => {
    expect(LAYOUT.archiveAgentRuns).toBe('archive/agent_runs');
  });

  it('sessions === "sessions"', () => {
    expect(LAYOUT.sessions).toBe('sessions');
  });

  it('cas === "cas"', () => {
    expect(LAYOUT.cas).toBe('cas');
  });
});

describe('LAYOUT.configFiles — nested object keys', () => {
  it('configFiles must be a non-null object (not a string)', () => {
    expect(typeof LAYOUT.configFiles).toBe('object');
    expect(LAYOUT.configFiles).not.toBeNull();
  });

  it('configFiles.projectRules === "config/project-rules.md"', () => {
    expect(LAYOUT.configFiles.projectRules).toBe('config/project-rules.md');
  });

  it('configFiles.devEnv === "config/dev-environment.md"', () => {
    expect(LAYOUT.configFiles.devEnv).toBe('config/dev-environment.md');
  });

  it('configFiles.prodEnv === "config/prod-environment.md"', () => {
    expect(LAYOUT.configFiles.prodEnv).toBe('config/prod-environment.md');
  });

  it('configFiles.project === "config/project.json"', () => {
    expect(LAYOUT.configFiles.project).toBe('config/project.json');
  });

  it('configFiles.riskPolicy === "config/risk_policy.json"', () => {
    expect(LAYOUT.configFiles.riskPolicy).toBe('config/risk_policy.json');
  });

  it('configFiles.skillFragments === "config/skill_fragments.json"', () => {
    expect(LAYOUT.configFiles.skillFragments).toBe('config/skill_fragments.json');
  });

  it('configFiles.projectRules can compose absolute path via path.join', () => {
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'config', 'project-rules.md');
    const actual = path.join(PROJ, SPEC_DIR_NAME, LAYOUT.configFiles.projectRules);
    expect(actual).toBe(expected);
  });
});

describe('resolveProjectPath()', () => {
  it('happy path: top-level key without subpath', () => {
    const got = resolveProjectPath(PROJ, 'runtime');
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'runtime');
    expect(got).toBe(expected);
  });

  it('happy path: top-level key with single subpath segment', () => {
    const got = resolveProjectPath(PROJ, 'specs', 'WI-001');
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'specs', 'WI-001');
    expect(got).toBe(expected);
  });

  it('edge case: multi-segment subpath', () => {
    const got = resolveProjectPath(PROJ, 'specs', 'WI-001', 'design.md');
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'specs', 'WI-001', 'design.md');
    expect(got).toBe(expected);
  });

  it('edge case: resolves nested path key archiveAgentRuns correctly', () => {
    const got = resolveProjectPath(PROJ, 'archiveAgentRuns');
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'archive', 'agent_runs');
    expect(got).toBe(expected);
  });

  it('edge case: configFiles key (non-string value) falls back to key name', () => {
    // LAYOUT.configFiles is a nested object, not a string. resolveProjectPath
    // must NOT crash; per JSDoc contract, it falls back to the key name itself.
    const got = resolveProjectPath(PROJ, 'configFiles' as LayoutKey);
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'configFiles');
    expect(got).toBe(expected);
  });

  it('returns a non-empty string for every top-level LayoutKey', () => {
    const keys = Object.keys(LAYOUT) as LayoutKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const p = resolveProjectPath(PROJ, k);
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
      expect(p.startsWith(PROJ)).toBe(true);
    }
  });
});

describe('specPath()', () => {
  it('happy path: builds /<root>/.specforge/specs/<wi>/<file>', () => {
    const got = specPath(PROJ, 'WI-001', 'design.md');
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'specs', 'WI-001', 'design.md');
    expect(got).toBe(expected);
  });

  it('edge case: WI ID containing hyphen (e.g. WI-010)', () => {
    const got = specPath(PROJ, 'WI-010', 'refactor_plan.md');
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'specs', 'WI-010', 'refactor_plan.md');
    expect(got).toBe(expected);
  });

  it('edge case: file with extension chain (e.g. .test.ts)', () => {
    const got = specPath(PROJ, 'WI-042', 'notes.draft.md');
    const expected = path.join(PROJ, SPEC_DIR_NAME, 'specs', 'WI-042', 'notes.draft.md');
    expect(got).toBe(expected);
  });
});

describe('agentRunArchivePath()', () => {
  it('happy path: runIndex=1', () => {
    const got = agentRunArchivePath(PROJ, 'WI-001', 'sf-design', 1);
    const expected = path.join(
      PROJ,
      SPEC_DIR_NAME,
      'archive',
      'agent_runs',
      'WI-001-sf-design-1',
    );
    expect(got).toBe(expected);
  });

  it('edge case: large runIndex=99', () => {
    const got = agentRunArchivePath(PROJ, 'WI-010', 'sf-executor', 99);
    const expected = path.join(
      PROJ,
      SPEC_DIR_NAME,
      'archive',
      'agent_runs',
      'WI-010-sf-executor-99',
    );
    expect(got).toBe(expected);
  });

  it('edge case: runIndex=0 still produces dir name with "-0" suffix', () => {
    const got = agentRunArchivePath(PROJ, 'WI-010', 'sf-executor', 0);
    expect(got.endsWith('WI-010-sf-executor-0')).toBe(true);
  });

  it('does not zero-pad runIndex (raw number-to-string)', () => {
    const got = agentRunArchivePath(PROJ, 'WI-001', 'sf-verifier', 7);
    // Verifies no "07" zero-padding (consistent with existing daemon-core behavior).
    expect(got.endsWith('WI-001-sf-verifier-7')).toBe(true);
    expect(got.includes('-07')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 用户级路径 Schema 测试（WI-011 TASK-1）
// ---------------------------------------------------------------------------

describe('SPEC_USER_DIR_NAME', () => {
  it('must equal literal string ".specforge"', () => {
    expect(SPEC_USER_DIR_NAME).toBe('.specforge');
  });

  it('must be a non-empty string', () => {
    expect(typeof SPEC_USER_DIR_NAME).toBe('string');
    expect(SPEC_USER_DIR_NAME.length).toBeGreaterThan(0);
  });
});

describe('USER_LAYOUT — all keys path composition', () => {
  it('runtime === "runtime"', () => {
    expect(USER_LAYOUT.runtime).toBe('runtime');
  });

  it('runtimeHandshake === "runtime/handshake.json"', () => {
    expect(USER_LAYOUT.runtimeHandshake).toBe('runtime/handshake.json');
  });

  it('runtimeState === "runtime/state.json"', () => {
    expect(USER_LAYOUT.runtimeState).toBe('runtime/state.json');
  });

  it('runtimeEvents === "runtime/events.jsonl"', () => {
    expect(USER_LAYOUT.runtimeEvents).toBe('runtime/events.jsonl');
  });

  it('runtimeDaemonLock === "runtime/daemon.lock"', () => {
    expect(USER_LAYOUT.runtimeDaemonLock).toBe('runtime/daemon.lock');
  });

  it('hostProfile === "host-profile.json"', () => {
    expect(USER_LAYOUT.hostProfile).toBe('host-profile.json');
  });

  it('logs === "logs"', () => {
    expect(USER_LAYOUT.logs).toBe('logs');
  });

  it('projects === "projects"', () => {
    expect(USER_LAYOUT.projects).toBe('projects');
  });

  it('templates === "templates"', () => {
    expect(USER_LAYOUT.templates).toBe('templates');
  });

  it('backups === "backups"', () => {
    expect(USER_LAYOUT.backups).toBe('backups');
  });

  it('every key resolves via resolveUserPath to contain ".specforge"', () => {
    const keys = Object.keys(USER_LAYOUT) as UserLayoutKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const p = resolveUserPath(k);
      expect(p).toContain('.specforge');
      expect(typeof p).toBe('string');
      expect(p.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveUserPath()', () => {
  it("resolveUserPath('hostProfile') contains '.specforge' and 'host-profile.json'", () => {
    const got = resolveUserPath('hostProfile');
    expect(got).toContain('.specforge');
    expect(got).toContain('host-profile.json');
  });

  it("resolveUserPath('projects', 'hash123') contains 'projects' and 'hash123'", () => {
    const got = resolveUserPath('projects', 'hash123');
    expect(got).toContain('projects');
    expect(got).toContain('hash123');
  });

  it("resolveUserPath('runtime') contains '.specforge' and 'runtime'", () => {
    const got = resolveUserPath('runtime');
    expect(got).toContain('.specforge');
    expect(got).toContain('runtime');
  });
});
