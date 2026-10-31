import assert from 'node:assert/strict';
import test from 'node:test';
import { detectClashes, pageClashes } from '../src/scene/clash-detect.js';

const OPT = {
    people: [{ key: '林小雨', aliases: ['小雨'], gender: 'female' }, { key: '陈默', aliases: [], gender: 'male' }],
    onStage: ['林小雨'],
    userNames: ['阿明'],
};

// 误触发回归：目光、位置、比喻、回忆、梦、转述、照片屏幕里、词内误认（我们、自我、其他、吉他）、动作打在别处。
const NOT_CLASH = [
    "林小雨一拳砸在墙上，转头看着我。",
    "林小雨撞上了我的目光，慌忙低下头。",
    "林小雨踹开门，冲我喊了一声。",
    "其他人推开人群，林小雨看向我。",
    "林小雨仿佛被人揍了一拳，愣在原地看着我。",
    "我们和林小雨撞在一起的那天，雨很大。",
    "林小雨想起上次扇我耳光的事，脸红了。",
    "林小雨拍了拍桌子，抬头对我笑。",
    "林小雨抱住膝盖，偷偷看我。",
    "林小雨扑到床上，给我发了条消息。",
    "林小雨一脚踢开石子，走到我身边。",
    "林小雨推开窗户看向我。",
    "林小雨推倒了椅子，我愣住了。",
    "我梦见林小雨扇了我一巴掌。",
    "林小雨看着他推开陈默，吓了一跳。",
    "林小雨忘我地抱住吉他，弹给我听。",
    "林小雨击掌叫好，我也跟着笑。",
    "林小雨撞上门框，回头瞪我。",
    "林小雨撞见我和陈默在一起。",
    "林小雨撞上我的视线，脸一下红了。",
    "回忆里，林小雨扇了我一巴掌。",
    "那年林小雨揍过我一次。",
    "林小雨像是被雷劈中，扑到我面前。",
    "林小雨的话像一记耳光扇在我心上。",
    "林小雨撞上了我投来的眼神。",
    "她们和我撞在一起。",
    "林小雨的心被我揍得稀碎。",
    "林小雨梦到自己扑进我怀里。",
    "林小雨在照片里抱住我。",
    "屏幕上林小雨一拳打向我。",
    "林小雨说她昨天扇了我一巴掌。",
    "林小雨对着镜子挥拳，我在一旁看着。",
    "林小雨扑向门口，我没拦住。",
    "林小雨抱住了自己，我不知所措。",
];

const CLASH = [
    "林小雨扇了我一巴掌。",
    "林小雨一巴掌扇在我脸上。",
    "林小雨踹了我一脚。",
    "我被林小雨推倒在地。",
    "林小雨扑进我怀里。",
    "林小雨一把抱住我。",
    "林小雨把我推开。",
    "林小雨和我撞了个满怀。",
    "林小雨拍了拍我的头。",
    "林小雨和我击掌。",
    "林小雨给了我一拳。",
];

test('立绘碰撞：不是此刻碰到人的句子不触发', () => {
    for (const s of NOT_CLASH) assert.deepEqual(detectClashes(s, OPT), [], s);
});

test('立绘碰撞：真碰到人的句子照常触发', () => {
    for (const s of CLASH) assert.equal(detectClashes(s, OPT).length, 1, s);
});

test('立绘碰撞：身体部位算碰到人，抽象名词不算', () => {
    assert.equal(detectClashes('林小雨抱住我的胳膊撒娇。', OPT)[0].action, 'hug');
    assert.deepEqual(detectClashes('林小雨的心被我揍得稀碎。', OPT), []);
});

test('立绘碰撞：给了我一拳认出受方', () => {
    assert.deepEqual(detectClashes('林小雨给了我一拳。', OPT).map((c) => [c.attacker, c.target, c.action]), [['林小雨', '{{user}}', 'punch']]);
});

test('立绘碰撞：写了标签时照常播放', () => {
    const list = pageClashes([{ attacker: '林小雨', target: '{{user}}', action: 'slap' }], '回忆里，林小雨扇了我一巴掌。', { ...OPT, auto: false });
    assert.equal(list.length, 1);
});

test('立绘碰撞：前一分句的回想不挡后一分句的真动手，打在身上、肚子上算碰到人', () => {
    for (const s of ['林小雨想起昨天的事，抬手扇了陈默一巴掌。', '林小雨一脚踹在我的肚子上。', '林小雨一拳打在陈默的身上。', '林小雨踹在陈默的腹部。']) {
        assert.equal(detectClashes(s, OPT).length, 1, s);
    }
    assert.deepEqual(detectClashes('回忆里，林小雨扇了我一巴掌。', OPT), []);
    assert.deepEqual(detectClashes('林小雨说她昨天扇了我一巴掌。', OPT), []);
});
