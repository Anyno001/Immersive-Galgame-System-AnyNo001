import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { captureHumanBaseline } from './helpers/human-baseline-capture.js';

// 非人角色系统上线前固化的人类方案基线；人类提示词、写词请求和最终出图请求必须逐字一致。
// 仅在人类方案被有意修改时用 UPDATE_HUMAN_BASELINE=1 重写。
const FILE = new URL('./fixtures/human-prompt-baseline.json', import.meta.url);

test('人类立绘、差分、NSFW 差分、自动补全的提示词与基线逐字一致', async () => {
    const actual = await captureHumanBaseline();
    if (process.env.UPDATE_HUMAN_BASELINE === '1') writeFileSync(FILE, JSON.stringify(actual, null, 1));
    const expected = JSON.parse(readFileSync(FILE, 'utf8'));
    // 词库只允许新增键：基线里已有的键逐字相同。
    for (const key of Object.keys(expected.static.builtin)) assert.deepEqual(actual.static.builtin[key], expected.static.builtin[key], `builtin.${key}`);
    for (const section of Object.keys(expected)) {
        for (const key of Object.keys(expected[section])) {
            if (section === 'static' && key === 'builtin') continue;
            assert.deepEqual(actual[section][key], expected[section][key], `${section}.${key}`);
        }
    }
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
});
