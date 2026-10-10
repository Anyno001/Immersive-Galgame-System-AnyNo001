import test from 'node:test';
import assert from 'node:assert/strict';
import {
    detectLiveWarning,
    warningCardText,
    warningCooldownOk,
} from '../src/visual/igs-ui/live-warning.js';
import { normalizeLiveFxSettings } from '../src/visual/igs-ui/danmaku-settings.js';

test('gate:live-warning:positive-cases-and-levels', () => {
    assert.deepEqual(detectLiveWarning('超管突然弹出警告：直播内容涉嫌违规。', { dms: [] }), { level: 'warn', reason: '超管突然弹出警告：直播内容涉嫌违规' });
    assert.equal(detectLiveWarning('平台警告了她的直播，要求整改。', null).level, 'warn');
    assert.equal(detectLiveWarning('直播间被封了，屏幕一下黑了。', null).level, 'ban');
    assert.equal(detectLiveWarning('超管直接切断直播，主播被封号。', null).level, 'ban');
    assert.equal(detectLiveWarning('', null), null);
    // dm 标签：房管说了警告，或系统口吻的用户名。
    assert.deepEqual(detectLiveWarning('今晚很安静。', { dms: [{ user: '房管小王', text: '警告一次，别乱说', type: 'admin' }] }), { level: 'warn', reason: '警告一次，别乱说' });
    assert.equal(detectLiveWarning('', { dms: [{ user: '系统', text: '直播间已被关闭', type: 'text' }] }).level, 'ban');
    assert.equal(detectLiveWarning('', { dms: [{ user: '超管', text: '请整改', type: 'text' }] }).level, 'warn');
});

test('gate:live-warning:ordinary-talk-is-not-a-warning', () => {
    assert.equal(detectLiveWarning('警告他别乱说话。', { dms: [] }), null);
    assert.equal(detectLiveWarning('他违规了，裁判吹哨。', { dms: [] }), null);
    assert.equal(detectLiveWarning('她被封印在塔里。', { dms: [] }), null);
    assert.equal(detectLiveWarning('我今晚要看直播。', { dms: [] }), null);
    // 房管发的普通弹幕、普通观众发「警告」都不算。
    assert.equal(detectLiveWarning('', { dms: [{ user: '房管', text: '欢迎新朋友', type: 'admin' }] }), null);
    assert.equal(detectLiveWarning('', { dms: [{ user: '路人', text: '警告警告', type: 'text' }] }), null);
});

test('gate:live-warning:cooldown-is-sixty-seconds-and-card-text', () => {
    assert.equal(warningCooldownOk(0, 1000), true);
    assert.equal(warningCooldownOk(1000, 30000), false);
    assert.equal(warningCooldownOk(1000, 61000), true);
    assert.match(warningCardText(''), /涉嫌违规/);
    assert.match(warningCardText('内容不当'), /（内容不当）$/);
    assert.equal(normalizeLiveFxSettings({}).adminWarn, true);
    assert.equal(normalizeLiveFxSettings({ adminWarn: false }).adminWarn, false);
});

test('gate:live-chatter:settings-emoji-custom-lines-and-fan-medals-normalize', () => {
    const d = normalizeLiveFxSettings({});
    assert.equal(d.emoji, true);
    assert.deepEqual(d.customLines, {});
    assert.deepEqual(d.fanMedals, {});
    const s = normalizeLiveFxSettings({ emoji: false, customLines: { chat: '你好呀\n\n再来一条', game: '' }, fanMedals: '爱丽丝=茶会\n坏行\n鲍勃：团子' });
    assert.equal(s.emoji, false);
    assert.deepEqual(Array.from(s.customLines.chat), ['你好呀', '再来一条']);
    assert.equal(s.customLines.game, undefined);
    assert.deepEqual(s.fanMedals, { 爱丽丝: '茶会', 鲍勃: '团子' });
});
