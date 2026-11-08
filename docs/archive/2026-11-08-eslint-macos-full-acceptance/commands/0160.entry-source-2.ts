import { describe, expect, it } from 'vitest';
import { codeContains, hasCallArgument } from '../../../../tests/helpers/source-structure';
describe('source contract syntax normalization', () => {
  it('preserves the same string values and optional trailing separators', () => {
    expect(codeContains('const paths = ["a", \n "b",];', "['a', 'b']")).toBe(true);
    expect(codeContains('feature_spec: "requirement_change_path"', "feature_spec: 'requirement_change_path'")).toBe(true);
  });
  it('does not hide changed literal values, operators, array holes or comments', () => {
    expect(codeContains('const paths = ["a", "changed"];', "['a', 'b']")).toBe(false);
    expect(codeContains('const value = left - right;', 'left + right')).toBe(false);
    expect(codeContains('const value = [1,,];', '[1,]')).toBe(false);
    expect(codeContains('// target(call);\nconst value = "target(call)";', 'target(call)')).toBe(false);
  });
  it('requires the real named call and argument instead of text mention', () => {
    expect(hasCallArgument('snapshot(root, paths);', 'snapshot', 'paths')).toBe(true);
    expect(hasCallArgument('other(root, paths);', 'snapshot', 'paths')).toBe(false);
    expect(hasCallArgument('snapshot(root, other);', 'snapshot', 'paths')).toBe(false);
  });
});
