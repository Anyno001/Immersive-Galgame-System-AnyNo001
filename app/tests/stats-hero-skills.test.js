import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_SKILLS, CORE_SKILL_NAMES } from '../src/scene/stats/stat-registry.js';
import { createEngine, heroSkillLevel, profileOf, PROTAGONIST } from '../src/scene/stats/stat-engine.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { buildHeroSkillRequest, parseHeroSkillReply, HERO_TIER_LIMITS } from '../src/scene/stats/stat-sheets.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { sanitizeCatalog, emptyCatalog } from '../src/scene/stats/stat-persist.js';
import { statsArchiveModel } from '../src/scene/stats/stat-archive.js';
import { createStatsLedger } from '../src/scene/stats/stat-ledger.js';
import { DEFAULT_STAT_PROMPTS } from '../src/scene/stats/stat-prompt.js';
import { readStatsSettings } from '../src/scene/stats/stat-settings.js';

const FLAT = { readAbilities: () => ({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }) };
const engineOf = (catalog = {}) => createEngine(catalog, {}, 'coc7', FLAT);

test('注册表：新增 12 项都市技能，基础值取官方表，别名不与其他技能冲突', () => {
    const added = { 电脑: 5, 图书馆: 20, 乔装: 5, 妙手: 10, 投掷: 20, 法律: 5, 财务: 5, 外语: 1, 估价: 5, 电子学: 1, 跳跃: 20, 追踪: 10 };
    const engine = engineOf();
    for (const [name, base] of Object.entries(added)) {
        assert.ok(CORE_SKILL_NAMES.includes(name), name);
        assert.equal(profileOf(engine, createStatsState(), PROTAGONIST, name).value, base, name);
    }
    const seen = new Map();
    for (const [name, entry] of Object.entries(BUILTIN_SKILLS)) for (const alias of entry.aliases || []) {
        assert.ok(!BUILTIN_SKILLS[alias], `${alias} 与技能名重复`);
        if (name in added) assert.ok(!seen.has(alias), `${alias} 别名重复`);
        seen.set(alias, name);
    }
    assert.equal(engine.registry.resolve('编程'), '电脑');
});

test('heroSkillLevel：手改 > 账本 > 底数；成长叠加在手改值上', () => {
    const engine = engineOf({ protagonistBase: { 格斗: 60 }, protagonistEdit: { 格斗: { value: 70, from: 0 }, 侦查: { value: 40, from: 50 } } });
    assert.equal(heroSkillLevel(engine, null, '射击'), null);
    assert.equal(heroSkillLevel(engine, null, '格斗'), 70);
    assert.equal(heroSkillLevel(engine, { value: 55 }, '格斗'), 125 > 99 ? 99 : 125);
    assert.equal(heroSkillLevel(engine, { value: 55 }, '侦查'), 45);
    assert.equal(heroSkillLevel(engine, { value: 30 }, '侦查'), 40);
    assert.equal(heroSkillLevel(engineOf({ protagonistBase: { 格斗: 60 } }), { value: 52 }, '格斗'), 52);
    assert.equal(heroSkillLevel(engineOf({ protagonistBase: { 格斗: 60 } }), null, '格斗'), 60);
});

test('profileOf：底数与手改使技能视为已学，未配置的走基础值', () => {
    const state = createStatsState();
    const engine = engineOf({ protagonistBase: { 法律: 55 }, protagonistEdit: { 电脑: { value: 33, from: 0 } } });
    const law = profileOf(engine, state, PROTAGONIST, '法律');
    assert.equal(law.value, 55);
    assert.equal(law.learned, true);
    assert.equal(profileOf(engine, state, PROTAGONIST, '电脑').value, 33);
    const other = profileOf(engine, state, PROTAGONIST, '财务');
    assert.equal(other.value, 5);
    assert.equal(other.learned, false);
});

test('分配回复解析：名额限制按回复顺序降档，数字项丢弃，清单外技能忽略', () => {
    const skills = ['格斗', '射击', '侦查', '聆听', '心理学', '潜行', '闪避', '攀爬', '急救', '驾驶', '开锁', '电脑'];
    const reply = JSON.stringify({ 格斗: '大师', 射击: '大师', 侦查: '精通', 聆听: '精通', 心理学: '精通', 潜行: '85', 闪避: '熟练', 不存在: '大师', 电脑: '未学' });
    const r = parseHeroSkillReply(reply, { skills });
    assert.equal(r.ok, true);
    assert.equal(r.tiers.格斗, '大师');
    assert.equal(r.tiers.射击, '精通');
    assert.equal(r.tiers.侦查, '精通');
    assert.equal(r.tiers.聆听, '熟练');
    assert.equal(r.tiers.心理学, '熟练');
    assert.equal(r.tiers.闪避, '熟练');
    assert.ok(!('潜行' in r.tiers) && !('不存在' in r.tiers) && !('电脑' in r.tiers));
    const flood = Object.fromEntries(skills.map((s) => [s, '入门']));
    const counts = Object.values(parseHeroSkillReply(JSON.stringify(flood), { skills }).tiers).length;
    assert.equal(counts, HERO_TIER_LIMITS.入门);
    assert.equal(parseHeroSkillReply('没有 JSON', { skills }).ok, false);
    assert.equal(parseHeroSkillReply(JSON.stringify({ 格斗: '未学' }), { skills }).ok, false);
});

