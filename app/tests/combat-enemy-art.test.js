// 与 v0.39.0 原版的差分测试：图集已安装时，enemyArtCell 的输出与原版一致；样式文本不再含 base64。
// 逻辑侧 src/combat/enemy-art.js 由其他窗口负责，这里用原版的输出生成查表垫片，只验证本模块的格子换算。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGINAL_PACKAGE = 'G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js';
const ENTRY = 'src/visual/igs-ui/combat-enemy-art.js';
const WORLDVIEWS = ['fantasy', 'magic', 'ancient', 'modern', 'scifi', '', undefined];

const REFERENCE_SCRIPT = `
const fs = require('fs');
require(${JSON.stringify(ORIGINAL_PACKAGE)});
const art = globalThis.__igsRequire('src/visual/igs-ui/combat-enemy-art.js');
const logic = globalThis.__igsRequire('src/combat/enemy-art.js');
const inputs = [];
for (const key of logic.ENEMY_ART_KEYS) inputs.push({ art: key });
for (const name of ['史莱姆', '哥布林', '李将军', '血魔女王', '无名', '', undefined]) for (const tier of ['normal', 'elite', 'boss', undefined]) inputs.push({ name, tier });
inputs.push({});
const keys = {}, cells = [];
for (const input of inputs) {
    keys[JSON.stringify(input)] = logic.enemyArtKeyFor(input);
    for (const worldview of ${JSON.stringify(WORLDVIEWS)}) cells.push({ input, worldview, cell: art.enemyArtCell({ ...input, worldview }), theme: art.enemyArtThemeOf(worldview) });
}
const style = art.COMBAT_ENEMY_ART_STYLE_TEXT;
fs.writeFileSync(process.argv[2], JSON.stringify({ allKeys: logic.ENEMY_ART_KEYS, base: logic.ENEMY_ART_BASE_COUNT, keys, cells, style }));
process.exit(0);
`;

// 沿相对 import 收集模块闭包，复制到临时目录。
function copyClosure(entry, target) {
    const seen = new Set();
    const visit = relative => {
        if (seen.has(relative)) return;
        seen.add(relative);
        const source = path.join(appRoot, relative);
        const text = fs.readFileSync(source, 'utf8');
        fs.mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
        fs.copyFileSync(source, path.join(target, relative));
        for (const match of text.matchAll(/(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/g)) {
            visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
        }
    };
    visit(entry);
    return seen;
}

const available = fs.existsSync(ORIGINAL_PACKAGE);
const normalizeOriginal = text => text.replace(/url\("data:image\/webp;base64,[A-Za-z0-9+/=]+"\)/g, 'url(ATLAS)');
const normalizeMine = text => text.replace(/var\(--igs-enemy-atlas-\w+\)/g, 'url(ATLAS)');

test('敌人图集 enemyArtCell 与 v0.39.0 原版一致（图集已安装）', { skip: !available && '未找到 v0.39.0 拆解包', timeout: 120000 }, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igs-enemy-art-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const referenceFile = path.join(dir, 'reference.json');
    const scriptFile = path.join(dir, 'reference.cjs');
    fs.writeFileSync(scriptFile, REFERENCE_SCRIPT);
    execFileSync(process.execPath, [scriptFile, referenceFile], { timeout: 100000, stdio: 'pipe' });
    const reference = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));

    const tree = path.join(dir, 'tree');
    copyClosure(ENTRY.replace('combat-enemy-art', 'combat-enemy-atlas'), tree);
    // 垫片：逻辑侧按原版输出查表，不重新实现。
    fs.mkdirSync(path.join(tree, 'src/combat'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(tree, 'src/combat/enemy-art.js'), `const keys = ${JSON.stringify(reference.keys)};
export const ENEMY_ART_KEYS = Object.freeze(${JSON.stringify(reference.allKeys)});
export const ENEMY_ART_BASE_COUNT = ${reference.base};
export const enemyArtKeyFor = input => keys[JSON.stringify(input ?? {})];
export const isEnemyArtTheme = value => typeof value === 'string' && ['western', 'urban', 'wuxia'].includes(value);
`);
    fs.copyFileSync(path.join(appRoot, ENTRY), path.join(tree, ENTRY));
    const load = file => import(pathToFileURL(path.join(tree, file)).href);
    const mine = await load(ENTRY);
    const atlas = await load('src/visual/igs-ui/combat-enemy-atlas.js');

    await t.test('已安装：格子与主题逐项一致', () => {
        atlas.setEnemyAtlas({ url: theme => `/user/images/igs-media/${theme}.webp` });
        let checked = 0;
        for (const { input, worldview, cell, theme } of reference.cells) {
            assert.deepEqual(mine.enemyArtCell({ ...input, worldview }), cell, JSON.stringify({ input, worldview }));
            assert.equal(mine.enemyArtThemeOf(worldview), theme);
            checked += 1;
        }
        assert.equal(checked, reference.cells.length);
        assert.ok(checked >= 200, `样本量 ${checked}`);
    });

    await t.test('样式文本归一后与原版一致（仅多出占位规则），且不含 base64', t2 => {
        const original = normalizeOriginal(reference.style).split('\n');
        const rules = normalizeMine(mine.COMBAT_ENEMY_ART_STYLE_TEXT).split('\n');
        const placeholder = rules.filter(line => line.includes('data-atlas="none"'));
        assert.equal(placeholder.length, 1);
        assert.deepEqual(rules.filter(line => !line.includes('data-atlas="none"')), original);
        assert.doesNotMatch(mine.COMBAT_ENEMY_ART_STYLE_TEXT, /base64/);
        const before = Buffer.byteLength(reference.style), after = Buffer.byteLength(mine.COMBAT_ENEMY_ART_STYLE_TEXT);
        assert.ok(after < 3000, `样式体积 ${after} 字节`);
        t2.diagnostic(`COMBAT_ENEMY_ART_STYLE_TEXT：原版 ${before} 字节，现在 ${after} 字节`);
        console.log(`样式体积：原版 ${before} 字节，现在 ${after} 字节`);
    });

    await t.test('样式不写死颜色，且不含内联图片', () => {
        const text = mine.COMBAT_ENEMY_ART_STYLE_TEXT;
        assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
        assert.doesNotMatch(text, /data:image\/webp/);
    });

    await t.test('未安装：返回中性占位，位置字段为零', () => {
        atlas.setEnemyAtlas(null);
        for (const { input, worldview } of reference.cells.slice(0, 40)) {
            assert.deepEqual(mine.enemyArtCell({ ...input, worldview }), { atlas: 'none', x: '0%', y: '0%' });
        }
        atlas.setEnemyAtlas({ url: () => '' });
        assert.equal(mine.enemyArtCell({ art: 'beast', worldview: 'fantasy' }).atlas, 'none');
    });

    await t.test('部分安装：只有已装主题显示图集，其余仍是占位', () => {
        atlas.setEnemyAtlas({ url: theme => (theme === 'western' ? '/user/images/igs-media/western.webp' : '') });
        assert.equal(mine.enemyArtCell({ art: 'beast', worldview: 'fantasy' }).atlas, 'western');
        assert.equal(mine.enemyArtCell({ art: 'grunt-m', worldview: 'ancient' }).atlas, 'none');
        atlas.setEnemyAtlas(null);
    });
});
