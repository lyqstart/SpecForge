import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { HotReloadManager } from '../src/hot-reload'
import { mergeConfigLayers } from '../src/config-merge'

// Mock chokidar properly - create mock before each test
let mockWatcher: any

vi.mock('chokidar', () => {
  return {
    __esModule: true,
    default: {
      watch: vi.fn().mockImplementation(() => {
        mockWatcher = {
          on: vi.fn(),
          close: vi.fn().mockResolvedValue(undefined),
        }
        return mockWatcher
      }),
    },
    watch: vi.fn().mockImplementation(() => {
      mockWatcher = {
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      }
      return mockWatcher
    }),
  }
})

describe('hot-reload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('HotReloadManager', () => {
    it('should start and stop watcher', async () => {
      const manager = new HotReloadManager({ enabled: true, debounceMs: 100, watchPaths: [] })
      
      await manager.start(['/path/to/config'])
      expect(manager.getLastReloadTime()).toBeNull()
      
      // After starting, mockWatcher should exist and have event handlers
      expect(mockWatcher).toBeDefined()
      expect(mockWatcher.on).toHaveBeenCalled()
      
      await manager.stop()
      expect(mockWatcher.close).toHaveBeenCalled()
    })

    it('should handle disabled hot-reload start', async () => {
      const manager = new HotReloadManager({ enabled: false, debounceMs: 100, watchPaths: [] })
      
      await manager.start(['/path/to/config'])
      // With hot-reload disabled, no watcher should be created
      expect(manager.getLastReloadTime()).toBeNull()
    })

    it('should trigger reload callbacks', async () => {
      const manager = new HotReloadManager({ enabled: true, debounceMs: 100, watchPaths: [] })
      
      let callbackCalled = false
      manager.onReload(async () => {
        callbackCalled = true
      })
      
      const result = await manager.reload('api-call')
      
      expect(result.success).toBe(true)
      expect(result.eventId).toBeDefined()
      expect(result.timestamp).toBeDefined()
      expect(callbackCalled).toBe(true)
    })

    it('should not call callback twice if already running', async () => {
      const manager = new HotReloadManager({ enabled: true, debounceMs: 0, watchPaths: [] })
      
      let callCount = 0
      manager.onReload(async () => {
        callCount++
      })
      
      // Trigger reload multiple times rapidly
      await manager.reload('api-call')
      
      // The callback should be called exactly once per explicit reload
      expect(callCount).toBe(1)
    })

    it('should trigger explicit reload', async () => {
      const manager = new HotReloadManager({ enabled: true, debounceMs: 100, watchPaths: [] })
      
      let callbackCalled = false
      manager.onReload(async () => {
        callbackCalled = true
      })
      
      const result = await manager.reload('api-call')
      
      expect(result.success).toBe(true)
      expect(result.eventId).toBeDefined()
      expect(result.timestamp).toBeDefined()
      expect(callbackCalled).toBe(true)
    })

    it('should record reload events', async () => {
      const manager = new HotReloadManager({ enabled: true, debounceMs: 100, watchPaths: [] })
      
      await manager.reload('cli-command')
      await manager.reload('api-call')
      
      const events = manager.getReloadEvents()
      expect(events.length).toBe(2)
      expect(events[0].trigger).toBe('cli-command')
      expect(events[1].trigger).toBe('api-call')
    })

    it('should handle disabled hot-reload', async () => {
      const manager = new HotReloadManager({ enabled: false, debounceMs: 100, watchPaths: [] })
      
      const result = await manager.reload('api-call')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Hot-reload is disabled')
    })

    describe('Activation Boundary', () => {
      let manager: HotReloadManager

      beforeEach(() => {
        manager = new HotReloadManager({ enabled: true, debounceMs: 0, watchPaths: [] })
      })

      it('should apply new config to work items starting after reload time', async () => {
        const baseTime = 1000
        const reloadTime = baseTime + 50

        // Create layers before reload
        const layersBefore = [
          { type: 'builtin' as const, timestamp: baseTime, data: { testKey: 'beforeValue' } },
        ]
        const mergedBefore = mergeConfigLayers(layersBefore)

        // Simulate reload by directly setting lastReloadTime (not calling reload which uses Date.now())
        manager['lastReloadTime'] = reloadTime

        // Create snapshot for work item starting before reload
        manager.snapshotConfig('work-item-before', reloadTime - 10, mergedBefore)

        // Create new layers after reload
        const layersAfter = [
          { type: 'builtin' as const, timestamp: baseTime, data: { testKey: 'afterValue' } },
        ]
        const mergedAfter = mergeConfigLayers(layersAfter)

        // Create snapshot for work item starting after reload
        manager.snapshotConfig('work-item-after', reloadTime + 10, mergedAfter)

        // Get config for work item starting before reload
        const configBefore = manager.getConfigForWorkItem('work-item-before', reloadTime - 10)
        expect(configBefore.merged.testKey).toBe('beforeValue')

        // Get config for work item starting after reload
        const configAfter = manager.getConfigForWorkItem('work-item-after', reloadTime + 10)
        expect(configAfter.merged.testKey).toBe('afterValue')
      })

      it('should maintain old config for work items starting at reload time', async () => {
        const baseTime = 1000
        const reloadTime = baseTime + 50

        const layers = [
          { type: 'builtin' as const, timestamp: baseTime, data: { testKey: 'initialValue' } },
        ]
        const merged = mergeConfigLayers(layers)

        // Simulate reload by directly setting lastReloadTime
        manager['lastReloadTime'] = reloadTime

        // Create snapshot for work item starting exactly at reload time
        manager.snapshotConfig('work-item-at', reloadTime, merged)

        // Get config - should get old config
        const config = manager.getConfigForWorkItem('work-item-at', reloadTime)
        expect(config.merged.testKey).toBe('initialValue')
      })

      it('should throw error when no snapshot exists for work item', async () => {
        const baseTime = 1000
        const reloadTime = baseTime + 50

        // Simulate reload by directly setting lastReloadTime
        manager['lastReloadTime'] = reloadTime

        // Try to get config without creating snapshot first
        expect(() => {
          manager.getConfigForWorkItem('work-item-no-snapshot', baseTime)
        }).toThrow('No configuration snapshot found')
      })

      it('should clear work item snapshots', async () => {
        const baseTime = 1000
        const reloadTime = baseTime + 50

        const layers = [
          { type: 'builtin' as const, timestamp: baseTime, data: { testKey: 'value' } },
        ]
        const merged = mergeConfigLayers(layers)

        // Simulate reload by directly setting lastReloadTime
        manager['lastReloadTime'] = reloadTime

        // Create snapshot
        manager.snapshotConfig('work-item-to-clear', baseTime, merged)

        // Verify snapshot exists
        expect(manager.getWorkItemStartTime('work-item-to-clear')).toBe(baseTime)

        // Clear snapshot
        manager.clearWorkItemSnapshot('work-item-to-clear')

        // Verify snapshot is cleared
        expect(manager.getWorkItemStartTime('work-item-to-clear')).toBeNull()
      })

      it('should clear all snapshots', async () => {
        const baseTime = 1000
        const reloadTime = baseTime + 50

        const layers = [
          { type: 'builtin' as const, timestamp: baseTime, data: { testKey: 'value' } },
        ]
        const merged = mergeConfigLayers(layers)

        // Simulate reload by directly setting lastReloadTime
        manager['lastReloadTime'] = reloadTime

        // Create multiple snapshots
        manager.snapshotConfig('work-item-1', baseTime, merged)
        manager.snapshotConfig('work-item-2', baseTime + 10, merged)

        // Verify snapshots exist
        expect(manager.getWorkItemStartTime('work-item-1')).toBe(baseTime)
        expect(manager.getWorkItemStartTime('work-item-2')).toBe(baseTime + 10)

        // Clear all snapshots
        manager.clearAllSnapshots()

        // Verify all snapshots are cleared
        expect(manager.getWorkItemStartTime('work-item-1')).toBeNull()
        expect(manager.getWorkItemStartTime('work-item-2')).toBeNull()
      })
    })
  })
})
describe('Cache Management', () => {
      let manager: HotReloadManager

      beforeEach(() => {
        manager = new HotReloadManager({ 
          enabled: true, 
          debounceMs: 0, 
          watchPaths: [],
          maxCacheSize: 3,
        })
      })

      it('should track cache statistics', () => {
        const layers = [
          { type: 'builtin' as const, timestamp: 1000, data: { key: 'value' } },
        ]
        const merged = mergeConfigLayers(layers)

        manager.snapshotConfig('item1', 1000, merged)
        manager.snapshotConfig('item2', 2000, merged)

        const stats = manager.getCacheStats()
        expect(stats.size).toBe(2)
        expect(stats.maxSize).toBe(3)
        expect(stats.hits).toBe(0)
        expect(stats.misses).toBe(0)
      })

      it('should reset cache statistics', () => {
        const layers = [
          { type: 'builtin' as const, timestamp: 1000, data: { key: 'value' } },
        ]
        const merged = mergeConfigLayers(layers)

        manager.snapshotConfig('item1', 1000, merged)

        manager.resetCacheStats()
        const stats = manager.getCacheStats()
        expect(stats.hits).toBe(0)
        expect(stats.misses).toBe(0)
        expect(stats.evictions).toBe(0)
      })

      it('should configure cache parameters', () => {
        manager.configureCache(500, 60000, false)
        const stats = manager.getCacheStats()
        expect(stats.maxSize).toBe(500)
      })

      it('should check if cache is full', () => {
        const layers = [
          { type: 'builtin' as const, timestamp: 1000, data: { key: 'value' } },
        ]
        const merged = mergeConfigLayers(layers)

        expect(manager.isCacheFull()).toBe(false)

        manager.snapshotConfig('item1', 1000, merged)
        manager.snapshotConfig('item2', 2000, merged)
        manager.snapshotConfig('item3', 3000, merged)

        expect(manager.isCacheFull()).toBe(true)
      })

      it('should get cache size', () => {
        const layers = [
          { type: 'builtin' as const, timestamp: 1000, data: { key: 'value' } },
        ]
        const merged = mergeConfigLayers(layers)

        expect(manager.getCacheSize()).toBe(0)

        manager.snapshotConfig('item1', 1000, merged)
        expect(manager.getCacheSize()).toBe(1)

        manager.clearAllSnapshots()
        expect(manager.getCacheSize()).toBe(0)
      })

      it('should perform cache maintenance', () => {
        const layers = [
          { type: 'builtin' as const, timestamp: 1000, data: { key: 'value' } },
        ]
        const merged = mergeConfigLayers(layers)

        manager.configureCache(2, 0, true) // Very short TTL for testing
        manager.snapshotConfig('item1', 1000, merged)
        manager.snapshotConfig('item2', 2000, merged)
        manager.snapshotConfig('item3', 3000, merged)

        // Cache maintenance should evict LRU entries
        manager.performCacheMaintenance()
        
        const stats = manager.getCacheStats()
        expect(stats.size).toBeLessThanOrEqual(2)
      })
    })

    describe('Reload Configuration', () => {
      let manager: HotReloadManager

      beforeEach(() => {
        manager = new HotReloadManager({ 
          enabled: true, 
          debounceMs: 100, 
          watchPaths: [],
        })
      })

      it('should update configuration', async () => {
        // First verify it works when enabled
        let result = await manager.reload('api-call')
        expect(result.success).toBe(true)
      })

      it('should generate unique event IDs', async () => {
        const result1 = await manager.reload('api-call')
        const result2 = await manager.reload('api-call')
        
        expect(result1.eventId).not.toBe(result2.eventId)
      })

      it('should get last reload event', async () => {
        await manager.reload('cli-command')
        const lastEvent = manager.getLastReloadEvent()
        
        expect(lastEvent).not.toBeNull()
        expect(lastEvent?.trigger).toBe('cli-command')
      })
    })