/**
 * Unit tests for cas-types.ts — BlobRef format validation + CASClient contract.
 *
 * Covers Task 2.2 deliverable:
 *   1) BlobRef format / construction tests
 *   2) CASClient interface contract tests against a minimal in-memory impl
 *
 * Validates: Requirements 14.2, 30.9
 * Feature: multimodal, Property 9: CAS Content Addressing
 */

import { describe, it, expect } from "vitest";
import {
  type BlobRef,
  type CASClient,
  BLOB_REF_PATTERN,
  BlobNotFoundError,
  SHA256_HEX_LENGTH,
  createBlobRef,
  extractHash,
  isBlobRef,
  isStrictBlobRef,
  validateBlobRef,
} from "../src/cas-types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const HEX_64_A = "a".repeat(SHA256_HEX_LENGTH);
const HEX_64_B = "0123456789abcdef".repeat(4); // 64 hex chars
const VALID_REF_A: BlobRef = `blob://${HEX_64_A}`;
const VALID_REF_B: BlobRef = `blob://${HEX_64_B}`;

/**
 * Minimal in-memory CASClient implementation used purely for contract testing.
 *
 * Note: this fake intentionally does NOT compute SHA-256 — the contract test
 * exercises the *interface shape* (store returns a BlobRef, retrieve mirrors
 * it, exists is consistent). Property 9's real-hash check is the subject of
 * Task 3.1, not this task.
 */
class FakeInMemoryCAS implements CASClient {
  private readonly store_ = new Map<BlobRef, Uint8Array>();
  private counter = 0;

  async store(content: Uint8Array): Promise<BlobRef> {
    // Deterministic-ish synthetic ref so we can also assert "same content,
    // same ref" without bringing in subtle.crypto in this contract test.
    const key = this.synthRef(content);
    this.store_.set(key, content);
    return key;
  }

  async retrieve(ref: BlobRef): Promise<Uint8Array> {
    const found = this.store_.get(ref);
    if (!found) {
      throw new BlobNotFoundError(ref);
    }
    return found;
  }

  async exists(ref: BlobRef): Promise<boolean> {
    return this.store_.has(ref);
  }

  private synthRef(content: Uint8Array): BlobRef {
    // Combine length + first/last byte + a stable rolling sum for a quick
    // collision-resistant-enough fingerprint, then pad/truncate to 64 hex.
    let sum = content.length & 0xff;
    for (const b of content) sum = (sum * 31 + b) >>> 0;
    const fp = sum.toString(16).padStart(8, "0");
    const padded = (fp + "0".repeat(SHA256_HEX_LENGTH)).slice(0, SHA256_HEX_LENGTH);
    this.counter += 0; // keep counter in case future variants need uniqueness
    return `blob://${padded}` as BlobRef;
  }
}

// ---------------------------------------------------------------------------
// BlobRef format tests
// ---------------------------------------------------------------------------

describe("BlobRef format", () => {
  it("createBlobRef builds a `blob://<hash>` value", () => {
    expect(createBlobRef(HEX_64_A)).toBe(VALID_REF_A);
  });

  it("isBlobRef accepts any string starting with `blob://` (loose check)", () => {
    expect(isBlobRef(VALID_REF_A)).toBe(true);
    // loose check: only prefix matters
    expect(isBlobRef("blob://not-hex")).toBe(true);
    expect(isBlobRef("http://example.com")).toBe(false);
    expect(isBlobRef(null)).toBe(false);
    expect(isBlobRef(undefined)).toBe(false);
    expect(isBlobRef(42)).toBe(false);
  });

  it("extractHash returns the hex suffix", () => {
    expect(extractHash(VALID_REF_A)).toBe(HEX_64_A);
    expect(extractHash(VALID_REF_B)).toBe(HEX_64_B);
  });
});

