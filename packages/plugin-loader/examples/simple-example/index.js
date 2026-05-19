/**
 * Simple Example Plugin
 * 
 * This is a minimal example plugin that demonstrates the basic plugin structure.
 * It exports a simple function and metadata about the plugin.
 */

// Plugin metadata
export const pluginInfo = {
  id: 'simple-example',
  name: 'Simple Example Plugin',
  version: '1.0.0',
  description: 'A simple example plugin demonstrating basic plugin structure'
};

/**
 * A simple greet function that the plugin provides
 * @param {string} name - The name to greet
 * @returns {string} A greeting message
 */
export function greet(name) {
  return `Hello, ${name}! Welcome to the Simple Example Plugin.`;
}

/**
 * Returns plugin metadata
 * @returns {Object} Plugin information
 */
export function getPluginInfo() {
  return { ...pluginInfo };
}

// Default export for compatibility
export default {
  pluginInfo,
  greet,
  getPluginInfo
};