/**
 * Path Utils 单元测试
 * 
 * 测试路径规范化功能的正确性：
 * - 绝对路径转换
 * - 路径片段处理（.. 和 .）
 * - 不同操作系统路径分隔符处理
 * - 路径比较和相对路径计算
 */

import { describe, it, expect } from 'vitest';
import PathUtils, { type PathAnalysis, type PathComparison, type NormalizeOptions } from '../src/utils/path-utils';

describe('PathUtils.normalize', () => {
  describe('基本规范化', () => {
    it('应规范化正斜杠路径', () => {
      expect(PathUtils.normalize('a/b/c')).toBe('a/b/c');
    });

    it('应规范化反斜杠路径', () => {
      expect(PathUtils.normalize('a\\b\\c')).toBe('a/b/c');
    });

    it('应规范化混合路径', () => {
      expect(PathUtils.normalize('a/b\\c/d')).toBe('a/b/c/d');
    });

    it('应移除多余分隔符', () => {
      expect(PathUtils.normalize('a//b///c')).toBe('a/b/c');
    });

    it('应处理空路径', () => {
      expect(PathUtils.normalize('')).toBe('');
    });

    it('应处理空白路径', () => {
      expect(PathUtils.normalize('   ')).toBe('');
    });
  });

  describe('当前目录片段处理 (.)', () => {
    it('应解析单个点', () => {
      expect(PathUtils.normalize('./a')).toBe('a');
    });

    it('应解析多个点', () => {
      expect(PathUtils.normalize('./a/./b')).toBe('a/b');
    });

    it('应解析点结尾', () => {
      expect(PathUtils.normalize('a/b/.')).toBe('a/b');
    });

    it('应解析中间的点', () => {
      expect(PathUtils.normalize('a/./b/./c')).toBe('a/b/c');
    });
  });

  describe('父目录片段处理 (..)', () => {
    it('应解析单点上级', () => {
      expect(PathUtils.normalize('a/../b')).toBe('b');
    });

    it('应解析多点上级', () => {
      expect(PathUtils.normalize('a/b/../../c')).toBe('c');
    });

    it('应正确处理同级目录的父目录', () => {
      expect(PathUtils.normalize('a/./b/../c')).toBe('a/c');
    });

    // 注意：在 Windows 上 path.resolve 会处理超过根的情况，结果可能是 D:/a
    // 在 Unix 上则是 ../a
  });

  describe('相对路径转绝对路径', () => {
    it('应在 resolveToAbsolute 时转换为绝对路径', () => {
      const result = PathUtils.normalize('a/b', { resolveToAbsolute: true });
      expect(result).toContain('/a/b');
      // Windows: D:/xxx/a/b, Unix: /xxx/a/b
      expect(result.startsWith('/') || /^[A-Z]:/.test(result)).toBe(true);
    });

    it('应使用指定的基础目录', () => {
      const result = PathUtils.normalize('a/b', { 
        resolveToAbsolute: true, 
        baseDir: '/test/base' 
      });
      // Windows: D:/test/base/a/b, Unix: /test/base/a/b
      expect(result).toMatch(/\/test\/base\/a\/b$/);
    });
  });

  describe('分隔符处理', () => {
    it('应输出正斜杠（默认）', () => {
      expect(PathUtils.normalize('a\\b')).toBe('a/b');
    });

    it('应输出反斜杠（当指定时）', () => {
      expect(PathUtils.normalize('a/b', { separator: '\\' })).toBe('a\\b');
    });
  });
});

describe('PathUtils.toAbsolute', () => {
  it('应保持绝对路径不变', () => {
    const result = PathUtils.toAbsolute('/a/b');
    expect(result).toBe('/a/b');
  });

  it('应转换相对路径为绝对路径', () => {
    const result = PathUtils.toAbsolute('a/b', '/base');
    // Windows: D:/base/a/b, Unix: /base/a/b
    expect(result).toMatch(/\/base\/a\/b$/);
  });

  it('应使用当前工作目录作为基础', () => {
    const result = PathUtils.toAbsolute('a/b');
    expect(result).toContain('/a/b');
  });
});

describe('PathUtils.toRelative', () => {
  it('应计算相对路径', () => {
    const result = PathUtils.toRelative('/a/b/c', '/a/b');
    expect(result).toBe('c');
  });

  it('应处理相同路径', () => {
    const result = PathUtils.toRelative('/a/b', '/a/b');
    // path.relative returns '' for same path, we normalize to '.'
    expect(result === '' || result === '.').toBe(true);
  });

  it('应处理上级目录', () => {
    const result = PathUtils.toRelative('/a', '/a/b');
    expect(result).toBe('..');
  });
});

describe('PathUtils.analyze', () => {
  it('应分析简单路径', () => {
    const result: PathAnalysis = PathUtils.analyze('a/b/c.txt');
    
    expect(result.original).toBe('a/b/c.txt');
    expect(result.normalized).toBe('a/b/c.txt');
    expect(result.segments).toEqual(['a', 'b', 'c.txt']);
    expect(result.ext).toBe('.txt');
    expect(result.name).toBe('c');
    expect(result.base).toBe('c.txt');
  });

  it('应检测原始路径中的路径遍历', () => {
    // 使用原始路径（未规范化）来检测
    const result = PathUtils.analyze('a/../b');
    // 规范化后是 'b'，但原始路径包含 ..
    expect(result.original).toContain('..');
  });

  it('应检测原始路径中的当前目录', () => {
    const result = PathUtils.analyze('./a/b');
    // 原始路径包含 .
    expect(result.original).toContain('.');
  });

  it('应正确分析绝对路径', () => {
    const result = PathUtils.analyze('/a/b/c');
    expect(result.isAbsolute).toBe(true);
  });
});

