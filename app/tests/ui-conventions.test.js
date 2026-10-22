import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 只锁跨功能共用、源码里真实存在的界面约定；单个功能的渲染细节不在这里维护。
const ROOT = new URL('../src/', import.meta.url);
function sources(dir = ROOT, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (entry.name !== 'vendor' && entry.name !== 'dice-system') sources(new URL(entry.name + '/', dir), acc);
        } else if (entry.name.endsWith('.js')) {
            const url = new URL(entry.name, dir);
            acc.push({ file: path.basename(url.pathname), text: fs.readFileSync(url, 'utf8') });
        }
    }
    return acc;
}
const files = sources();

test('设置页二级折叠：igs-settings-sub 必须同时用 igs-settings-advanced 样式并带 data-advanced 记忆展开', () => {
    const folds = files.flatMap(({ file, text }) => [...text.matchAll(/<details\b[^>]*class=\\?"([^"\\]*)[^>]*/g)]
        .filter(m => m[1].split(/\s+/).includes('igs-settings-sub'))
        .map(m => ({ file, tag: m[0] })));
    assert.ok(folds.length > 0, '源码中应存在设置页二级折叠');
    for (const { file, tag } of folds) {
        assert.ok(/\bigs-settings-advanced\b/.test(tag), `${file}: ${tag.slice(0, 80)}`);
        assert.ok(/data-advanced=/.test(tag), `${file}: ${tag.slice(0, 80)}`);
    }
});

test('折叠样式只用设置页语义变量，不写死颜色', () => {
    const style = files.find(f => f.file === 'settings-style.js');
    assert.ok(style, 'settings-style.js 存在');
    const rules = [...style.text.matchAll(/details\.igs-settings-advanced[^{]*\{[^}]*\}/g)].map(m => m[0]);
    assert.ok(rules.length > 0, '存在 details.igs-settings-advanced 样式');
    assert.ok(rules.some(r => /::-webkit-details-marker\{display:none/.test(r)), '隐藏原生折叠三角');
    assert.ok(rules.some(r => /var\(--igs-settings-/.test(r)), '使用 --igs-settings-* 变量');
    for (const rule of rules) assert.equal(/#[0-9a-f]{3,8}\b/i.test(rule), false, rule.slice(0, 120));
});
