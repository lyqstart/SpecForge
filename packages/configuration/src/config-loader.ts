/**
 * Configuration file loading with error handling and logging
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { homedir } from 'node:os'
import { ConfigLayer, ConfigLayerType, MergedConfig } from './types'
import { CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG, SENSITIVE_FIELDS } from './constants'
import { logger } from './logger'
import { mergeConfigLayers } from './config-merge'

/**
 * Runtime configuration source
 */
export interface RuntimeConfigSource {
  cliArgs?: Record<string, unknown>
  envVars?: Record<string, unknown>
}

/**
 * Load configuration from a JSON file
 */
export async function loadConfigFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    logger.debug('Loading configuration file', { filePath })
    const content = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(content)
    logger.info('Configuration file loaded successfully', { filePath })
    return data
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { message?: string; code?: string }
    if (err.code === 'ENOENT') {
      logger.debug('Configuration file not found', { filePath })
      throw new Error(`Configuration file not found: ${filePath}`)
    }
    if (err instanceof SyntaxError) {
      logger.error('Invalid JSON in configuration file', { filePath, message: err.message })
      throw new Error(`Invalid JSON in configuration file ${filePath}: ${err.message}`)
    }
    logger.error('Failed to load configuration file', { filePath, message: err.message })
    throw new Error(`Failed to load configuration file ${filePath}: ${err.message}`)
  }
}

/**
 * Create a config layer with timestamp
 */
function createConfigLayer(
  type: ConfigLayerType,
  path: string | undefined,
  data: Record<string, unknown>,
): ConfigLayer {
  return {
    type,
    path,
    timestamp: Date.now(),
    data,
    schemaVersion: CONFIG_SCHEMA_VERSION,
  }
}

/**
 * Load builtin configuration from code constants
 */
export async function loadBuiltinConfig(): Promise<ConfigLayer> {
  logger.debug('Loading builtin configuration')
  return createConfigLayer('builtin', undefined, DEFAULT_CONFIG)
}

/**
 * Load user-level configuration from ~/.specforge/config/
 */
export async function loadUserConfig(): Promise<ConfigLayer> {
  const homeDir = homedir()
  const configPath = path.join(homeDir, '.specforge', 'config', 'config.json')
  logger.debug('Loading user-level configuration', { configPath, homeDir })

  const data = await loadConfigFile(configPath)
  return createConfigLayer('user', configPath, data)
}

/**
 * Load project-level configuration from <project>/.specforge/config/
 * 
 * CRITICAL: Project-level configuration is mandatory.
 * If it fails to load, error immediately without falling back to user-level or builtin.
 */
export async function loadProjectConfig(projectPath: string): Promise<ConfigLayer> {
  const configPath = path.join(projectPath, '.specforge', 'config', '.specforge.json')
  logger.debug('Loading project-level configuration', { configPath, projectPath })

  let data: Record<string, unknown>
  try {
    data = await loadConfigFile(configPath)
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { message?: string }
    // Re-throw with clear context for project-level config failures
    if (err.code === 'ENOENT') {
      logger.error('Project-level configuration file not found', { 
        configPath, 
        projectPath,
        hint: 'Project-level configuration is mandatory. Create .specforge/config/.specforge.json or disable project-level config if not needed.'
      })
      throw new Error(
        `Project-level configuration file not found: ${configPath}. ` +
        `Project-level configuration is mandatory for this project. ` +
        `Create .specforge/config/.specforge.json or ensure project path is correct.`
      )
    }
    // For other errors (parse errors, permissions, etc.), also throw with context
    logger.error('Failed to load project-level configuration', { 
      configPath, 
      projectPath,
      message: err.message
    })
    throw new Error(
      `Failed to load project-level configuration ${configPath}: ${err.message}. ` +
      `Project-level configuration is mandatory. Check file permissions and JSON syntax.`
    )
  }
  
  return createConfigLayer('project', configPath, data)
}

/**
 * Load runtime configuration from CLI args and environment variables
 */
export function loadRuntimeConfig(source?: RuntimeConfigSource): ConfigLayer {
  logger.debug('Loading runtime configuration')

  const cliArgs = source?.cliArgs ?? {}
  const envVars = source?.envVars ?? {}

  // Convert environment variables to config format
  const envConfig: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(envVars)) {
    if (value !== undefined) {
      envConfig[key] = value
    }
  }

  const runtimeData = { ...cliArgs, ...envConfig }
  logger.debug('Runtime configuration loaded', { data: runtimeData })

  return createConfigLayer('runtime', 'cli/env', runtimeData)
}

/**
 * Load all configuration layers in order
 * 
 * CRITICAL: Project-level configuration is mandatory.
 * If project-level config fails to load, the entire loading process fails.
 */
export async function loadAllConfigLayers(
  projectPath: string,
  runtimeSource?: RuntimeConfigSource,
): Promise<ConfigLayer[]> {
  logger.info('Loading all configuration layers', { projectPath })
  const layers: ConfigLayer[] = []

  // Load in order: builtin -> user -> project -> runtime
  const builtinLayer = await loadBuiltinConfig()
  layers.push(builtinLayer)
  logger.debug('Loaded builtin layer', { layer: builtinLayer.type })

  const userLayer = await loadUserConfig()
  layers.push(userLayer)
  logger.debug('Loaded user layer', { layer: userLayer.type, path: userLayer.path })

  // Project-level config is mandatory - if it fails, the entire load fails
  const projectLayer = await loadProjectConfig(projectPath)
  layers.push(projectLayer)
  logger.debug('Loaded project layer', { layer: projectLayer.type, path: projectLayer.path })

  const runtimeLayer = loadRuntimeConfig(runtimeSource)
  layers.push(runtimeLayer)
  logger.debug('Loaded runtime layer', { layer: runtimeLayer.type })

  logger.info('All configuration layers loaded successfully', { layerCount: layers.length })
  return layers
}

/**
 * Load and merge all configuration layers
 * 
 * CRITICAL: Project-level configuration is mandatory.
 * If project-level config fails to load, the entire loading process fails.
 */
export async function loadAndMergeConfig(
  projectPath: string,
  runtimeSource?: RuntimeConfigSource,
  sensitiveFields?: string[],
): Promise<MergedConfig> {
  logger.info('Loading and merging configuration', { projectPath })
  const layers = await loadAllConfigLayers(projectPath, runtimeSource)
  return mergeConfigLayers(layers, sensitiveFields)
}
