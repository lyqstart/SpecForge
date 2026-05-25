/**
 * Daemon Core types and interfaces
 */
/**
 * Daemon error class for structured error handling
 * Used by HTTPServer for global error handling
 */
export class DaemonError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.name = 'DaemonError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=types.js.map