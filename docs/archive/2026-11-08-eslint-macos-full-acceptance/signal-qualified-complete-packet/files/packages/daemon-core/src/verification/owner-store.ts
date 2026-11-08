/** Runtime-private, immutable, authenticated verification objects. Never an artifact-write target. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveSpecForgeUserPath } from '@specforge/types/user-level-paths';

export type VerificationObjectKind =
  | 'plan'
  | 'receipt'
  | 'revocation'
  | 'invocation'
  | 'attempt'
  | 'start'
  | 'recovery'
  | 'lease';
export const VERIFICATION_OWNER_CONTRACT = 'verification-owner/v1' as const;
const kinds = new Set<VerificationObjectKind>([
  'plan',
  'receipt',
  'revocation',
  'invocation',
  'attempt',
  'start',
  'recovery',
  'lease',
]);
const digest = (raw: string | Buffer): string => createHash('sha256').update(raw).digest('hex');
export const verificationId = digest;

export function canonicalVerificationJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalVerificationJson).join(',') + ']';
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const obj = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(obj)
        .sort()
        .map(k => JSON.stringify(k) + ':' + canonicalVerificationJson(obj[k]))
        .join(',') +
      '}'
    );
  }
  throw new Error('VERIFICATION_NON_JSON_OBJECT');
}

/** Check ancestors before opening the final file; never follow an unexamined link. */
export async function assertVerificationPath(file: string, allowMissing = false): Promise<void> {
  const absolute = path.resolve(file),
    ancestors: string[] = [];
  for (let current = absolute; ; current = path.dirname(current)) {
    ancestors.unshift(current);
    if (path.dirname(current) === current) break;
  }
  let missing = false;
  for (const ancestor of ancestors) {
    if (missing) continue;
    try {
      const stat = await fs.lstat(ancestor);
      if (stat.isSymbolicLink()) throw new Error('VERIFICATION_LINK_FORBIDDEN');
      if (!stat.isDirectory() && !stat.isFile())
        throw new Error('VERIFICATION_SPECIAL_FILE_FORBIDDEN');
      if (ancestor !== absolute && !stat.isDirectory())
        throw new Error('VERIFICATION_ANCESTOR_NOT_DIRECTORY');
      if (stat.isFile() && stat.nlink !== 1) throw new Error('VERIFICATION_HARDLINK_FORBIDDEN');
    } catch (error) {
      if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') missing = true;
      else throw error;
    }
  }
}

export async function readVerificationFile(
  file: string,
  limit = 16 * 1024 * 1024
): Promise<Buffer> {
  await assertVerificationPath(file);
  const handle = await fs.open(file, 'r');
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(limit))
      throw new Error('VERIFICATION_FILE_INVALID');
    const bytes = await handle.readFile(),
      after = await handle.stat({ bigint: true }),
      current = await fs.lstat(file, { bigint: true });
    if (
      BigInt(bytes.length) !== before.size ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      after.ino !== current.ino ||
      after.dev !== current.dev ||
      current.nlink !== 1n ||
      current.isSymbolicLink()
    )
      throw new Error('VERIFICATION_FILE_CHANGED');
    return bytes;
  } finally {
    await handle.close();
  }
}

export class VerificationOwnerStore {
  readonly root: string;
  constructor(root = resolveSpecForgeUserPath('runtime', 'verification-owner')) {
    this.root = path.resolve(root);
  }

  private objectPath(kind: VerificationObjectKind, id: string): string {
    if (!kinds.has(kind) || !/^[a-f0-9]{64}$/.test(id))
      throw new Error('VERIFICATION_OBJECT_ID_INVALID');
    return path.join(this.root, kind, id + '.json');
  }

  private async key(create: boolean): Promise<Buffer> {
    await assertVerificationPath(this.root, create);
    const keyPath = path.join(this.root, 'owner.key');
    if (create) {
      await fs.mkdir(this.root, { recursive: true });
      await assertVerificationPath(this.root);
      try {
        await fs.writeFile(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const bytes = await readVerificationFile(keyPath, 32);
    if (bytes.length !== 32) throw new Error('VERIFICATION_OWNER_KEY_INVALID');
    return bytes;
  }

  async put(kind: VerificationObjectKind, payload: unknown, fixedId?: string): Promise<string> {
    if (!kinds.has(kind)) throw new Error('VERIFICATION_OBJECT_KIND_INVALID');
    if (fixedId && !['invocation', 'revocation', 'start'].includes(kind))
      throw new Error('VERIFICATION_CONTENT_ID_REQUIRED');
    const body = canonicalVerificationJson(payload),
      contentId = digest(body),
      id = fixedId ?? contentId;
    if (Buffer.byteLength(body, 'utf8') > 16 * 1024 * 1024 - 65536)
      throw new Error('VERIFICATION_OBJECT_BUDGET');
    const target = this.objectPath(kind, id),
      key = await this.key(true);
    await assertVerificationPath(target, true);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await assertVerificationPath(path.dirname(target));
    const signed = { contract: VERIFICATION_OWNER_CONTRACT, kind, id, contentId, payload };
    const mac = createHmac('sha256', key).update(canonicalVerificationJson(signed)).digest('hex');
    await fs.writeFile(target, canonicalVerificationJson({ ...signed, mac }) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    return id;
  }

  async get<T = unknown>(kind: VerificationObjectKind, id: string): Promise<T> {
    const target = this.objectPath(kind, id),
      key = await this.key(false);
    const bytes = await readVerificationFile(target),
      parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('VERIFICATION_ENVELOPE_INVALID');
    const env = parsed as Record<string, unknown>;
    if (
      Object.keys(env).sort().join(',') !== 'contentId,contract,id,kind,mac,payload' ||
      env['contract'] !== VERIFICATION_OWNER_CONTRACT ||
      env['kind'] !== kind ||
      env['id'] !== id ||
      env['contentId'] !== digest(canonicalVerificationJson(env['payload'])) ||
      (!['invocation', 'revocation', 'start'].includes(kind) && env['contentId'] !== id) ||
      typeof env['mac'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(env['mac'])
    )
      throw new Error('VERIFICATION_ENVELOPE_INVALID');
    const signed = {
      contract: env['contract'],
      kind,
      id,
      contentId: env['contentId'],
      payload: env['payload'],
    };
    const expected = createHmac('sha256', key).update(canonicalVerificationJson(signed)).digest();
    if (!timingSafeEqual(expected, Buffer.from(env['mac'], 'hex')))
      throw new Error('VERIFICATION_OWNER_SIGNATURE_INVALID');
    return env['payload'] as T;
  }

  async has(kind: VerificationObjectKind, id: string): Promise<boolean> {
    try {
      await this.get(kind, id);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}
