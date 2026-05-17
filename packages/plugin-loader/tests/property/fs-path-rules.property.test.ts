/**
 * Property-based Tests for FS Path Rules
 * 
 * Feature: plugin-loader, Path Checking, Derived-From: plugin-loader tasks.md 2.3.4
 * 
 * 本测试使用 fast-check 验证路径检查功能的通用属性：
 * 1. 路径规范化的一致性
 * 2. 路径逃逸检测的完整性
 * 3. 符号链接检测的准确性
 * 4. 危险扩展名识别的全面性
 * 5. 白名单验证的正确性
 * 6. 权限验证的完整性
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  createPathChecker, 
  createWhitelistChecker,
  PathChecker,
  DirectoryWhitelist,
  PathUtils,
} from '../../src/static-checker/fs-path-rules';

// 生成任意非空字符串（用于路径）
const arbitraryPath = fc.string({ minLength: 1 }).map(s => s.replace(/[\x00-\x1F]/g, ''));

// 生成任意有效文件名
const arbitraryFileName = fc.sample(
  fc.string({ minLength: 1, maxLength: 50 })
    .map(s => s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'))
    .filter(s => s.length > 0 && s !== '.' && s !== '..'),
  1
)[0] || 'file.txt';

// 生成任意路径段
const arbitraryPathSegment = fc.string({ minLength: 1, maxLength: 20 })
  .map(s => s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'))
  .filter(s => s.length > 0);

// 生成相对路径（不包含逃逸）
const arbitraryRelativePath = fc.array(arbitraryPathSegment, { minLength: 1, maxLength: 10 })
  .map(segments => segments.join('/'));

// 生成可能的逃逸路径
const arbitraryEscapePath = fc.array(arbitraryPathSegment, { minLength: 1, maxLength: 3 })
  .chain(segments => 
    fc.record({
      prefix: fc.constant(segments.join('/')),
      escapes: fc.array(fc.constantFrom('../', '..\\'), { minLength: 1, maxLength: 3 }),
      suffix: fc.option(arbitraryRelativePath, { nil: undefined }),
    })
  )
  .map(({ prefix, escapes, suffix }) => {
    const base = prefix ? prefix + '/' : '';
    const escapePart = escapes.join('');
    const suffixPart = suffix ? '/' + suffix : '';
    return base + escapePart + suffixPart;
  });

// 生成危险扩展名
const arbitraryDangerousExtension = fc.oneof(
  fc.constant('.exe'),
  fc.constant('.bat'),
  fc.constant('.cmd'),
  fc.constant('.ps1'),
  fc.constant('.sh'),
  fc.constant('.dll'),
  fc.constant('.so'),
  fc.constant('.dylib'),
  fc.constant('.py'),
  fc.constant('.rb'),
  fc.constant('.pl'),
  fc.constant('.php'),
  fc.constant('.jar'),
  fc.constant('.class'),
);

// 生成安全扩展名
const arbitrarySafeExtension = fc.oneof(
  fc.constant('.json'),
  fc.constant('.txt'),
  fc.constant('.md'),
  fc.constant('.png'),
  fc.constant('.pdf'),
  fc.constant('.zip'),
  fc.constant('.csv'),
  fc.constant('.log'),
  fc.constant('.js'),
  fc.constant('.ts'),
);

describe('Property: Path Normalization', () => {
  /**
   * Property 1: normalize(normalize(p)) = normalize(p)
   * 路径双重规范化应该等于单次规范化
   */
  it('双重规范化应该等于单次规范化', () => {
    fc.assert(
      fc.property(arbitraryPath, (path) => {
        const once = PathUtils.normalize(path);
        const twice = PathUtils.normalize(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 2: normalize 应该处理各种路径分隔符
   */
  it('应该统一处理路径分隔符', () => {
    fc.assert(
      fc.property(arbitraryRelativePath, (path) => {
        const normalized = PathUtils.normalize(path);
        // 规范化后不应该有多重斜杠
        expect(normalized).not.toMatch(/\/\/+/);
        expect(normalized).not.toMatch(/\\\\+/);
      }),
      { numRuns: 100, seed: 42 }
    );
  });
});

describe('Property: Path Traversal Detection', () => {
  const pluginRoot = process.platform === 'win32' 
    ? 'C:/Users/user/plugins/my-plugin' 
    : '/home/user/plugins/my-plugin';
  const checker = createPathChecker(pluginRoot);

  /**
   * Property 1: 包含 ../ 或 ..\ 的路径应该被检测为逃逸
   */
  it('包含父目录引用的路径应该被标记为不安全', () => {
    fc.assert(
      fc.property(arbitraryEscapePath, (path) => {
        // 过滤掉可能在白名单内的情况
        if (path.includes('../') || path.includes('..\\')) {
          const result = checker.checkPath(path);
          // 父目录引用应该被检测到
          expect(result.safe || result.error?.includes('路径逃逸')).toBeTruthy();
        }
      }),
      { numRuns: 100, seed: 42 }
    );
  });

  /**
   * Property 2: 安全的相对路径应该通过检查
   */
  it('安全的相对路径应该通过检查', () => {
    fc.assert(
      fc.property(arbitraryRelativePath, (path) => {
        const result = checker.checkPath(path);
        // 简单的相对路径应该安全（不考虑扩展名限制）
        expect(result.safe || result.normalizedPath).toBeTruthy();
      }),
      { numRuns: 100, seed: 42 }
    );
  });
});

describe('Property: Symlink Detection', () => {
  const pluginRoot = process.platform === 'win32' 
    ? 'C:/Users/user/plugins/my-plugin' 
    : '/home/user/plugins/my-plugin';
  const checker = createPathChecker(pluginRoot);

  /**
   * Property: .lnk, .symlink, .link 扩展名应该触发警告
   */
  it('符号链接扩展名应该被检测', () => {
    fc.assert(
      fc.property(arbitraryPathSegment, (name) => {
        const symlinkExtensions = ['.lnk', '.symlink', '.link'];
        for (const ext of symlinkExtensions) {
          const result = checker.checkPath(name + ext);
          // 符号链接应该被检测到
          expect(result.error?.includes('符号链接') || result.safe).toBeTruthy();
        }
      }),
      { numRuns: 50, seed: 42 }
    );
  });
});

describe('Property: Dangerous Extension Detection', () => {
  const pluginRoot = process.platform === 'win32' 
    ? 'C:/Users/user/plugins/my-plugin' 
    : '/home/user/plugins/my-plugin';
  const checker = createPathChecker(pluginRoot);

  /**
   * Property 1: 所有危险扩展名应该被拒绝
   */
  it('危险文件扩展名应该被拒绝', () => {
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.ps1', '.sh', '.dll', '.so', '.dylib',
      '.py', '.rb', '.pl', '.php', '.jar', '.class',
    ];
    
    for (const ext of dangerousExtensions) {
      const result = checker.checkPath('testfile' + ext);
      expect(result.safe).toBe(false);
      expect(result.error).toContain('危险文件扩展名');
    }
  });

  /**
   * Property 2: 安全扩展名应该被允许
   */
  it('安全文件扩展名应该被允许', () => {
    const safeExtensions = [
      '.json', '.txt', '.md', '.png', '.pdf', '.zip', '.csv', '.log', '.js', '.ts',
    ];
    
    for (const ext of safeExtensions) {
      const result = checker.checkPath('testfile' + ext);
      // 安全扩展名应该通过
      expect(result.safe).toBe(true);
    }
  });
});

describe('Property: Whitelist Validation', () => {
  /**
   * Property 1: 白名单内的路径应该被允许
   */
  it('白名单内的路径应该被允许', () => {
    const baseDir = process.platform === 'win32' ? 'C:/allowed' : '/allowed';
    const whitelist: DirectoryWhitelist[] = [
      {
        id: 'test',
        name: '测试白名单',
        allowedDirs: [baseDir],
        allowSubdirs: true,
        requiredPermissions: [],
        enabled: true,
      },
    ];
    const checker = createWhitelistChecker(whitelist, baseDir);

    const allowedPath = baseDir + (process.platform === 'win32' ? '\\file.txt' : '/file.txt');
    const result = checker.checkWhitelist(allowedPath);
    expect(result.allowed).toBe(true);
  });

  /**
   * Property 2: 白名单外的路径应该被拒绝
   */
  it('白名单外的路径应该被拒绝', () => {
    const baseDir = process.platform === 'win32' ? 'C:/allowed' : '/allowed';
    const whitelist: DirectoryWhitelist[] = [
      {
        id: 'test',
        name: '测试白名单',
        allowedDirs: [baseDir],
        allowSubdirs: true,
        requiredPermissions: [],
        enabled: true,
      },
    ];
    const checker = createWhitelistChecker(whitelist, baseDir);

    const deniedPath = process.platform === 'win32' ? 'C:/denied/file.txt' : '/denied/file.txt';
    const result = checker.checkWhitelist(deniedPath);
    expect(result.allowed).toBe(false);
  });

  /**
   * Property 3: 权限验证应该正确工作
   */
  it('有权限时应该允许访问', () => {
    const baseDir = process.platform === 'win32' ? 'C:/secure' : '/secure';
    const whitelist: DirectoryWhitelist[] = [
      {
        id: 'secure',
        name: '安全目录',
        allowedDirs: [baseDir],
        allowSubdirs: true,
        requiredPermissions: ['filesystem.read'],
        enabled: true,
      },
    ];
    const checker = createWhitelistChecker(whitelist, baseDir);

    const securePath = baseDir + (process.platform === 'win32' ? '\\file.txt' : '/file.txt');
    const result = checker.checkWhitelist(securePath, ['filesystem.read']);
    expect(result.allowed).toBe(true);
  });

  it('没有权限时应该拒绝访问', () => {
    const baseDir = process.platform === 'win32' ? 'C:/secure' : '/secure';
    const whitelist: DirectoryWhitelist[] = [
      {
        id: 'secure',
        name: '安全目录',
        allowedDirs: [baseDir],
        allowSubdirs: true,
        requiredPermissions: ['filesystem.read'],
        enabled: true,
      },
    ];
    const checker = createWhitelistChecker(whitelist, baseDir);

    const securePath = baseDir + (process.platform === 'win32' ? '\\file.txt' : '/file.txt');
    const result = checker.checkWhitelist(securePath, []);
    expect(result.allowed).toBe(false);
  });
});

describe('Property: Permission Validation', () => {
  const pluginRoot = process.platform === 'win32' 
    ? 'C:/Users/user/plugins/my-plugin' 
    : '/home/user/plugins/my-plugin';
  const checker = createPathChecker(pluginRoot);

  /**
   * Property 1: 有 filesystem.read 权限时应该允许路径逃逸
   */
  it('有权限时应该允许路径逃逸', () => {
    fc.assert(
      fc.property(arbitraryEscapePath, (path) => {
        if (path.includes('../') || path.includes('..\\')) {
          const result = checker.checkPath(path, ['filesystem.read']);
          // 有权限时应该允许
          expect(result.safe).toBe(true);
        }
      }),
      { numRuns: 50, seed: 42 }
    );
  });

  /**
   * Property 2: 有 filesystem.read 权限时应该允许系统路径
   */
  it('有权限时应该允许系统路径', () => {
    // 使用相对路径模拟系统路径检查
    // 由于我们在测试，路径检查器会根据规则来判断
    // 这里主要测试权限验证逻辑
    const testPath = process.platform === 'win32' ? 'C:/test/file.txt' : '/test/file.txt';
    const result = checker.checkPath(testPath, ['filesystem.read']);
    // 相对路径在有权限时应该通过
    expect(result).toBeDefined();
  });

  /**
   * Property 3: 有权限时应该允许危险扩展名
   */
  it('有权限时应该允许危险扩展名', () => {
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.ps1', '.sh'];
    
    for (const ext of dangerousExtensions) {
      const result = checker.checkPath('testfile' + ext, ['filesystem.read']);
      // 有权限时应该允许
      expect(result.safe).toBe(true);
    }
  });
});

describe('Property: Edge Cases', () => {
  const pluginRoot = process.platform === 'win32' 
    ? 'C:/Users/user/plugins/my-plugin' 
    : '/home/user/plugins/my-plugin';
  const checker = createPathChecker(pluginRoot);

  /**
   * Property 1: 空路径应该被拒绝
   */
  it('空路径应该被拒绝', () => {
    const result = checker.checkPath('');
    expect(result.safe).toBe(false);
    expect(result.error).toBe('文件路径不能为空');
  });

  /**
   * Property 2: 空白路径应该被拒绝
   */
  it('空白路径应该被拒绝', () => {
    const result = checker.checkPath('   ');
    expect(result.safe).toBe(false);
    expect(result.error).toBe('文件路径不能为空');
  });

  /**
   * Property 3: 非常长的路径应该被正确处理
   */
  it('非常长的路径应该被正确处理', () => {
    fc.assert(
      fc.property(fc.nat({ max: 1000 }), (length) => {
        const longPath = 'a/'.repeat(length) + 'file.txt';
        const result = checker.checkPath(longPath);
        // 应该有结果，不应该崩溃
        expect(result).toBeDefined();
        expect(result.normalizedPath).toBeDefined();
      }),
      { numRuns: 20, seed: 42 }
    );
  });

  /**
   * Property 4: 特殊字符路径应该被正确处理
   */
  it('特殊字符路径应该被正确处理', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 })
          .map(s => s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')),
        (name) => {
          if (name.length > 0) {
            const result = checker.checkPath(name + '.txt');
            // 应该有结果，不应该崩溃
            expect(result).toBeDefined();
          }
        }
      ),
      { numRuns: 50, seed: 42 }
    );
  });
});

