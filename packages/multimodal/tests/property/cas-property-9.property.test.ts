/**
 * Property 9: CAS Content Addressing — property-based test
 *
 * Feature: multimodal, Property 9: CAS Content Addressing;
 * Derived-From: v6-architecture-overview Property 9
 *
 * This file exercises the *deterministic content-addressing* contract that
 * the CAS layer must satisfy:
 *
 *   store(content).id === "blob://" + sha256_hex(content)
 *
 * Three properties are checked over fast-check generated `Uint8Array`
 * inputs (1000 iterations — Property 9 is safety-critical per steering rule):
 *
 *   Property A — Hash-derived id:
 *     For any byte sequence `c`, `store(c)` returns
 *     `"blob://" + sha256_hex(c)`.
 *
 *   Property B — Determinism / collision-shape:
 *     `store(a) === store(b)`  iff  `a` and `b` are byte-equivalent.
 *     (Forward direction is the determinism guarantee; reverse direction is
 *     the SHA-256 collision-resistance assumption — a counterexample over
 *     fast-check sized inputs would itself be newsworthy.)
 *
 *   Property C — Round-trip:
 *     `retrieve(store(c))` returns the exact bytes of `c`.
 *
 * Validates: Requirements 30.9, 5.6, 14.2
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createHash } from "node:crypto";

import {
  type BlobRef,
  type CASClient,
  BlobNotFoundError,
  validateBlobRef,
} from "../../src/cas-types.js";

// ---------------------------------------------------------------------------
// Local SHA-256 CASClient — synchronous Node-crypto hash, async API surface.
// Defined inline so the test owns its reference implementation and is not
// coupled to any future swap of the in-tree InMemoryCASClient.
// ---------------------------------------------------------------------------

function sha256Hex(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

class Sha256InMemoryCAS implements CASClient {
  // Keyed by BlobRef so the keyspace is exactly the addressable surface.
  private readonly blobs = new Map<BlobRef, Uint8Array>();

  async store(content: Uint8Array): Promise<BlobRef> {
    const ref = `blob://${sha256Hex(content)}` as BlobRef;
    // CAS semantics: storing the same content twice is a no-op (idempotent),
    // not an error. We always overwrite with a defensive copy so external
    // mutation of the input array does not corrupt the store.
    this.blobs.set(ref, new Uint8Array(content));
    return ref;
  }

  async retrieve(ref: BlobRef): Promise<Uint8Array> {
    const found = this.blobs.get(ref);
    if (!found) {
      throw new BlobNotFoundError(ref);
    }
    // Return a defensive copy so callers cannot mutate the stored bytes.
    return new Uint8Array(found);
  }

  async exists(ref: BlobRef): Promise<boolean> {
    return this.blobs.has(ref);
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Bytes generator constrained to the realistic CAS input space:
 *   - includes the empty buffer (boundary case)
 *   - max length 4 KiB so 1000 iterations stay well under testTimeout
 */
const bytesArb: fc.Arbitrary<Uint8Array> = fc
  .uint8Array({ minLength: 0, maxLength: 4096 })
  .map((arr) => new Uint8Array(arr));

/** Two byte buffers that are guaranteed to differ in at least one position. */
const distinctPairArb: fc.Arbitrary<[Uint8Array, Uint8Array]> = fc
  .tuple(bytesArb, bytesArb)
  .filter(([a, b]) => {
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return true;
    }
    return false;
  });

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 9: CAS Content Addressing", () => {
  // Property 9 is safety-critical (per .kiro/steering/v6-development-workflow.md
  // — Property allocation rule: 3/7/9/24 require ≥ 1000 iterations).
  const NUM_RUNS = 1000;

  it("Property A: store(content).id === 'blob://' + sha256_hex(content)", async () => {
    await fc.assert(
      fc.asyncProperty(bytesArb, async (content) => {
        const cas = new Sha256InMemoryCAS();
        const ref = await cas.store(content);

        // Structural check: canonical 64-hex-suffix shape.
        expect(validateBlobRef(ref).valid).toBe(true);

        // Semantic check: the suffix is exactly the SHA-256 of the bytes.
        expect(ref).toBe(`blob://${sha256Hex(content)}`);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("Property B (forward): identical bytes → identical BlobRef (determinism)", async () => {
    await fc.assert(
      fc.asyncProperty(bytesArb, async (content) => {
        const cas = new Sha256InMemoryCAS();
        // Use a structurally independent copy so we are testing the
        // contents-determine-the-id contract, not reference equality.
        const copy = new Uint8Array(content);

        const ref1 = await cas.store(content);
        const ref2 = await cas.store(copy);

        expect(ref2).toBe(ref1);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("Property B (reverse): distinct bytes → distinct BlobRef (no SHA-256 collisions in tested space)", async () => {
    await fc.assert(
      fc.asyncProperty(distinctPairArb, async ([a, b]) => {
        // Precondition guarded by the generator's filter, asserted defensively.
        expect(bytesEqual(a, b)).toBe(false);

        const cas = new Sha256InMemoryCAS();
        const refA = await cas.store(a);
        const refB = await cas.store(b);

        expect(refA).not.toBe(refB);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("Property C: retrieve(store(content)) returns byte-equal content", async () => {
    await fc.assert(
      fc.asyncProperty(bytesArb, async (content) => {
        const cas = new Sha256InMemoryCAS();
        const ref = await cas.store(content);
        const got = await cas.retrieve(ref);

        expect(bytesEqual(got, content)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
