import assert from 'node:assert/strict';
import test from 'node:test';
import { claimDecide, COVERAGE_KEYS, runDiff } from '../scripts/scmj-diff.mjs';

const matches = Number(process.env.SCMJ_DIFF_MATCHES || 200);

test(`gate:scmj:factory-matches-original-${matches}`, async () => {
    const result = await runDiff({ matches, untilCovered: Math.max(matches, 2000) });
    assert.equal(result.ok, true, JSON.stringify({ missing: result.missing, at: result.at, seed: result.seed }));
    if (result.missing) assert.deepEqual(result.missing.filter((key) => COVERAGE_KEYS.includes(key)), []);
    console.log('scmj diff coverage', result.coverage);
    const tianhu = await runDiff({ matches: 1, seedBase: 1135, decide: claimDecide });
    assert.equal(tianhu.at, undefined, JSON.stringify({ at: tianhu.at, seed: tianhu.seed }));
    assert.ok(tianhu.coverage.tianhu >= 1);
    const dihu = await runDiff({ matches: 1, seedBase: 47, decide: claimDecide });
    assert.equal(dihu.at, undefined, JSON.stringify({ at: dihu.at, seed: dihu.seed }));
    assert.ok(dihu.coverage.dihu >= 1);
});
