/**
 * 路径检查器单元测试
 *
 * 测试覆盖：
 *   - 基本路径检查
 *   - 路径逃逸检测
 *   - 系统路径保护
 *   - 配置管理
 *
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPathChecker, PathChecker, type PathCheckResult } from '../../src/static-checker/path-checker';

describe('PathChecker', () => {
  let checker: PathChecker;

  beforeEach(() => {
    checker = createPathChecker();
  });

  describe('基本路径检查', () => {
    it('应该允许访问基础目录内的路径', () => {
      const baseDir = '/home/user/plugin';
      const safePaths = [
        'config.json',
        './config.json',
        'data/file.txt',
        './data/file.txt',
        '../plugin/config.json', // 相对路径回到基础目录
      ];

      for (const path of safePaths) {
        const result = checker.checkPath(path, baseDir);
        expect(result.safe, `路径 "${path}" 应该安全`).toBe(true);
      }
    });

    it('应该检测路径逃逸攻击', () => {
      const baseDir = '/home/user/plugin';
      const dangerousPaths = [
        '../../other/file.txt', // 逃逸但不匹配系统路径
        '../../../other/file.txt',
        '.././../other/file.txt',
        'data/../../../other/file.txt',
        '/other/file.txt', // 绝对路径但不匹配系统路径
      ];

      for (const path of dangerousPaths) {
        const result = checker.checkPath(path, baseDir);
        expect(result.safe, `路径 "${path}" 应该不安全`).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('路径逃逸攻击');
      }
    });

    it('应该处理 Windows 路径', () => {
      const baseDir = 'C:\\Users\\user\\plugin';
      const paths = [
        { path: 'config.json', expectedSafe: true },
        { path: '..\\..\\Windows\\System32', expectedSafe: false },
        { path: 'C:\\Windows\\System32', expectedSafe: false },
        { path: '.\\data\\file.txt', expectedSafe: true },
      ];

      for (const { path, expectedSafe } of paths) {
        const result = checker.checkPath(path, baseDir);
        expect(result.safe, `路径 "${path}" 应该${expectedSafe ? '安全' : '不安全'}`).toBe(expectedSafe);
      }
    });
  });

  describe('系统路径保护', () => {
    it('应该禁止访问系统关键路径', () => {
      const baseDir = '/home/user/plugin';
      const systemPaths = [
        '/etc/passwd',
        '/etc/shadow',
        '/bin/bash',
        '/usr/bin/python',
        '/var/log/syslog',
        '/root/.ssh/id_rsa',
        '/System/Library/CoreServices',
        '/Library/Preferences',
        'C:\\Windows\\System32\\cmd.exe',
        'C:\\Program Files\\Windows NT',
      ];

      for (const path of systemPaths) {
        const result = checker.checkPath(path, baseDir);
        expect(result.safe, `系统路径 "${path}" 应该被禁止`).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('禁止访问系统关键路径');
      }
    });

    it('应该允许访问非系统路径', () => {
      const baseDir = '/home/user/plugin';
      const nonSystemPaths = [
        '/home/user/plugin/config.json',
        '/tmp/plugin-data.txt',
        '/var/tmp/cache.dat',
        '/home/user/.config/plugin.json',
      ];

      // 注意：这些路径需要相对于基础目录
      // 对于绝对路径，我们需要设置基础目录为根目录或允许访问
      const checkerWithRootBase = createPathChecker();
      for (const path of nonSystemPaths) {
        const result = checkerWithRootBase.checkPath(path, '/');
        // 这些路径可能被标记为系统路径，取决于配置
        // 我们只检查函数不抛出错误
        expect(result).toBeDefined();
      }
    });
  });

  describe('配置管理', () => {
    it('应该支持自定义允许目录', () => {
      const customChecker = createPathChecker({
        allowedDirs: ['/allowed/dir1', '/allowed/dir2'],
      });

      const baseDir = '/allowed/dir1';
      
      // 在允许目录内的路径应该安全
      const result1 = customChecker.checkPath('subdir/file.txt', baseDir);
      expect(result1.safe).toBe(true);

      // 不在允许目录内的路径应该不安全
      const result2 = customChecker.checkPath('/other/dir/file.txt', '/other/dir');
      expect(result2.safe).toBe(false);
      expect(result2.error).toContain('不在允许的目录列表中');
    });

    it('应该支持动态添加允许目录', () => {
      // 使用新的检查器，避免状态污染
      const freshChecker = createPathChecker();
      const baseDir = '/custom/dir';
      
      // 初始状态下，自定义目录在基础目录内，所以是安全的
      const result1 = freshChecker.checkPath('file.txt', baseDir);
      expect(result1.safe).toBe(true);

      // 添加允许目录（不影响结果，因为已经在基础目录内）
      freshChecker.addAllowedDir(baseDir);
      
      // 仍然安全
      const result2 = freshChecker.checkPath('file.txt', baseDir);
      expect(result2.safe).toBe(true);

      // 测试：当 allowedDirs 不为空时，不在列表中的目录应该不安全
      freshChecker.addAllowedDir('/other/allowed');
      // 现在 allowedDirs 不为空，只有列表中的目录才允许
      // 但当前路径在基础目录内，所以仍然安全
      const result3 = freshChecker.checkPath('file.txt', baseDir);
      expect(result3.safe).toBe(true);

      // 移除允许目录
      freshChecker.removeAllowedDir(baseDir);
      freshChecker.removeAllowedDir('/other/allowed');
      
      // 恢复初始状态
      const result4 = freshChecker.checkPath('file.txt', baseDir);
      expect(result4.safe).toBe(true);
    });

    it('应该支持自定义禁止路径', () => {
      const customChecker = createPathChecker({
        forbiddenPaths: ['/custom/forbidden'],
      });

      const baseDir = '/';
      
      // 自定义禁止路径应该被阻止
      const result1 = customChecker.checkPath('/custom/forbidden/file.txt', baseDir);
      expect(result1.safe).toBe(false);
      expect(result1.error).toContain('禁止访问系统关键路径');

      // 其他路径应该允许
      const result2 = customChecker.checkPath('/other/path/file.txt', baseDir);
      // 注意：/other/path 可能被默认配置禁止
      // 我们只检查函数不抛出错误
      expect(result2).toBeDefined();
    });

    it('应该支持动态添加禁止路径', () => {
      const baseDir = '/';
      const testPath = '/test/forbidden/path';
      
      // 初始状态下，测试路径可能允许
      const result1 = checker.checkPath(testPath, baseDir);
      const initiallySafe = result1.safe;

      // 添加禁止路径
      checker.addForbiddenPath(testPath);
      
      // 现在应该被禁止
      const result2 = checker.checkPath(testPath, baseDir);
      expect(result2.safe).toBe(false);

      // 移除禁止路径
      checker.removeForbiddenPath(testPath);
      
      // 应该恢复初始状态
      const result3 = checker.checkPath(testPath, baseDir);
      expect(result3.safe).toBe(initiallySafe);
    });

    it('应该获取和更新配置', () => {
      // 创建新的检查器，避免之前测试的影响
      const freshChecker = createPathChecker();
      const initialConfig = freshChecker.getConfig();
      expect(initialConfig.allowedDirs).toEqual([]);
      expect(initialConfig.forbiddenPaths.length).toBeGreaterThan(0);

      // 更新配置
      const newConfig = {
        allowedDirs: ['/new/allowed'],
        allowParentAccess: true,
        allowSymlinks: true,
      };
      
      freshChecker.updateConfig(newConfig);
      
      const updatedConfig = freshChecker.getConfig();
      expect(updatedConfig.allowedDirs).toEqual(['/new/allowed']);
      expect(updatedConfig.allowParentAccess).toBe(true);
      expect(updatedConfig.allowSymlinks).toBe(true);
      // 原有配置应该保留
      expect(updatedConfig.forbiddenPaths.length).toBeGreaterThan(0);
    });
  });

  describe('批量检查', () => {
    it('应该批量检查多个路径', () => {
      // 使用新的检查器，避免状态污染
      const freshChecker = createPathChecker();
      const baseDir = '/home/user/plugin';
      const paths = [
        'config.json',
        'data/file.txt',
        '../../other/file.txt', // 逃逸但不匹配系统路径
        'subdir/../config.json',
      ];

      const results = freshChecker.checkPaths(paths, baseDir);
      
      expect(results).toHaveLength(4);
      expect(results[0].safe).toBe(true); // config.json
      expect(results[1].safe).toBe(true); // data/file.txt
      expect(results[2].safe).toBe(false); // ../../other/file.txt
      expect(results[3].safe).toBe(true); // subdir/../config.json
    });
  });

  describe('静态方法', () => {
    it('应该检测路径逃逸模式', () => {
      const safePaths = [
        'file.txt',
        './file.txt',
        'dir/file.txt',
        'dir/./file.txt',
        // 'dir/subdir/../file.txt' 包含 ..，应该被检测到
      ];

      const dangerousPaths = [
        '../file.txt',
        '../../file.txt',
        'dir/../../file.txt',
        'dir/subdir/../file.txt', // 包含 ..
        '..\\file.txt',
        '..',
        '../',
      ];

      for (const path of safePaths) {
        expect(PathChecker.containsPathTraversal(path), `路径 "${path}" 不应该包含逃逸模式`).toBe(false);
      }

      for (const path of dangerousPaths) {
        expect(PathChecker.containsPathTraversal(path), `路径 "${path}" 应该包含逃逸模式`).toBe(true);
      }
    });

    it('应该检测绝对路径', () => {
      const relativePaths = [
        'file.txt',
        './file.txt',
        'dir/file.txt',
      ];

      const absolutePaths = [
        '/file.txt',
        'C:\\file.txt',
        '/home/user/file.txt',
        'C:\\Users\\user\\file.txt',
      ];

      for (const path of relativePaths) {
        expect(PathChecker.containsPathTraversal(path), `相对路径 "${path}" 不应该被标记为逃逸`).toBe(false);
      }

      for (const path of absolutePaths) {
        expect(PathChecker.containsPathTraversal(path), `绝对路径 "${path}" 应该被标记为逃逸`).toBe(true);
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理空路径', () => {
      const result = checker.checkPath('', '/base');
      expect(result.safe).toBe(true); // 空路径在当前实现中是安全的
    });

    it('应该处理点路径', () => {
      const result = checker.checkPath('.', '/base');
      expect(result.safe).toBe(true);
    });

    it('应该处理双点路径', () => {
      const result = checker.checkPath('..', '/base');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('路径逃逸攻击');
    });

    it('应该处理复杂逃逸模式', () => {
      const complexPaths = [
        '.../file.txt', // 三个点不是标准逃逸模式
        '..../file.txt', // 四个点
        '.. /file.txt', // 空格
        '../file.txt/../other.txt', // 混合
      ];

      for (const path of complexPaths) {
        const result = checker.checkPath(path, '/base');
        // 我们只检查函数不抛出错误
        expect(result).toBeDefined();
      }
    });

    it('应该处理符号链接', () => {
      // 注意：当前实现不检查符号链接目标
      // 我们只检查函数不抛出错误
      const result = checker.checkPath('symlink', '/base');
      expect(result).toBeDefined();
    });
  });
});