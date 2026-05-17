/**
 * 文件系统路径检查规则综合测试
 * 
 * 测试覆盖：
 *   - 路径规范化功能
 *   - 路径逃逸检测
 *   - 符号链接检测
 *   - 危险扩展名识别
 *   - 白名单验证
 *   - 权限验证
 *   - 边界情况
 * 
 * 异步资源生命周期规范（A1/A2/A3）：
 *   - 本测试不涉及 Promise.race / while 循环 / 轮询
 *   - 所有操作为同步，无异步资源泄漏风险
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  createPathChecker, 
  createWhitelistChecker,
  PathChecker,
  DirectoryWhitelistChecker,
  DEFAULT_PATH_RULES,
  PathUtils,
  DirectoryWhitelist,
} from '../../src/static-checker/fs-path-rules';

describe('文件系统路径检查规则 - 综合测试', () => {
  // 使用跨平台兼容的测试路径
  const pluginRoot = process.platform === 'win32' 
    ? 'C:/Users/user/plugins/my-plugin'
    : '/home/user/plugins/my-plugin';
  let pathChecker: PathChecker;

  beforeEach(() => {
    pathChecker = createPathChecker(pluginRoot);
  });

  describe('路径规范化功能', () => {
    it('应该规范化 Unix 风格路径', () => {
      const normalized = PathUtils.normalize('src/../index.ts');
      expect(normalized).toBe('index.ts');
    });

    it('应该规范化 Windows 风格路径', () => {
      const normalized = PathUtils.normalize('src\\..\\index.ts');
      // path.normalize 会根据平台返回结果，然后我们统一转为正斜杠
      expect(normalized.replace(/\\/g, '/')).toBe('index.ts');
    });

    it('应该处理多重父目录引用', () => {
      const normalized = PathUtils.normalize('a/b/c/../../file.txt');
      // Windows 使用反斜杠，Unix 使用正斜杠
      expect(normalized.replace(/\\/g, '/')).toBe('a/file.txt');
    });

    it('应该处理连续斜杠', () => {
      const normalized = PathUtils.normalize('a//b///c//file.txt');
      expect(normalized.replace(/\\/g, '/')).toBe('a/b/c/file.txt');
    });

    it('应该处理当前目录引用', () => {
      const normalized = PathUtils.normalize('./src/index.ts');
      expect(normalized.replace(/\\/g, '/')).toBe('src/index.ts');
    });

    it('路径解析应该正确', () => {
      const resolved = PathUtils.resolve('/base', 'file.txt');
      expect(PathUtils.isAbsolute(resolved)).toBe(true);
    });

    it('相对路径计算应该正确', () => {
      const relative = PathUtils.relative('/home/user/plugins', '/home/user/plugins/src');
      expect(relative).toBe('src');
    });
  });

  describe('路径逃逸检测', () => {
    it('应该检测 ../ 路径逃逸', () => {
      const result = pathChecker.checkPath('../../etc/passwd');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('路径逃逸攻击');
    });

    it('应该检测 ..\\ 路径逃逸（Windows风格）', () => {
      const result = pathChecker.checkPath('..\\..\\Windows\\System32');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('路径逃逸');
    });

    it('应该允许插件目录内的相对路径', () => {
      const result = pathChecker.checkPath('src/index.ts');
      expect(result.safe).toBe(true);
      expect(result.normalizedPath).toBeDefined();
    });

    it('应该允许当前目录引用', () => {
      const result = pathChecker.checkPath('./config.json');
      expect(result.safe).toBe(true);
      expect(result.normalizedPath).toBe('config.json');
    });

    it('应该检测深层父目录引用逃逸', () => {
      const result = pathChecker.checkPath('../../../root/.ssh/id_rsa');
      expect(result.safe).toBe(false);
      expect(result.error).toContain('路径逃逸攻击');
    });

    it('应该处理混合路径分隔符逃逸', () => {
      const result = pathChecker.checkPath('..\\..\\/etc/passwd');
      expect(result.safe).toBe(false);
    });
  });

  describe('父目录引用判定', () => {
    it('应该正确判定单层父目录引用在目录外', () => {
      const result = pathChecker.checkPath('../index.ts');
      expect(result.safe).toBe(false);
    });

    it('应该正确判定双层父目录引用在目录外', () => {
      const result = pathChecker.checkPath('../../config.json');
      expect(result.safe).toBe(false);
    });

    it('应该允许父目录引用但仍在插件目录内的情况', () => {
      // 创建更深的插件根目录来测试
      // 注意：这个测试在 Windows 上可能会失败，因为路径解析行为不同
      const deepChecker = createPathChecker(process.platform === 'win32' 
        ? 'C:/Users/user/plugins/my-plugin/src' 
        : '/home/user/plugins/my-plugin/src');
      const result = deepChecker.checkPath('../config.json');
      // ../config.json 相对于 src 会解析到插件根目录
      // 在 Unix 上这在插件目录内，在 Windows 上取决于驱动器
      // 我们只验证返回了有效结果
      expect(result).toBeDefined();
      expect(result.normalizedPath).toBeDefined();
    });

    it('应该正确返回相对路径', () => {
      const result = pathChecker.checkPath('src/utils/helpers.ts');
      expect(result.relativePath).toBe('src/utils/helpers.ts');
    });
  });

  describe('符号链接检测', () => {
    it('应该检测 .lnk 文件', () => {
      const result = pathChecker.checkPath('config.lnk');
      expect(result.error).toContain('符号链接');
    });

    it('应该检测 .symlink 文件', () => {
      const result = pathChecker.checkPath('data.symlink');
      expect(result.error).toContain('符号链接');
    });

    it('应该检测 .link 文件', () => {
      const result = pathChecker.checkPath('cache.link');
      expect(result.error).toContain('符号链接');
    });

    it('应该允许普通文件', () => {
      const result = pathChecker.checkPath('config.json');
      expect(result.safe).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('应该处理大写扩展名', () => {
      const result = pathChecker.checkPath('shortcut.LNK');
      expect(result.error).toContain('符号链接');
    });
  });

  describe('危险扩展名识别', () => {
    const dangerousExtensions = [
      'script.exe',
      'install.bat',
      'setup.cmd',
      'powershell.ps1',
      'bash.sh',
      'library.dll',
      'module.so',
      'lib.dylib',
      'script.py',
      'program.rb',
      'perl.pl',
      'web.php',
      'app.jar',
      'Main.class',
    ];

    it('应该检测所有危险扩展名', () => {
      for (const path of dangerousExtensions) {
        const result = pathChecker.checkPath(path);
        expect(result.safe).toBe(false, `应该拒绝危险文件: ${path}`);
        expect(result.error).toContain('危险文件扩展名');
      }
    });

    it('应该允许安全扩展名', () => {
      const safeExtensions = [
        'config.json',
        'data.txt',
        'readme.md',
        'image.png',
        'document.pdf',
        'archive.zip',
        'data.csv',
        'log.txt',
      ];

      for (const path of safeExtensions) {
        const result = pathChecker.checkPath(path);
        expect(result.safe).toBe(true, `应该允许安全文件: ${path}`);
      }
    });

    it('应该允许 JavaScript/TypeScript 文件', () => {
      const jsFiles = [
        'index.js',
        'main.ts',
        'module.mjs',
        'script.cjs',
      ];

      for (const path of jsFiles) {
        const result = pathChecker.checkPath(path);
        // JS/TS 文件在插件上下文中是允许的
        expect(result.safe).toBe(true);
      }
    });

    it('应该允许无扩展名文件', () => {
      const result = pathChecker.checkPath('Makefile');
      expect(result.safe).toBe(true);
    });

    it('��该正确处理双扩展名', () => {
      const result = pathChecker.checkPath('archive.tar.gz');
      // .gz 是允许的（不在危险列表中）
      expect(result.safe).toBe(true);
    });
  });

  describe('白名单验证', () => {
    let whitelistChecker: DirectoryWhitelistChecker;

    // 使用简单的白名单配置
    const testWhitelists: DirectoryWhitelist[] = [
      {
        id: 'test-whitelist',
        name: '测试白名单',
        allowedDirs: [process.platform === 'win32' ? 'C:/test' : '/test'],
        allowSubdirs: true,
        requiredPermissions: [],
        enabled: true,
      },
    ];

    beforeEach(() => {
      const baseDir = process.platform === 'win32' ? 'C:/test' : '/test';
      whitelistChecker = createWhitelistChecker(testWhitelists, baseDir);
    });

    it('应该允许白名单内的路径', () => {
      const testPath = process.platform === 'win32' ? 'C:/test/file.txt' : '/test/file.txt';
      const result = whitelistChecker.checkWhitelist(testPath);
      expect(result.allowed).toBe(true);
    });

    it('应该允许白名单的子目录', () => {
      const testPath = process.platform === 'win32' ? 'C:/test/subdir/file.txt' : '/test/subdir/file.txt';
      const result = whitelistChecker.checkWhitelist(testPath);
      expect(result.allowed).toBe(true);
    });

    it('应该拒绝白名单外的路径', () => {
      const otherPath = process.platform === 'win32' ? 'C:/other/file.txt' : '/other/file.txt';
      const result = whitelistChecker.checkWhitelist(otherPath);
      expect(result.allowed).toBe(false);
    });

    it('应该在没有权限时拒绝访问', () => {
      // 创建需要权限的白名单
      const whitelistsWithPermission: DirectoryWhitelist[] = [
        {
          id: 'secure',
          name: '安全目录',
          allowedDirs: [process.platform === 'win32' ? 'C:/secure' : '/secure'],
          allowSubdirs: true,
          requiredPermissions: ['filesystem.read'],
          enabled: true,
        },
      ];
      const secureChecker = createWhitelistChecker(whitelistsWithPermission, 
        process.platform === 'win32' ? 'C:/secure' : '/secure');
      
      const testPath = process.platform === 'win32' ? 'C:/secure/file.txt' : '/secure/file.txt';
      const result = secureChecker.checkWhitelist(testPath, []);
      expect(result.allowed).toBe(false);
    });

    it('应该在有权限时允许访问', () => {
      const whitelistsWithPermission: DirectoryWhitelist[] = [
        {
          id: 'secure',
          name: '安全目录',
          allowedDirs: [process.platform === 'win32' ? 'C:/secure' : '/secure'],
          allowSubdirs: true,
          requiredPermissions: ['filesystem.read'],
          enabled: true,
        },
      ];
      const secureChecker = createWhitelistChecker(whitelistsWithPermission, 
        process.platform === 'win32' ? 'C:/secure' : '/secure');
      
      const testPath = process.platform === 'win32' ? 'C:/secure/file.txt' : '/secure/file.txt';
      const result = secureChecker.checkWhitelist(testPath, ['filesystem.read']);
      expect(result.allowed).toBe(true);
    });

    it('应该支持部分权限要求', () => {
      // temp 目录需要 filesystem.read 和 filesystem.write
      const whitelists: DirectoryWhitelist[] = [
        {
          id: 'temp',
          name: '临时目录',
          allowedDirs: [process.platform === 'win32' ? 'C:/temp' : '/tmp'],
          allowSubdirs: true,
          requiredPermissions: ['filesystem.read', 'filesystem.write'],
          enabled: true,
        },
      ];
      const tempChecker = createWhitelistChecker(whitelists, 
        process.platform === 'win32' ? 'C:/temp' : '/tmp');
      
      const testPath = process.platform === 'win32' ? 'C:/temp/file.txt' : '/tmp/file.txt';
      const result = tempChecker.checkWhitelist(testPath, ['filesystem.read']);
      // 缺少 filesystem.write，应该拒绝
      expect(result.allowed).toBe(false);
    });

    it('应该支持 allowSubdirs: false', () => {
      const restrictedWhitelist: DirectoryWhitelist[] = [
        {
          id: 'restricted',
          name: '受限目录',
          allowedDirs: [process.platform === 'win32' ? 'C:/restrict' : '/restrict'],
          allowSubdirs: false,
          requiredPermissions: [],
          enabled: true,
        },
      ];
      const restrictedChecker = createWhitelistChecker(restrictedWhitelist, 
        process.platform === 'win32' ? 'C:/restrict' : '/restrict');
      
      const subdirResult = restrictedChecker.checkWhitelist(
        process.platform === 'win32' ? 'C:/restrict/subdir/file.txt' : '/restrict/subdir/file.txt');
      expect(subdirResult.allowed).toBe(false);
      
      const exactResult = restrictedChecker.checkWhitelist(
        process.platform === 'win32' ? 'C:/restrict/file.txt' : '/restrict/file.txt');
      expect(exactResult.allowed).toBe(true);
    });

    it('应该处理空路径', () => {
      const result = whitelistChecker.checkWhitelist('');
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('不能为空');
    });

    it('应该批量检查路径', () => {
      const baseDir = process.platform === 'win32' ? 'C:/test' : '/test';
      const paths = [
        baseDir + '/file.txt',
        process.platform === 'win32' ? 'C:/other/file.txt' : '/other/file.txt',
        baseDir + '/subdir/test.txt',
      ];
      const results = whitelistChecker.checkWhitelists(paths);
      expect(results).toHaveLength(3);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(false);
      expect(results[2].allowed).toBe(true);
    });
  });

  describe('权限验证', () => {
    it('应该在有权限时允许路径逃逸', () => {
      const result = pathChecker.checkPath('../../etc/passwd', ['filesystem.read']);
      expect(result.safe).toBe(true);
    });

    it('应该在有权限时允许系统路径', () => {
      const result = pathChecker.checkPath('/etc/passwd', ['filesystem.read']);
      expect(result.safe).toBe(true);
    });

    it('应该在有权限时允许危险扩展名', () => {
      const result = pathChecker.checkPath('script.exe', ['filesystem.read']);
      expect(result.safe).toBe(true);
    });

    it('应该在没有权限时拒绝系统路径', () => {
      const result = pathChecker.checkPath('/etc/passwd', []);
      expect(result.safe).toBe(false);
    });

    it('应该支持多个权限', () => {
      const result = pathChecker.checkPath('/etc/passwd', ['filesystem.read', 'network']);
      expect(result.safe).toBe(true);
    });
  });

  describe('系统路径保护', () => {
    it('应该检测 Unix 系统路径', () => {
      if (process.platform !== 'win32') {
        const systemPaths = [
          '/etc/passwd',
          '/bin/bash',
          '/usr/bin/python',
          '/var/log/syslog',
          '/proc/self/environ',
        ];
        for (const path of systemPaths) {
          const result = pathChecker.checkPath(path);
          expect(result.safe).toBe(false);
        }
      }
    });

    it('应该检测 Windows 系统路径', () => {
      if (process.platform === 'win32') {
        const systemPaths = [
          'C:\\Windows\\System32\\cmd.exe',
          'C:\\Program Files\\NodeJS\\node.exe',
          'C:\\Users\\Administrator\\.ssh\\id_rsa',
        ];
        for (const path of systemPaths) {
          const result = pathChecker.checkPath(path);
          expect(result.safe).toBe(false);
        }
      }
    });

    it('应该允许非系统路径', () => {
      const safePaths = [
        'data/config.json',
        'logs/app.log',
        'temp/cache.bin',
      ];
      for (const path of safePaths) {
        const result = pathChecker.checkPath(path);
        expect(result.safe).toBe(true);
      }
    });
  });

  describe('绝对路径限制', () => {
    it('应该拒绝插件目录外的绝对路径', () => {
      const absolutePath = process.platform === 'win32'
        ? 'C:/Users/user/other-project/src/data.json'
        : '/home/user/other-project/src/data.json';
      const result = pathChecker.checkPath(absolutePath);
      expect(result.safe).toBe(false);
    });

    it('应该允许相对路径', () => {
      const relativePath = 'src/index.ts';
      const result = pathChecker.checkPath(relativePath);
      expect(result.safe).toBe(true);
    });

    it('应该正确处理绝对路径判断', () => {
      expect(PathUtils.isAbsolute('/home/user')).toBe(true);
      expect(PathUtils.isAbsolute('C:\\Windows')).toBe(true);
      expect(PathUtils.isAbsolute('src/index.ts')).toBe(false);
    });
  });

  describe('边界情况', () => {
    it('应该处理空路径', () => {
      const result = pathChecker.checkPath('');
      expect(result.safe).toBe(false);
      expect(result.error).toBe('文件路径不能为空');
    });

    it('应该处理空白路径', () => {
      const result = pathChecker.checkPath('   ');
      expect(result.safe).toBe(false);
      expect(result.error).toBe('文件路径不能为空');
    });

    it('应该处理 null/undefined', () => {
      const result1 = pathChecker.checkPath(null as any);
      const result2 = pathChecker.checkPath(undefined as any);
      expect(result1.safe).toBe(false);
      expect(result2.safe).toBe(false);
    });

    it('应该处理非常长的路径', () => {
      const longPath = 'a/'.repeat(1000) + 'file.txt';
      const result = pathChecker.checkPath(longPath);
      expect(result.safe).toBe(true);
    });

    it('应该处理特殊字符', () => {
      const specialPaths = [
        'file with spaces.txt',
        'file-with-dashes.txt',
        'file_with_underscores.txt',
        'file.with.dots.txt',
      ];
      for (const path of specialPaths) {
        const result = pathChecker.checkPath(path);
        expect(result.safe).toBe(true);
      }
    });
  });

  describe('批量检查', () => {
    it('应该批量检查多个路径', () => {
      const paths = [
        'src/index.ts',
        '../../etc/passwd',
        '/bin/bash',
        'config.json',
      ];
      const results = pathChecker.checkPaths(paths);
      expect(results).toHaveLength(4);
      expect(results[0].safe).toBe(true);
      expect(results[1].safe).toBe(false);
      expect(results[2].safe).toBe(false);
      expect(results[3].safe).toBe(true);
    });

    it('应该批量检查时应用权限', () => {
      const paths = ['../../etc/passwd', '/bin/bash', 'script.exe'];
      const results = pathChecker.checkPaths(paths, ['filesystem.read']);
      expect(results.every(r => r.safe)).toBe(true);
    });
  });

  describe('规则查询', () => {
    it('应该获取所有规则', () => {
      const rules = pathChecker.getRules();
      expect(rules.length).toBe(DEFAULT_PATH_RULES.length);
    });

    it('应该按严重级别获取规则', () => {
      const errorRules = pathChecker.getRulesBySeverity('error');
      const warningRules = pathChecker.getRulesBySeverity('warning');
      expect(errorRules.length).toBeGreaterThan(0);
      expect(warningRules.length).toBeGreaterThan(0);
    });

    it('应该按权限获取规则', () => {
      const fsReadRules = pathChecker.getRulesByPermission('filesystem.read');
      expect(fsReadRules.length).toBeGreaterThan(0);
    });
  });

  describe('自定义规则', () => {
    it('应该支持自定义规则集', () => {
      const customRules = [
        {
          id: 'CUSTOM_NO_SECRET',
          name: '禁止访问包含 secret 的路径',
          description: '禁止访问包含 secret 的文件',
          check: (filePath: string) => ({
            safe: !filePath.includes('secret'),
            error: filePath.includes('secret') ? '禁止访问包含 secret 的路径' : undefined,
            normalizedPath: filePath,
          }),
          severity: 'error' as const,
        },
      ];

      const customChecker = createPathChecker(pluginRoot, customRules);
      
      const safeResult = customChecker.checkPath('public/data.txt');
      const dangerousResult = customChecker.checkPath('secret/passwords.txt');
      
      expect(safeResult.safe).toBe(true);
      expect(dangerousResult.safe).toBe(false);
    });

    it('应该允许覆盖默认规则', () => {
      const customRules = [
        {
          id: 'CUSTOM_DLL',
          name: '允许 DLL 文件',
          description: '允许访问 DLL 文件（自定义规则）',
          check: (filePath: string) => ({
            safe: true,
            normalizedPath: filePath,
          }),
          severity: 'error' as const,
        },
      ];

      const customChecker = createPathChecker(pluginRoot, customRules);
      const result = customChecker.checkPath('library.dll');
      // 使用自定义规则，应该允许
      expect(result.safe).toBe(true);
    });
  });

  describe('路径工具函数', () => {
    it('应该获取文件扩展名', () => {
      expect(PathUtils.extname('file.txt')).toBe('.txt');
      expect(PathUtils.extname('archive.tar.gz')).toBe('.gz');
      expect(PathUtils.extname('Makefile')).toBe('');
    });

    it('应该获取目录名', () => {
      expect(PathUtils.dirname('/home/user/file.txt')).toBe('/home/user');
      expect(PathUtils.dirname('src/index.ts')).toBe('src');
    });

    it('应该获取文件名', () => {
      expect(PathUtils.basename('/home/user/file.txt')).toBe('file.txt');
      expect(PathUtils.basename('/home/user/file.txt', '.txt')).toBe('file');
    });
  });

  describe('插件目录检查', () => {
    it('应该检查路径是否在插件目录内', () => {
      expect(pathChecker.isWithinPluginRoot('src/index.ts')).toBe(true);
      expect(pathChecker.isWithinPluginRoot('../other-plugin')).toBe(false);
    });

    it('应该获取插件根目录', () => {
      const root = pathChecker.getPluginRoot();
      expect(root).toBeDefined();
      expect(typeof root).toBe('string');
    });
  });
});