describe("validateBlobRef (strict)", () => {
  it("accepts canonical 64-hex refs", () => {
    expect(validateBlobRef(VALID_REF_A)).toEqual({ valid: true });
    expect(validateBlobRef(VALID_REF_B)).toEqual({ valid: true });
  });

  it("rejects non-strings with reason=not_a_string", () => {
    for (const v of [null, undefined, 0, 1, true, {}, []]) {
      expect(validateBlobRef(v)).toEqual({
        valid: false,
        reason: "not_a_string",
      });
    }
  });

  it("rejects strings missing the blob:// prefix", () => {
    expect(validateBlobRef("http://example.com")).toEqual({
      valid: false,
      reason: "missing_blob_prefix",
    });
    expect(validateBlobRef(HEX_64_A)).toEqual({
      valid: false,
      reason: "missing_blob_prefix",
    });
    expect(validateBlobRef("")).toEqual({
      valid: false,
      reason: "missing_blob_prefix",
    });
  });

  it("rejects refs with the wrong hash length", () => {
    expect(validateBlobRef("blob://abc")).toEqual({
      valid: false,
      reason: "wrong_hash_length",
    });
    expect(validateBlobRef(`blob://${"a".repeat(63)}`)).toEqual({
      valid: false,
      reason: "wrong_hash_length",
    });
    expect(validateBlobRef(`blob://${"a".repeat(65)}`)).toEqual({
      valid: false,
      reason: "wrong_hash_length",
    });
  });

  it("rejects refs with non-hex characters in the suffix", () => {
    // 64 chars but contains 'g' (not hex) and an uppercase 'A'
    const bad1 = `blob://${"g".repeat(64)}`;
    const bad2 = `blob://${"A".repeat(64)}`; // strict: lowercase only
    expect(validateBlobRef(bad1)).toEqual({
      valid: false,
      reason: "non_hex_characters",
    });
    expect(validateBlobRef(bad2)).toEqual({
      valid: false,
      reason: "non_hex_characters",
    });
  });

  it("BLOB_REF_PATTERN matches valid refs and only valid refs", () => {
    expect(BLOB_REF_PATTERN.test(VALID_REF_A)).toBe(true);
    expect(BLOB_REF_PATTERN.test(VALID_REF_B)).toBe(true);
    expect(BLOB_REF_PATTERN.test("blob://abc")).toBe(false);
    expect(BLOB_REF_PATTERN.test(`blob://${"A".repeat(64)}`)).toBe(false);
    expect(BLOB_REF_PATTERN.test(`blob://${HEX_64_A} `)).toBe(false); // trailing space
  });

  it("isStrictBlobRef narrows to BlobRef on valid input only", () => {
    expect(isStrictBlobRef(VALID_REF_A)).toBe(true);
    expect(isStrictBlobRef("blob://abc")).toBe(false);
    expect(isStrictBlobRef(123)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CASClient contract tests (interface shape, not Property 9)
// ---------------------------------------------------------------------------

describe("CASClient contract", () => {
  it("store returns a BlobRef in canonical shape", async () => {
    const cas: CASClient = new FakeInMemoryCAS();
    const ref = await cas.store(new Uint8Array([1, 2, 3]));
    expect(typeof ref).toBe("string");
    expect(ref.startsWith("blob://")).toBe(true);
    // The synthetic implementation is engineered to emit valid 64-hex refs.
    expect(validateBlobRef(ref).valid).toBe(true);
  });

  it("exists is true after store, false for unknown refs", async () => {
    const cas: CASClient = new FakeInMemoryCAS();
    const stored = await cas.store(new Uint8Array([1, 2, 3]));
    await expect(cas.exists(stored)).resolves.toBe(true);

    const unknown: BlobRef = `blob://${"f".repeat(64)}`;
    await expect(cas.exists(unknown)).resolves.toBe(false);
  });

  it("retrieve round-trips the exact stored bytes", async () => {
    const cas: CASClient = new FakeInMemoryCAS();
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    const ref = await cas.store(original);
    const got = await cas.retrieve(ref);
    expect(Array.from(got)).toEqual(Array.from(original));
  });

  it("retrieve throws BlobNotFoundError for unknown refs", async () => {
    const cas: CASClient = new FakeInMemoryCAS();
    const unknown: BlobRef = `blob://${"d".repeat(64)}`;
    await expect(cas.retrieve(unknown)).rejects.toBeInstanceOf(
      BlobNotFoundError,
    );
  });

  it("storing identical content yields identical refs (deterministic addressing)", async () => {
    const cas: CASClient = new FakeInMemoryCAS();
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3, 4]);
    const refA = await cas.store(a);
    const refB = await cas.store(b);
    expect(refA).toBe(refB);
  });

  it("storing different content yields different refs", async () => {
    const cas: CASClient = new FakeInMemoryCAS();
    const refA = await cas.store(new Uint8Array([1, 2, 3]));
    const refB = await cas.store(new Uint8Array([9, 9, 9]));
    expect(refA).not.toBe(refB);
  });
});
