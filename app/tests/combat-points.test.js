import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js");
const orig = globalThis.__igsRequire;
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const same = (a, b, msg) => assert.deepStrictEqual(a, b, msg);

import * as mine from "../src/combat/points.js";
const old = orig("src/combat/points.js");
test("points 导出一致", () => {
  same(Object.keys(mine).sort(), Object.keys(old).sort());
  for (const k of Object.keys(old)) if (typeof old[k] !== "function") same(mine[k], old[k], k);
});
test("sellPrice 差分", () => {
  const r = prng(1);
  for (const rar of ["common","uncommon","rare","epic","mythic","basic",undefined,null,"x"])
    for (let i = 0; i < 40; i++) { const seed = [i, "s"+i, undefined, null, r()][i % 5]; same(mine.sellPrice(rar, seed), old.sellPrice(rar, seed)); }
});
