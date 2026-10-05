import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const activeRulesPath = resolve(repoRoot, 'docs/rule/specforge-active-development-rules.md');
const registryPath = resolve(repoRoot, 'docs/product-specification/authority-registry.md');
const statusPath = resolve(repoRoot, 'docs/project-status.md');
const agentsPath = resolve(repoRoot, 'AGENTS.md');
const protocolPath = resolve(
  repoRoot,
  'docs/rule/specforge-execution-mode-and-evidence-protocol.md',
);
const spsPath = resolve(
  repoRoot,
  'docs/product-specification/specforge-product-specification.md',
);
const governancePlanPath = resolve(
  repoRoot,
  'docs/design/SpecForge架构一致性治理最终实施方案.md',
);

const read = (p: string) => readFileSync(p, 'utf8');

const FOCUS_SAMPLES = [
  'EXP-165',
  'EXP-180',
  'EXP-189',
  'EXP-190',
  'EXP-201',
  'EXP-202',
  'EXP-204',
  'EXP-207',
  'EXP-220',
  'EXP-228',
  'EXP-229',
  'EXP-261',
  'EXP-262',
  'EXP-263',
] as const;

/** Split the active rules file into per-EXP sections keyed by heading line. */
function sectionsOf(content: string): Map<string, string> {
  const lines = content.split('\n');
  const map = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current) map.set(current, buf.join('\n').trim());
  };
  for (const line of lines) {
    const m = line.match(/^## (EXP-\d+)\s*($|[：—-])/);
    if (m) {
      flush();
      current = m[1];
      buf = [line];
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  return map;
}

describe('active development rules contract (AR-DEC-06) — structural integrity', () => {
  const content = read(activeRulesPath);
  const sections = sectionsOf(content);

  it('covers every EXP rule id from EXP-001 to EXP-263 exactly once (no gaps, no duplicates)', () => {
    const ids = [...content.matchAll(/^## (EXP-\d+)/gm)].map((m) => m[1]);
    const unique = new Set(ids);
    expect(unique.size).toBe(263);
    expect(ids.length).toBe(unique.size);
    for (let n = 1; n <= 263; n += 1) {
      expect(unique.has(`EXP-${String(n).padStart(3, '0')}`)).toBe(true);
    }
  });

  it('every EXP section has non-empty semantic rule content (no empty/hollow rules)', () => {
    expect(sections.size).toBe(263);
    for (const [id, body] of sections) {
      const visible = body.replace(/<!--[\s\S]*?-->/g, '').replace(/[#\s*`>-]/g, '');
      expect(
        visible.length,
        `${id} must carry >=40 visible semantic chars, got ${visible.length}: ${body.slice(0, 120)}`,
      ).toBeGreaterThanOrEqual(40);
    }
  });

  it('every EXP heading has a complete semantic title', () => {
    const headings = [...content.matchAll(/^## (EXP-\d+)(.*)$/gm)];
    expect(headings).toHaveLength(263);
    for (const [, id, suffix] of headings) {
      expect(suffix, `${id} heading must have a semantic title`).toMatch(/^(?:：|\s+—\s+)\S/);
    }
  });

  it('contains no empty fenced blocks', () => {
    expect(content.match(/^```[^\r\n]*\r?\n\s*```$/gm) ?? []).toHaveLength(0);
  });

  it('binds every EXP section to exactly one source comment', () => {
    for (const [id, body] of sections) {
      expect(body.match(/<!-- source: ledger /g) ?? [], `${id} source binding`).toHaveLength(1);
    }
  });

  it('contains zero ERR headings and zero SPECFORGE_ERR markers', () => {
    expect([...content.matchAll(/^#{1,6} ERR-/gm)]).toHaveLength(0);
    expect(content.includes('SPECFORGE_ERR')).toBe(false);
  });
});

describe('active development rules contract — semantic purity (FIX2)', () => {
  const content = read(activeRulesPath);
  const migratedStart = content.indexOf('# 账本追加区定义条目');
  const migrated = content.slice(migratedStart);
  const part34 = content.slice(0, migratedStart);
  const sections = sectionsOf(content);

  it('whole file contains no concrete ERR-[0-9]+ ids', () => {
    expect(content.match(/ERR-[0-9]+/g) ?? []).toHaveLength(0);
  });

  it('whole file contains no ^ERR-N= status lines', () => {
    expect(content.match(/^ERR-[0-9]+=/gm) ?? []).toHaveLength(0);
  });

  it('whole file contains no P0_OVERALL_STATUS', () => {
    expect(content).not.toContain('P0_OVERALL_STATUS');
  });

  it('migrated region (EXP-095..263) contains no UNRECORDED_FAILURES= runtime status', () => {
    // part34 baseline EXP-060 keeps UNRECORDED_FAILURES=0 as rule-contract output template;
    // the migrated tail region must not carry any runtime occurrences.
    expect(migrated.match(/UNRECORDED_FAILURES\s*=/g) ?? []).toHaveLength(0);
  });

  it('migrated region contains no concrete V-number execution facts', () => {
    expect(migrated.match(/\bV\d+\b/g) ?? []).toHaveLength(0);
  });

  it('contains no incident narrative "本轮验证器失败补录"', () => {
    expect(content).not.toContain('本轮验证器失败补录');
  });

  it('EXP-097..101 carry no ERR status blocks', () => {
    for (let n = 97; n <= 101; n += 1) {
      const body = sections.get(`EXP-${String(n).padStart(3, '0')}`) ?? '';
      expect(body, `EXP-${n}`).not.toMatch(/ERR-[0-9]+=/);
      expect(body, `EXP-${n}`).not.toContain('P0_OVERALL_STATUS');
      expect(body, `EXP-${n}`).not.toContain('WI0001_STATE');
    }
  });

  it('EXP-186 carries no V81/V82/V83/V86/V89 incident narrative', () => {
    const body = sections.get('EXP-186') ?? '';
    expect(body).toContain('冻结边界');
    for (const v of ['V81', 'V82', 'V83', 'V86', 'V89']) {
      expect(body, `EXP-186 must not mention ${v}`).not.toContain(v);
    }
    expect(body).not.toContain('本轮验证器失败补录');
  });

  it('EXP-190 carries no V98 or runtime status', () => {
    const body = sections.get('EXP-190') ?? '';
    expect(body).toContain('真实交付不变量');
    expect(body).not.toContain('V98');
    expect(body).not.toMatch(/UNRECORDED_FAILURES\s*=/);
  });
});

describe('active development rules contract — Definition/Reference classification regressions', () => {
  const content = read(activeRulesPath);
  const sections = sectionsOf(content);

  it('a trailing ordinary reference must not overwrite the canonical definition (EXP-188 regression)', () => {
    const body = sections.get('EXP-188') ?? '';
    expect(body).toContain('副作用契约');
    expect(body).not.toContain('unrelated WI governance artifacts 会阻断当前');
    expect(body).not.toContain('closed spec_migration branch recovery');
  });

  it('combined ERR/EXP sections migrate only the EXP rule, never ERR facts (EXP-189/190)', () => {
    const b189 = sections.get('EXP-189') ?? '';
    expect(b189).toContain('canonical marker');
    expect(b189).not.toContain('ROLLBACK');
    const b190 = sections.get('EXP-190') ?? '';
    expect(b190).toContain('真实交付不变量');
    expect(b190).not.toContain('V97');
  });

  it('bold-list definitions are single-line rules without trailing ERR narrative (EXP-185)', () => {
    const body = sections.get('EXP-185') ?? '';
    expect(body).toContain('冻结 Manifest');
    expect(body).not.toContain('V77 交付器');
    expect(body).not.toContain('V79 提交器');
  });

  it('COMBINED_REUSE (ERR topic-classification reuse) sections do not become definitions (EXP-044)', () => {
    const body = sections.get('EXP-044') ?? '';
    expect(body).not.toContain('V163');
    expect(body).not.toContain('V180');
  });

  it.each([...FOCUS_SAMPLES])('%s carries rule text with a selected-source comment', (id) => {
    const body = sections.get(id) ?? '';
    expect(body.length, `${id} section must exist`).toBeGreaterThan(0);
    expect(body).toMatch(/<!-- source: ledger view L\d+-\d+ format \w+(?: \(purity-filtered\))? -->/);
  });
});

describe('consumer alignment (registry / status / AGENTS / protocol / SPS / plan)', () => {
  it('registry registers AR-DEC-06 and both rule-file roles', () => {
    const registry = read(registryPath);
    expect(registry).toContain('AR-DEC-06');
    expect(registry).toContain('docs/rule/specforge-active-development-rules.md');
    expect(registry).toContain('HISTORICAL EVIDENCE + TARGETED SEARCH');
  });

  it('project-status REQUIRED_RULES references active rules and never the full ledger', () => {
    const rulesLine = read(statusPath).match(/^REQUIRED_RULES=(.*)$/m)?.[1] ?? '';
    expect(rulesLine).toContain('docs/rule/specforge-active-development-rules.md');
    expect(rulesLine).not.toContain(
      'docs/rule/specforge-development-error-ledger-and-experience.md',
    );
  });

  it('AGENTS gate points at active rules and requires ledger search output', () => {
    const agents = read(agentsPath);
    expect(agents).toContain('docs/rule/specforge-active-development-rules.md');
    expect(agents).toContain('HISTORICAL_LEDGER_SEARCH=');
  });

  it('protocol §6 states active-rules precedence and targeted ledger search', () => {
    const protocol = read(protocolPath);
    const six = protocol.indexOf('## 6');
    const seven = protocol.indexOf('## 7');
    const section = protocol.slice(six, seven > 0 ? seven : undefined);
    expect(section).toContain('specforge-active-development-rules.md');
    expect(section).toContain('定向检索');
  });

  it('SPS appendix absorption list includes AR-DEC-06', () => {
    expect(read(spsPath)).toMatch(/Appendix A[\s\S]*AR-DEC-06/);
  });

  it('governance plan head overlay carries the AR-DEC-06 separation note', () => {
    const plan = read(governancePlanPath);
    expect(plan.slice(0, 4000)).toContain('AR-DEC-06');
    expect(plan.slice(0, 4000)).toContain('specforge-active-development-rules.md');
  });
});
