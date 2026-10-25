import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LINE_MAX,
    VOICE_MOODS,
    builtinLines,
    chengduWinKeys,
    declareLine,
    riichiWinKeys,
    splitMood,
    voiceKeys,
    voiceLine,
    wantsToTalk,
} from '../src/visual/igs-ui/wait-stage-mahjong-voice.js';
import { STYLE_IDS, normalizePersona } from '../src/visual/igs-ui/wait-stage-mahjong-mind.js';

const ALL_SLOTS = { 对方: '凛', 牌: '五万', 番: 3, 点: 8000 };

test('gate:wait-stage:mahjong-voice-every-moment-has-lines-for-every-style', () => {
    for (const rules of ['riichi', 'chengdu']) {
        for (const style of STYLE_IDS) {
            const persona = normalizePersona({ style }, '绫');
            for (const key of Object.keys(voiceKeys(rules))) {
                const line = voiceLine(persona, rules, [key], { slots: ALL_SLOTS, random: () => 0 });
                assert.ok(line && line.text, `${rules} ${style} ${key}`);
                assert.equal(line.key, key);
                assert.ok(VOICE_MOODS.includes(line.mood), `${key} 的表情 ${line.mood}`);
            }
        }
        for (const raw of builtinLines(rules)) {
            const { mood, text } = splitMood(raw);
            assert.ok(text.length <= LINE_MAX, raw);
            if (mood) assert.ok(VOICE_MOODS.includes(mood), raw);
        }
    }
});

test('gate:wait-stage:mahjong-voice-own-lines-first-then-style-then-generic', () => {
    const persona = normalizePersona({
        style: 'cautious',
        address: { 你: '前辈', 凛: '凛酱' },
        voice: { riichi: { dealIn: ['[愤怒]{对方}给我记住！'], 'win.cheap': ['小和也是和'] } },
    }, '绫');
    const own = voiceLine(persona, 'riichi', ['dealIn'], { slots: { 对方: '凛', 牌: '五万' }, random: () => 0 });
    assert.deepEqual([own.text, own.mood, own.own, own.tagged], ['凛酱给我记住！', '愤怒', true, true], '自己的句子、称呼、表情标签');
    const toPlayer = voiceLine(persona, 'riichi', ['dealIn'], { slots: { 对方: '你', 牌: '五万' }, random: () => 0 });
    assert.equal(toPlayer.text, '前辈给我记住！');
    const styled = voiceLine(persona, 'riichi', ['threat'], { slots: { 对方: '凛' }, random: () => 0 });
    assert.equal(styled.own, false);
    assert.equal(styled.mood, '紧张', '没标表情就用这个键的默认表情');

    const plain = normalizePersona({ style: 'steady' }, '咲');
    assert.equal(voiceLine(plain, 'riichi', ['~win.cheap']), null, '带 ~ 的键不退到通用句');
    assert.equal(voiceLine(plain, 'riichi', ['~win.cheap', 'win.ron'], { slots: { 对方: '凛', 牌: '五万', 点: 1000 }, random: () => 0 }).key, 'win.ron', '跳过去用下一个键');
    assert.equal(voiceLine(persona, 'riichi', ['~win.cheap']).text, '小和也是和');
    assert.equal(voiceLine(plain, 'riichi', ['no.such.key', 'riichi'], { random: () => 0 }).key, 'riichi');

    const slotted = normalizePersona({ style: 'steady', voice: { chengdu: { 'win.ron': ['{对方}的{牌}，胡！', '胡了。'] } } }, '咲');
    assert.equal(voiceLine(slotted, 'chengdu', ['win.ron'], { slots: {}, random: () => 0 }).text, '胡了。', '缺占位符的句子跳过');
    const avoid = voiceLine(slotted, 'chengdu', ['win.ron'], { slots: { 对方: '凛', 牌: '五万' }, random: () => 0, avoid: ['凛的五万，胡！'] });
    assert.equal(avoid.text, '胡了。', '刚说过的先不重复');
});

test('gate:wait-stage:mahjong-voice-drops-doubled-address-to-the-player', () => {
    const persona = normalizePersona({ style: 'steady', voice: { chengdu: { 'win.last': ['血战到最后，是我赢了，{对方}。'], 'dealIn.again': ['{对方}，你专胡我是吧？'] } } }, '咲');
    assert.equal(voiceLine(persona, 'chengdu', ['win.last'], { slots: { 对方: '你', 番: 2 } }).text, '血战到最后，是我赢了。');
    assert.equal(voiceLine(persona, 'chengdu', ['dealIn.again'], { slots: { 对方: '你' } }).text, '你专胡我是吧？');
    assert.equal(voiceLine(persona, 'chengdu', ['dealIn.again'], { slots: { 对方: '凛' } }).text, '凛，你专胡我是吧？');
    const named = normalizePersona({ ...persona, address: { 你: '哥哥' } }, '咲');
    assert.equal(voiceLine(named, 'chengdu', ['win.last'], { slots: { 对方: '你', 番: 2 } }).text, '血战到最后，是我赢了，哥哥。');
});

test('gate:wait-stage:mahjong-voice-talkative-people-chatter-more', () => {
    const rolls = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);
    const count = (style, weight) => rolls.filter((roll) => wantsToTalk(normalizePersona({ style }, ''), weight, () => roll)).length;
    assert.ok(count('airhead', 1) > count('cautious', 1));
    assert.ok(count('steady', 1.5) > count('steady', 0.5));
    assert.equal(declareLine('riichi', 'riichi'), '立直！');
    assert.equal(declareLine('chengdu', 'win.ron'), '胡！');
    assert.equal(declareLine('chengdu', 'riichi'), '', '成都没有立直');
});

test('gate:wait-stage:mahjong-voice-riichi-wins-lead-with-the-rarest-thing', () => {
    const kokushi = riichiWinKeys({ hupai: [{ name: '国士無双' }], damanguan: 1, defen: 32000, baojia: 2 }, { random: () => 0 });
    assert.deepEqual(kokushi.slice(0, 2), ['yaku.国士无双', 'win.yakuman']);
    assert.equal(kokushi[kokushi.length - 1], 'win.ron');
    const rinshan = riichiWinKeys({ hupai: [{ name: '嶺上開花' }, { name: '立直' }], defen: 3900, baojia: null }, { revenge: true, random: () => 0 });
    assert.deepEqual(rinshan, ['yaku.岭上开花', 'win.revenge', 'win.tsumo']);
    const cheap = riichiWinKeys({ hupai: [{ name: '断幺九' }], defen: 1000, baojia: 1 }, { dama: true, comeback: true, random: () => 0.9 });
    assert.deepEqual(cheap, ['win.comeback', 'win.dama', '~win.cheap', 'win.ron']);
});

test('gate:wait-stage:mahjong-voice-chengdu-wins-lead-with-the-hand-shape', () => {
    assert.deepEqual(
        chengduWinKeys({ patterns: ['杠上花', '清一色'], fan: 4 }, { zimo: true, last: true }),
        ['pattern.杠上花', 'win.last', 'pattern.清一色', 'win.big', 'win.zimo'],
    );
    assert.deepEqual(chengduWinKeys({ patterns: [], fan: 1 }, { first: true }), ['win.first', '~win.cheap', 'win.ron']);
    assert.deepEqual(chengduWinKeys({ patterns: ['龙七对'], fan: 4 }, { revenge: true }), ['win.revenge', 'pattern.龙七对', 'win.big', 'win.ron']);
});
