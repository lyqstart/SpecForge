import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mergePackageJson } from "../../../scripts/sf-installer"
import * as fs from "fs"
import * as path from "path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"

describe("mergePackageJson", () => {
  let targetDir: string
  let sourceDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(path.join(tmpdir(), "sf-test-target-"))
    sourceDir = await mkdtemp(path.join(tmpdir(), "sf-test-source-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  describe("add mode", () => {
    it("should merge devDependencies from source to target", () => {
      const sourcePkg = {
        devDependencies: {
          "fast-check": "^4.7.0",
          vitest: "^4.1.5",
        },
      }
      const targetPkg = {
        name: "my-project",
        version: "1.0.0",
        devDependencies: {
          typescript: "^5.0.0",
        },
      }
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify(sourcePkg)
      )
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        JSON.stringify(targetPkg)
      )

      mergePackageJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.devDependencies["fast-check"]).toBe("^4.7.0")
      expect(result.devDependencies.vitest).toBe("^4.1.5")
      expect(result.devDependencies.typescript).toBe("^5.0.0")
    })

    it("should preserve name, version, scripts, and dependencies", () => {
      const sourcePkg = {
        devDependencies: { vitest: "^4.1.5" },
      }
      const targetPkg = {
        name: "my-project",
        version: "2.0.0",
        scripts: { build: "tsc", test: "vitest" },
        dependencies: { express: "^4.18.0" },
        devDependencies: {},
      }
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify(sourcePkg)
      )
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        JSON.stringify(targetPkg)
      )

      mergePackageJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.name).toBe("my-project")
      expect(result.version).toBe("2.0.0")
      expect(result.scripts).toEqual({ build: "tsc", test: "vitest" })
      expect(result.dependencies).toEqual({ express: "^4.18.0" })
    })

    it("should create devDependencies if target lacks it", () => {
      const sourcePkg = {
        devDependencies: { vitest: "^4.1.5" },
      }
      const targetPkg = { name: "my-project" }
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify(sourcePkg)
      )
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        JSON.stringify(targetPkg)
      )

      mergePackageJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.devDependencies.vitest).toBe("^4.1.5")
      expect(result.name).toBe("my-project")
    })

    it("should create target file if it does not exist", () => {
      const sourcePkg = {
        devDependencies: { vitest: "^4.1.5" },
      }
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify(sourcePkg)
      )

      mergePackageJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.devDependencies.vitest).toBe("^4.1.5")
    })

    it("should do nothing if source file does not exist", () => {
      const targetPkg = { name: "my-project", devDependencies: { a: "1" } }
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        JSON.stringify(targetPkg)
      )

      mergePackageJson(targetDir, sourceDir, "add")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.devDependencies.a).toBe("1")
    })

    it("should throw on invalid JSON in target file", () => {
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify({ devDependencies: { x: "1" } })
      )
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        "not valid json"
      )

      expect(() => mergePackageJson(targetDir, sourceDir, "add")).toThrow()
    })
  })

  describe("remove mode", () => {
    it("should remove SF devDependencies from target", () => {
      const sourcePkg = {
        devDependencies: {
          "fast-check": "^4.7.0",
          vitest: "^4.1.5",
        },
      }
      const targetPkg = {
        name: "my-project",
        devDependencies: {
          "fast-check": "^4.7.0",
          vitest: "^4.1.5",
          typescript: "^5.0.0",
        },
      }
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify(sourcePkg)
      )
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        JSON.stringify(targetPkg)
      )

      mergePackageJson(targetDir, sourceDir, "remove")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.devDependencies["fast-check"]).toBeUndefined()
      expect(result.devDependencies.vitest).toBeUndefined()
      expect(result.devDependencies.typescript).toBe("^5.0.0")
    })

    it("should preserve other fields when removing", () => {
      const sourcePkg = {
        devDependencies: { vitest: "^4.1.5" },
      }
      const targetPkg = {
        name: "my-project",
        version: "1.0.0",
        scripts: { test: "vitest" },
        devDependencies: { vitest: "^4.1.5" },
      }
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify(sourcePkg)
      )
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        JSON.stringify(targetPkg)
      )

      mergePackageJson(targetDir, sourceDir, "remove")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.name).toBe("my-project")
      expect(result.version).toBe("1.0.0")
      expect(result.scripts).toEqual({ test: "vitest" })
    })

    it("should do nothing if target file does not exist", () => {
      fs.writeFileSync(
        path.join(sourceDir, "package.json"),
        JSON.stringify({ devDependencies: { x: "1" } })
      )

      expect(() =>
        mergePackageJson(targetDir, sourceDir, "remove")
      ).not.toThrow()
    })

    it("should do nothing if source file does not exist", () => {
      const targetPkg = { devDependencies: { a: "1" } }
      fs.writeFileSync(
        path.join(targetDir, "package.json"),
        JSON.stringify(targetPkg)
      )

      mergePackageJson(targetDir, sourceDir, "remove")

      const result = JSON.parse(
        fs.readFileSync(path.join(targetDir, "package.json"), "utf-8")
      )
      expect(result.devDependencies.a).toBe("1")
    })
  })
})
