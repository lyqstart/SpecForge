import { describe, expect, it } from 'vitest';
import {
  parseRequiredVerificationDeclaration,
  REQUIRED_VERIFICATION_BEGIN,
  REQUIRED_VERIFICATION_END,
  requiredVerificationPathIdentity,
} from '../../../types/src/required-verification-contract';

const declaration = () => ({
  schema_version: '1.0',
  profile: 'candidate-exact-file-sha256/v1',
  work_item_id: 'WI-0001',
  project_spec_manifest_sha256: 'a'.repeat(64),
  candidate_generation: 'c'.repeat(64),
  requirements: [{
    id: 'RV-trace',
    path: 'candidates/trace_delta.md',
    owner: 'sf-task-planner',
    expected_sha256: 'b'.repeat(64),
  }],
});
const source = (value: unknown, newline = '\n') =>
  ['Explicit user requirement.', REQUIRED_VERIFICATION_BEGIN, JSON.stringify(value), REQUIRED_VERIFICATION_END].join(newline);

describe('D31 finite source declaration', () => {
  it('does not infer mandatory requirements from prose or handoff warnings', () => {
    expect(parseRequiredVerificationDeclaration('Unable to verify the hash; unknowns remain.')).toBeNull();
  });
  it.each(['\n', '\r\n'])('parses the whole explicit block with %j separators', newline => {
    expect(parseRequiredVerificationDeclaration(source(declaration(), newline))).toEqual(declaration());
  });
  it('rejects partial, duplicate and malformed declarations instead of treating them as absent', () => {
    expect(() => parseRequiredVerificationDeclaration(REQUIRED_VERIFICATION_BEGIN)).toThrow();
    expect(() => parseRequiredVerificationDeclaration(source(declaration()) + '\n' + source(declaration()))).toThrow();
    expect(() => parseRequiredVerificationDeclaration(`${REQUIRED_VERIFICATION_BEGIN}\n{\n${REQUIRED_VERIFICATION_END}`)).toThrow();
  });
  it.each([
    '../trace.md', 'candidates/../trace.md', 'candidates\\trace.md',
    'candidates/tasks.md', 'candidates/TASKS.md', 'candidates/.specforge/state.json',
    'candidates/.git/config', 'candidates/NUL.md', 'candidates/trailing./file.md',
    'candidates/file.md:stream', 'candidates/file.md ', '/candidates/file.md',
  ])('rejects out-of-scope or ambiguous path %s', file => {
    const value = declaration();
    value.requirements[0]!.path = file;
    expect(() => parseRequiredVerificationDeclaration(source(value))).toThrow();
  });
  it('rejects missing baseline, unknown fields, unsupported owner and incomplete expected digest', () => {
    const value = declaration();
    expect(() => parseRequiredVerificationDeclaration(source({ ...value, project_spec_manifest_sha256: undefined }))).toThrow();
    expect(() => parseRequiredVerificationDeclaration(source({ ...value, skip_verification: true }))).toThrow();
    value.requirements[0]!.owner = 'sf-executor';
    expect(() => parseRequiredVerificationDeclaration(source(value))).toThrow();
    value.requirements[0]!.owner = 'sf-task-planner';
    value.requirements[0]!.expected_sha256 = 'b';
    expect(() => parseRequiredVerificationDeclaration(source(value))).toThrow();
  });
  it('uses host path identity and always rejects duplicate IDs or exact paths', () => {
    const value = declaration();
    value.requirements.push({ ...value.requirements[0]!, id: 'RV-other', path: 'candidates/TRACE_DELTA.md' });
    if (process.platform === 'win32') expect(() => parseRequiredVerificationDeclaration(source(value))).toThrow();
    else expect(parseRequiredVerificationDeclaration(source(value))).toEqual(value);
    value.requirements[1]!.path = value.requirements[0]!.path;
    expect(() => parseRequiredVerificationDeclaration(source(value))).toThrow();
    value.requirements[1]!.path = 'candidates/design.md';
    value.requirements[1]!.id = 'RV-trace';
    expect(() => parseRequiredVerificationDeclaration(source(value))).toThrow();
  });
  it.each(['win32', 'linux', 'darwin'] as const)('preserves the specified platform identity: %s', platform => {
    const lower = requiredVerificationPathIdentity('candidates/trace.md', platform);
    const upper = requiredVerificationPathIdentity('candidates/TRACE.md', platform);
    expect(lower === upper).toBe(platform === 'win32');
  });
  it('requires an explicit current-history binding for replacement or cancellation', () => {
    const value = { ...declaration(), requirements: [] };
    expect(() => parseRequiredVerificationDeclaration(source(value))).toThrow('EMPTY_REGISTRATION');
    expect(parseRequiredVerificationDeclaration(source({ ...value, replacement: { prior_history_sha256: 'c'.repeat(64) } }))?.requirements).toEqual([]);
    expect(() => parseRequiredVerificationDeclaration(source({ ...value, replacement: { prior_history_sha256: 'missing' } }))).toThrow();
  });
  it.each(['"work_item_id":"WI-9999",', '"work_item_\\u0069d":"WI-9999",'])(
    'rejects duplicate JSON keys before an overwritten value can authorize a different WI: %s', prefix => {
      const body = JSON.stringify(declaration()).replace('{', `{${prefix}`);
      expect(() => parseRequiredVerificationDeclaration(`${REQUIRED_VERIFICATION_BEGIN}\n${body}\n${REQUIRED_VERIFICATION_END}`)).toThrow('DUPLICATE_JSON_KEY');
    });
  it('rejects nested duplicate digest keys while allowing the same field names in separate entries', () => {
    const value = declaration();
    value.requirements.push({ ...value.requirements[0]!, id: 'RV-other', path: 'candidates/other.md' });
    expect(parseRequiredVerificationDeclaration(source(value))).toEqual(value);
    const body = JSON.stringify(value).replace('"expected_sha256":', '"expected_sha256":"' + 'd'.repeat(64) + '","expected_sha256":');
    expect(() => parseRequiredVerificationDeclaration(`${REQUIRED_VERIFICATION_BEGIN}\n${body}\n${REQUIRED_VERIFICATION_END}`)).toThrow('DUPLICATE_JSON_KEY');
  });
});
