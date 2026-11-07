const {test}=require("node:test");const assert=require("node:assert/strict");const {salute}=require("../src/library.cjs");test("salute",()=>assert.equal(salute("Ada"),"hi Ada"));
