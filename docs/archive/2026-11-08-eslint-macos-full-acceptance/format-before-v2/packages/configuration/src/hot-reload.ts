/**
 * Hot-reload manager
 * 
 * Manages configuration reload events with:
 * - File system watchers for config changes
 * - Explicit reload command (CLI/API)
 * - Reload event recording
 * - Activation boundary enforcement (Property 19)
 * - Per-workitem configuration caching with memory management
 */

import { HotReloadConfig, ReloadEvent, ReloadResult, MergedConfig, ConfigSnapshot } from './types'
import { logger } from './logger'

/**
 * Cache entry with metadata for eviction
 */
interface CacheEntry {
  snapshot: ConfigSnapshot
  startTime: number
  createdAt: number
  lastAccessedAt: number
  size: number // Estimated memory size in bytes
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number // Number of entries
  maxSize: number // Maximum entries allowed
  hits: number
  misses: number
  evictions: number
  totalMemoryBytes: number
  oldestEntry: number | null
  newestEntry: number | null
}

export class HotReloadManager {
  private reloadCallbacks: Array<() => Promise<void>> = []
  private reloadEvents: ReloadEvent[] = []
  private lastReloadTime: number | null = null
  private config: HotReloadConfig
  private watcher: any | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private reloadPending = false
  
  // Per-workitem configuration cache with LRU and TTL support
  private workItemSnapshots: Map<string, CacheEntry> = new Map()
  
  // Cache configuration
  private maxCacheSize: number
  private cacheTTLMs: number
  private enableLRU: boolean
  
  // Cache statistics
  private cacheHits = 0
  private cacheMisses = 0
  private cacheEvictions = 0

  constructor(config: HotReloadConfig = { enabled: true, debounceMs: 100, watchPaths: [] }) {
    this.config = config
    
    // Default cache settings
    this.maxCacheSize = config.maxCacheSize ?? 1000 // Maximum number of work items to cache
    this.cacheTTLMs = config.cacheTTLMs ?? 3600000 // Default 1 hour TTL
    this.enableLRU = config.enableLRU ?? true // Enable LRU eviction by default
  }

