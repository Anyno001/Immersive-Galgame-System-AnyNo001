// 人类 CG 提示词基线：单人、双人、含 generic 路人三个场景，收集完整写词请求与最终出图请求。
// 改动前用 HEAD 源码取得快照固化到 fixtures/human-cg-baseline.json，之后任何改动都必须逐字一致。
import { createAutoIllustrationService } from './media-fixtures.js';
import { createIndexedDbIllustrationStore, floorKeyOf } from '../../src/media/illustration-store.js';
import { createTransactionalIdb } from './transactional-idb.js';
import { characterViewsFixture } from './prompt-provenance.js';
import { builtinImageHarness } from './builtin-image-harness.js';
import { secondaryLlmText } from '../../src/host/secondary-llm-result.js';

const scrub = (value) => JSON.parse(JSON.stringify(value, (key, item) => (key === 'seed' && typeof item === 'number' ? '<seed>' : item)));

const head = ['slotid: 1', 'at: 1', 'prompt_mode: dna_template', 'outfit_mode: template'];
const named = (index, key, token, frame, identity, outfitName, outfitDescription) => [
    `meta_kind: ${index} | named`, `meta_key: ${index} | ${key}`, `meta_token: ${index} | ${token}`, `meta_frame: ${index} | ${frame}`,
    `meta_identity: ${index} | ${identity}`, `meta_signature: ${index} |`,
    `meta_outfit_name: ${index} | ${outfitName}`, `meta_outfit_description: ${index} | ${outfitDescription}`, `meta_outfit_id: ${index} |`];

const SCENES = {
    single: {
        text: '[igs-scene:避难所|傍晚|阴]\nAlice在物资箱旁挥手。\n[igs-char:Alice|平静|你好。]',
        assets: { characters: {}, characterOutfits: {}, wardrobe: {}, characterDna: {
            Alice: { version: 2, identity: 'silver hair', views: characterViewsFixture('Alice, an adult woman with silver hair and blue eyes,') } } },
        reply: [...head, 'scene: A quiet shelter.', 'scene_uc: lowres',
            'char: 0.5,0.5 | <<dna:r0>> <<outfit:r0>> and waves.', 'char_uc: <<dna_uc:r0>>',
            ...named(0, 'Alice', 'r0', 'half_body', 'Alice, an adult woman,', 'Navy coat', 'wears a navy coat')],
    },
    double: {
        text: '[igs-scene:避难所|傍晚|阴]\nAlice把红书递给Bob。\n[igs-char:Alice|平静|给你。]\n[igs-char:Bob|平静|谢谢。]',
        assets: { characters: {}, characterOutfits: {}, wardrobe: {}, characterDna: {
            Alice: { version: 2, identity: 'silver hair', views: characterViewsFixture('Alice, an adult woman with silver hair and blue eyes,') } } },
        reply: [...head, 'scene: Two adults at a table.', 'scene_uc: lowres',
            'char: 0.3,0.5 | <<dna:r0>> <<outfit:r0>> and offers a red book.', 'char_uc: <<dna_uc:r0>>',
            'char: 0.7,0.5 | <<dna:r1>> <<outfit:r1>> and reaches for the book.', 'char_uc:',
            ...named(0, 'Alice', 'r0', 'half_body', 'Alice, an adult woman,', 'Navy coat', 'wears a navy coat'),
            ...named(1, 'Bob', 'r1', 'half_body', '1boy, adult, black hair, short hair, brown eyes,', 'Grey shirt', 'wears a grey shirt')],
    },
    generic: {
        text: '[igs-scene:街道|白天|晴]\nAlice穿过人群。\n[igs-char:Alice|平静|借过。]',
        assets: { characters: {}, characterOutfits: {}, wardrobe: {}, characterDna: {
            Alice: { version: 2, identity: 'silver hair', views: characterViewsFixture('Alice, an adult woman with silver hair and blue eyes,') } } },
        reply: [...head, 'scene: A busy street.', 'scene_uc: lowres',
            'char: 0.4,0.5 | <<dna:r0>> <<outfit:r0>> and walks forward.', 'char_uc:',
            'char: 0.8,0.5 | 1boy, adult, hat, brown coat, walking away.', 'char_uc:',
            ...named(0, 'Alice', 'r0', 'half_body', 'Alice, an adult woman,', 'Navy coat', 'wears a navy coat'),
            'meta_kind: 1 | generic'],
    },
    // 人类战斗对手带临时档（形态待判定，form=auto）：与没有档案时的 CG 必须完全一致。
    battleTagged: {
        text: '[igs-scene:山道|白天|晴]\n山贼拦住Alice。\n[igs-fx:battle|山贼|山贼]\n[igs-char:Alice|惊讶|站住？]\n[igs-char:山贼|愤怒|留下买路财。]',
        assets: { characters: {}, characterOutfits: {}, wardrobe: {}, characterDna: {
            Alice: { version: 2, identity: 'silver hair', views: characterViewsFixture('Alice, an adult woman with silver hair and blue eyes,') },
            山贼: { version: 2, identity: 'bandit', views: characterViewsFixture('1boy, adult, scarred face, short black hair,'),
                creature: { form: 'auto', size: 'medium', anchor: 'ground', temp: true, seenAt: 1 } } } },
        reply: [...head, 'scene: A mountain road.', 'scene_uc: lowres',
            'char: 0.3,0.5 | <<dna:r0>> <<outfit:r0>> and steps back.', 'char_uc:',
            'char: 0.7,0.5 | <<dna:r1>> <<outfit:r1>> and draws a knife.', 'char_uc:',
            ...named(0, 'Alice', 'r0', 'half_body', 'Alice, an adult woman,', 'Navy coat', 'wears a navy coat'),
            ...named(1, '山贼', 'r1', 'half_body', '1boy, adult, scarred face,', 'Brown vest', 'wears a brown leather vest')],
    },
    battleUntagged: {
        text: '[igs-scene:山道|白天|晴]\n山贼拦住Alice。\n[igs-fx:battle|山贼|山贼]\n[igs-char:Alice|惊讶|站住？]',
        assets: { characters: {}, characterOutfits: {}, wardrobe: {}, characterDna: {
            Alice: { version: 2, identity: 'silver hair', views: characterViewsFixture('Alice, an adult woman with silver hair and blue eyes,') },
            山贼: { version: 2, identity: 'bandit', views: characterViewsFixture('1boy, adult, scarred face, short black hair,'),
                creature: { form: 'auto', size: 'medium', anchor: 'ground', temp: true, seenAt: 1 } } } },
        reply: [...head, 'scene: A mountain road.', 'scene_uc: lowres',
            'char: 0.3,0.5 | <<dna:r0>> <<outfit:r0>> and steps back.', 'char_uc:',
            'char: 0.8,0.5 | 1boy, adult, scarred face, drawing a knife.', 'char_uc:',
            ...named(0, 'Alice', 'r0', 'half_body', 'Alice, an adult woman,', 'Navy coat', 'wears a navy coat'),
            'meta_kind: 1 | generic'],
    },
};

