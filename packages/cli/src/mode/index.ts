/**
 * Mode module exports
 * 
 * Provides dual-mode output handling:
 * - ModeSwitch: handles mode detection and switching
 * - OutputFormatter: handles formatted output for both modes
 */

export { ModeSwitch, OutputMode, createModeSwitch, createModeSwitchFromArgs } from './ModeSwitch';
export { OutputFormatter, createFormatter, createFormatterFromArgs } from './OutputFormatter';
export type { ModeSwitchOptions } from './ModeSwitch';
export type { FormatterOptions, OutputCategory } from './OutputFormatter';