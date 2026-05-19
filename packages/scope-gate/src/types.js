"use strict";
/**
 * Type definitions for Scope Gate module
 *
 * This file contains all TypeScript interfaces and types
 * for the Scope Gate module as defined in the design document.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationError = exports.DependencyError = exports.CapabilityUnavailableError = exports.ScopeBoundaryViolationError = exports.ScopeError = void 0;
class ScopeError extends Error {
    constructor(code, message, capabilityId, scopeTag, requiredFlag) {
        super(message);
        this.code = code;
        this.capabilityId = capabilityId;
        this.scopeTag = scopeTag;
        this.requiredFlag = requiredFlag;
        this.name = "ScopeError";
    }
}
exports.ScopeError = ScopeError;
/**
 * Error thrown when a scope boundary is violated (P1/P2 used in V6.0)
 */
class ScopeBoundaryViolationError extends ScopeError {
    constructor(capabilityId, scopeTag, requiredFlag) {
        const scopeLabel = scopeTag === "p1" ? "P1" : "P2";
        super("SCOPE_BOUNDARY_VIOLATION", `${scopeLabel} capability '${capabilityId}' is not available in V6.0 release branch. ${requiredFlag ? `Enable feature flag '${requiredFlag}' to use this capability.` : ""}`, capabilityId, scopeTag, requiredFlag);
        this.name = "ScopeBoundaryViolationError";
    }
}
exports.ScopeBoundaryViolationError = ScopeBoundaryViolationError;
/**
 * Error thrown when a required feature flag is not enabled
 */
class CapabilityUnavailableError extends ScopeError {
    constructor(capabilityId, scopeTag, requiredFlag) {
        super("CAPABILITY_UNAVAILABLE", `Capability '${capabilityId}' is currently unavailable. ${requiredFlag ? `Enable feature flag '${requiredFlag}' to use this capability.` : "Contact your administrator for access."}`, capabilityId, scopeTag, requiredFlag);
        this.name = "CapabilityUnavailableError";
    }
}
exports.CapabilityUnavailableError = CapabilityUnavailableError;
/**
 * Error thrown when a dependency constraint is violated
 */
class DependencyError extends ScopeError {
    constructor(capabilityId, dependencyId, scopeTag) {
        super("SCOPE_BOUNDARY_VIOLATION", `Capability '${capabilityId}' cannot be used because it depends on '${dependencyId}' which is ${scopeTag.toUpperCase()}`, capabilityId, scopeTag);
        this.name = "DependencyError";
        this.dependencyId = dependencyId;
    }
}
exports.DependencyError = DependencyError;
/**
 * Error thrown when scope configuration is invalid or missing
 */
class ConfigurationError extends ScopeError {
    constructor(message, capabilityId, configKey) {
        super("CAPABILITY_UNAVAILABLE", message, capabilityId, "p0" // Default to p0 for config errors
        );
        this.name = "ConfigurationError";
        if (configKey) {
            this.configKey = configKey;
        }
    }
}
exports.ConfigurationError = ConfigurationError;
//# sourceMappingURL=types.js.map