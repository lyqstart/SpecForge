/**
 * Simple logger for configuration subsystem
 */

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

class ConsoleLogger implements Logger {
  private prefix = '[Config]'

  // Configuration values and parser diagnostics may contain credentials under
  // arbitrary names. Log only structural metadata, never raw values/errors.
  private safeMeta(meta: Record<string, unknown>): Record<string, unknown> {
    const counts = new Set(['layerCount', 'keyCount', 'validationErrors'])
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(meta)) {
      if (counts.has(key) && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) result[key] = value
      else if (key === 'layer' && ['builtin', 'user', 'project', 'runtime'].includes(String(value))) result.layer = value
      else if (key === 'schemaVersion' && value === '1.0') result.schemaVersion = value
      // Do not echo arbitrary metadata keys: even a key can contain a secret.
    }
    return result
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.debug(`${this.prefix} DEBUG`, message, this.safeMeta(meta))
    } else {
      console.debug(`${this.prefix} DEBUG`, message)
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.info(`${this.prefix} INFO`, message, this.safeMeta(meta))
    } else {
      console.info(`${this.prefix} INFO`, message)
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.warn(`${this.prefix} WARN`, message, this.safeMeta(meta))
    } else {
      console.warn(`${this.prefix} WARN`, message)
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.error(`${this.prefix} ERROR`, message, this.safeMeta(meta))
    } else {
      console.error(`${this.prefix} ERROR`, message)
    }
  }
}

export const logger: Logger = new ConsoleLogger()
