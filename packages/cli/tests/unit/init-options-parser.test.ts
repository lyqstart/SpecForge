/**
 * Init 命令参数解析器单元测试
 * 
 * 覆盖 REQ-3.1: 只接受 --force / --json / --help / --install-root=<path>
 * 未知 flag 必须抛 INIT_UNKNOWN_FLAG（exit 2）
 */

import { describe, it, expect } from "vitest";
import {
  parseInitOptions,
  InitOptionsParseError,
} from "../../src/commands/init/options-parser.js";

describe("parseInitOptions", () => {
  describe("valid flags", () => {
    it("should parse empty argv to default options", () => {
      const result = parseInitOptions([]);
      expect(result).toEqual({
        force: false,
        json: false,
      });
    });

    it("should parse --force flag", () => {
      const result = parseInitOptions(["--force"]);
      expect(result).toEqual({
        force: true,
        json: false,
      });
    });

    it("should parse --json flag", () => {
      const result = parseInitOptions(["--json"]);
      expect(result).toEqual({
        force: false,
        json: true,
      });
    });

    it("should parse --help flag (allowed but not processed)", () => {
      const result = parseInitOptions(["--help"]);
      expect(result).toEqual({
        force: false,
        json: false,
      });
    });

    it("should parse --install-root=<path> flag", () => {
      const result = parseInitOptions(["--install-root=/custom/path"]);
      expect(result).toEqual({
        force: false,
        json: false,
        installRootOverride: "/custom/path",
      });
    });

    it("should parse multiple valid flags", () => {
      const result = parseInitOptions([
        "--force",
        "--json",
        "--install-root=/tmp/test",
      ]);
      expect(result).toEqual({
        force: true,
        json: true,
        installRootOverride: "/tmp/test",
      });
    });

    it("should handle Windows-style paths in --install-root", () => {
      const result = parseInitOptions([
        "--install-root=C:\\Users\\test\\.specforge",
      ]);
      expect(result).toEqual({
        force: false,
        json: false,
        installRootOverride: "C:\\Users\\test\\.specforge",
      });
    });

    it("should skip non-flag arguments", () => {
      const result = parseInitOptions(["somearg", "--force", "anotherarg"]);
      expect(result).toEqual({
        force: true,
        json: false,
      });
    });
  });

  describe("invalid flags", () => {
    it("should throw INIT_UNKNOWN_FLAG for unknown flag", () => {
      expect(() => parseInitOptions(["--unknown"])).toThrow(
        InitOptionsParseError,
      );

      try {
        parseInitOptions(["--unknown"]);
      } catch (error) {
        expect(error).toBeInstanceOf(InitOptionsParseError);
        const parseError = error as InitOptionsParseError;
        expect(parseError.code).toBe("INIT_UNKNOWN_FLAG");
        expect(parseError.message).toContain("--unknown");
        expect(parseError.message).toContain("Unknown flag");
        expect(parseError.unknownFlag).toBe("--unknown");
      }
    });

    it("should throw INIT_UNKNOWN_FLAG for --verbose", () => {
      expect(() => parseInitOptions(["--verbose"])).toThrow(
        InitOptionsParseError,
      );

      try {
        parseInitOptions(["--verbose"]);
      } catch (error) {
        const parseError = error as InitOptionsParseError;
        expect(parseError.code).toBe("INIT_UNKNOWN_FLAG");
        expect(parseError.unknownFlag).toBe("--verbose");
      }
    });

    it("should throw INIT_UNKNOWN_FLAG for --debug", () => {
      expect(() => parseInitOptions(["--debug"])).toThrow(
        InitOptionsParseError,
      );

      try {
        parseInitOptions(["--debug"]);
      } catch (error) {
        const parseError = error as InitOptionsParseError;
        expect(parseError.code).toBe("INIT_UNKNOWN_FLAG");
        expect(parseError.message).toContain("--debug");
      }
    });

    it("should throw for --install-root without value", () => {
      expect(() => parseInitOptions(["--install-root="])).toThrow(
        InitOptionsParseError,
      );

      try {
        parseInitOptions(["--install-root="]);
      } catch (error) {
        const parseError = error as InitOptionsParseError;
        expect(parseError.code).toBe("INIT_UNKNOWN_FLAG");
        expect(parseError.message).toContain("requires a value");
      }
    });

    it("should include supported flags in error message", () => {
      try {
        parseInitOptions(["--invalid"]);
      } catch (error) {
        const parseError = error as InitOptionsParseError;
        expect(parseError.message).toContain("--force");
        expect(parseError.message).toContain("--json");
        expect(parseError.message).toContain("--help");
        expect(parseError.message).toContain("--install-root");
      }
    });

    it("should fail on first unknown flag when multiple flags present", () => {
      expect(() =>
        parseInitOptions(["--force", "--unknown", "--json"]),
      ).toThrow(InitOptionsParseError);

      try {
        parseInitOptions(["--force", "--unknown", "--json"]);
      } catch (error) {
        const parseError = error as InitOptionsParseError;
        expect(parseError.unknownFlag).toBe("--unknown");
      }
    });
  });

  describe("edge cases", () => {
    it("should handle flags in any order", () => {
      const result1 = parseInitOptions(["--json", "--force"]);
      const result2 = parseInitOptions(["--force", "--json"]);
      expect(result1).toEqual(result2);
    });

    it("should handle duplicate flags (last one wins for boolean)", () => {
      const result = parseInitOptions(["--force", "--force"]);
      expect(result.force).toBe(true);
    });

    it("should handle duplicate --install-root (last one wins)", () => {
      const result = parseInitOptions([
        "--install-root=/path1",
        "--install-root=/path2",
      ]);
      expect(result.installRootOverride).toBe("/path2");
    });

    it("should handle empty string argv", () => {
      const result = parseInitOptions([]);
      expect(result).toEqual({
        force: false,
        json: false,
      });
    });

    it("should handle single dash flags as non-flags", () => {
      const result = parseInitOptions(["-f", "-j"]);
      expect(result).toEqual({
        force: false,
        json: false,
      });
    });
  });
});
