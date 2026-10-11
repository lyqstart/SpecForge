import { describe, expect, it } from "vitest"
import {
  buildCommandPathGuidance,
  isDirectoryOnPath,
  resolveInstalledCliBinDirectory,
} from "../../../scripts/lib/command-path"

describe("installed CLI PATH guidance", () => {
  it("resolves the CLI directory below the canonical user-level root", () => {
    expect(resolveInstalledCliBinDirectory("C:\\Users\\test\\.config\\opencode"))
      .toBe("C:\\Users\\test\\.config\\opencode\\sf-user\\bin")
  })

  it("matches Windows PATH entries case-insensitively and by exact directory", () => {
    const bin = "C:\\Users\\Test\\.config\\opencode\\sf-user\\bin"
    expect(isDirectoryOnPath(bin, `C:\\Windows;${bin.toLowerCase()};C:\\Tools`, "win32")).toBe(true)
    expect(isDirectoryOnPath(bin, `C:\\Windows;${bin}2;C:\\Tools`, "win32")).toBe(false)
  })

  it("reports a directly usable short command when PATH is ready", () => {
    const root = "C:\\Users\\test\\.config\\opencode"
    const bin = resolveInstalledCliBinDirectory(root)
    expect(buildCommandPathGuidance(root, { platform: "win32", pathValue: bin }).join("\n"))
      .toContain("当前 shell 可直接运行 specforge")
  })

  it("emits an idempotent Windows user-PATH command without mutating PATH", () => {
    const root = "C:\\Users\\test\\.config\\opencode"
    const guidance = buildCommandPathGuidance(root, { platform: "win32", pathValue: "C:\\Windows" }).join("\n")
    expect(guidance).toContain("[Environment]::SetEnvironmentVariable('Path'")
    expect(guidance).toContain("$entries -notcontains $sfBin")
    expect(guidance).toContain("$env:Path = \"$sfBin;$env:Path\"")
  })

  it("emits POSIX shell guidance when the CLI directory is absent", () => {
    const guidance = buildCommandPathGuidance("/home/test/.config/opencode", {
      platform: "linux",
      pathValue: "/usr/bin",
    }).join("\n")
    expect(guidance).toContain("export PATH='/home/test/.config/opencode/sf-user/bin':\"$PATH\"")
  })
})