// 存档里的角色资料快照会原样带着 creature 档案字段（第一期起 DNA 保留它），那是元数据而非提示词；基线只比较提示词与绑定。
const withoutCreatureArchive = (snapshot) => snapshot && { ...snapshot, characters: snapshot.characters.map(({ profile, ...rest }) => {
    if (!profile) return rest;
    const { creature, ...others } = profile;
    return { ...rest, profile: others };
}) };

async function runScene(name) {
    const scene = SCENES[name];
    const assets = structuredClone(scene.assets);
    const h = builtinImageHarness({ reply: () => secondaryLlmText(scene.reply.join('\n')) });
    Object.assign(h.bridge.autoIllustration, { interludeEnabled: true, interludeMaxCount: 1 });
    let text = scene.text;
    const floor = () => ({ chatId: 'cg-baseline', messageId: 7, swipeId: 0, isAi: true, isLatest: true, text });
    const host = { getChatId: () => 'cg-baseline', readFloor: floor, readPreviousAiTexts: () => [],
        async writeFloor(_id, next) { text = next; return { ok: true }; }, on: () => () => {},
        attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {} };
    const store = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
    const service = createAutoIllustrationService({ nai: h.backend, llm: h.llm, store,
        messageHost: host, getSettings: () => h.bridge.autoIllustration, getSceneAssets: () => assets,
        report: () => {} });
    const result = await service.processMessage(7, { manual: true });
    const slots = await store.getSlots(floorKeyOf(floor()));
    const out = scrub({ ok: result.ok, reason: result.reason, count: result.count,
        writes: h.writes.map(w => ({ system: w.request.messages.find(m => m.role === 'system')?.content,
            messages: w.request.messages.map(m => ({ role: m.role, content: m.content })), input: w.input })),
        wires: h.wires, text,
        slots: slots.map(s => ({ slot: s.slot, status: s.status, caption: s.caption, promptRecipe: s.promptRecipe,
            characterMeta: s.characterMeta, outfitSnapshot: s.outfitSnapshot, dnaSnapshot: withoutCreatureArchive(s.dnaSnapshot) })) });
    h.dispose();
    return out;
}

export async function captureHumanCg() {
    const out = {};
    for (const name of Object.keys(SCENES)) out[name] = await runScene(name);
    return out;
}
