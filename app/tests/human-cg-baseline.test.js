import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { captureHumanCg } from './helpers/human-cg-capture.js';

// 非人角色 CG 出镜上线前，用 HEAD 源码固化的人类 CG 基线（单人、双人、含 generic 路人）。
// 完整写词请求与最终出图请求必须逐字一致；仅在人类 CG 被有意修改时用 UPDATE_HUMAN_CG_BASELINE=1 重写。
const FILE = new URL('./fixtures/human-cg-baseline.json', import.meta.url);

test('人类 CG 的写词请求与最终出图请求与基线逐字一致', async () => {
    const actual = await captureHumanCg();
    if (process.env.UPDATE_HUMAN_CG_BASELINE === '1') writeFileSync(FILE, JSON.stringify(actual, null, 1));
    const expected = JSON.parse(readFileSync(FILE, 'utf8'));
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const scene of Object.keys(expected)) {
        for (const key of Object.keys(expected[scene])) assert.deepEqual(actual[scene][key], expected[scene][key], `${scene}.${key}`);
    }
});
