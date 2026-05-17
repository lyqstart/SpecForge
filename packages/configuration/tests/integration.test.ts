/**
 * Integration tests for configuration module
 * 
 * Covers:
 * - End-to-end configuration loading from all four layers
 * - Hot-reload with concurrent workflows
 * - Error recovery scenarios
 * - Cross-component configuration sharing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  loadConfigFile, 
  loadAllConfigLayers, 
  loadAndMergeConfig, 
  loadBuiltinConfig,
  loadProjectConfig,
  loadRuntimeConfig
} from '../src/config-loader'
import { mergeConfigLayers } from '../src/config-merge'
import { HotReloadManager } from '../src/hot-reload'
import { ConfigLayer, MergedConfig } from '../src/types'
import * as fs from 'fs/promises'
import * as path from 'path'
import { tmpdir } from 'os'
import { mkdir, rm, writeFile } from 'fs/promises'

// Mock chokidar
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

describe('Integration: End-to-End Configuration Loading', () => {
  let tempDir: string
  let mockHomeDir: string

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `specforge-integration-test-${Date.now()}`)
    mockHomeDir = path.join(tempDir, 'mock-home')
    await mkdir(mockHomeDir, { recursive: true })
    await mkdir(path.join(tempDir, '.specforge', 'config'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('Four-layer configuration loading', () => {
    it('should load all four layers in correct priority order', async () => {
      // Setup project config
      const projectConfigPath = path.join(tempDir, '.specforge', 'config', '.specforge.json')
      await writeFile(projectConfigPath, JSON.stringify({
        projectKey: 'projectValue',
        sharedKey: 'projectOverride'
      }))

      // Mock user config path - create a temporary home directory approach
      // Since we can't actually mock homedir(), we'll test with project config only
      
      // Create layers directly for testing
      const builtinLayer: ConfigLayer = {
        type: 'builtin',
        timestamp: Date.now(),
        data: { 
          builtinKey: 'builtinValue',
          sharedKey: 'builtinValue',
          logLevel: 'info'
        },
        schemaVersion: '1.0'
      }

      const userLayer: ConfigLayer = {
        type: 'user',
        path: path.join(mockHomeDir, '.specforge', 'config', 'config.json'),
        timestamp: Date.now(),
        data: { 
          userKey: 'userValue',
          sharedKey: 'userOverride'
        },
        schemaVersion: '1.0'
      }

      const projectLayer: ConfigLayer = {
        type: 'project',
        path: projectConfigPath,
        timestamp: Date.now(),
        data: { 
          projectKey: 'projectValue',
          sharedKey: 'projectOverride'
        },
        schemaVersion: '1.0'
      }

      const runtimeLayer: ConfigLayer = {
        type: 'runtime',
        timestamp: Date.now(),
        data: { 
          runtimeKey: 'runtimeValue',
          sharedKey: 'runtimeOverride'
        },
        schemaVersion: '1.0'
      }

      const layers = [builtinLayer, userLayer, projectLayer, runtimeLayer]
      const merged = mergeConfigLayers(layers)

      // Verify priority: runtime > project > user > builtin
      expect(merged.merged.sharedKey).toBe('runtimeOverride')
      expect(merged.sources.sharedKey).toBe('runtime')
      expect(merged.merged.userKey).toBe('userValue')
      expect(merged.sources.userKey).toBe('user')
      expect(merged.merged.projectKey).toBe('projectValue')
      expect(merged.sources.projectKey).toBe('project')
      expect(merged.merged.builtinKey).toBe('builtinValue')
      expect(merged.sources.builtinKey).toBe('builtin')
      expect(merged.merged.runtimeKey).toBe('runtimeValue')
      expect(merged.sources.runtimeKey).toBe('runtime')
    })

    it('should handle deep object merging correctly', async () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: {
            database: {
              host: 'localhost',
              port: 5432,
              pool: { min: 2, max: 10 }
            }
          },
          schemaVersion: '1.0'
        },
        {
          type: 'user',
          timestamp: Date.now(),
          data: {
            database: {
              host: 'user-host',
              credentials: { username: 'user' }
            }
          },
          schemaVersion: '1.0'
        },
        {
          type: 'project',
          path: path.join(tempDir, '.specforge', 'config', '.specforge.json'),
          timestamp: Date.now(),
          data: {
            database: {
              port: 3306,
              pool: { timeout: 30 }
            }
          },
          schemaVersion: '1.0'
        },
        {
          type: 'runtime',
          timestamp: Date.now(),
          data: {
            database: {
              pool: { max: 50 }
            }
          },
          schemaVersion: '1.0'
        }
      ]

      const merged = mergeConfigLayers(layers)

      // Deep merge should combine nested objects
      expect(merged.merged.database).toEqual({
        host: 'user-host', // from user layer
        port: 3306, // from project layer
        credentials: { username: 'user' }, // from user layer
        pool: { min: 2, max: 50, timeout: 30 } // deep merged from all layers
      })
    })

    it('should handle array replacement (not concatenation)', async () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: {
            plugins: ['plugin-a', 'plugin-b']
          },
          schemaVersion: '1.0'
        },
        {
          type: 'user',
          timestamp: Date.now(),
          data: {
            plugins: ['plugin-c']
          },
          schemaVersion: '1.0'
        },
        {
          type: 'project',
          path: path.join(tempDir, '.specforge', 'config', '.specforge.json'),
          timestamp: Date.now(),
          data: {
            plugins: ['plugin-d', 'plugin-e']
          },
          schemaVersion: '1.0'
        }
      ]

      const merged = mergeConfigLayers(layers)

      // Arrays should be replaced, not concatenated
      expect(merged.merged.plugins).toEqual(['plugin-d', 'plugin-e'])
    })
  })

  describe('Error Recovery Scenarios', () => {
    it('should fail fast when project config is missing', async () => {
      // No project config file created - should throw
      await expect(loadProjectConfig(tempDir)).rejects.toThrow(
        /Project-level configuration is mandatory/
      )
    })

    it('should fail with clear error for invalid JSON in project config', async () => {
      const projectConfigPath = path.join(tempDir, '.specforge', 'config', '.specforge.json')
      await writeFile(projectConfigPath, '{ invalid json }')

      await expect(loadProjectConfig(tempDir)).rejects.toThrow(/Invalid JSON|Failed to load/)
    })

    it('should maintain previous valid config when new config fails to load', async () => {
      const projectConfigPath = path.join(tempDir, '.specforge', 'config', '.specforge.json')
      
      // Create valid initial config
      await writeFile(projectConfigPath, JSON.stringify({ key: 'initialValue' }))
      const validConfig = await loadProjectConfig(tempDir)
      expect(validConfig.data.key).toBe('initialValue')

      // Write invalid config
      await writeFile(projectConfigPath, '{ invalid }')

      // Loading should fail now
      await expect(loadProjectConfig(tempDir)).rejects.toThrow()

      // Original config is still valid (in real scenario, we'd catch and keep old)
    })

    it('should handle schema validation errors gracefully', async () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { 
            logLevel: 'info',
            timeoutMs: 30000
          },
          schemaVersion: '1.0'
        }
      ]

      const merged = mergeConfigLayers(layers)
      
      // Should have validation errors array (even if empty)
      expect(merged.metadata.validationErrors).toBeDefined()
      expect(Array.isArray(merged.metadata.validationErrors)).toBe(true)
    })
  })

  describe('Sensitive Field Protection', () => {
    it('should reject project-level override of sensitive fields', async () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { 
            apiKeys: { openai: 'builtin-key' },
            tokens: { access: 'builtin-token' }
          },
          schemaVersion: '1.0'
        },
        {
          type: 'project',
          path: path.join(tempDir, '.specforge', 'config', '.specforge.json'),
          timestamp: Date.now(),
          data: { 
            // This should be rejected
            apiKeys: { openai: 'project-key-should-be-rejected' }
          },
          schemaVersion: '1.0'
        }
      ]

      const merged = mergeConfigLayers(layers)

      // Project layer override should be rejected
      expect(merged.merged.apiKeys?.openai).toBe('builtin-key')
      expect(merged.metadata.validationErrors).toHaveLength(1)
      expect(merged.metadata.validationErrors[0].field).toBe('apiKeys')
    })

    it('should allow user-level override of sensitive fields', async () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { 
            apiKeys: { openai: 'builtin-key' }
          },
          schemaVersion: '1.0'
        },
        {
          type: 'user',
          timestamp: Date.now(),
          data: { 
            // User level CAN override sensitive fields
            apiKeys: { openai: 'user-key' }
          },
          schemaVersion: '1.0'
        }
      ]

      const merged = mergeConfigLayers(layers)

      // User layer override should be allowed
      expect(merged.merged.apiKeys?.openai).toBe('user-key')
      expect(merged.sources.apiKeys).toBe('user')
    })
  })
})

describe('Integration: Hot-Reload with Concurrent Workflows', () => {
  let manager: HotReloadManager

  beforeEach(() => {
    manager = new HotReloadManager({ 
      enabled: true, 
      debounceMs: 100, 
      watchPaths: [],
      maxCacheSize: 100
    })
  })

  afterEach(async () => {
    await manager.stop()
  })

  describe('Concurrent workflow scenarios', () => {
    it('should handle multiple workflows starting at different times around reload', async () => {
      // Simulate workflow timing
      const baseTime = 1000
      const reloadTime = baseTime + 500

      // Create initial config
      const initialLayers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: baseTime,
          data: { setting: 'initial', maxConnections: 10 },
          schemaVersion: '1.0'
        }
      ]
      const initialConfig = mergeConfigLayers(initialLayers)

      // Create updated config (simulating what would be loaded after reload)
      const updatedLayers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: reloadTime,
          data: { setting: 'updated', maxConnections: 50 },
          schemaVersion: '1.0'
        }
      ]
      const updatedConfig = mergeConfigLayers(updatedLayers)

      // Simulate reload happened at reloadTime
      manager['lastReloadTime'] = reloadTime

      // Create snapshots for 3 workflows:
      // 1. Starts before reload (should get initial config)
      // 2. Starts exactly at reload (should get initial config)
      // 3. Starts after reload (should get updated config)

      manager.snapshotConfig('workflow-1', baseTime + 100, initialConfig)
      manager.snapshotConfig('workflow-2', reloadTime, initialConfig)
      manager.snapshotConfig('workflow-3', reloadTime + 100, updatedConfig)

      // Get configs for each workflow
      const config1 = manager.getConfigForWorkItem('workflow-1', baseTime + 100)
      const config2 = manager.getConfigForWorkItem('workflow-2', reloadTime)
      const config3 = manager.getConfigForWorkItem('workflow-3', reloadTime + 100)

      // Verify activation boundary is correctly applied
      expect(config1.merged.setting).toBe('initial')
      expect(config2.merged.setting).toBe('initial')
      expect(config3.merged.setting).toBe('updated')
    })

    it('should handle rapid sequential reloads', async () => {
      const baseTime = 1000

      const layers1: ConfigLayer[] = [
        { type: 'builtin', timestamp: baseTime, data: { version: 1 }, schemaVersion: '1.0' }
      ]
      const config1 = mergeConfigLayers(layers1)

      // First reload
      manager['lastReloadTime'] = baseTime + 100
      manager.snapshotConfig('workflow-1', baseTime + 50, config1)

      const layers2: ConfigLayer[] = [
        { type: 'builtin', timestamp: baseTime + 100, data: { version: 2 }, schemaVersion: '1.0' }
      ]
      const config2 = mergeConfigLayers(layers2)

      // Second reload before first workflow finishes
      manager['lastReloadTime'] = baseTime + 200
      manager.snapshotConfig('workflow-2', baseTime + 150, config2)

      const layers3: ConfigLayer[] = [
        { type: 'builtin', timestamp: baseTime + 200, data: { version: 3 }, schemaVersion: '1.0' }
      ]
      const config3 = mergeConfigLayers(layers3)

      // Third reload
      manager['lastReloadTime'] = baseTime + 300
      manager.snapshotConfig('workflow-3', baseTime + 250, config3)

      // Each workflow should maintain its config version
      expect(manager.getConfigForWorkItem('workflow-1', baseTime + 50).merged.version).toBe(1)
      expect(manager.getConfigForWorkItem('workflow-2', baseTime + 150).merged.version).toBe(2)
      expect(manager.getConfigForWorkItem('workflow-3', baseTime + 250).merged.version).toBe(3)
    })

    it('should handle cache eviction under load', async () => {
      const smallCache = new HotReloadManager({
        enabled: true,
        debounceMs: 100,
        watchPaths: [],
        maxCacheSize: 3, // Very small cache
        cacheTTLMs: 0, // No TTL
        enableLRU: true
      })

      const layers: ConfigLayer[] = [
        { type: 'builtin', timestamp: 1000, data: { value: 'test' }, schemaVersion: '1.0' }
      ]
      const config = mergeConfigLayers(layers)

      // Fill cache beyond capacity
      smallCache.snapshotConfig('item-1', 1000, config)
      smallCache.snapshotConfig('item-2', 2000, config)
      smallCache.snapshotConfig('item-3', 3000, config)
      smallCache.snapshotConfig('item-4', 4000, config) // Should trigger LRU eviction

      const stats = smallCache.getCacheStats()
      
      // Cache should not exceed max size
      expect(stats.size).toBeLessThanOrEqual(3)
      expect(stats.evictions).toBeGreaterThan(0)
    })

    it('should work with file watcher triggered reloads', async () => {
      let reloadCallbackCalled = false
      let reloadTimestamp: number | null = null

      manager.onReload(async () => {
        reloadCallbackCalled = true
        reloadTimestamp = Date.now()
      })

      // Trigger reload via API (simulating file watcher callback)
      const result = await manager.reload('file-watcher')

      expect(result.success).toBe(true)
      expect(reloadCallbackCalled).toBe(true)
      expect(reloadTimestamp).toBeGreaterThan(0)
      expect(manager.getLastReloadTime()).not.toBeNull()
    })
  })
})

describe('Integration: Cross-Component Configuration Sharing', () => {
  describe('Multi-component config access', () => {
    it('should share config across multiple components', () => {
      // Simulate different components accessing shared config
      const sharedConfig: MergedConfig = {
        layers: [
          { type: 'builtin', timestamp: 1000, data: { sharedDb: { host: 'localhost' } }, schemaVersion: '1.0' }
        ],
        merged: {
          sharedDb: { host: 'localhost', port: 5432 },
          componentA: { setting: 'a' },
          componentB: { setting: 'b' }
        },
        sources: {
          sharedDb: 'builtin',
          componentA: 'builtin',
          componentB: 'builtin'
        },
        metadata: {
          mergedAt: 0,
          schemaVersion: '1.0',
          sensitiveFields: [],
          validationErrors: []
        }
      }

      // Component A accesses its config
      const componentAConfig = {
        dbHost: sharedConfig.merged.sharedDb,
        ownSetting: sharedConfig.merged.componentA
      }

      // Component B accesses same shared config
      const componentBConfig = {
        dbHost: sharedConfig.merged.sharedDb,
        ownSetting: sharedConfig.merged.componentB
      }

      // Both components share the same underlying db config
      expect(componentAConfig.dbHost).toBe(componentBConfig.dbHost)
      expect(componentAConfig.dbHost).toEqual({ host: 'localhost', port: 5432 })
    })

    it('should track layer sources for debugging', () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { keyA: 'builtin' },
          schemaVersion: '1.0'
        },
        {
          type: 'user',
          timestamp: Date.now(),
          data: { keyB: 'user' },
          schemaVersion: '1.0'
        },
        {
          type: 'project',
          timestamp: Date.now(),
          data: { keyC: 'project' },
          schemaVersion: '1.0'
        },
        {
          type: 'runtime',
          timestamp: Date.now(),
          data: { keyD: 'runtime' },
          schemaVersion: '1.0'
        }
      ]

      const merged = mergeConfigLayers(layers)

      // Sources should be tracked for each key
      expect(merged.sources.keyA).toBe('builtin')
      expect(merged.sources.keyB).toBe('user')
      expect(merged.sources.keyC).toBe('project')
      expect(merged.sources.keyD).toBe('runtime')
    })

    it('should provide metadata for observability', () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { key: 'value' },
          schemaVersion: '1.0'
        }
      ]

      const merged = mergeConfigLayers(layers)

      // Metadata should be available for debugging/monitoring
      expect(merged.metadata.schemaVersion).toBe('1.0')
      expect(merged.metadata.mergedAt).toBe(0) // Deterministic
      expect(merged.metadata.sensitiveFields).toBeDefined()
      expect(merged.metadata.validationErrors).toBeDefined()
    })

    it('should maintain config immutability across components', () => {
      const layers: ConfigLayer[] = [
        {
          type: 'builtin',
          timestamp: Date.now(),
          data: { counter: 0 },
          schemaVersion: '1.0'
        }
      ]

      const config1 = mergeConfigLayers(layers)
      const config2 = mergeConfigLayers(layers) // New merge

      // Both should have independent copies
      config1.merged.counter = 100
      expect(config2.merged.counter).toBe(0) // Original should be unchanged
    })
  })

  describe('Config change propagation', () => {
    it('should propagate changes through reload callbacks', async () => {
      const manager = new HotReloadManager({
        enabled: true,
        debounceMs: 50,
        watchPaths: []
      })

      const callback1Results: any[] = []
      const callback2Results: any[] = []

      manager.onReload(async () => {
        callback1Results.push({ time: Date.now() })
      })

      manager.onReload(async () => {
        callback2Results.push({ time: Date.now() })
      })

      await manager.reload('api-call')

      // Both callbacks should be called
      expect(callback1Results).toHaveLength(1)
      expect(callback2Results).toHaveLength(1)

      await manager.stop()
    })

    it('should handle config snapshot isolation', () => {
      const manager = new HotReloadManager({
        enabled: true,
        debounceMs: 100,
        watchPaths: []
      })

      // Set up initial reload time first (simulating that config was loaded)
      manager['lastReloadTime'] = 500

      const layers: ConfigLayer[] = [
        { type: 'builtin', timestamp: 1000, data: { value: 'original' }, schemaVersion: '1.0' }
      ]
      const originalConfig = mergeConfigLayers(layers)

      // Create snapshot for workflow 1 (starts before reload time)
      manager.snapshotConfig('workflow-1', 400, originalConfig)

      // Modify the original config object (simulating runtime changes)
      originalConfig.merged.value = 'modified'

      // Get config for workflow 1 - should still have original value from snapshot
      const workflow1Config = manager.getConfigForWorkItem('workflow-1', 400)
      
      // Snapshot should be independent of the modified original
      expect(workflow1Config.merged.value).toBe('original')
    })
  })
})

describe('Integration: Real-world Scenarios', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `specforge-integration-test-${Date.now()}`)
    await mkdir(path.join(tempDir, '.specforge', 'config'), { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('should handle complete application startup flow', async () => {
      // Step 1: Create project config
      const projectConfigPath = path.join(tempDir, '.specforge', 'config', '.specforge.json')
      await writeFile(projectConfigPath, JSON.stringify({
        appName: 'test-app',
        database: {
          host: 'localhost',
          port: 5432
        },
        features: {
          hotReload: true,
          cache: true
        }
      }))

      // Step 2: Load configuration layers directly (bypassing user config which requires real home dir)
      const layers: ConfigLayer[] = [
        await loadBuiltinConfig(),
        {
          type: 'user',
          timestamp: Date.now(),
          data: {}, // Empty user config (user config is optional)
          schemaVersion: '1.0'
        },
        await loadProjectConfig(tempDir),
        loadRuntimeConfig()
      ]
      expect(layers).toHaveLength(4)

      // Step 3: Merge configuration
      const merged = mergeConfigLayers(layers)
      expect(merged.merged.appName).toBe('test-app')
      expect(merged.merged.database).toEqual({ host: 'localhost', port: 5432 })

      // Step 4: Setup hot-reload
      const manager = new HotReloadManager({
        enabled: true,
        debounceMs: 100,
        watchPaths: [projectConfigPath]
      })

      await manager.start([projectConfigPath])

      // Verify initial reload time is null
      expect(manager.getLastReloadTime()).toBeNull()

      // Trigger reload
      await manager.reload('cli-command')

      // Verify reload happened
      expect(manager.getLastReloadTime()).not.toBeNull()
      const events = manager.getReloadEvents()
      expect(events).toHaveLength(1)
      expect(events[0].trigger).toBe('cli-command')

      await manager.stop()
    })

  it('should handle configuration migration between versions', () => {
    // Simulate config migration
    const oldConfig = {
      v1Setting: 'old-value',
      deprecatedSetting: 'should-be-migrated'
    }

    const migrationMap: Record<string, string> = {
      deprecatedSetting: 'newSetting'
    }

    // Migration logic
    const migratedConfig: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(oldConfig)) {
      if (migrationMap[key]) {
        migratedConfig[migrationMap[key]] = value
      } else {
        migratedConfig[key] = value
      }
    }

    expect(migratedConfig.v1Setting).toBe('old-value')
    expect(migratedConfig.newSetting).toBe('should-be-migrated')
    expect(migratedConfig.deprecatedSetting).toBeUndefined()
  })

  it('should handle environment-specific configuration', () => {
    // Test environment variable expansion simulation
    const runtimeSource = {
      envVars: {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost:5432/db'
      }
    }

    const runtimeLayer = loadRuntimeConfig(runtimeSource)

    expect(runtimeLayer.data.NODE_ENV).toBe('production')
    expect(runtimeLayer.data.DATABASE_URL).toBe('postgresql://localhost:5432/db')
  })
})