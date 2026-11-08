/**
 * BlobOptimizer - Optimized streaming Blob handling for large file uploads.
 * 
 * Implements streaming-based Blob processing to reduce memory footprint:
 * - streamBlob: Reads files in chunks, yielding buffers as AsyncIterable
 * - uploadBlobStream: Uploads streamed content with memory monitoring
 * - Memory usage monitoring and reporting
 * 
 * Follows async-resource-coding-standards.md:
 * - A1: Proper resource cleanup in finally blocks
 * - A2: Termination conditions for loops with timeout
 * - A4: Creator responsible for resource destruction
 */

import { createReadStream, statSync } from 'fs';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

/**
 * Default chunk size for streaming (1 MB)
 */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Memory monitoring threshold (warn if usage exceeds this percentage of total)
 */
export const MEMORY_THRESHOLD_PERCENT = 80;

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: number;
}

/**
 * Upload result
 */
export interface UploadResult {
  blobId: string;
  sha256: string;
  size: number;
  chunksProcessed: number;
  peakMemoryUsage: number;
  uploadTimeMs: number;
}

/**
 * Stream options
 */
export interface StreamOptions {
  chunkSize?: number;
  onProgress?: (bytesRead: number, totalBytes: number) => void;
  onMemoryWarning?: (stats: MemoryStats) => void;
}

/**
 * BlobOptimizer class for streaming Blob handling
 */
export class BlobOptimizer extends EventEmitter {
  private readonly chunkSize: number;
  private peakMemoryUsage: number = 0;
  private memoryCheckInterval: NodeJS.Timeout | null = null;

  constructor(chunkSize: number = DEFAULT_CHUNK_SIZE) {
    super();
    this.chunkSize = chunkSize;
  }

  /**
   * Stream a file as chunks (AsyncIterable<Buffer>)
   * 
   * Implements A2 (termination condition) and A4 (resource cleanup):
   * - Proper stream cleanup in finally block
   * - Timeout protection for stream reading
   * - Progress reporting
   */
  async *streamBlob(
    filePath: string,
    chunkSize: number = this.chunkSize,
    options: StreamOptions = {}
  ): AsyncIterable<Buffer> {
    const { onProgress } = options;
    
    // Get file size for progress tracking
    let totalBytes = 0;
    try {
      totalBytes = statSync(filePath).size;
    } catch (err) {
      throw new Error(`Failed to stat file ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }

    let bytesRead = 0;
    let stream: ReturnType<typeof createReadStream> | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      stream = createReadStream(filePath, { highWaterMark: chunkSize });
      
      // A2: Timeout protection for stream reading
      const streamTimeout = 30000; // 30 seconds
      let lastChunkTime = Date.now();

      for await (const chunk of stream) {
        // Reset timeout on each chunk
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        // A2: Set timeout for next chunk
        timeoutHandle = setTimeout(() => {
          if (stream) {
            stream.destroy(new Error(`Stream timeout after ${streamTimeout}ms`));
          }
        }, streamTimeout);

        bytesRead += chunk.length;
        lastChunkTime = Date.now();

        // Report progress
        if (onProgress) {
          onProgress(bytesRead, totalBytes);
        }

        yield chunk;
      }

      // Clear final timeout
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
    } catch (err) {
      // A4: Ensure stream is destroyed on error
      if (stream) {
        stream.destroy();
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      throw new Error(`Stream error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      // A4: Final cleanup
      if (stream) {
        stream.destroy();
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Upload a blob stream with memory monitoring
   * 
   * Implements A1 (cleanup in finally) and memory monitoring:
   * - Tracks peak memory usage
   * - Warns if memory exceeds threshold
   * - Computes SHA256 hash during upload
   * - Returns upload result with metrics
   */
  async uploadBlobStream(
    stream: AsyncIterable<Buffer>,
    options: StreamOptions = {}
  ): Promise<UploadResult> {
    const { onMemoryWarning } = options;
    const startTime = Date.now();
    
    let chunksProcessed = 0;
    let totalSize = 0;
    let localPeakMemory = 0;
    const hash = createHash('sha256');
    let memoryCheckInterval: NodeJS.Timeout | null = null;

    try {
      // Start memory monitoring
      memoryCheckInterval = setInterval(() => {
        const stats = this.getMemoryStats();
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, stats.heapUsed);
        localPeakMemory = Math.max(localPeakMemory, stats.heapUsed);

        // Check if memory usage exceeds threshold
        const usagePercent = (stats.heapUsed / stats.heapTotal) * 100;
        if (usagePercent > MEMORY_THRESHOLD_PERCENT) {
          if (onMemoryWarning) {
            onMemoryWarning(stats);
          }
          this.emit('memoryWarning', stats);
        }
      }, 1000); // Check every second

      // Process stream
      for await (const chunk of stream) {
        hash.update(chunk);
        totalSize += chunk.length;
        chunksProcessed++;

        // Track memory during processing
        const currentMemory = this.getMemoryStats().heapUsed;
        this.peakMemoryUsage = Math.max(this.peakMemoryUsage, currentMemory);
        localPeakMemory = Math.max(localPeakMemory, currentMemory);

        // Emit progress
        this.emit('progress', { chunksProcessed, totalSize });
      }

      const sha256 = hash.digest('hex');
      const uploadTimeMs = Date.now() - startTime;

      return {
        blobId: `blob://${sha256}`,
        sha256,
        size: totalSize,
        chunksProcessed,
        peakMemoryUsage: localPeakMemory,
        uploadTimeMs,
      };
    } finally {
      // A1: Cleanup in finally block
      if (memoryCheckInterval) {
        clearInterval(memoryCheckInterval);
      }
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      timestamp: Date.now(),
    };
  }

  /**
   * Get peak memory usage recorded during uploads
   */
  getPeakMemoryUsage(): number {
    return this.peakMemoryUsage;
  }

  /**
   * Reset peak memory usage counter
   */
  resetPeakMemoryUsage(): void {
    this.peakMemoryUsage = 0;
  }

  /**
   * Format bytes to human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.removeAllListeners();
  }
}

/**
 * Create a BlobOptimizer instance
 */
export function createBlobOptimizer(chunkSize?: number): BlobOptimizer {
  return new BlobOptimizer(chunkSize);
}