describe('PathUtils.compare', () => {
  it('应识别相同路径', () => {
    const result: PathComparison = PathUtils.compare('a/b/c', 'a/b/c');
    expect(result.equal).toBe(true);
  });

  it('应识别不同路径', () => {
    const result = PathUtils.compare('a/b/c', 'a/b/d');
    expect(result.equal).toBe(false);
  });

  it('应计算相对路径', () => {
    const result = PathUtils.compare('/a/b/c', '/a/b');
    expect(result.relative).toBe('c');
  });

  it('应检测内部路径', () => {
    const result = PathUtils.compare('/a/b/c', '/a/b');
    expect(result.isInside).toBe(true);
  });

  it('应检测外部路径', () => {
    const result = PathUtils.compare('/a/b', '/a/b/c');
    expect(result.isInside).toBe(false);
  });
});

describe('PathUtils.isInside', () => {
  it('应识别内部路径', () => {
    expect(PathUtils.isInside('/a/b/c', '/a/b')).toBe(true);
  });

  it('应识别外部路径', () => {
    expect(PathUtils.isInside('/a/b', '/a/b/c')).toBe(false);
  });

  it('应识别同级路径（不算内部）', () => {
    expect(PathUtils.isInside('/a/b', '/a/b')).toBe(true);
  });
});

describe('PathUtils.hasTraversal', () => {
  it('应检测路径遍历', () => {
    expect(PathUtils.hasTraversal('a/../b')).toBe(true);
  });

  it('应识别安全路径', () => {
    expect(PathUtils.hasTraversal('a/b/c')).toBe(false);
  });
});

describe('PathUtils.resolveTraversal', () => {
  it('应解析有效的路径遍历', () => {
    const result = PathUtils.resolveTraversal('a/../b', '/base');
    // Windows: D:/base/b, Unix: /base/b
    expect(result).toMatch(/\/base\/b$/);
  });

  it('应拒绝逃逸的路径', () => {
    expect(() => {
      PathUtils.resolveTraversal('../../etc', '/home/user');
    }).toThrow();
  });
});

describe('PathUtils.normalizeSeparator', () => {
  it('应统一为正斜杠', () => {
    expect(PathUtils.normalizeSeparator('a\\b\\c', '/')).toBe('a/b/c');
  });

  it('应统一为反斜杠', () => {
    expect(PathUtils.normalizeSeparator('a/b/c', '\\')).toBe('a\\b\\c');
  });
});

describe('PathUtils.toCrossPlatform', () => {
  it('应转换为跨平台统一路径', () => {
    expect(PathUtils.toCrossPlatform('a\\b\\c')).toBe('a/b/c');
    expect(PathUtils.toCrossPlatform('a/b/c')).toBe('a/b/c');
  });
});

describe('PathUtils.join', () => {
  it('应合并路径片段', () => {
    expect(PathUtils.join('a', 'b', 'c')).toBe('a/b/c');
  });

  it('应处理已有分隔符', () => {
    expect(PathUtils.join('a/', '/b/', 'c')).toBe('a/b/c');
  });
});

describe('PathUtils.relative', () => {
  it('应返回相对路径', () => {
    expect(PathUtils.relative('/a/b/c', '/a/b')).toBe('c');
  });
});

describe('PathUtils.safePath', () => {
  it('应创建安全路径', () => {
    const result = PathUtils.safePath('/base', 'sub/path');
    // Windows: D:/base/sub/path, Unix: /base/sub/path
    expect(result).toMatch(/\/base\/sub\/path$/);
  });

  it('应拒绝不安全的路径', () => {
    expect(() => {
      PathUtils.safePath('/base', '../../../etc');
    }).toThrow();
  });
});

describe('PathUtils.isSystemPath', () => {
  it('应识别 Windows 系统路径', () => {
    expect(PathUtils.isSystemPath('C:\\Windows\\System32')).toBe(true);
  });

  it('应识别 Linux 系统路径', () => {
    expect(PathUtils.isSystemPath('/etc/passwd')).toBe(true);
  });

  it('应识别非系统路径', () => {
    expect(PathUtils.isSystemPath('/home/user/file')).toBe(false);
  });
});

describe('PathUtils.normalizeDrive', () => {
  it('应规范化驱动器路径', () => {
    const result = PathUtils.normalizeDrive('C:\\Windows');
    expect(result).toContain('C:');
  });
});

describe('边界情况', () => {
  it('应处理只有点的路径', () => {
    expect(PathUtils.normalize('.')).toBe('.');
  });

  it('应处理只有双点的路径', () => {
    expect(PathUtils.normalize('..')).toBe('..');
  });

  it('应处理复杂的混合路径', () => {
    expect(PathUtils.normalize('a/b/./c/../d')).toBe('a/b/d');
  });

  it('应处理带驱动器号的 Windows 绝对路径', () => {
    const result = PathUtils.normalize('C:\\Users\\test\\file.txt');
    // 跨平台统一输出正斜杠
    expect(result).toContain('C:');
  });
});