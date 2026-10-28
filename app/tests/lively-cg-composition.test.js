import test from 'node:test';
import assert from 'node:assert/strict';
import {
    spriteSchemeOf, livelyCgLines, identityFillLines, LIVELY_TASK_TEXT, LIVELY_CG_COMPOSITION, LIVELY_BACKGROUND_DAYLIGHT,
} from '../src/generated-images/prompt-scheme.js';
import { createLivelyImagePromptPreset, createDefaultImagePromptPreset } from '../src/generated-images/image-prompt-defaults.js';
import { buildCharacterSpriteDescription } from '../src/generated-images/dbgen-prompt.js';
import { writeTemplateCaptionsWithLlm } from '../src/generated-images/illustration/caption-writer.js';
import { editImagePromptField } from '../src/visual/igs-ui/settings-image-prompt-fields.js';

const lively = (extra = {}) => spriteSchemeOf({ spriteScheme: 'lively', ...extra });

test('灵动 CG主体缺省为角色、补标签缺省关闭；标准方案不带这两项', () => {
    assert.equal(lively().cgSubject, 'character');
    assert.equal(lively().tagFill, false);
    assert.equal(lively({ cgSubject: 'user', tagFill: true }).cgSubject, 'user');
    assert.equal(lively({ cgSubject: '乱写', tagFill: 'yes' }).cgSubject, 'character');
    assert.equal(lively({ tagFill: 'yes' }).tagFill, false);
    const std = spriteSchemeOf({ cgSubject: 'user', tagFill: true });
    assert.equal(std.id, 'standard');
    assert.equal(std.tagFill, false);
    const data = createLivelyImagePromptPreset().data;
    assert.equal(data.cgSubject, undefined);
    assert.equal(data.tagFill, undefined);
});

test('CG 追加句：标准为空；灵动按主体取句，补标签与 NSFW 各自开关', () => {
    assert.deepEqual(livelyCgLines(spriteSchemeOf({}), { nsfw: true, userName: '林' }), []);
    const [character] = livelyCgLines(lively(), { userName: '林' });
    assert.match(character, /User（林）/);
    assert.match(character, /User 默认弱化/);
    assert.match(character, /pov hands/);
    const [user] = livelyCgLines(lively({ cgSubject: 'user' }));
    assert.match(user, /User（用户扮演的角色） 是画面主体/);
    assert.equal(livelyCgLines(lively()).length, 1);
    assert.equal(livelyCgLines(lively({ tagFill: true })).length, 2);
    const nsfw = livelyCgLines(lively(), { nsfw: true });
    assert.equal(nsfw.length, 2);
    assert.match(nsfw[1], /按 NSFW 画/);
    assert.equal(livelyCgLines(lively(), { nsfw: 'true' }).length, 1);
});

test('灵动 CG 模块含构图正文，NSFW 与主体规则不进预设正文（提示词页看不到）', () => {
    const cg = LIVELY_TASK_TEXT.cg['dna-template'];
    assert.ok(cg.includes(LIVELY_CG_COMPOSITION));
    assert.ok(cg.indexOf(LIVELY_CG_COMPOSITION) < cg.indexOf('【交付前逐图核对】'));
    assert.match(cg, /能用 Danbooru 标签准确表达的优先用标签/);
    assert.doesNotMatch(cg, /不逐词翻译 tag/);
    for (const preset of [createLivelyImagePromptPreset(), createDefaultImagePromptPreset()]) {
        const text = JSON.stringify(preset.data);
        assert.doesNotMatch(text, /NSFW 楼层|按 NSFW 画|【CG 主体】|【补标签】|bishoujo/);
    }
    assert.doesNotMatch(JSON.stringify(createDefaultImagePromptPreset().data), /# 构图决策/);
});

test('补标签只在灵动且开启时进入立绘身份写词', () => {
    assert.deepEqual(identityFillLines(lively()), []);
    assert.deepEqual(identityFillLines(spriteSchemeOf({ tagFill: true })), []);
    assert.equal(identityFillLines(lively({ tagFill: true })).length, 1);
    const off = buildCharacterSpriteDescription('甲', null, { scheme: lively() });
    const on = buildCharacterSpriteDescription('甲', null, { scheme: lively({ tagFill: true }) });
    assert.doesNotMatch(off, /【补标签】/);
    assert.match(on, /【补标签】.*bishoujo/);
    assert.match(buildCharacterSpriteDescription('甲', null, { template: true, scheme: lively({ tagFill: true }) }), /【补标签】/);
});

test('CG 写词：灵动预设把追加句放进本次资料，标准预设原样', async () => {
    const run = async (data, cgHints) => {
        let seen = null;
        const llm = {
            request() {},
            runImageTask: (meta, execute) => execute(meta, { state: { promptPreset: { data } } }),
            prepareImagePrompt: async (_task, input) => { seen = input.description; return { ok: false, reason: 'stop' }; },
        };
        const result = await writeTemplateCaptionsWithLlm(llm, {}, { imagePromptTask: 'cg', description: '正文',
            promptTask: { version: 1, mode: 'dna_template', purpose: 'cg', characters: [] }, characterContext: [],
            ...(cgHints && { cgHints }) });
        assert.equal(result.ok, false);
        return seen;
    };
    assert.equal(await run({}), '正文');
    const plain = await run({ spriteScheme: 'lively' }, { userName: '林' });
    assert.match(plain, /^【CG 主体】与 User（林）/);
    assert.match(plain, /\n正文$/);
    const nsfw = await run({ spriteScheme: 'lively', cgSubject: 'user', tagFill: true }, { nsfw: true });
    assert.equal(nsfw.split('\n').length, 4);
    assert.match(nsfw, /【NSFW 楼层】/);
});

test('灵动背景只多一句白天光色规则，其余与标准逐字相同', () => {
    const mod = preset => preset.data.modules.find(m => m.task === 'background');
    const std = mod(createDefaultImagePromptPreset()), liv = mod(createLivelyImagePromptPreset());
    for (const format of ['caption-slots', 'asset-plan']) {
        assert.equal(liv.contentByFormat[format].split(LIVELY_BACKGROUND_DAYLIGHT).join(''), std.contentByFormat[format], format);
        assert.ok(liv.contentByFormat[format].includes(`区分固有颜色与光照。${LIVELY_BACKGROUND_DAYLIGHT}`), format);
        assert.doesNotMatch(std.contentByFormat[format], /natural daylight/);
    }
    assert.equal(liv.content, std.content);
});

test('提示词页字段：CG主体只收角色/User，补标签只收布尔值', () => {
    const editor = { preset: { data: { spriteScheme: 'lively' } } };
    const at = field => JSON.stringify(['data', '', field]);
    assert.equal(editImagePromptField(editor, at('cgSubject'), 'user').ok, true);
    assert.equal(editor.preset.data.cgSubject, 'user');
    assert.equal(editImagePromptField(editor, at('cgSubject'), 'boss').ok, false);
    assert.equal(editImagePromptField(editor, at('tagFill'), true).ok, true);
    assert.equal(editor.preset.data.tagFill, true);
    assert.equal(editImagePromptField(editor, at('tagFill'), 'on').ok, false);
});
