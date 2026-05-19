/**
 * Data Processor Plugin
 * 
 * This plugin demonstrates plugin dependency management.
 * It depends on the logger-base plugin to provide logging functionality.
 * 
 * The plugin loader will:
 * 1. Parse the plugin.json and discover the dependency on logger-base
 * 2. Resolve the dependency order (logger-base must be loaded first)
 * 3. Load logger-base before loading data-processor
 * 4. Make the logger-base API available to this plugin
 */

// Plugin metadata
export const pluginInfo = {
  id: 'data-processor',
  name: 'Data Processor Plugin',
  version: '1.0.0',
  description: 'A plugin that depends on logger-base plugin'
};

// We'll store the logger API after it's injected by the plugin loader
let logger = null;

/**
 * Initialize the plugin with dependencies
 * The plugin loader will inject dependencies through this function
 * @param {Object} deps - Dependencies object containing loaded plugin modules
 */
export function initialize(deps) {
  // Get the logger-base plugin from dependencies
  logger = deps['logger-base'];
  
  if (logger) {
    logger.info('Data Processor Plugin initialized');
  } else {
    console.warn('logger-base dependency not available');
  }
}

/**
 * Process data with logging
 * @param {Array} data - Array of data items to process
 * @returns {Object} Processing result
 */
export function processData(data) {
  const result = {
    processed: [],
    count: 0,
    errors: []
  };

  if (!data || !Array.isArray(data)) {
    const errMsg = 'Invalid data: expected an array';
    if (logger) logger.error(errMsg);
    result.errors.push(errMsg);
    return result;
  }

  if (logger) {
    logger.info(`Processing ${data.length} items`);
  }

  for (const item of data) {
    try {
      // Simple processing: uppercase strings, double numbers
      let processed;
      if (typeof item === 'string') {
        processed = item.toUpperCase();
      } else if (typeof item === 'number') {
        processed = item * 2;
      } else {
        processed = item;
      }
      
      result.processed.push(processed);
      result.count++;
    } catch (err) {
      const errMsg = `Failed to process item: ${err.message}`;
      if (logger) logger.warn(errMsg);
      result.errors.push(errMsg);
    }
  }

  if (logger) {
    logger.info(`Processed ${result.count} items successfully`);
  }

  return result;
}

/**
 * Filter data based on a predicate function
 * @param {Array} data - Array of data items
 * @param {Function} predicate - Filter predicate function
 * @returns {Array} Filtered data
 */
export function filterData(data, predicate) {
  if (!logger) {
    console.warn('Logger not available, logging disabled');
  } else {
    logger.info('Filtering data with custom predicate');
  }

  const filtered = data.filter(predicate);
  
  if (logger) {
    logger.info(`Filtered ${data.length} items down to ${filtered.length}`);
  }

  return filtered;
}

/**
 * Aggregate data - sum numbers in the array
 * @param {Array} data - Array of data items
 * @returns {Object} Aggregation result
 */
export function aggregateData(data) {
  if (logger) {
    logger.info('Starting data aggregation');
  }

  const numbers = data.filter(item => typeof item === 'number');
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  const avg = numbers.length > 0 ? sum / numbers.length : 0;

  const result = {
    sum,
    average: avg,
    count: numbers.length
  };

  if (logger) {
    logger.info(`Aggregation complete: sum=${sum}, avg=${avg.toFixed(2)}`);
  }

  return result;
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
  initialize,
  processData,
  filterData,
  aggregateData,
  getPluginInfo
};