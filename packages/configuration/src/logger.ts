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

  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.debug(`${this.prefix} DEBUG`, message, meta)
    } else {
      console.debug(`${this.prefix} DEBUG`, message)
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.info(`${this.prefix} INFO`, message, meta)
    } else {
      console.info(`${this.prefix} INFO`, message)
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.warn(`${this.prefix} WARN`, message, meta)
    } else {
      console.warn(`${this.prefix} WARN`, message)
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      console.error(`${this.prefix} ERROR`, message, meta)
    } else {
      console.error(`${this.prefix} ERROR`, message)
    }
  }
}

export const logger: Logger = new ConsoleLogger()
