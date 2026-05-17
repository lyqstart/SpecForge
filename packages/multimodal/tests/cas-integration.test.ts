/**
 * CAS Integration Tests
 * 
 * Tests for CAS (Content Addressable Storage) integration including:
 * - computeSHA256 hash function
 * - verifyBlobRef verification helper
 * - verifyIdenticalContentProducesIdenticalRef
 * - verifyDifferentContentProducesDifferentRef
 * - Helper utilities (generateRandomContent, stringToUint8Array, uint8ArrayToString)
 * 
 * Note: InMemoryCASClient from property-9-helpers.ts has a naming conflict 
 * (store property vs store method). Using our own implementation for testing.
 * 
 * Validates: Requirements 14.2, 30.9
 * Feature: multimodal, Property 9: CAS Content Addressing
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  computeSHA256,
  verifyBlobRef,
  verifyIdenticalContentProducesIdenticalRef,
  verifyDifferentContentProducesDifferentRef,
  generateRandomContent,
  stringToUint8Array,
  uint8ArrayToString,
} from "../src/cas/property-9-helpers.js";
import { createBlobRef, extractHash, isBlobRef } from "../src/types/blob-ref.js";
import type { BlobRef } from "../src/types/blob-ref.js";

// Separate test implementation to avoid naming conflict in original
class TestCASClient {
  private blobs = new Map<string, Uint8Array>();
  
  async store(content: Uint8Array): Promise<BlobRef> {
    const hash = await computeSHA256(content);
    const ref = createBlobRef(hash);
    this.blobs.set(hash, new Uint8Array(content));
    return ref;
  }
  
  async retrieve(ref: BlobRef): Promise<Uint8Array> {
    const hash = extractHash(ref);
    const content = this.blobs.get(hash);
    if (!content) {
      throw new Error(`Blob not found: ${ref}`);
    }
    return new Uint8Array(content);
  }
  
  async exists(ref: BlobRef): Promise<boolean> {
    const hash = extractHash(ref);
    return this.blobs.has(hash);
  }
}

describe("computeSHA256", () => {
  it("should compute correct SHA-256 hash for empty array", async () => {
    const content = new Uint8Array(0);
    const hash = await computeSHA256(content);
    
    // SHA-256 of empty string
    const expected = createHash("sha256").update("").digest("hex");
    expect(hash).toBe(expected);
  });

  it("should compute correct SHA-256 hash for known content", async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = await computeSHA256(content);
    
    const expected = createHash("sha256").update(Buffer.from([1, 2, 3, 4, 5])).digest("hex");
    expect(hash).toBe(expected);
  });

  it("should produce 64-character hex string", async () => {
    const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const hash = await computeSHA256(content);
    
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("should be deterministic - same content yields same hash", async () => {
    const content = new Uint8Array([10, 20, 30, 40]);
    
    const hash1 = await computeSHA256(content);
    const hash2 = await computeSHA256(content);
    
    expect(hash1).toBe(hash2);
  });

  it("should produce different hashes for different content", async () => {
    const content1 = new Uint8Array([1, 2, 3]);
    const content2 = new Uint8Array([1, 2, 4]);
    
    const hash1 = await computeSHA256(content1);
    const hash2 = await computeSHA256(content2);
    
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyBlobRef", () => {
  it("should return true for correct blob ref", async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = await computeSHA256(content);
    const blobRef = createBlobRef(hash);
    
    const result = await verifyBlobRef(content, blobRef);
    expect(result).toBe(true);
  });

  it("should return false for incorrect blob ref", async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const wrongHash = "a".repeat(64);
    const wrongBlobRef = createBlobRef(wrongHash);
    
    const result = await verifyBlobRef(content, wrongBlobRef);
    expect(result).toBe(false);
  });

  it("should return false for invalid blob ref format", async () => {
    const content = new Uint8Array([1, 2, 3]);
    
    // Invalid format - missing blob:// prefix
    const result = await verifyBlobRef(content, "invalid-ref" as BlobRef);
    expect(result).toBe(false);
  });

  it("should verify Property 9: store(content).id === blob:// + sha256(content)", async () => {
    const testCases = [
      new Uint8Array(0),  // empty
      new Uint8Array([1]),
      new Uint8Array([1, 2, 3, 4, 5]),
      new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256)),
    ];
    
    for (const content of testCases) {
      const expectedHash = await computeSHA256(content);
      const blobRef = createBlobRef(expectedHash);
      
      const result = await verifyBlobRef(content, blobRef);
      expect(result).toBe(true);
    }
  });
});

describe("verifyIdenticalContentProducesIdenticalRef", () => {
  it("should return true for identical content arrays", () => {
    const content1 = new Uint8Array([1, 2, 3, 4]);
    const content2 = new Uint8Array([1, 2, 3, 4]);
    const content3 = new Uint8Array([1, 2, 3, 4]);
    
    const contents = [content1, content2, content3];
    const refs: BlobRef[] = [
      "blob://" + "a".repeat(64),
      "blob://" + "a".repeat(64),
      "blob://" + "a".repeat(64),
    ];
    
    expect(verifyIdenticalContentProducesIdenticalRef(contents, refs)).toBe(true);
  });

  it("should return false for different refs with same content count", () => {
    const content1 = new Uint8Array([1, 2, 3]);
    const content2 = new Uint8Array([1, 2, 3]);
    
    const contents = [content1, content2];
    const refs: BlobRef[] = [
      "blob://" + "a".repeat(64),
      "blob://" + "b".repeat(64),
    ];
    
    expect(verifyIdenticalContentProducesIdenticalRef(contents, refs)).toBe(false);
  });

  it("should return false for empty arrays", () => {
    const contents: Uint8Array[] = [];
    const refs: BlobRef[] = [];
    
    expect(verifyIdenticalContentProducesIdenticalRef(contents, refs)).toBe(false);
  });

  it("should return false for mismatched array lengths", () => {
    const contents = [new Uint8Array([1, 2, 3])];
    const refs: BlobRef[] = [
      "blob://" + "a".repeat(64),
      "blob://" + "a".repeat(64),
    ];
    
    expect(verifyIdenticalContentProducesIdenticalRef(contents, refs)).toBe(false);
  });
});

describe("verifyDifferentContentProducesDifferentRef", () => {
  it("should return true for different content with different refs", () => {
    const content1 = new Uint8Array([1, 2, 3]);
    const content2 = new Uint8Array([4, 5, 6]);
    
    const contents = [content1, content2];
    const refs: BlobRef[] = [
      "blob://" + "a".repeat(64),
      "blob://" + "b".repeat(64),
    ];
    
    expect(verifyDifferentContentProducesDifferentRef(contents, refs)).toBe(true);
  });

  it("should return false for same refs with different content", () => {
    const content1 = new Uint8Array([1, 2, 3]);
    const content2 = new Uint8Array([4, 5, 6]);
    
    const contents = [content1, content2];
    const refs: BlobRef[] = [
      "blob://" + "a".repeat(64),
      "blob://" + "a".repeat(64),
    ];
    
    expect(verifyDifferentContentProducesDifferentRef(contents, refs)).toBe(false);
  });

  it("should return false for less than 2 content items", () => {
    const contents = [new Uint8Array([1, 2, 3])];
    const refs: BlobRef[] = ["blob://" + "a".repeat(64)];
    
    expect(verifyDifferentContentProducesDifferentRef(contents, refs)).toBe(false);
  });

  it("should return false for empty arrays", () => {
    const contents: Uint8Array[] = [];
    const refs: BlobRef[] = [];
    
    expect(verifyDifferentContentProducesDifferentRef(contents, refs)).toBe(false);
  });

  it("should return false for mismatched array lengths", () => {
    const contents = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
    const refs: BlobRef[] = ["blob://" + "a".repeat(64)];
    
    expect(verifyDifferentContentProducesDifferentRef(contents, refs)).toBe(false);
  });
});

describe("TestCASClient (integration with helpers)", () => {
  let client: TestCASClient;
  
  beforeEach(() => {
    client = new TestCASClient();
  });

  it("should store content and return BlobRef", async () => {
    const content = new Uint8Array([1, 2, 3, 4, 5]);
    const ref = await client.store(content);
    
    expect(ref).toMatch(/^blob:\/\/[0-9a-f]{64}$/);
  });

  it("should retrieve stored content", async () => {
    const content = new Uint8Array([10, 20, 30, 40, 50]);
    const ref = await client.store(content);
    
    const retrieved = await client.retrieve(ref);
    
    expect(Array.from(retrieved)).toEqual(Array.from(content));
  });

  it("should throw error when retrieving non-existent blob", async () => {
    const fakeRef = createBlobRef("b".repeat(64));
    
    await expect(client.retrieve(fakeRef)).rejects.toThrow("Blob not found");
  });

  it("should return true for exists() after store", async () => {
    const content = new Uint8Array([1, 2, 3]);
    const ref = await client.store(content);
    
    expect(await client.exists(ref)).toBe(true);
  });

  it("should return false for exists() with non-existent ref", async () => {
    const fakeRef = createBlobRef("c".repeat(64));
    
    expect(await client.exists(fakeRef)).toBe(false);
  });

  it("should store identical content at same ref (idempotent)", async () => {
    const content = new Uint8Array([1, 2, 3, 4]);
    
    const ref1 = await client.store(content);
    const ref2 = await client.store(content);
    
    expect(ref1).toBe(ref2);
  });

  it("should store different content at different refs", async () => {
    const content1 = new Uint8Array([1, 2, 3]);
    const content2 = new Uint8Array([4, 5, 6]);
    
    const ref1 = await client.store(content1);
    const ref2 = await client.store(content2);
    
    expect(ref1).not.toBe(ref2);
  });

  it("should follow Property 9: store(content).id === blob:// + sha256(content)", async () => {
    const testCases = [
      new Uint8Array(0),
      new Uint8Array([1]),
      new Uint8Array([255, 254, 253]),
      generateRandomContent(1024),
    ];
    
    for (const content of testCases) {
      const ref = await client.store(content);
      const expectedHash = await computeSHA256(content);
      
      expect(ref).toBe(`blob://${expectedHash}`);
    }
  });

  it("should support round-trip: store then retrieve", async () => {
    const originalContent = generateRandomContent(500);
    
    const ref = await client.store(originalContent);
    const retrieved = await client.retrieve(ref);
    
    expect(Array.from(retrieved)).toEqual(Array.from(originalContent));
  });
});

describe("Helper utilities", () => {
  describe("generateRandomContent", () => {
    it("should generate content of specified size", () => {
      const content = generateRandomContent(100);
      expect(content).toHaveLength(100);
    });

    it("should generate different content each call", () => {
      const content1 = generateRandomContent(100);
      const content2 = generateRandomContent(100);
      
      // Very high probability of being different (256^100 difference)
      expect(Array.from(content1)).not.toEqual(Array.from(content2));
    });

    it("should handle size 0", () => {
      const content = generateRandomContent(0);
      expect(content).toHaveLength(0);
    });
  });

  describe("stringToUint8Array", () => {
    it("should convert string to Uint8Array", () => {
      const str = "Hello, World!";
      const result = stringToUint8Array(str);
      
      expect(result).toBeInstanceOf(Uint8Array);
      expect(uint8ArrayToString(result)).toBe(str);
    });

    it("should handle empty string", () => {
      const result = stringToUint8Array("");
      expect(result).toHaveLength(0);
    });

    it("should handle Unicode characters", () => {
      const str = "你好世界🌍";
      const result = stringToUint8Array(str);
      
      expect(uint8ArrayToString(result)).toBe(str);
    });
  });

  describe("uint8ArrayToString", () => {
    it("should convert Uint8Array to string", () => {
      const original = "Test string 123";
      const encoded = stringToUint8Array(original);
      const decoded = uint8ArrayToString(encoded);
      
      expect(decoded).toBe(original);
    });

    it("should handle empty array", () => {
      const result = uint8ArrayToString(new Uint8Array(0));
      expect(result).toBe("");
    });
  });
});

describe("CAS Integration: Full Property 9 verification flow", () => {
  it("should satisfy all Property 9 requirements in a complete flow", async () => {
    const client = new TestCASClient();
    
    // Generate test content
    const content1 = generateRandomContent(100);
    const content2 = generateRandomContent(100);
    const content1Copy = new Uint8Array(content1);
    
    // Property A: store(content).id === "blob://" + sha256(content)
    const ref1 = await client.store(content1);
    const ref1Copy = await client.store(content1Copy);
    const expectedHash = await computeSHA256(content1);
    expect(ref1).toBe(`blob://${expectedHash}`);
    expect(ref1Copy).toBe(`blob://${expectedHash}`);
    
    // Property B (forward): identical bytes → identical BlobRef
    expect(ref1).toBe(ref1Copy);
    
    // Property B (reverse): distinct bytes → distinct BlobRef
    const ref2 = await client.store(content2);
    expect(ref1).not.toBe(ref2);
    
    // Property C: retrieve(store(content)) returns byte-equal content
    const retrieved = await client.retrieve(ref1);
    expect(Array.from(retrieved)).toEqual(Array.from(content1));
    
    // Verify using helper functions
    expect(await verifyBlobRef(content1, ref1)).toBe(true);
    expect(await verifyBlobRef(content2, ref2)).toBe(true);
    
    // Verify identical/different content produces identical/different refs
    expect(verifyIdenticalContentProducesIdenticalRef(
      [content1, content1Copy], 
      [ref1, ref1Copy]
    )).toBe(true);
    
    expect(verifyDifferentContentProducesDifferentRef(
      [content1, content2], 
      [ref1, ref2]
    )).toBe(true);
  });
});