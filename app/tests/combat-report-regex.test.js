import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_REPORT_REGEX_ID, combatReportRegex, ensureCombatReportRegex } from '../src/host/combat-report-regex.js';

function fakeHelper(initial = []) {
    const h = { regexes: initial, writes: 0 };
    h.getTavernRegexes = () => JSON.parse(JSON.stringify(h.regexes));
    h.replaceTavernRegexes = async (list) => { h.writes += 1; h.regexes = list; };
    return h;
}

// 按酒馆正则引擎的写法：/pattern/flags，{{match}} 替换为整段命中。
function applyDisplay(rule, text) {
    const m = rule.find_regex.match(/^\/(.*)\/([a-z]*)$/s);
    return text.replace(new RegExp(m[1], m[2]), (hit) => rule.replace_string.replace('{{match}}', hit));
}

test('战报正则只折叠显示、不改发送原文，并带上后面的 exp 标签行', () => {
    const rule = combatReportRegex();
    assert.deepEqual([rule.destination, rule.source.user_input, rule.source.ai_output], [{ display: true, prompt: false }, true, false]);
    const report = '（战斗结束）\n<igs-combat-report id="r1" result="win" encounter="狭路">\n第1回合：……\n</igs-combat-report>\n[igs-combat:exp|主角|20|战斗:r1]';
    const shown = applyDisplay(rule, report);
    assert.ok(shown.startsWith('（战斗结束）\n<details><summary>战斗记录</summary>'));
    assert.ok(shown.includes('[igs-combat:exp|主角|20|战斗:r1]\n\n</details>'));
    assert.equal(applyDisplay(rule, '普通输入'), '普通输入');
});

test('注册幂等且保留其他全局正则；缺少接口时 fail-closed', async () => {
    const other = { id: 'user-rule', script_name: '用户正则' };
    const helper = fakeHelper([other, { id: COMBAT_REPORT_REGEX_ID, replace_string: '旧' }]);
    const g = { TavernHelper: helper };
    assert.deepEqual(await ensureCombatReportRegex(g), { ok: true, changed: true });
    assert.deepEqual(helper.regexes.map((r) => r.id), ['user-rule', COMBAT_REPORT_REGEX_ID]);
    assert.deepEqual(await ensureCombatReportRegex(g), { ok: true, changed: false });
    assert.equal(helper.writes, 1);
    assert.deepEqual(await ensureCombatReportRegex({}), { ok: false, reason: 'regex-api-missing' });
});
