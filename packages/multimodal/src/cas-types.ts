/**
 * CAS (Content-Addressable Storage) Types — Authoritative Entry
 *
 * This module is the single, normalized entry point for the CAS integration
 * surface required by Task 2.2 of the Multimodal spec. It re-exports the
 * canonical {@link BlobRef} type (template literal `blob://${string}`),
 * the {@link CASClient} interface (store / retrieve / exists), and a small
 * set of format-validation / construction helpers so that downstream
 * consumers (Ingestion, ModalityAdapter, Property 9 verification) only need
 * to depend on a single import path.
 *
 * Design:
 * - BlobRef is the template literal type `blob://${string}` (not a wider
 *   `string`), giving compile-time discrimination from arbitrary URLs.
 * - CASClient describes only what the V6.0 skeleton requires of a content
 *   store: deterministic addressing (store), retrieval (retrieve), and
 *   existence checks (exists). Concrete implementations live elsewhere.
 * - validateBlobRef performs structural format validation independent of any
 *   running CAS instance, so callers can reject malformed refs at the edge.
 *
 * Validates: Requirements 14.2, 30.9
 * Feature: multimodal, Property 9: CAS Content Addressing
 * Derived-From: v6-architecture-overview Property 9
 */

import { createBlobRef, extractHash, isBlobRef } from "./types/blob-ref.js";
import type { BlobRef } from "./types/blob-ref.js";
import {
  BlobNotFoundError,
  CASError,
  type CASClient,
} from "./cas/CASClient.js";

// ---------------------------------------------------------------------------
// Re-exports: canonical BlobRef + CASClient surface
// ---------------------------------------------------------------------------

export type { BlobRef, CASClient };
export { createBlobRef, extractHash, isBlobRef, BlobNotFoundError, CASError };

// ---------------------------------------------------------------------------
// Format validation
// ---------------------------------------------------------------------------

/**
 * SHA-256 produces a 256-bit digest, which is exactly 64 hex characters
 * when rendered in lowercase hexadecimal. A canonical BlobRef therefore has
 * the shape `blob://` followed by 64 lowercase hex characters.
 */
export const SHA256_HEX_LENGTH = 64;

/**
 * Regex describing a strictly-formed CAS BlobRef.
 * Anchored on both ends so partial matches (e.g. trailing whitespace) fail.
 */
export const BLOB_REF_PATTERN: RegExp = /^blob:\/\/[0-9a-f]{64}$/;

/**
 * Result of {@link validateBlobRef}.
 */
export interface BlobRefValidationResult {
  readonly valid: boolean;
  /** Present only when `valid === false`; describes why validation failed. */
  readonly reason?:
    | "not_a_string"
    | "missing_blob_prefix"
    | "wrong_hash_length"
    | "non_hex_characters";
}

/**
 * Strict format validation for a CAS blob reference.
 *
 * Unlike {@link isBlobRef}, which only checks the `blob://` prefix, this
 * function additionally verifies that the suffix is exactly 64 lowercase
 * hexadecimal characters — the canonical SHA-256 digest shape used by
 * Property 9.
 *
 * @param value - Candidate value (any type).
 * @returns Validation result with a machine-readable reason on failure.
 */
export function validateBlobRef(value: unknown): BlobRefValidationResult {
  if (typeof value !== "string") {
    return { valid: false, reason: "not_a_string" };
  }

  if (!value.startsWith("blob://")) {
    return { valid: false, reason: "missing_blob_prefix" };
  }

  const suffix = value.slice("blob://".length);

  if (suffix.length !== SHA256_HEX_LENGTH) {
    return { valid: false, reason: "wrong_hash_length" };
  }

  if (!/^[0-9a-f]+$/.test(suffix)) {
    return { valid: false, reason: "non_hex_characters" };
  }

  return { valid: true };
}

/**
 * Type-narrowing predicate for a strictly-formed BlobRef.
 *
 * Use this when callers want compile-time `BlobRef` narrowing combined with
 * the strict 64-hex format check (instead of the looser {@link isBlobRef}).
 */
export function isStrictBlobRef(value: unknown): value is BlobRef {
  return validateBlobRef(value).valid;
}
