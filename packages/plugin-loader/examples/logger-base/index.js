/**
 * Logger Base Plugin
 * 
 * This is a base logger plugin that provides logging functionality.
 * Other plugins can depend on this plugin to use its logging capabilities.
 */

// Plugin metadata
export const pluginInfo = {
  id: 'logger-base',
  name: 'Logger Base Plugin',
  version: '1.0.0',
  description: 'A base logger plugin that provides logging functionality'
};

// Internal logger state
const logs = [];

/**
 * Log a message with the specified level
 * @param {string} level - Log level (info, warn, error)
 * @param {string} message - The message to log
 * @returns {Object} Log entry
 */
export function log(level, message) {
  const entry = {
    timestamp: Date.now(),
    level,
    message
  };
  logs.push(entry);
  console.log(`[${level.toUpperCase()}] ${message}`);
  return entry;
}

/**
 * Log an info message
 * @param {string} message - The message to log
 * @returns {Object} Log entry
 */
export function info(message) {
  return log('info', message);
}

/**
 * Log a warning message
 * @param {string} message - The warning message
 * @returns {Object} Log entry
 */
export function warn(message) {
  return log('warn', message);
}

/**
 * Log an error message
 * @param {string} message - The error message
 * @returns {Object} Log entry
 */
export function error(message) {
  return log('error', message);
}

/**
 * Get all log entries
 * @returns {Array} Array of log entries
 */
export function getLogs() {
  return [...logs];
}

/**
 * Clear all logs
 */
export function clearLogs() {
  logs.length = 0;
}

/**
 * Returns plugin metadata
 * @returns {Object} Plugin information
 */
export function getPluginInfo() {
  return { ...pluginInfo };
}

// Default export
export default {
  pluginInfo,
  log,
  info,
  warn,
  error,
  getLogs,
  clearLogs,
  getPluginInfo
};