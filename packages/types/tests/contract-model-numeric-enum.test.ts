import { describe, expect, it } from 'vitest';

import { SharedEnumContractSchema } from '../src/contract-model';

describe('SharedEnumContractSchema typed values', () => {
  it('keeps legacy shared enums without value_type as string enums', () => {
    const parsed = SharedEnumContractSchema.parse({
      id: 'LegacyStatus',
      owner_module: 'CORE',
      values: ['ready', 'done'],
    });

    expect(parsed.values).toEqual(['ready', 'done']);
    expect(parsed.value_type).toBeUndefined();
  });

  it('accepts an explicit string shared enum', () => {
    const parsed = SharedEnumContractSchema.parse({
      id: 'SyncOp',
      owner_module: 'SYNC',
      value_type: 'string',
      values: ['upsert', 'delete'],
    });

    expect(parsed.value_type).toBe('string');
    expect(parsed.values).toEqual(['upsert', 'delete']);
  });

  it('accepts an explicit numeric shared enum without coercion', () => {
    const parsed = SharedEnumContractSchema.parse({
      id: 'SyncErrorCode',
      owner_module: 'SYNC',
      value_type: 'number',
      values: [4004, 4006, 4007, 4008],
    });

    expect(parsed.value_type).toBe('number');
    expect(parsed.values).toEqual([4004, 4006, 4007, 4008]);
    expect(typeof parsed.values[0]).toBe('number');
  });

  it('rejects values that do not match value_type', () => {
    expect(
      SharedEnumContractSchema.safeParse({
        id: 'BadStringEnum',
        owner_module: 'SYNC',
        value_type: 'string',
        values: [4004, 4006],
      }).success,
    ).toBe(false);

    expect(
      SharedEnumContractSchema.safeParse({
        id: 'BadNumberEnum',
        owner_module: 'SYNC',
        value_type: 'number',
        values: ['4004', '4006'],
      }).success,
    ).toBe(false);
  });

  it('rejects mixed, object, blank, duplicate, and non-finite values', () => {
    const invalidEntries = [
      {
        id: 'MixedEnum',
        owner_module: 'SYNC',
        value_type: 'number',
        values: [4004, '4006'],
      },
      {
        id: 'ObjectEnum',
        owner_module: 'SYNC',
        value_type: 'string',
        values: [{ value: 'upsert' }],
      },
      {
        id: 'BlankEnum',
        owner_module: 'SYNC',
        value_type: 'string',
        values: ['ok', '   '],
      },
      {
        id: 'DuplicateStringEnum',
        owner_module: 'SYNC',
        value_type: 'string',
        values: ['upsert', 'upsert'],
      },
      {
        id: 'DuplicateNumberEnum',
        owner_module: 'SYNC',
        value_type: 'number',
        values: [4004, 4004],
      },
      {
        id: 'InfiniteNumberEnum',
        owner_module: 'SYNC',
        value_type: 'number',
        values: [4004, Number.POSITIVE_INFINITY],
      },
    ];

    for (const entry of invalidEntries) {
      expect(SharedEnumContractSchema.safeParse(entry).success).toBe(false);
    }
  });

  it('rejects unsupported value_type values', () => {
    expect(
      SharedEnumContractSchema.safeParse({
        id: 'BadType',
        owner_module: 'SYNC',
        value_type: 'integer',
        values: [4004],
      }).success,
    ).toBe(false);
  });
});
