/**
 * Plugin With Permissions Demo
 * 
 * This plugin demonstrates how to properly declare permissions in the manifest
 * and how the plugin loader validates access to sensitive operations.
 * 
 * The manifest declares the following permissions:
 * - filesystem.read: Read files from allowed directories
 * - filesystem.write: Write files to allowed directories
 * - network: Make network requests
 * - child_process: Execute external commands
 * 
 * Without these permissions, the static analyzer will block access to:
 * - child_process module (spawn, exec, etc.)
 * - fs.readFile, fs.writeFile (when outside plugin root)
 * - http.request, https.request (network calls)
 */

/**
 * Plugin metadata - mirrors the manifest for runtime access
 */
export const pluginInfo = {
  id: 'with-permissions',
  name: 'Plugin With Permissions Demo',
  version: '1.0.0',
  description: 'A demonstration plugin that declares various permissions',
  permissions: [
    'filesystem.read',
    'filesystem.write',
    'network',
    'child_process'
  ]
};

/**
 * Example function: Read a configuration file
 * Requires: filesystem.read permission
 * @param {string} filePath - Path to config file
 * @returns {Promise<string>} File contents
 */
export async function readConfig(filePath) {
  // In a real implementation, this would use the filesystem API
  // The static analyzer checks for 'fs.readFile' calls and
  // requires 'filesystem.read' permission to allow them
  const fs = require('fs/promises');
  return await fs.readFile(filePath, 'utf-8');
}

/**
 * Example function: Write a cache file
 * Requires: filesystem.write permission
 * @param {string} filePath - Path to cache file
 * @param {string} data - Data to write
 * @returns {Promise<void>}
 */
export async function writeCache(filePath, data) {
  // In a real implementation, this would use the filesystem API
  // The static analyzer checks for 'fs.writeFile' calls and
  // requires 'filesystem.write' permission to allow them
  const fs = require('fs/promises');
  await fs.writeFile(filePath, data, 'utf-8');
}

/**
 * Example function: Make an HTTP request
 * Requires: network permission
 * @param {string} url - URL to fetch
 * @returns {Promise<object>} Response data
 */
export async function fetchData(url) {
  // In a real implementation, this would use the fetch API
  // The static analyzer checks for 'fetch', 'http.request', 'https.request'
  // and requires 'network' permission to allow them
  const response = await fetch(url);
  return response.json();
}

/**
 * Example function: Execute an external command
 * Requires: child_process permission
 * @param {string} command - Command to execute
 * @returns {Promise<string>} Command output
 */
export async function runCommand(command) {
  // In a real implementation, this would use child_process
  // The static analyzer checks for 'spawn', 'exec', 'execSync', etc.
  // and requires 'child_process' permission to allow them
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/**
 * Returns plugin metadata
 * @returns {Object} Plugin information
 */
export function getPluginInfo() {
  return { ...pluginInfo };
}

/**
 * Main plugin initialization
 * @param {Object} context - Plugin context with APIs
 * @returns {Object} Plugin exports
 */
export function initialize(context) {
  return {
    pluginInfo,
    readConfig,
    writeCache,
    fetchData,
    runCommand,
    getPluginInfo
  };
}

// Default export for compatibility
export default {
  pluginInfo,
  readConfig,
  writeCache,
  fetchData,
  runCommand,
  getPluginInfo,
  initialize
};