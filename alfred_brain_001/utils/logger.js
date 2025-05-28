/**
 * Logger Utility
 * 
 * A simple logging utility that can be replaced with a more robust solution like Winston 
 * or Bunyan in the future.
 */

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

// Current log level from environment or default to INFO
const currentLevel = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : LOG_LEVELS.INFO;

/**
 * Format log message with timestamp and additional metadata
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 * @returns {string} - Formatted log message
 */
function formatLogMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  let formattedMeta = '';
  
  if (Object.keys(meta).length > 0) {
    try {
      formattedMeta = ' ' + JSON.stringify(meta);
    } catch (e) {
      formattedMeta = ' [Error serializing metadata]';
    }
  }
  
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedMeta}`;
}

/**
 * General purpose logging function
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} [meta] - Additional metadata
 */
function log(level, message, meta = {}) {
  const logLevel = LOG_LEVELS[level.toUpperCase()];
  
  if (logLevel <= currentLevel) {
    const formattedMessage = formatLogMessage(level, message, meta);
    
    switch (level.toUpperCase()) {
      case 'ERROR':
        console.error(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      case 'DEBUG':
        console.debug(formattedMessage);
        break;
      case 'INFO':
      default:
        console.log(formattedMessage);
        break;
    }
  }
}

// Export different log level functions
module.exports = {
  error: (message, meta = {}) => log('ERROR', message, meta),
  warn: (message, meta = {}) => log('WARN', message, meta),
  info: (message, meta = {}) => log('INFO', message, meta),
  debug: (message, meta = {}) => log('DEBUG', message, meta),
  
  // Allow changing log level programmatically
  setLogLevel: (level) => {
    if (LOG_LEVELS[level.toUpperCase()] !== undefined) {
      currentLevel = LOG_LEVELS[level.toUpperCase()];
    }
  }
};