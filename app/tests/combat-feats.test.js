import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js");
const orig = globalThis.__igsRequire;
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const same = (a, b, msg) => assert.deepStrictEqual(a, b, msg);

import * as mine from "../src/combat/feats.js";
const old = orig("src/combat/feats.js");
test("feats 导出一致", () => { same(Object.keys(mine).sort(), Object.keys(old).sort()); same(mine.COMBAT_OVERKILL_HITS, old.COMBAT_OVERKILL_HITS); });
test("combatFeats 随机差分", () => {
  const r = prng(7); const pick = (a) => a[Math.floor(r() * a.length)];
  const types = ["damage","defeated","card","hero-skill","item","skill","awaken","other",null];
  for (let n = 0; n < 3000; n++) {
    const ev = Array.from({ length: Math.floor(r() * 16) }, (_, i) => {
      const type = pick(types); if (type === null) return pick([null, undefined]);
      return { type, unitId: pick(["a","b","c"]), target: pick(["a","b","c"]), kind: pick(["attack","skill"]), overkill: r() < 0.5, source: r() < 0.9 ? { unitId: pick(["a","b","c"]) } : undefined, hpLoss: pick([0,3,5]), amount: pick([3,5,8]), blocked: pick([undefined,0,3]), strike: r() < 0.5 ? "s" + Math.floor(r()*3) : undefined };
    });
    const sum = pick([{ outcome: "victory", units: { a:{side:"ally"}, b:{side:"enemy"}, c:{side:"enemy"} }, controlledId: pick(["a","b"]) }, { outcome: "defeat", units: {} }, null, {outcome:"victory"}]);
    same(mine.combatFeats(ev, sum), old.combatFeats(ev, sum));
  }
  same(mine.combatFeats(null, {outcome:"victory"}), old.combatFeats(null, {outcome:"victory"}));
  // 构造必中过量击杀
  const ev = [{type:"damage",target:"b",kind:"attack",source:{unitId:"a"},hpLoss:5,amount:5},{type:"defeated",unitId:"b"}, ...Array.from({length:6},(_, i)=>({type:"damage",overkill:true,source:{unitId:"a"},strike:"k"+i}))];
  const s = {outcome:"victory",units:{b:{side:"enemy"}},controlledId:"a"};
  same(mine.combatFeats(ev,s), old.combatFeats(ev,s)); assert.equal(mine.combatFeats(ev,s).length, 2);
});