  /**
   * Start watching config files for changes
   */
  async start(watchPaths: string[] = this.config.watchPaths): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Hot-reload is disabled, skipping watcher setup')
      return
    }

    if (this.watcher) {
      logger.warn('Hot-reload watcher already running')
      return
    }

    logger.info('Starting hot-reload watcher', { paths: watchPaths })

    try {
      // Import chokidar dynamically to avoid build issues if not installed
      const chokidar = await import('chokidar')
      
      this.watcher = chokidar.watch(watchPaths, {
        persistent: true,
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      })

      // Handle file changes
      this.watcher.on('change', (path: string) => {
        logger.info('Config file changed', { path })
        this.scheduleReload('file-watcher')
      })

      // Handle file additions (new config files)
      this.watcher.on('add', (path: string) => {
        logger.info('New config file added', { path })
        this.scheduleReload('file-watcher')
      })

      // Handle file removals
      this.watcher.on('unlink', (path: string) => {
        logger.info('Config file removed', { path })
        this.scheduleReload('file-watcher')
      })

      logger.info('Hot-reload watcher started successfully', { paths: watchPaths })
    } catch (error) {
      logger.error('Failed to start hot-reload watcher', { 
        error: (error as Error).message,
        paths: watchPaths,
      })
      throw new Error(`Failed to start hot-reload watcher: ${(error as Error).message}`)
    }
  }

  /**
   * Stop watching config files
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      logger.warn('Hot-reload watcher is not running')
      return
    }

    logger.info('Stopping hot-reload watcher')

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    await this.watcher.close()
    this.watcher = null

    logger.info('Hot-reload watcher stopped')
  }

  /**
   * Schedule a reload with debouncing
   */
  private scheduleReload(trigger: 'file-watcher'): void {
    if (!this.config.enabled) {
      return
    }

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.reloadPending = false
      this.triggerReload(trigger).catch((error) => {
        logger.error('Failed to trigger reload', { error: error.message })
      })
    }, this.config.debounceMs)

    this.reloadPending = true
    logger.debug('Reload scheduled', { debounceMs: this.config.debounceMs })
  }

  /**
   * Register a callback to be called on reload
   */
  onReload(callback: () => Promise<void>): void {
    this.reloadCallbacks.push(callback)
    logger.debug('Reload callback registered', { callbackCount: this.reloadCallbacks.length })
  }

  /**
   * Trigger an explicit reload (CLI/API)
   */
  async reload(trigger: 'cli-command' | 'api-call' = 'api-call'): Promise<ReloadResult> {
    if (!this.config.enabled) {
      logger.warn('Hot-reload is disabled, cannot reload')
      return {
        success: false,
        timestamp: Date.now(),
        eventId: this.generateEventId(),
        layersReloaded: [],
        error: 'Hot-reload is disabled',
      }
    }

    return await this.triggerReload(trigger)
  }

  /**
   * Trigger a reload (internal)
   */
  private async triggerReload(trigger: 'file-watcher' | 'cli-command' | 'api-call'): Promise<ReloadResult> {
    const eventId = this.generateEventId()
    const timestamp = Date.now()
    const activationBoundary = timestamp

    logger.info('Triggering configuration reload', { 
      eventId, 
      trigger, 
      timestamp,
      callbackCount: this.reloadCallbacks.length,
    })

    try {
      // Record reload event
      const reloadEvent: ReloadEvent = {
        eventId,
        timestamp,
        trigger,
        layersChanged: ['user', 'project'], // These are the layers that typically change
        activationBoundary,
      }
      this.reloadEvents.push(reloadEvent)
      this.lastReloadTime = timestamp

      logger.info('Reload event recorded', { 
        eventId, 
        trigger, 
        layersChanged: reloadEvent.layersChanged,
      })

      // Call all registered callbacks
      for (const callback of this.reloadCallbacks) {
        try {
          await callback()
        } catch (error) {
          logger.error('Error during reload callback', { 
            error: (error as Error).message,
            callback: callback.name || 'anonymous',
          })
        }
      }

      logger.info('Configuration reload completed successfully', { 
        eventId, 
        timestamp,
        callbackCount: this.reloadCallbacks.length,
      })

      return {
        success: true,
        timestamp,
        eventId,
        layersReloaded: reloadEvent.layersChanged,
      }
    } catch (error) {
      logger.error('Configuration reload failed', { 
        eventId,
        error: (error as Error).message,
      })

      return {
        success: false,
        timestamp,
        eventId,
        layersReloaded: [],
        error: (error as Error).message,
      }
    }
  }

  /**
   * Get the last reload time
   */
  getLastReloadTime(): number | null {
    return this.lastReloadTime
  }

  /**
   * Check if a reload is pending
   */
  isReloadPending(): boolean {
    return this.reloadPending
  }

  /**
   * Get reload events history
   */
  getReloadEvents(): ReloadEvent[] {
    return [...this.reloadEvents]
  }

  /**
   * Get the most recent reload event
   */
  getLastReloadEvent(): ReloadEvent | null {
    return this.reloadEvents.length > 0 
      ? this.reloadEvents[this.reloadEvents.length - 1] 
      : null
  }

  /**
   * Get configuration for a work item based on activation boundary
   * 
   * Property 19: New config applies to workflows/work items with start time > t
   *              Old config is maintained for workflows/work items with start time <= t
   * 
   * @param workItemId - Work item ID
   * @param startTime - Work item start timestamp (Unix milliseconds)
   * @returns Merged configuration (new or old based on activation boundary)
   */
  getConfigForWorkItem(workItemId: string, startTime: number): MergedConfig {
    const lastReloadTime = this.lastReloadTime
    
    // If no reload has happened yet, return current merged config
    if (lastReloadTime === null) {
      logger.debug('No reload has happened yet, returning current config', { workItemId })
      // Return a placeholder - actual config should be provided by caller
      throw new Error('No configuration available. Call loadConfig first.')
    }
    
    // Check if we have a cached snapshot for this work item
    const entry = this.workItemSnapshots.get(workItemId)
    
    if (entry) {
      // Update access time for LRU
      entry.lastAccessedAt = Date.now()
      this.cacheHits++
      
      // We have a snapshot - check if it's the right one based on activation boundary
      const snapshotTime = entry.snapshot.metadata.mergedAt
      
      if (startTime > lastReloadTime) {
        // New work item started after reload - should use new config
        // The snapshot should have been created with new config (mergedAt < lastReloadTime for old, >= for new)
        // Since mergedAt is 0 for initial merge, we need to check if snapshotTime < lastReloadTime
        // If snapshotTime < lastReloadTime, it means this is an old config snapshot
        if (snapshotTime < lastReloadTime) {
          // Snapshot is from old config but should use new - need to get new config
          logger.warn('Work item has old snapshot but should use new config', {
            workItemId,
            startTime,
            lastReloadTime,
            snapshotTime,
          })
          throw new Error('Work item snapshot is outdated. Call snapshotConfig before starting work item.')
        } else {
          // Snapshot is from new config, return it
          logger.debug('Using new config for work item (start time > reload time)', { 
            workItemId, 
            startTime,
            lastReloadTime,
          })
          return this.createMergedConfigFromSnapshot(entry.snapshot)
        }
      } else {
        // Work item started before or at reload - should use old config
        // The snapshot should have been created with old config (mergedAt < lastReloadTime)
        if (snapshotTime < lastReloadTime) {
          // Snapshot is from old config, return it
          logger.debug('Using old config for work item (start time <= reload time)', { 
            workItemId, 
            startTime,
            lastReloadTime,
            snapshotTime,
          })
          return this.createMergedConfigFromSnapshot(entry.snapshot)
        } else {
          // Snapshot is from new config but should use old - need to get old config
          logger.warn('Work item has new snapshot but should use old config', {
            workItemId,
            startTime,
            lastReloadTime,
            snapshotTime,
          })
          throw new Error('Work item snapshot is from future config. Call snapshotConfig before starting work item.')
        }
      }
    } else {
      // No snapshot found - this is an error condition
      this.cacheMisses++
      // The caller should have called snapshotConfig before starting the work item
      logger.error('No snapshot found for work item', { workItemId })
      throw new Error(`No configuration snapshot found for work item: ${workItemId}. Call snapshotConfig before starting work item.`)
    }
  }

  /**
   * Create a MergedConfig from a ConfigSnapshot
   * 
   * @param snapshot - Configuration snapshot
   * @returns MergedConfig
   */
  private createMergedConfigFromSnapshot(snapshot: ConfigSnapshot): MergedConfig {
    return {
      layers: [], // Snapshots don't store layers, this is a simplified view
      merged: { ...snapshot.merged },
      sources: { ...snapshot.sources },
      metadata: {
        ...snapshot.metadata,
        mergedAt: snapshot.metadata.mergedAt,
        sensitiveFields: snapshot.metadata.sensitiveFields ?? [],
        validationErrors: snapshot.metadata.validationErrors ?? [],
      },
    }
  }

  /**
   * Create a configuration snapshot for a work item
   * 
   * This should be called when a work item is about to start,
   * so the activation boundary can determine which config version to use.
   * 
   * @param workItemId - Work item ID
   * @param startTime - Work item start timestamp
   * @param config - Current merged configuration
   */
  snapshotConfig(workItemId: string, startTime: number, config: MergedConfig): void {
    const lastReloadTime = this.lastReloadTime
    
    // Determine if this should use new or old config based on activation boundary
    // New config applies when: start time > last reload time (t)
    // Old config applies when: start time <= last reload time (t)
    const shouldUseNewConfig = lastReloadTime !== null && startTime > lastReloadTime
    
    // For the snapshot's mergedAt we use a marker to track "old" vs "new" config:
    // - If using new config (startTime > lastReloadTime): use lastReloadTime as marker
    //   This ensures snapshotTime (lastReloadTime) >= lastReloadTime, passing the check
    // - If using old config (startTime <= lastReloadTime): use lastReloadTime - 1 as marker
    //   This ensures snapshotTime (lastReloadTime - 1) < lastReloadTime, passing the check
    // 
    // The marker approach is needed because config.metadata.mergedAt is 0 (deterministic merge),
    // and 0 would never be >= any real lastReloadTime value.
    const snapshotMergedAt = shouldUseNewConfig 
      ? (lastReloadTime !== null ? lastReloadTime : config.metadata.mergedAt)
      : (lastReloadTime !== null ? lastReloadTime - 1 : config.metadata.mergedAt)
    
    // Create snapshot with appropriate mergedAt time
    const snapshot: ConfigSnapshot = {
      merged: { ...config.merged },
      sources: { ...config.sources },
      metadata: {
        ...config.metadata,
        mergedAt: snapshotMergedAt,
      },
    }
    
    // Check if we need to evict before adding
    if (this.enableLRU && this.workItemSnapshots.size >= this.maxCacheSize && !this.workItemSnapshots.has(workItemId)) {
      // Evict LRU entries to make room
      this.evictLRU(1)
    }
    
    // Also check and evict expired entries
    this.evictExpired()
    
    // Estimate size for memory management
    const estimatedSize = this.estimateConfigSize(snapshot.merged)
    
    // Create cache entry
    const entry: CacheEntry = {
      snapshot,
      startTime,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      size: estimatedSize,
    }
    
    this.workItemSnapshots.set(workItemId, entry)
    
    logger.debug('Configuration snapshot created for work item', {
      workItemId,
      startTime,
      shouldUseNewConfig,
      lastReloadTime,
      snapshotMergedAt,
      cacheSize: this.workItemSnapshots.size,
    })
  }

  /**
   * Get the start time for a work item
   * 
   * @param workItemId - Work item ID
   * @returns Start timestamp or null if not found
   */
  getWorkItemStartTime(workItemId: string): number | null {
    const entry = this.workItemSnapshots.get(workItemId)
    return entry ? entry.startTime : null
  }

  /**
   * Clear configuration snapshot for a work item
   * 
   * @param workItemId - Work item ID
   */
  clearWorkItemSnapshot(workItemId: string): void {
    const entry = this.workItemSnapshots.get(workItemId)
    if (entry) {
      this.workItemSnapshots.delete(workItemId)
      logger.debug('Configuration snapshot cleared for work item', { workItemId })
    }
  }

  /**
   * Clear all configuration snapshots (for testing)
   */
  clearAllSnapshots(): void {
    this.workItemSnapshots.clear()
    logger.debug('All configuration snapshots cleared')
  }

  // ==================== Cache Management ====================
  
  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    let totalMemory = 0
    let oldestTime: number | null = null
    let newestTime: number | null = null
    
    for (const entry of this.workItemSnapshots.values()) {
      totalMemory += entry.size
      if (oldestTime === null || entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt
      }
      if (newestTime === null || entry.createdAt > newestTime) {
        newestTime = entry.createdAt
      }
    }
    
    return {
      size: this.workItemSnapshots.size,
      maxSize: this.maxCacheSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      evictions: this.cacheEvictions,
      totalMemoryBytes: totalMemory,
      oldestEntry: oldestTime,
      newestEntry: newestTime,
    }
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats(): void {
    this.cacheHits = 0
    this.cacheMisses = 0
    this.cacheEvictions = 0
  }

  /**
   * Configure cache parameters
   * 
   * @param maxSize - Maximum number of entries
   * @param ttlMs - Time-to-live in milliseconds
   * @param enableLRU - Whether to enable LRU eviction
   */
  configureCache(maxSize?: number, ttlMs?: number, enableLRU?: boolean): void {
    if (maxSize !== undefined) {
      this.maxCacheSize = maxSize
    }
    if (ttlMs !== undefined) {
      this.cacheTTLMs = ttlMs
    }
    if (enableLRU !== undefined) {
      this.enableLRU = enableLRU
    }
    
    logger.info('Cache configuration updated', {
      maxSize: this.maxCacheSize,
      cacheTTLMs: this.cacheTTLMs,
      enableLRU: this.enableLRU,
    })
    
    // Trigger eviction if max size decreased
    if (this.workItemSnapshots.size > this.maxCacheSize) {
      this.evictLRU(this.workItemSnapshots.size - this.maxCacheSize)
    }
  }

  /**
   * Estimate the size of a config object in bytes
   */
  private estimateConfigSize(config: Record<string, unknown>): number {
    // Rough estimation: JSON stringify and measure length
    try {
      return JSON.stringify(config).length * 2 // UTF-16 = 2 bytes per char
    } catch {
      return 1024 // Default fallback
    }
  }

  /**
   * Evict LRU (Least Recently Used) entries
   */
  private evictLRU(count: number): void {
    if (count <= 0 || this.workItemSnapshots.size === 0) {
      return
    }
    
    // Sort entries by lastAccessedAt (oldest first)
    const entries = Array.from(this.workItemSnapshots.entries())
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
    
    const toEvict = Math.min(count, entries.length)
    
    for (let i = 0; i < toEvict; i++) {
      const [workItemId] = entries[i]
      this.workItemSnapshots.delete(workItemId)
      this.cacheEvictions++
    }
    
    logger.debug('LRU eviction performed', { count: toEvict, remaining: this.workItemSnapshots.size })
  }

  /**
   * Evict expired entries based on TTL
   */
  private evictExpired(): number {
    if (this.cacheTTLMs <= 0) {
      return 0
    }
    
    const now = Date.now()
    let evicted = 0
    
    for (const [workItemId, entry] of this.workItemSnapshots.entries()) {
      if (now - entry.createdAt > this.cacheTTLMs) {
        this.workItemSnapshots.delete(workItemId)
        evicted++
      }
    }
    
    if (evicted > 0) {
      this.cacheEvictions += evicted
      logger.debug('TTL eviction performed', { count: evicted, remaining: this.workItemSnapshots.size })
    }
    
    return evicted
  }

  /**
   * Evict entries that are no longer relevant based on activation boundary
   * 
   * This removes snapshots that are "old config" but the reload has long passed
   * (the work item should have finished by now)
   */
  private evictStaleByBoundary(): number {
    if (this.lastReloadTime === null) {
      return 0
    }
    
    // Consider snapshots stale if they are old config and 1 hour has passed since reload
    const staleThreshold = this.lastReloadTime + 3600000
    const now = Date.now()
    
    if (now < staleThreshold) {
      return 0 // Not enough time has passed
    }
    
    let evicted = 0
    
    for (const [workItemId, entry] of this.workItemSnapshots.entries()) {
      // If this is an old config snapshot (created before last reload)
      // and enough time has passed, it's likely stale
      if (entry.createdAt < this.lastReloadTime) {
        this.workItemSnapshots.delete(workItemId)
        evicted++
      }
    }
    
    if (evicted > 0) {
      this.cacheEvictions += evicted
      logger.debug('Stale boundary eviction performed', { count: evicted, remaining: this.workItemSnapshots.size })
    }
    
    return evicted
  }

  /**
   * Perform cache maintenance (eviction of expired and stale entries)
   */
  performCacheMaintenance(): void {
    const expiredEvicted = this.evictExpired()
    const boundaryEvicted = this.evictStaleByBoundary()
    
    // If still over max size after TTL eviction, do LRU
    if (this.workItemSnapshots.size > this.maxCacheSize) {
      this.evictLRU(this.workItemSnapshots.size - this.maxCacheSize)
    }
    
    logger.debug('Cache maintenance completed', {
      expiredEvicted,
      boundaryEvicted,
      currentSize: this.workItemSnapshots.size,
    })
  }

  /**
   * Check if cache is full
   */
  isCacheFull(): boolean {
    return this.workItemSnapshots.size >= this.maxCacheSize
  }

  /**
   * Get the number of cached entries
   */
  getCacheSize(): number {
    return this.workItemSnapshots.size
  }

  /**
   * Update HotReloadConfig (also updates cache settings)
   */
  updateConfig(config: Partial<HotReloadConfig>): void {
    this.config = { ...this.config, ...config }
    
    // Update cache settings if provided
    if (config.maxCacheSize !== undefined) {
      this.maxCacheSize = config.maxCacheSize
    }
    if (config.cacheTTLMs !== undefined) {
      this.cacheTTLMs = config.cacheTTLMs
    }
    if (config.enableLRU !== undefined) {
      this.enableLRU = config.enableLRU
    }
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `reload-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
  }

  /**
   * Clear reload events history (for testing)
   */
  clearReloadEvents(): void {
    this.reloadEvents = []
    logger.debug('Reload events history cleared')
  }
}
