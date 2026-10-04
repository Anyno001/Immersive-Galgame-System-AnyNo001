import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAssetZipEntries } from '../src/scene/asset-zip.js';
import { buildImageZip } from '../src/scene/card-pack.js';

test('asset-zip: 角色与场景按目录列出，空地址跳过', () => {
    const assets = {
        characters: { 小明: { 平和: 'igs-gen:a', 开心: '' } },
        statusAvatars: { 小明: 'igs-gen:av' },
        characterOutfits: { 小明: { 校服: { base: 'igs-gen:b', moods: { 害羞: 'https://x/c.png' } } } },
        scenes: { '教室/1': { url: 'igs-gen:s', times: { 黄昏: { url: 'igs-gen:t', weathers: { 雨: 'igs-gen:w' } } } }, 海边: '' },
    };
    assert.deepEqual(collectAssetZipEntries(assets, 'characters', ['小明']).map((e) => e.path),
        ['角色/小明/平和', '角色/小明/头像', '角色/小明/校服/底图', '角色/小明/校服/害羞']);
    assert.deepEqual(collectAssetZipEntries(assets, 'scenes', ['教室/1', '海边']).map((e) => e.path),
        ['场景/教室_1', '场景/教室_1/黄昏', '场景/教室_1/黄昏-雨']);
});

test('asset-zip: 打包时读不到的图计入 skipped，同名自动加序号', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const zip = buildImageZip([{ path: '场景/a', dataUrl: png }, { path: '场景/a', dataUrl: png }, { path: '场景/b', dataUrl: '' }]);
    assert.equal(zip.count, 2);
    assert.equal(zip.skipped, 1);
    assert.equal(zip.bytes[0], 0x50);
    const text = new TextDecoder().decode(zip.bytes);
    assert.ok(text.includes('场景/a.png') && text.includes('场景/a-2.png'));
    assert.equal(buildImageZip([]).bytes, null);
});