test('分配请求使用设置里的提示词，默认文案已登记', () => {
    assert.ok(DEFAULT_STAT_PROMPTS.heroSkills.includes('大师至多 1 项'));
    const req = buildHeroSkillRequest([{ name: '主角', summary: '退伍军人' }], ['格斗', '射击'], { prompt: '自定义' });
    assert.equal(req.system, '自定义');
    assert.ok(req.user.includes('格斗、射击') && req.user.includes('退伍军人'));
    const stored = readStatsSettings({ promptsVersion: 3, prompts: { heroSkills: '我的提示词' } });
    assert.equal(stored.prompts.heroSkills, '我的提示词');
});

test('存档：手改覆盖层与分配标记经键值记录往返，非法值被丢弃', () => {
    const catalog = { ...emptyCatalog(), protagonistBase: { 格斗: 60 }, protagonistEdit: { 电脑: { value: 40, from: 12 } }, heroAssigned: true };
    const back = restoreChat(chatEntries({ chatEnabled: true, catalog })).catalog;
    assert.deepEqual(back.protagonistEdit, { 电脑: { value: 40, from: 12 } });
    assert.equal(back.heroAssigned, true);
    assert.deepEqual(back.protagonistBase, { 格斗: 60 });
    const dirty = sanitizeCatalog({ protagonistEdit: { 电脑: { value: 0 }, 法律: { value: 150, from: -3 }, 财务: 'x' } });
    assert.deepEqual(dirty.protagonistEdit, { 法律: { value: 99, from: 0 } });
    assert.equal(chatEntries({ catalog: emptyCatalog() }).has('hero:assigned'), false);
});

test('存档区模型：CoC 列出全部可分配技能与生效值，D&D 不列', () => {
    const ledger = createStatsLedger('c1', createStatsState());
    const engine = engineOf({ protagonistBase: { 法律: 55 }, protagonistEdit: { 电脑: { value: 33, from: 0 } } });
    const model = statsArchiveModel(ledger, { engine, heroSkills: ['法律', '电脑', '财务'], catalog: {} });
    const by = Object.fromEntries(model.heroSkills.map((s) => [s.name, s]));
    assert.deepEqual([by.法律.value, by.法律.learned, by.法律.edited], [55, true, false]);
    assert.deepEqual([by.电脑.value, by.电脑.learned, by.电脑.edited], [33, true, true]);
    assert.deepEqual([by.财务.value, by.财务.learned], [5, false]);
    const dnd = createEngine({}, {}, 'dnd5e', FLAT);
    assert.deepEqual(statsArchiveModel(ledger, { engine: dnd, heroSkills: ['法律'], catalog: {} }).heroSkills, []);
});

test('手改的未学技能首次成功登记不翻倍；D&D 不读手改', async () => {
    const { markGrowth, resolveCheck } = await import('../src/scene/stats/stat-engine.js');
    // 电脑基础值 5：手改为 60，from 记为 seed 5（与 setHeroSkill 一致）。
    const engine = engineOf({ protagonistEdit: { 电脑: { value: 60, from: 5 } } });
    const state = createStatsState();
    const check = resolveCheck(engine, state, { actor: PROTAGONIST, skill: '电脑', raw: { unit: 0, tens: [1] } }, () => 0);
    assert.equal(check.value, 60);
    assert.equal(check.seed, 5);
    const after = markGrowth(state, { ...check, success: true });
    assert.equal(after.protagonist.skills.电脑.value, 5);
    assert.equal(profileOf(engine, after, PROTAGONIST, '电脑').value, 60);
    const grown = { ...after, protagonist: { ...after.protagonist, skills: { ...after.protagonist.skills, 电脑: { value: 8, marked: false } } } };
    assert.equal(profileOf(engine, grown, PROTAGONIST, '电脑').value, 63);
    const dnd = createEngine({ protagonistEdit: { 电脑: { value: 60, from: 5 } } }, {}, 'dnd5e', FLAT);
    assert.equal(heroSkillLevel(dnd, null, '电脑'), null);
});
