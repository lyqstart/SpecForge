import * as path from "node:path"

export interface CommandPathGuidanceOptions {
  platform?: NodeJS.Platform
  pathValue?: string
}

/** The directory that contains the installed `specforge` and `specforged` binaries. */
export function resolveInstalledCliBinDirectory(
  userLevelDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const pathApi = platform === "win32" ? path.win32 : path.posix
  return pathApi.join(userLevelDir, "sf-user", "bin")
}

function normalizePathEntry(value: string, platform: NodeJS.Platform): string {
  const pathApi = platform === "win32" ? path.win32 : path.posix
  const normalized = pathApi.normalize(value.trim().replace(/^"|"$/g, "")).replace(/[\\\/]+$/, "")
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized
}

/** True only when the exact installed CLI directory is already discoverable in this process. */
export function isDirectoryOnPath(
  directory: string,
  pathValue: string | undefined = process.env.PATH,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!pathValue) return false
  const delimiter = platform === "win32" ? ";" : ":"
  const expected = normalizePathEntry(directory, platform)
  return pathValue
    .split(delimiter)
    .filter((entry) => entry.trim().length > 0)
    .some((entry) => normalizePathEntry(entry, platform) === expected)
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function quotePosixLiteral(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

/**
 * Produce deterministic, copy-pasteable guidance without mutating PATH.
 * PATH is user-owned environment state and is deliberately not part of the
 * install/upgrade filesystem transaction.
 */
export function buildCommandPathGuidance(
  userLevelDir: string,
  options: CommandPathGuidanceOptions = {},
): string[] {
  const platform = options.platform ?? process.platform
  const binDirectory = resolveInstalledCliBinDirectory(userLevelDir, platform)
  const pathValue = options.pathValue ?? process.env.PATH

  if (isDirectoryOnPath(binDirectory, pathValue, platform)) {
    return [
      `   CLI 命令目录: ${binDirectory}`,
      "   CLI 可用: 当前 shell 可直接运行 specforge",
    ]
  }

  if (platform === "win32") {
    const quoted = quotePowerShellLiteral(binDirectory)
    return [
      `   CLI 命令目录: ${binDirectory}`,
      "   ⚠ 当前 shell 尚不能直接运行 specforge。请在 PowerShell 执行一次:",
      `   $sfBin = ${quoted}; $entries = @(([Environment]::GetEnvironmentVariable('Path', 'User') -split ';') | Where-Object { $_ }); if ($entries -notcontains $sfBin) { [Environment]::SetEnvironmentVariable('Path', (($entries + $sfBin) -join ';'), 'User') }; $env:Path = \"$sfBin;$env:Path\"`,
      "   完成后，新终端可直接运行 specforge；当前 PowerShell 也立即生效。",
    ]
  }

  const quoted = quotePosixLiteral(binDirectory)
  return [
    `   CLI 命令目录: ${binDirectory}`,
    "   ⚠ 当前 shell 尚不能直接运行 specforge。请执行:",
    `   export PATH=${quoted}:\"$PATH\"`,
    "   并将同一行加入当前 shell 的 profile，随后打开新终端。",
  ]
}
