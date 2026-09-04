import { describe, expect, it } from 'vitest';
import { parseHandshakeFile } from '../../src/types/handshake.js';

function validHandshake(): Record<string, unknown> {
  return {
    schema_version: '1.0',
    pid: 12345,
    port: 3847,
    token: 'test-token',
    bound_to: '127.0.0.1',
    startedAt: 1_700_000_000_000,
    version: '6.0.0',
    serviceMode: false,
    artifact_contract_versions: {
      task_document: '1.0',
    },
  };
}

describe('parseHandshakeFile', () => {
  it('accepts the complete current daemon handshake contract', () => {
    expect(parseHandshakeFile(validHandshake())).toEqual(validHandshake());
  });

  it.each([
    ['non-object root', null],
    ['wrong schema', { ...validHandshake(), schema_version: '0.9' }],
    ['non-positive pid', { ...validHandshake(), pid: 0 }],
    ['out-of-range port', { ...validHandshake(), port: 65_536 }],
    ['empty token', { ...validHandshake(), token: '' }],
    ['unsupported bind address', { ...validHandshake(), bound_to: 'localhost' }],
    ['invalid start timestamp', { ...validHandshake(), startedAt: -1 }],
    ['empty daemon version', { ...validHandshake(), version: '' }],
    ['non-boolean service mode', { ...validHandshake(), serviceMode: 'false' }],
    [
      'missing task artifact contract',
      { ...validHandshake(), artifact_contract_versions: {} },
    ],
  ])('rejects %s', (_description, value) => {
    expect(() => parseHandshakeFile(value)).toThrow();
  });
});
