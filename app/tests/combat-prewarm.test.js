import { describe, expect, it } from 'vitest';
import { combatPrewarmTargets } from '../src/scene/combat-prewarm.js';
import { listCombatEnemies, enemySpriteState, renderCombatEnemySprites } from '../src/visual/igs-ui/combat-enemy-sprites.js';
import { editCharacterCreature } from '../src/visual/igs-ui/creature-settings.js';
import { normalizeCharacterDna } from '../src/scene/character-dna.js';

const body = (tag) => `她拔出剑。\n${tag}`;

describe('combatPrewarmTargets', () => {
    it('取敌方与友方，群体称呼不取', () => {
        const out = combatPrewarmTargets(body('[igs-combat:start|林间遭遇|狼人、哥布林们|艾拉|elite]'));
        expect(out.map((t) => `${t.role}:${t.base}`)).toEqual(['enemy:狼人', 'ally:艾拉']);
    });
    it('编号敌人按去编号原名只取一次', () => {
        const out = combatPrewarmTargets(body('[igs-combat:start|遭遇|哥布林甲、哥布林乙|艾拉|normal]'));
        expect(out.filter((t) => t.role === 'enemy').map((t) => t.base)).toEqual(['哥布林']);
        expect(out[0].candidates).toContain('哥布林甲');
    });
    it('没有开战标签时为空', () => {
        expect(combatPrewarmTargets('普通正文')).toEqual([]);
    });
});

describe('combat enemy sprites page', () => {
    const assets = {
        characterDna: {
            史莱姆: { creature: { form: 'beast', size: 'small', anchor: 'ground', temp: true, seenAt: 5 } },
            艾拉: {},
        },
        characters: {},
    };
    it('只列非人档案与人类战斗对手', () => {
        expect(listCombatEnemies(assets).map((e) => e.name)).toEqual(['史莱姆']);
        const withHuman = { ...assets, characterDna: { ...assets.characterDna, 山贼: { combatFoe: true } } };
        expect(listCombatEnemies(withHuman).map((e) => e.name)).toEqual(['史莱姆', '山贼']);
        const html = renderCombatEnemySprites({ sceneAssets: withHuman, isOpen: () => true });
        expect(html).toContain('char-creature:enabled:%E5%8F%B2%E8%8E%B1%E5%A7%86:human');
        expect(html).toContain('combat-enemy-sprite:unlist:%E5%B1%B1%E8%B4%BC');
        expect(html).toContain('人类 · 无立绘');
    });
    it('取消非人：去档案、标为人类对手', () => {
        const next = editCharacterCreature(assets.characterDna.史莱姆, 'enabled', 'human');
        expect(next).toEqual({ combatFoe: true });
        expect(normalizeCharacterDna(next).combatFoe).toBe(true);
    });
    it('用图来源：已采用 > 待确认 > 无', () => {
        expect(enemySpriteState({ characters: { a: { 平和: 'igs-gen:1' } } }, 'a').kind).toBe('adopted');
        expect(enemySpriteState({}, 'a', () => 'igs-gen:2').kind).toBe('temp');
        expect(enemySpriteState({}, 'a').kind).toBe('none');
    });
    it('渲染带生成与删除动作', () => {
        const html = renderCombatEnemySprites({ sceneAssets: assets, isOpen: () => true, tempSprite: () => 'igs-gen:9' });
        expect(html).toContain('char-generate-sprite:%E5%8F%B2');
        expect(html).toContain('combat-enemy-sprite:remove:');
        expect(html).toContain('char-creature:temp:');
        expect(html).toContain('igs-row-menu');
    });
    it('折叠时不渲染行、不取缩略图', () => {
        let resolved = 0;
        const html = renderCombatEnemySprites({ sceneAssets: assets, resolveUrl: () => { resolved += 1; return ''; }, tempSprite: () => 'igs-gen:9' });
        expect(html).not.toContain('data-combat-enemy=');
        expect(html).toContain('（1）');
        expect(resolved).toBe(0);
    });
});