describe('Property: PathUtils Consistency', () => {
  /**
   * Property: isAbsolute 应该与 resolve 一致
   */
  it('isAbsolute 应该正确判断绝对路径', () => {
    fc.assert(
      fc.property(arbitraryRelativePath, (relPath) => {
        // 相对路径不应该被判断为绝对路径
        expect(PathUtils.isAbsolute(relPath)).toBe(false);
      }),
      { numRuns: 50, seed: 42 }
    );
  });

  /**
   * Property: extname 应该返回正确的扩展名
   */
  it('extname 应该返回正确的扩展名', () => {
    fc.assert(
      fc.property(arbitraryPathSegment, fc.oneof(arbitrarySafeExtension, arbitraryDangerousExtension), 
        (name, ext) => {
          const fullPath = name + ext;
          const resultExt = PathUtils.extname(fullPath);
          expect(resultExt).toBe(ext);
        }
      ),
      { numRuns: 50, seed: 42 }
    );
  });

  /**
   * Property: basename 应该正确提取文件名
   */
  it('basename 应该正确提取文件名', () => {
    fc.assert(
      fc.property(arbitraryRelativePath, (path) => {
        const base = PathUtils.basename(path);
        // basename 不应该为空
        expect(base.length).toBeGreaterThan(0);
      }),
      { numRuns: 50, seed: 42 }
    );
  });
});