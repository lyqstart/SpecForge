import path from 'node:path';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'eslint.config.mjs') });
const cases = [
  { name: 'unbound write', text: "import { beforeEach } from 'vitest'; beforeEach(() => { capturedEvents = []; });", expected: ['unbound'] },
  { name: 'bound capture', text: "import { beforeEach } from 'vitest'; let capturedEvents: unknown[] = []; beforeEach(() => { capturedEvents = []; }); void capturedEvents;", expected: [] },
  { name: 'type import used as value', text: "import type { Model } from './fixture'; Model.create();", expected: ['typeOnly'] },
  { name: 'type query', text: "import type { Model } from './fixture'; type Shape = typeof Model; export type { Shape };", expected: [] },
  { name: 'optional host probe', text: "export const present = typeof optionalHost !== 'undefined';", expected: [] },
  { name: 'unbound call', text: 'export const result = missingFactory();', expected: ['unbound'] },
];

describe('actual ESLint runtime value bindings', () => {
  it.each(cases)('$name', async ({ text, expected }) => {
    const results = await eslint.lintText(text, { filePath: path.join(root, 'packages/configuration/src/runtime-reference-canary.ts') });
    const messages = results.flatMap(result => result.messages);
    expect(messages.filter(message => message.fatal)).toEqual([]);
    const actual = messages.filter(message => message.ruleId === 'specforge/no-unbound-runtime-reference');
    expect(actual.map(message => message.messageId).sort()).toEqual(expected.slice().sort());
  });
});
