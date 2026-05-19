/**
 * PathResolver 单元测试
 * 
 * 覆盖 AC：
 * - REQ-4.6: resolveInstallRoot 支持 override
 * - REQ-4.9: linux/darwin 下 HOME 为空抛 INIT_HOME_NOT_SET
 * - REQ-4.6: win32 下解析 ~ 为 %USERPROFILE%
 * - REQ-4.3: platform() 返回封闭枚举
 * - REQ-6.4: arch() 返回封闭枚举
 * - REQ-4.3: installSourceFromArgv 判断安装来源
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DefaultPathResolver } from "../../src/utils/path-resolver.js";
import * as os from "node:os";
import * as path from "node:path";

describe("PathResolver", () => {
  let resolver: DefaultPathResolver;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    resolver = new DefaultPathResolver();
    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });

  describe("resolveInstallRoot", () => {
    it("应该返回 ~/.specforge 的绝对路径（无 override）", () => {
      const result = resolver.resolveInstallRoot();
      
      // 验证路径以 .specforge 结尾
      expect(result).toMatch(/\.specforge$/);
      
      // 验证是绝对路径
      expect(path.isAbsolute(result)).toBe(true);
    });

    it("应该支持 override 参数", () => {
      const override = "/custom/path/to/specforge";
      const result = resolver.resolveInstallRoot(override);
      
      expect(result).toBe(path.resolve(override));
    });

    it("应该将相对 override 路径转换为绝对路径", () => {
      const override = "relative/path";
      const result = resolver.resolveInstallRoot(override);
      
      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toContain("relative");
      expect(result).toContain("path");
    });
  });

  describe("resolveHomeDirectory", () => {
    it("应该在 win32 下返回 USERPROFILE", () => {
      // 模拟 Windows 环境
      const mockUserProfile = "C:\\Users\\TestUser";
      process.env.USERPROFILE = mockUserProfile;
      
      // 临时覆盖 platform 方法
      const originalPlatform = resolver.platform;
      resolver.platform = () => "win32";
      
      try {
        const result = resolver.resolveHomeDirectory();
        expect(result).toBe(mockUserProfile);
      } finally {
        resolver.platform = originalPlatform;
      }
    });

    it("应该在 win32 下 USERPROFILE 为空时抛出 INIT_HOME_NOT_SET", () => {
      process.env.USERPROFILE = "";
      
      const originalPlatform = resolver.platform;
      resolver.platform = () => "win32";
      
      try {
        expect(() => resolver.resolveHomeDirectory()).toThrow(/INIT_HOME_NOT_SET/);
        expect(() => resolver.resolveHomeDirectory()).toThrow(/USERPROFILE/);
      } finally {
        resolver.platform = originalPlatform;
      }
    });

    it("应该在 darwin 下返回 HOME", () => {
      const mockHome = "/Users/testuser";
      process.env.HOME = mockHome;
      
      const originalPlatform = resolver.platform;
      resolver.platform = () => "darwin";
      
      try {
        const result = resolver.resolveHomeDirectory();
        expect(result).toBe(mockHome);
      } finally {
        resolver.platform = originalPlatform;
      }
    });

    it("应该在 linux 下返回 HOME", () => {
      const mockHome = "/home/testuser";
      process.env.HOME = mockHome;
      
      const originalPlatform = resolver.platform;
      resolver.platform = () => "linux";
      
      try {
        const result = resolver.resolveHomeDirectory();
        expect(result).toBe(mockHome);
      } finally {
        resolver.platform = originalPlatform;
      }
    });

    it("应该在 darwin 下 HOME 为空时抛出 INIT_HOME_NOT_SET", () => {
      process.env.HOME = "";
      
      const originalPlatform = resolver.platform;
      resolver.platform = () => "darwin";
      
      try {
        expect(() => resolver.resolveHomeDirectory()).toThrow(/INIT_HOME_NOT_SET/);
        expect(() => resolver.resolveHomeDirectory()).toThrow(/HOME/);
      } finally {
        resolver.platform = originalPlatform;
      }
    });

    it("应该在 linux 下 HOME 为空时抛出 INIT_HOME_NOT_SET", () => {
      process.env.HOME = "";
      
      const originalPlatform = resolver.platform;
      resolver.platform = () => "linux";
      
      try {
        expect(() => resolver.resolveHomeDirectory()).toThrow(/INIT_HOME_NOT_SET/);
        expect(() => resolver.resolveHomeDirectory()).toThrow(/HOME/);
      } finally {
        resolver.platform = originalPlatform;
      }
    });

    it("应该在 HOME 只包含空格时抛出 INIT_HOME_NOT_SET", () => {
      process.env.HOME = "   ";
      
      const originalPlatform = resolver.platform;
      resolver.platform = () => "linux";
      
      try {
        expect(() => resolver.resolveHomeDirectory()).toThrow(/INIT_HOME_NOT_SET/);
      } finally {
        resolver.platform = originalPlatform;
      }
    });

    it("抛出的错误应该包含错误码", () => {
      process.env.HOME = "";
      
      const originalPlatform = resolver.platform;
      resolver.platform = () => "linux";
      
      try {
        try {
          resolver.resolveHomeDirectory();
          expect.fail("应该抛出错误");
        } catch (error: any) {
          expect(error.code).toBe("INIT_HOME_NOT_SET");
        }
      } finally {
        resolver.platform = originalPlatform;
      }
    });
  });

  describe("platform", () => {
    it("应该返回封闭枚举之一", () => {
      const result = resolver.platform();
      
      expect(["win32", "darwin", "linux"]).toContain(result);
    });

    it("应该返回与 os.platform() 一致的值（对于支持的平台）", () => {
      const osPlatform = os.platform();
      const result = resolver.platform();
      
      if (osPlatform === "win32") {
        expect(result).toBe("win32");
      } else if (osPlatform === "darwin") {
        expect(result).toBe("darwin");
      } else {
        // 其他 POSIX 平台映射为 linux
        expect(result).toBe("linux");
      }
    });
  });

  describe("arch", () => {
    it("应该返回封闭枚举之一", () => {
      const result = resolver.arch();
      
      expect(["x64", "arm64"]).toContain(result);
    });

    it("应该返回与 os.arch() 一致的值（对于支持的架构）", () => {
      const osArch = os.arch();
      const result = resolver.arch();
      
      if (osArch === "x64") {
        expect(result).toBe("x64");
      } else if (osArch === "arm64") {
        expect(result).toBe("arm64");
      } else {
        // 其他架构默认映射为 x64
        expect(result).toBe("x64");
      }
    });
  });

  describe("installSourceFromArgv", () => {
    it("应该识别 dev 环境（包含 packages/cli）", () => {
      const argv = [
        "/usr/local/bin/bun",
        "/path/to/SpecForge/packages/cli/src/cli.ts",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("dev");
    });

    it("应该识别 dev 环境（Windows 路径）", () => {
      const argv = [
        "C:\\Program Files\\bun\\bun.exe",
        "D:\\code\\SpecForge\\packages\\cli\\src\\cli.ts",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("dev");
    });

    it("应该识别 npm-global 安装（包含 node_modules/.bin）", () => {
      const argv = [
        "/usr/local/bin/node",
        "/usr/local/lib/node_modules/@specforge/cli/dist/cli.js",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("npm-global");
    });

    it("应该识别 npm-global 安装（Windows 路径）", () => {
      const argv = [
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Users\\User\\AppData\\Roaming\\npm\\node_modules\\@specforge\\cli\\dist\\cli.js",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("npm-global");
    });

    it("应该识别 npm-local 安装", () => {
      const argv = [
        "/usr/local/bin/node",
        "/home/user/project/node_modules/@specforge/cli/dist/cli.js",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      // 项目本地安装：包含 node_modules 但不在系统级路径
      expect(result).toBe("npm-local");
    });

    it("应该识别 npm-local 安装（Windows 路径）", () => {
      const argv = [
        "C:\\Program Files\\nodejs\\node.exe",
        "D:\\projects\\myapp\\node_modules\\@specforge\\cli\\dist\\cli.js",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("npm-local");
    });

    it("应该识别 bun link 场景为 dev（Unix 路径）", () => {
      const argv = [
        "/usr/local/bin/bun",
        "/home/user/.bun/install/global/node_modules/@specforge/cli/dist/cli.js",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("dev");
    });

    it("应该识别 bun link 场景为 dev（Windows 路径）", () => {
      const argv = [
        "C:\\Program Files\\bun\\bun.exe",
        "C:\\Users\\User\\.bun\\install\\global\\node_modules\\@specforge\\cli\\dist\\cli.js",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("dev");
    });

    it("应该在无法判断时默认返回 npm-global", () => {
      const argv = [
        "/usr/local/bin/node",
        "/some/unknown/path/cli.js",
        "init"
      ];
      
      const result = resolver.installSourceFromArgv(argv);
      expect(result).toBe("npm-global");
    });

    it("应该处理空 argv", () => {
      const result = resolver.installSourceFromArgv([]);
      expect(result).toBe("npm-global");
    });

    it("应该处理只有一个元素的 argv", () => {
      const result = resolver.installSourceFromArgv(["/usr/local/bin/node"]);
      expect(result).toBe("npm-global");
    });
  });
});
