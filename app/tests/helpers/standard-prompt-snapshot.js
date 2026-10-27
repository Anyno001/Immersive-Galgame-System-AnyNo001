// 「标准」生图方案的文字快照：同一份取样逻辑既用来对 git HEAD 的旧源码生成基线，也用来核对现行源码。
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sha = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

const DNA = { identity: '1girl, black hair, brown eyes', defaultAppearance: 'white shirt, blue skirt' };
const CAPTION = {
    v4_prompt: { caption: { base_caption: 'solo, white background', char_captions: [{ char_caption: '1girl, smile', centers: [{ x: 0.5, y: 0.5 }] }] } },
    v4_negative_prompt: { caption: { base_caption: 'text', char_captions: [{ char_caption: 'blur' }] } },
};

export async function standardSnapshot(srcRoot) {
    const load = (path) => import(pathToFileURL(`${srcRoot}/${path}`).href);
    const [defaults, registry, dbgen, assetPrompt, spriteData, kit] = await Promise.all([
        load('generated-images/image-prompt-defaults.js'), load('generated-images/prompt-registry.js'),
        load('generated-images/dbgen-prompt.js'), load('generated-images/illustration/asset-prompt.js'),
        load('generated-images/illustration/sprite-data.js'), load('generated-images/illustration/prompt-kit.js')]);
    const out = {};
    const data = defaults.createDefaultImagePromptPreset().data;
    for (const block of data.prompts) out[`prompt:${block.identifier}`] = sha(block.content);
    for (const mod of data.modules) out[`module:${mod.identifier}`] = sha({ content: mod.content, contentByFormat: mod.contentByFormat });
    out.halfBodyRule = sha(registry.SPRITE_HALF_BODY_RULE);
    out.spriteWords = sha(registry.BUILTIN_PROMPTS.sprite);
    out.expressionWords = sha(registry.BUILTIN_PROMPTS.expression);
    out.legacyWriterSystem = sha(registry.DNA_TEMPLATE_WRITER_SYSTEM);
    out.legacySpriteDataRule = sha(spriteData.SPRITE_DATA_RULE);
    out.assetTemplates = sha(kit.DEFAULT_ASSET_TEMPLATES);
    const need = { type: 'sprite', name: '甲', outfitName: '裙' };
    out.descSpriteTemplate = sha(dbgen.buildCharacterSpriteDescription('甲', DNA, { template: true, note: '备注' }));
    out.descSprite = sha(dbgen.buildCharacterSpriteDescription('甲', DNA, { nude: true, transparent: false }));
    out.descBatchTemplate = sha(dbgen.buildDbgenSpriteBatchDescription([need, { name: '乙' }], { template: true }));
    out.descBatch = sha(dbgen.buildDbgenSpriteBatchDescription([need, { name: '乙', dna: DNA }], { transparent: false }));
    out.descAsset = sha(dbgen.buildDbgenAssetDescription(need, { transparent: true }));
    const outfit = { name: '裙', prompt: 'blue skirt' };
    out.descExpressionTemplate = sha(dbgen.buildExpressionDiffDescription('甲', null, ['开心', '惊讶'], DNA, outfit, { template: true, note: '备注' }));
    out.descExpressionNoDna = sha(dbgen.buildExpressionDiffDescription('甲', null, ['开心'], DNA, outfit, { includeDna: false }));
    out.descExpression = sha(dbgen.buildExpressionDiffDescription('甲', { caption: CAPTION }, ['开心'], DNA, outfit, {}));
    out.expressionPrompts = sha(dbgen.expressionSpritePrompts('solo, arms at sides, standing', 'text'));
    out.upright = sha(dbgen.uprightSpriteCaption(CAPTION));
    const item = { need: { type: 'sprite', name: '甲' }, tags: 'smile', uc: '' };
    out.slot = sha(assetPrompt.buildAssetSlot(item, { transparent: true }));
    out.slotWhite = sha(assetPrompt.buildAssetSlot(item, { whiteBackground: true, fixedSpritePrompts: true }));
    out.slotCustom = sha(assetPrompt.buildAssetSlot(item, { fixedSpritePrompts: true,
        templates: { sprite: '{tags}, custom, {matte}', spriteNegative: 'custom negative' } }));
    return out;
}
