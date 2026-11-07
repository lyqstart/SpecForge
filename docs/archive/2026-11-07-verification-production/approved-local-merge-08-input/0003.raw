// TASK-WI-0001-003 / DD-CORE-006: A1–A4 行为断言套件
import { test } from "node:test"
import assert from "node:assert/strict"
import { greet } from "../src/greet.ts"

test("A1: greet('Ada') strictly equals 'Hello, Ada!'", () => {
  assert.strictEqual(greet("Ada"), "Hello, Ada!")
})

test("A2: greet('Grace') strictly equals 'Hello, Grace!'", () => {
  assert.strictEqual(greet("Grace"), "Hello, Grace!")
})

test("A3: greet('') strictly equals 'Hello, world!'", () => {
  assert.strictEqual(greet(""), "Hello, world!")
})

test("A4: greet('  ') strictly equals 'Hello, ' + name + '!' form", () => {
  const name = "  "
  assert.strictEqual(greet(name), "Hello, " + name + "!")
})
