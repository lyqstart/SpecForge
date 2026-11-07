import {test} from "node:test";import assert from "node:assert/strict";import {sum} from "../src/esm.mjs";test("sum",()=>assert.equal(sum(2,3),5));
