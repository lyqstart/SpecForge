/**
 * Tool Translator
 *
 * Converts tool call parameters between OpenCode and Daemon formats.
 */

import { OpenCodeToolCall, OpenCodeToolResult, TranslationResult, DaemonToolCall, DaemonToolResult, IToolTranslator } from '../types';

/**
 * Tool Translator
 *
 * Converts tool call parameters between OpenCode and Daemon formats.
 * Handles tool result translation and tool call error translation.
 */
export class ToolTranslator implements IToolTranslator {
  /**
   * Check if a string is valid (not null, undefined, or whitespace-only)
   */
  private isValidString(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    return value.trim().length > 0;
  }

  /**
   * Translate OpenCode tool call to Daemon tool call
   *
   * @param ocToolCall - OpenCode tool call
   * @param sessionId - Optional session ID
   * @returns Translation result with Daemon tool call or unsupported indicator
   */
  translateToolCall(
    ocToolCall: OpenCodeToolCall,
    sessionId?: string
  ): TranslationResult<DaemonToolCall> {
    // Validate required fields
    if (!this.isValidString(ocToolCall.name)) {
      return {
        success: false,
        unsupported: true,
        reason: 'Missing required field: name',
      };
    }

    if (!ocToolCall.arguments) {
      return {
        success: false,
        unsupported: true,
        reason: 'Missing required field: arguments',
      };
    }

    // Translate to Daemon format
    const daemonToolCall: DaemonToolCall = {
      name: ocToolCall.name,
      arguments: ocToolCall.arguments,
      callId: ocToolCall.id || `call-${Date.now()}`,
      sessionId,
    };

    return { success: true, data: daemonToolCall };
  }

  /**
   * Translate OpenCode tool result to Daemon tool result
   *
   * @param ocToolResult - OpenCode tool result
   * @param sessionId - Optional session ID
   * @returns Translation result with Daemon tool result or unsupported indicator
   */
  translateToolResult(
    ocToolResult: OpenCodeToolResult,
    sessionId?: string
  ): TranslationResult<DaemonToolResult> {
    // Validate required fields
    if (!this.isValidString(ocToolResult.call_id)) {
      return {
        success: false,
        unsupported: true,
        reason: 'Missing required field: call_id',
      };
    }

    // Translate to Daemon format
    const daemonToolResult: DaemonToolResult = {
      callId: ocToolResult.call_id,
      result: ocToolResult.result,
      error: ocToolResult.error,
      sessionId,
    };

    return { success: true, data: daemonToolResult };
  }

  /**
   * Check if a tool name is supported (basic validation)
   *
   * @param toolName - Tool name to check
   * @returns Whether the tool name appears valid
   */
  isToolSupported(toolName: string): boolean {
    return this.isValidString(toolName);
  }
}
