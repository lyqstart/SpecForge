/**
 * @specforge/observability - Observability module for SpecForge V6
 * 
 * This module provides comprehensive monitoring, logging, and analysis capabilities
 * to achieve the North Star goal: "5 minutes from problem occurrence to root cause identification."
 */

export * from './types/index.js';
export { EventBus } from './event-bus/index.js';
export { CAS, CASAdapter, createCAS } from './cas/index.js';
export { EventLogger } from './event-logger/index.js';
export { QueryAPI } from './query-api/index.js';
export { AnalystEngine } from './analyst-engine/index.js';
export { ModeSwitch, filterByMode, configureMode, getEffectiveMode, resetModeConfig, processPayloadByMode } from './mode-switch/index.js';
export type { ObservabilityMode } from './mode-switch/index.js';
export { SfAnalyst, createSfAnalyst } from './sf-analyst/index.js';
export type { 
  SfAnalystConfig, 
  AnalysisRequest, 
  ScheduledAnalysis, 
  AnalysisReport, 
  AnalystDataAccess 
} from './sf-analyst/index.js';

// North Star validation
export * from './north-star/index.js';