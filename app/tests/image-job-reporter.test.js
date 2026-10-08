import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageJobReporter } from '../src/core/bootstrap.js';

function fakeToastr() {
    const calls = [];
    return { calls, success: (m) => calls.push(['success', m]), warning: (m) => calls.push(['warning', m]), error: (m) => calls.push(['error', m]) };
}

test('生图提示：阅读器开着时交给生成细线，不弹酒馆 toastr', () => {
    const toastr = fakeToastr();
    const seen = [];
    const report = createImageJobReporter({ toastr }, () => ({}), null, () => (level, message) => { seen.push([level, message]); return true; });
    report('success', '第 2 楼已生成 1 项素材，待确认');
    report('error', '素材「教室」生成失败：超时');
    assert.deepEqual(seen.map((item) => item[0]), ['success', 'error']);
    assert.equal(toastr.calls.length, 0);
});

test('生图提示：阅读器没开或细线出错时照旧弹 toastr', () => {
    const toastr = fakeToastr();
    const closed = createImageJobReporter({ toastr }, () => ({}), null, () => () => false);
    closed('error', '失败了');
    const broken = createImageJobReporter({ toastr }, () => ({}), null, () => { throw new ReferenceError('app'); });
    broken('success', '好了');
    assert.deepEqual(toastr.calls, [['error', '失败了'], ['success', '好了']]);
});
