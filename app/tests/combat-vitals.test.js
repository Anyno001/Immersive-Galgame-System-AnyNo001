import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js");
const orig = globalThis.__igsRequire;
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const same = (a, b, msg) => assert.deepStrictEqual(a, b, msg);

import * as mine from "../src/combat/vitals.js";
const old = orig("src/combat/vitals.js");
test("vitals 导出一致", () => { same(Object.keys(mine).sort(), Object.keys(old).sort()); same(mine.HERO_BASE_HP, old.HERO_BASE_HP); same(mine.HERO_BASE_ARCHETYPE, old.HERO_BASE_ARCHETYPE); });
test("vitals 差分", () => {
  const r = prng(3); const pick = (a) => a[Math.floor(r() * a.length)];
  for (let n = 0; n < 1500; n++) {
    const attrs = pick([undefined, null, {}, { mods: { con: Math.floor(r()*7)-3, dex: Math.floor(r()*7)-3 }, level: pick([0,1,5,20,"3",undefined]), relTagged: r()<0.5, tier: pick(["outclassed","weaker","even","stronger","formidable","zzz"]) }]);
    const profile = pick([undefined, {}, { tier: pick(["support","peer","ace","legend","bad"]), base: { hp: Math.floor(r()*200), speed: pick([undefined, 90, 130]) } }]);
    const ch = { kind: pick(["deck-character","npc"]), id: pick(["x","y"]), hpMax: Math.floor(r()*120), profile: { base: { hp: 1 + Math.floor(r()*150), speed: pick([undefined, 77]) }, tier: pick(["support","peer","ace","legend","bad",undefined]) }, classProfile: pick([undefined, { archetype: pick(["mage","bard","zz"]) }]), attributes: attrs };
    same(mine.allyTierOf(profile), old.allyTierOf(profile)); same(mine.skillTierFor(ch), old.skillTierFor(ch));
    same(mine.characterCombatStats(ch), old.characterCombatStats(ch));
    const hp = 1 + Math.floor(r()*300), sp = 40 + Math.floor(r()*100);
    same(mine.applyAbilities(hp, sp, attrs), old.applyAbilities(hp, sp, attrs));
    same(mine.heroBaseStats(attrs), old.heroBaseStats(attrs)); same(mine.heroBaseStats(attrs, "q"), old.heroBaseStats(attrs, "q"));
    const saved = pick([undefined, null, { down: true }, { hp: Math.floor(r()*80), maxHp: 80 }, { hp: 90, maxHp: 80 }]);
    same(mine.vitalsOf(hp, saved), old.vitalsOf(hp, saved));
  }
  same(mine.allyTierOf(), old.allyTierOf());
});
