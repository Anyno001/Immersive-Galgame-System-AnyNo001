import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { canonicalizeIgsDirectives, normalizeIgsDirectiveLayout } from '../src/scene/directive-tags.js';

const sceneAssets = { enabled: true, characters: { 爱丽丝: { 平静: 'a.png', 开心: 'b.png' }, 小雪: { 平静: 'c.png' } }, characterAliases: {} };
const pages = (body, sentencePaging = false) => buildIgsTextPayload({ id: 1, text: `<content>\n${body}\n</content>` }, { sceneAssets, sentencePaging });

test('igs-paging: 走样的指令写法统一成标准写法', () => {
    assert.equal(canonicalizeIgsDirectives('【igs-char：爱丽丝｜平静｜你好。】'), '[igs-char:爱丽丝|平静|你好。]');
    assert.equal(canonicalizeIgsDirectives('［ IGS-Thought : 小雪 | 平静 | 嗯…… ］'), '[igs-thought:小雪|平静|嗯……]');
    assert.equal(canonicalizeIgsDirectives('[igs-char:爱丽丝|平静|他说【哈】]'), '[igs-char:爱丽丝|平静|他说【哈】]', '半角括号开头的，台词里的【】不当收口');
    assert.equal(canonicalizeIgsDirectives('[igs-char:爱丽丝|平静|A｜B]'), '[igs-char:爱丽丝|平静|A｜B]', '已用半角分隔时台词里的｜不动');
    assert.equal(canonicalizeIgsDirectives('[igs-char:爱丽丝|平静|没写收口'), '[igs-char:爱丽丝|平静|没写收口');
    assert.equal(normalizeIgsDirectiveLayout('她推开门。[igs-char:爱丽丝|平静|你好。][igs-thought:小雪|平静|嗯。]她叹气。[igs-fx:shake]'),
        '她推开门。\n[igs-char:爱丽丝|平静|你好。]\n[igs-thought:小雪|平静|嗯。]她叹气。[igs-fx:shake]', 'fx 跟着前面那句，不挪');
});

test('igs-paging: 旁白和台词写在同一行时各占一页，指令落在自己那一页', () => {
    const payload = pages('门开了。[igs-char:爱丽丝|平静|你好。]小雪抬头。[igs-char:小雪|平静|早。][igs-thought:爱丽丝|开心|太好了]窗外下着雨。');
    assert.deepEqual(payload.textSegments, ['门开了。', '[爱丽丝]：你好。', '小雪抬头。', '[小雪]：早。', '*太好了*', '窗外下着雨。']);
    assert.deepEqual(payload.sceneDirectives.map((d) => `${d.type}:${d.character}@${d.segmentIndex}`), ['char:爱丽丝@1', 'char:小雪@3', 'thought:爱丽丝@4']);
    const scene = pages('清晨。[igs-scene:教室|day|clear]阳光照进来。');
    assert.deepEqual(scene.textSegments, ['清晨。', '阳光照进来。'], '场景标签不漏进正文');
    assert.equal(scene.sceneDirectives[0].segmentIndex, 1);
});

// 压力测试：随机拼旁白（各种句末符号、没有句末）、台词 / 心理 / 场景指令（各种走样写法），同一行或分行，
// 每条都检查：指令不漏进正文、每条台词 / 心理独占一页且指令落在那一页、旁白不和台词挤在一页、旁白一个字不丢。
test('igs-paging: 压力测试 600 条随机混排', () => {
    // mulberry32：固定种子，失败可复现；低位不像线性同余那样循环，组合覆盖得全。
    let seed = 20261007;
    const rand = (n) => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    const pick = (list) => list[rand(list.length)];
    const enders = ['。', '！', '？', '!', '?', '……', '…', '。」', '', '～'];
    const narrations = ['她推开门', '雨停了', '小雪抬头看了一眼', '“走吧。”他说', '风很大', '远处传来钟声', 'It was late'];
    const lines = ['你好。', '真的吗？！', '等等……', '嗯', 'Hello!', '「走吧」', '好、好的'];
    const opens = [['[', ':', '|', ']'], ['【', '：', '｜', '】'], ['［', ':', '|', '］'], ['[ ', ' : ', ' | ', ' ]'], ['[', '：', '｜', ']']];
    const names = ['爱丽丝', '小雪'];
    for (let round = 0; round < 600; round += 1) {
        const expected = [];
        let body = '';
        const parts = 2 + rand(5);
        for (let p = 0; p < parts; p += 1) {
            const kind = pick(['narration', 'narration', 'char', 'thought', 'scene']);
            const glue = pick(['', '', ' ', '\n']);
            if (kind === 'narration') {
                const text = pick(narrations) + pick(enders);
                body += glue + text;
                expected.push({ kind, text });
                continue;
            }
            const [open, colon, bar, close] = pick(opens);
            const tagName = rand(2) ? kind : kind.toUpperCase();
            if (kind === 'scene') {
                body += `${glue}${open}igs-${tagName}${colon}教室${bar}day${bar}clear${close}`;
                expected.push({ kind });
                continue;
            }
            const name = pick(names);
            const text = pick(lines);
            body += `${glue}${open}igs-${tagName}${colon}${name}${bar}平静${bar}${text}${close}`;
            expected.push({ kind, name, text });
        }
        // 只有场景标签、一个字正文都没有的楼层不在这里测（那是空楼层兜底的事）。
        if (expected.every((e) => e.kind === 'scene')) {
            body += '雨停了。';
            expected.push({ kind: 'narration', text: '雨停了。' });
        }
        for (const sentencePaging of [false, true]) {
            const payload = pages(body, sentencePaging);
            const where = `\n原文：${JSON.stringify(body)}\n分页：${JSON.stringify(payload.textSegments)}`;
            for (const seg of payload.textSegments) {
                assert.doesNotMatch(seg, /igs\s*-/i, `指令漏进正文${where}`);
                assert.ok(!/\S\s*\[(?:爱丽丝|小雪)\]：/.test(seg), `旁白和台词挤在一页${where}`);
            }
            const spoken = expected.filter((e) => e.kind === 'char' || e.kind === 'thought');
            const directives = payload.sceneDirectives.filter((d) => d.type === 'char' || d.type === 'thought');
            assert.equal(directives.length, spoken.length, `台词 / 心理指令数不对${where}`);
            spoken.forEach((e, i) => {
                const seg = payload.textSegments[directives[i].segmentIndex];
                const want = e.kind === 'char' ? `[${e.name}]：${e.text}` : `*${e.text}*`;
                assert.equal(seg, want, `第 ${i + 1} 条${e.kind === 'char' ? '台词' : '心理'}没落在自己那一页${where}`);
                assert.equal(directives[i].character, e.name, where);
            });
            const narrationText = payload.textSegments.filter((seg) => !seg.startsWith('[') && !seg.startsWith('*')).join('').replace(/\s+/g, '');
            const wantNarration = expected.filter((e) => e.kind === 'narration').map((e) => e.text).join('').replace(/\s+/g, '');
            assert.equal(narrationText, wantNarration, `旁白丢字或多字${where}`);
        }
    }
});
