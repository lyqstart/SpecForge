import path from 'node:path';
import { resolveSpecForgeUserPath } from '@specforge/types/user-level-paths';
import { readVerificationFile, verificationId } from './owner-store';
import {
  PINNED_NODE_SHA256,
  VERIFICATION_PROFILE,
  type VerificationAssets,
} from './verification-plan';

interface AssetEntry {
  file: string;
  sha256: string;
}
interface AssetManifest {
  contract: 'verification-assets/v1';
  profile: typeof VERIFICATION_PROFILE;
  node: AssetEntry;
  launcher: AssetEntry;
  daemon: AssetEntry;
}

export async function loadVerificationAssets(
  binRoot = resolveSpecForgeUserPath('bin')
): Promise<VerificationAssets> {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('VERIFICATION_PLATFORM_UNSUPPORTED');
  const root = path.resolve(binRoot),
    base = path.join(root, 'verification');
  const bytes = await readVerificationFile(path.join(base, 'assets.json'), 65536);
  const manifest = JSON.parse(bytes.toString('utf8')) as AssetManifest;
  if (
    !manifest ||
    Object.keys(manifest).sort().join(',') !== 'contract,daemon,launcher,node,profile' ||
    manifest.contract !== 'verification-assets/v1' ||
    manifest.profile !== VERIFICATION_PROFILE
  )
    throw new Error('VERIFICATION_ASSET_MANIFEST_INVALID');
  const fixed = [
    ['node', 'node.exe', base],
    ['launcher', 'specforge-verify.exe', base],
    ['daemon', 'specforged.exe', root],
  ] as const;
  const paths = new Map<string, string>();
  for (const [kind, file, directory] of fixed) {
    const entry = manifest[kind];
    if (
      !entry ||
      Object.keys(entry).sort().join(',') !== 'file,sha256' ||
      entry.file !== file ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('VERIFICATION_ASSET_ENTRY_INVALID:' + kind);
    const full = path.join(directory, file);
    const actual = verificationId(await readVerificationFile(full, 256 * 1024 * 1024));
    if (actual !== entry.sha256 || (kind === 'node' && actual !== PINNED_NODE_SHA256))
      throw new Error('VERIFICATION_ASSET_IDENTITY_MISMATCH:' + kind);
    paths.set(kind, full);
  }
  return {
    contract: manifest.contract,
    profile: manifest.profile,
    manifestSha256: verificationId(bytes),
    nodePath: paths.get('node')!,
    nodeSha256: PINNED_NODE_SHA256,
    launcherPath: paths.get('launcher')!,
    launcherSha256: manifest.launcher.sha256,
    daemonPath: paths.get('daemon')!,
    daemonSha256: manifest.daemon.sha256,
  };
}
