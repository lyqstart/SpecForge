import { createHash } from 'crypto';
import { readFile, writeFile, unlink, mkdir, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import type { CAS as ICAS } from '../types';

export const BLOB_REF_PREFIX = 'blob://';

interface DaemonCoreCAS {
  store(content: Buffer | string): Promise<{ reference: string; hash: string; size: number }>;
  retrieve(ref: string): Promise<Buffer | null>;
  exists(hash: string): Promise<boolean>;
}

export class CAS implements ICAS {
  private basePath: string;
  private referenceCounts: Map<string, number> = new Map();

  constructor(basePath: string = './data/cas/blobs') {
    this.basePath = basePath;
  }

  async initialize(): Promise<void> {
    await mkdir(this.basePath, { recursive: true });
  }

  private computeHash(content: Uint8Array | string): string {
    const hash = createHash('sha256');

    if (typeof content === 'string') {
      hash.update(content, 'utf8');
    } else {
      hash.update(content);
    }

    return hash.digest('hex');
  }

  private extractHash(ref: string): string | null {
    if (!ref.startsWith(BLOB_REF_PREFIX)) {
      return null;
    }
    return ref.slice(BLOB_REF_PREFIX.length);
  }

  private getBlobPath(hash: string): string {
    const subdir = hash.slice(0, 2);
    return join(this.basePath, subdir, hash);
  }

  private getRefCountPath(hash: string): string {
    const subdir = hash.slice(0, 2);
    return join(this.basePath, subdir, `${hash}.refcount`);
  }

  async store(content: Uint8Array | string): Promise<string> {
    const hash = this.computeHash(content);
    const blobRef = BLOB_REF_PREFIX + hash;
    const blobPath = this.getBlobPath(hash);

    try {
      const exists = await this.exists(blobRef);
      if (exists) {
        await this.incrementRefCount(hash);
        return blobRef;
      }
    } catch {
      // Blob doesn't exist, proceed to create it
    }

    await mkdir(dirname(blobPath), { recursive: true });

    if (typeof content === 'string') {
      await writeFile(blobPath, content, 'utf8');
    } else {
      await writeFile(blobPath, Buffer.from(content));
    }

    await this.setRefCount(hash, 1);

    return blobRef;
  }

  async retrieve(ref: string): Promise<Uint8Array | string | null> {
    const hash = this.extractHash(ref);
    if (!hash) {
      return null;
    }

    const blobPath = this.getBlobPath(hash);

    try {
      const blobStat = await stat(blobPath);
      if (!blobStat.isFile()) {
        return null;
      }

      const buffer = await readFile(blobPath);

      try {
        const text = buffer.toString('utf8');
        if (!buffer.includes(0xFFFD)) {
          return text;
        }
      } catch {
        // Not valid UTF-8, return as binary
      }

      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  async exists(ref: string): Promise<boolean> {
    const hash = this.extractHash(ref);
    if (!hash) {
      return false;
    }

    const blobPath = this.getBlobPath(hash);

    try {
      const blobStat = await stat(blobPath);
      return blobStat.isFile();
    } catch {
      return false;
    }
  }

  async delete(ref: string): Promise<void> {
    const hash = this.extractHash(ref);
    if (!hash) {
      return;
    }

    const newCount = await this.decrementRefCount(hash);

    if (newCount <= 0) {
      const blobPath = this.getBlobPath(hash);
      const refCountPath = this.getRefCountPath(hash);

      try {
        await unlink(blobPath);
      } catch {
        // Blob file might not exist
      }

      try {
        await unlink(refCountPath);
      } catch {
        // Refcount file might not exist
      }

      this.referenceCounts.delete(hash);
    }
  }

  async getRefCount(hash: string): Promise<number> {
    if (this.referenceCounts.has(hash)) {
      return this.referenceCounts.get(hash)!;
    }

    const refCountPath = this.getRefCountPath(hash);

    try {
      const content = await readFile(refCountPath, 'utf8');
      const count = parseInt(content.trim(), 10);
      this.referenceCounts.set(hash, count);
      return isNaN(count) ? 0 : count;
    } catch {
      return 0;
    }
  }

  private async setRefCount(hash: string, count: number): Promise<void> {
    this.referenceCounts.set(hash, count);
    const refCountPath = this.getRefCountPath(hash);
    await mkdir(dirname(refCountPath), { recursive: true });
    await writeFile(refCountPath, count.toString(), 'utf8');
  }

  private async incrementRefCount(hash: string): Promise<number> {
    const currentCount = await this.getRefCount(hash);
    const newCount = currentCount + 1;
    await this.setRefCount(hash, newCount);
    return newCount;
  }

  private async decrementRefCount(hash: string): Promise<number> {
    const currentCount = await this.getRefCount(hash);
    const newCount = Math.max(0, currentCount - 1);
    await this.setRefCount(hash, newCount);
    return newCount;
  }

  async garbageCollect(): Promise<number> {
    let deletedCount = 0;

    try {
      const entries = await readdir(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const subdirPath = join(this.basePath, entry.name);
        const files = await readdir(subdirPath);

        for (const file of files) {
          if (file.endsWith('.refcount')) continue;

          const filePath = join(subdirPath, file);
          const hash = file;

          const count = await this.getRefCount(hash);
          if (count <= 0) {
            try {
              await unlink(filePath);
              deletedCount++;
            } catch {
              // File might not exist
            }

            try {
              await unlink(join(subdirPath, `${hash}.refcount`));
            } catch {
              // File might not exist
            }
          }
        }
      }
    } catch {
      // Directory might not exist
    }

    return deletedCount;
  }

  async getStats(): Promise<{ blobCount: number; totalSize: number }> {
    let blobCount = 0;
    let totalSize = 0;

    try {
      const entries = await readdir(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const subdirPath = join(this.basePath, entry.name);
        const files = await readdir(subdirPath);

        for (const file of files) {
          if (file.endsWith('.refcount')) continue;

          const filePath = join(subdirPath, file);
          try {
            const fileStat = await stat(filePath);
            if (fileStat.isFile()) {
              blobCount++;
              totalSize += fileStat.size;
            }
          } catch {
            // File might not exist
          }
        }
      }
    } catch {
      // Directory might not exist
    }

    return { blobCount, totalSize };
  }
}

export class CASAdapter implements ICAS {
  private delegate: DaemonCoreCAS;

  constructor(delegate: DaemonCoreCAS) {
    this.delegate = delegate;
  }

  async store(content: Uint8Array | string): Promise<string> {
    const buf = typeof content === 'string'
      ? Buffer.from(content, 'utf8')
      : Buffer.from(content);
    const result = await this.delegate.store(buf);
    return result.reference;
  }

  async retrieve(ref: string): Promise<Uint8Array | string | null> {
    const result = await this.delegate.retrieve(ref);
    if (result === null) return null;
    return new Uint8Array(result);
  }

  async exists(ref: string): Promise<boolean> {
    if (!ref.startsWith(BLOB_REF_PREFIX)) return false;
    const hash = ref.slice(BLOB_REF_PREFIX.length);
    return this.delegate.exists(hash);
  }

  async delete(_ref: string): Promise<void> {
    // daemon-core CAS is append-only, no-op
  }
}

export function createCAS(basePath?: string): CAS {
  return new CAS(basePath);
}

export { BLOB_REF_PREFIX as BLOB_REFERENCE_PREFIX };
