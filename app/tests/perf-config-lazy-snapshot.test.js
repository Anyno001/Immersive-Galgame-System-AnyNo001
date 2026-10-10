import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createIgsCompatApi } from '../src/api/igs-compat.js';

test('gate:perf:compat-getConfig-uses-app-getConfig-not-getState', () => {
    let stateCalls = 0;
    const config = { a: { b: 1 } };
    const app = { getConfig: () => config, getState: () => { stateCalls += 1; return { config }; }, igsUi: null };
    const copy = createIgsCompatApi(app).getConfig();
    assert.deepEqual(copy, config);
    assert.notEqual(copy.a, config.a, 'external caller still gets an independent copy');
    assert.equal(stateCalls, 0, 'getState (deep snapshot) is not touched');
    // 没有 getConfig 的旧 app 仍走 getState。
    const legacy = { getState: () => { stateCalls += 1; return { config }; }, igsUi: null };
    assert.deepEqual(createIgsCompatApi(legacy).getConfig(), config);
    assert.equal(stateCalls, 1);
});

test('gate:perf:bootstrap-exposes-getConfig-and-reader-snapshot-is-lazy', () => {
    const boot = fs.readFileSync(new URL('../src/core/bootstrap.js', import.meta.url), 'utf8');
    assert.match(boot, /function getConfig\(\) \{\s*return state\.config;/);
    const host = fs.readFileSync(new URL('../src/visual/igs-ui/reader-host.js', import.meta.url), 'utf8');
    assert.equal((host.match(/snapshot: lazySnapshotCopy\(/g) || []).length, 2, 'openReader and replaceReader both return a lazy snapshot');
    assert.match(host, /get\(\) \{\s*if \(!done\) \{ copy = cloneSnapshotKeepAssets\(source\)/);
});
