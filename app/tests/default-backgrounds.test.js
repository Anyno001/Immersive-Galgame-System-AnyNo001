import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_BACKGROUND_FOLDERS, DEFAULT_BACKGROUND_PACK } from '../src/backgrounds/default-background-pack.js';
import { mergeDefaultBackgrounds } from '../src/backgrounds/merge-default-backgrounds.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('gate:backgrounds:default-pack-names-and-aliases-are-unique-and-clean', () => {
    assert.ok(DEFAULT_BACKGROUND_PACK.length >= 70);
    const owner = new Map();
    for (const item of DEFAULT_BACKGROUND_PACK) {
        assert.ok(DEFAULT_BACKGROUND_FOLDERS.includes(item.folder), `folder of ${item.name}`);
        for (const term of [item.name, ...item.words]) {
            assert.ok(!/李|白家|白府|哪吒|兰台|镜川|402/.test(term), `play trace in ${term}`);
            assert.ok(!owner.has(term) || owner.get(term) === item.name, `duplicate term ${term}`);
            owner.set(term, item.name);
        }
    }
});

test('gate:backgrounds:default-pack-images-exist-as-local-webp', () => {
    const urls = DEFAULT_BACKGROUND_PACK.flatMap((item) => [item.url, ...Object.values(item.times || {})]);
    assert.equal(new Set(urls).size, urls.length);
    for (const url of urls) {
        assert.ok(url.startsWith('file:'), `source build resolves to a local file: ${url}`);
        assert.ok(!url.includes('rollconsole'), 'no third-party image host');
        const file = fileURLToPath(url);
        assert.ok(file.startsWith(path.join(appRoot, 'assets', 'backgrounds')), file);
        const head = fs.readFileSync(file).subarray(0, 12);
        assert.equal(head.toString('latin1', 0, 4), 'RIFF');
        assert.equal(head.toString('latin1', 8, 12), 'WEBP');
    }
});

test('gate:backgrounds:merge-adds-all-into-empty-library-with-scene-shape', () => {
    const { scenes, added, skipped } = mergeDefaultBackgrounds(undefined);
    assert.equal(added.length, DEFAULT_BACKGROUND_PACK.length);
    assert.equal(skipped.length, 0);
    const withTimes = DEFAULT_BACKGROUND_PACK.find((item) => item.times && Object.keys(item.times).length);
    const scene = scenes[withTimes.name];
    assert.equal(scene.url, withTimes.url);
    for (const [time, url] of Object.entries(withTimes.times)) assert.deepEqual(scene.times[time], { url, weathers: {} });
    assert.deepEqual(scene.words, [...withTimes.words]);
});

test('gate:backgrounds:merge-never-overwrites-and-drops-colliding-aliases', () => {
    const [first, second] = DEFAULT_BACKGROUND_PACK;
    const userScene = { url: 'https://example.invalid/mine.png', times: {}, words: [second.words[0]] };
    const input = { [first.name]: userScene, '我的场景': { url: 'x', times: {}, words: [second.words[0]] } };
    delete input[first.name];
    input[first.name] = userScene;
    const before = JSON.stringify(input);
    const { scenes, added, skipped } = mergeDefaultBackgrounds(input);
    assert.equal(JSON.stringify(input), before, 'input is not mutated');
    assert.ok(skipped.includes(first.name));
    assert.equal(scenes[first.name], userScene, 'existing scene kept as-is');
    assert.ok(added.some((a) => a.name === second.name));
    assert.ok(!(scenes[second.name].words || []).includes(second.words[0]), 'alias already used by user is dropped');
    const again = mergeDefaultBackgrounds(scenes);
    assert.equal(again.added.length, 0, 'second merge is a no-op');
});

test('gate:backgrounds:merge-skips-pack-item-whose-name-is-a-user-alias', () => {
    const target = DEFAULT_BACKGROUND_PACK[2];
    const { skipped, scenes } = mergeDefaultBackgrounds({ '自定义': { url: 'x', times: {}, words: [target.name] } });
    assert.ok(skipped.includes(target.name));
    assert.ok(!Object.prototype.hasOwnProperty.call(scenes, target.name));
});
