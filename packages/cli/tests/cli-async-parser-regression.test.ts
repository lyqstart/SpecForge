import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

describe('CLI async parser regression', () => {
  it('does not synchronously or repeatedly parse the async command tree', () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(path.join(testDir, '..', 'src', 'cli.ts'), 'utf8');

    expect(source).not.toContain('parserWithCommands.parseSync(');
    expect(source.match(/parserWithCommands\.parse\(/g)).toHaveLength(1);
    expect(source).toContain('await parserWithCommands.parse();');
  });
});
