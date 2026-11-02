import test from 'node:test';
import assert from 'node:assert/strict';
import { reportIdFor } from '../src/combat/report.js';
import { CHALLENGE_OUTCOMES, CHALLENGE_SKIP_TEXT, buildChallengeReport, challengeDirectiveOf, parseChallengeReport } from '../src/combat/challenge-report.js';

const base = { combatId: 'ch|12|0|abc|0', event: '公司终面', tier: '普通', stake: '压力', domain: '话术' };
// 标记属性里的战报编号含数字，正文描述不得含数值。
const body = (text) => text.replace(/<igs-challenge-report[^>]*>|<\/igs-challenge-report>/g, '');

test('战报只含结局词与相对描述，正文没有任何数字', () => {
    for (const outcome of CHALLENGE_OUTCOMES) {
        for (const detail of ['brief', 'normal']) {
            for (const willRatio of [0.9, 0.4, 0.1]) {
                for (const stake of ['压力', '体力']) {
                    const report = buildChallengeReport({ ...base, outcome, willRatio, stake, detail });
                    assert.ok(report.ok);
                    assert.doesNotMatch(body(report.text), /[0-9０-９]/, `${outcome} ${detail}`);
                }
            }
        }
    }
});

test('战报带合法编号并与战斗标识一一对应，结果词映射到引擎结果', () => {
    const report = buildChallengeReport({ ...base, outcome: '勉强' });
    assert.equal(report.reportId, reportIdFor(base.combatId));
    assert.match(report.reportId, /^r[0-9a-z]{1,13}$/);
    assert.equal(report.result, 'win');
    assert.ok(report.text.includes(`id="${report.reportId}"`));
    assert.deepEqual(CHALLENGE_OUTCOMES.map((outcome) => buildChallengeReport({ ...base, outcome }).result), ['win', 'win', 'lose', 'escape']);
});

test('简略档只写结局，普通档追加过程与相对代价', () => {
    const brief = body(buildChallengeReport({ ...base, outcome: '失败', detail: 'brief' }).text);
    const normal = body(buildChallengeReport({ ...base, outcome: '失败', willRatio: 0.2, detail: 'normal' }).text);
    assert.match(brief, /挑战：公司终面。结果：没有成功。/);
    assert.ok(normal.length > brief.length);
    assert.match(normal, /压力明显上升/);
    assert.match(body(buildChallengeReport({ ...base, outcome: '失败', stake: '体力' }).text), /体力消耗很大/);
    assert.match(body(buildChallengeReport({ ...base, outcome: '放弃' }).text), /压力略有上升/);
    assert.match(body(buildChallengeReport({ ...base, outcome: '圆满' }).text), /压力有所缓解/);
});

test('只给引擎结果时按剩余意志换算结局，回合上限到时的成功只算勉强', () => {
    assert.match(buildChallengeReport({ ...base, result: 'win', willRatio: 0.8 }).text, /outcome="圆满"/);
    assert.match(buildChallengeReport({ ...base, result: 'win', willRatio: 0.8, byLimit: true }).text, /outcome="勉强"/);
    assert.match(body(buildChallengeReport({ ...base, result: 'lose', byLimit: true }).text), /时限已到/);
});

test('事件名里会破坏标记结构的字符被去掉；缺少标识或结局时拒绝生成', () => {
    const report = buildChallengeReport({ ...base, event: '面"试<终>|面', outcome: '圆满' });
    assert.equal((report.text.match(/<igs-challenge-report/g) || []).length, 1);
    assert.match(body(report.text), /挑战：面试终面。/);
    assert.equal(buildChallengeReport({ ...base, combatId: '', outcome: '圆满' }).ok, false);
    assert.equal(buildChallengeReport({ ...base, outcome: '大胜' }).ok, false);
});

test('战报标记能被数值侧读回并合成 challenge 指令', () => {
    const report = buildChallengeReport({ ...base, outcome: '失败', tier: '艰难', stake: '体力' });
    const parsed = parseChallengeReport(`（前文）\n${report.text}`);
    assert.deepEqual(parsed, { reportId: report.reportId, result: 'lose', outcome: '失败', tier: '艰难', stake: '体力', domain: '话术', foe: '', counterpart: '', allies: [] });
    assert.deepEqual(challengeDirectiveOf(parsed, 31), { kind: 'challenge', reportId: report.reportId, outcome: '失败', tier: '艰难', stake: '体力', domain: '话术', floor: 31, counterpart: '', prize: null });
    assert.equal(parseChallengeReport('没有战报'), null);
    assert.equal(parseChallengeReport('<igs-challenge-report id="bad id" outcome="圆满">'), null);
    assert.equal(parseChallengeReport('<igs-challenge-report id="rabc1" outcome="大胜">'), null);
    assert.equal(challengeDirectiveOf(null), null);
});

test('跳过文案不是战报，数值侧读不出结算指令', () => {
    assert.equal(parseChallengeReport(CHALLENGE_SKIP_TEXT), null);
    assert.doesNotMatch(CHALLENGE_SKIP_TEXT, /[0-9０-９]/);
});
