import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { VerificationOwnerStore, verificationId, canonicalVerificationJson } from '../../src/verification/owner-store';

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-verification-owner-test-'));
  roots.push(root);
  return new VerificationOwnerStore(root);
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root), base = path.resolve(os.tmpdir());
    if (path.dirname(resolved) !== base || !path.basename(resolved).startsWith('sf-verification-owner-test-')) throw new Error('UNSAFE_TEST_CLEANUP');
    await fs.rm(resolved, { recursive: true, force: true });
  }
});

describe('Runtime verification owner immutable store', () => {
  it('persists authenticated objects across owner restart', async () => {
    const store = await fixture(), payload = { wi: 'WI-0001', project: 'owned-project', passed: false };
    const id = await store.put('plan', payload);
    expect(id).toBe(verificationId(canonicalVerificationJson(payload)));
    expect(await new VerificationOwnerStore(store.root).get('plan', id)).toEqual(payload);
    await expect(store.put('plan', payload)).rejects.toHaveProperty('code', 'EEXIST');
  });

  it.each(['payload', 'mac', 'kind', 'id', 'contentId', 'contract', 'extra'])('rejects envelope mutation of %s', async field => {
    const store = await fixture(), id = await store.put('receipt', { exit: 0, ended: true });
    const file = path.join(store.root, 'receipt', id + '.json'), env = JSON.parse(await fs.readFile(file, 'utf8'));
    if (field === 'payload') env.payload.exit = 99;
    else env[field] = field === 'mac' ? '0'.repeat(64) : 'changed';
    await fs.writeFile(file, JSON.stringify(env));
    await expect(store.get('receipt', id)).rejects.toThrow('VERIFICATION_');
  });

  it('rejects copying a signed plan to a different identity or object kind', async () => {
    const store = await fixture(), id = await store.put('plan', { task: 'TASK-001' }), other = 'a'.repeat(64);
    await fs.copyFile(path.join(store.root, 'plan', id + '.json'), path.join(store.root, 'plan', other + '.json'));
    await expect(store.get('plan', other)).rejects.toThrow('VERIFICATION_');
    await fs.mkdir(path.join(store.root, 'receipt'));
    await fs.copyFile(path.join(store.root, 'plan', id + '.json'), path.join(store.root, 'receipt', id + '.json'));
    await expect(store.get('receipt', id)).rejects.toThrow('VERIFICATION_');
  });

  it('rejects cross-installation signature replay and linked objects', async () => {
    const a = await fixture(), b = await fixture(), id = await a.put('receipt', { exit: 0 });
    await b.put('plan', { initialized: true });
    await fs.mkdir(path.join(b.root, 'receipt'));
    await fs.copyFile(path.join(a.root, 'receipt', id + '.json'), path.join(b.root, 'receipt', id + '.json'));
    await expect(b.get('receipt', id)).rejects.toThrow('SIGNATURE_INVALID');
    const hard = path.join(a.root, 'alias.json');
    await fs.link(path.join(a.root, 'receipt', id + '.json'), hard);
    await expect(a.get('receipt', id)).rejects.toThrow('HARDLINK_FORBIDDEN');
  });

  it('reserves a real invocation identity once even when payloads differ', async () => {
    const store = await fixture(), id = verificationId('ses-owned/msg-owned/call-owned');
    await store.put('invocation', { tool: 'sf_verification_run' }, id);
    await expect(store.put('invocation', { tool: 'sf_verification_plan' }, id)).rejects.toHaveProperty('code', 'EEXIST');
  });

  it('does not create private files while inspecting a missing owner store', async () => {
    const store = await fixture(), missing = path.join(store.root, 'not-created');
    expect(await new VerificationOwnerStore(missing).has('plan', 'a'.repeat(64))).toBe(false);
    await expect(fs.stat(missing)).rejects.toHaveProperty('code', 'ENOENT');
  });

  it('rejects invalid IDs and non-JSON payloads', async () => {
    const store = await fixture();
    await expect(store.get('plan', '../escape')).rejects.toThrow('OBJECT_ID_INVALID');
    await expect(store.put('plan', { undefined: undefined })).rejects.toThrow('NON_JSON');
  });
  it('rejects oversized authenticated objects before creating a key or an unreadable envelope',async()=>{
    const store=await fixture();
    await expect(store.put('plan',{oversized:'x'.repeat(16*1024*1024)})).rejects.toThrow('OBJECT_BUDGET');
    await expect(fs.stat(path.join(store.root,'owner.key'))).rejects.toHaveProperty('code','ENOENT');
  });
});
