// 卡牌战斗战报（<igs-combat-report>）供数值系统读取：合成一个只带结果与伤势的战斗指令，不含任何数值结算。
// 主角自称（与 ledger.js 的 PROTAGONIST_ALIASES 一致；本文件不引入账本，免得数值侧加载整套战斗账本）。
const PROTAGONIST_ALIASES = Object.freeze(['我', '{{user}}', '主角']);

const REPORT_OPEN = /<igs-combat-report\s+([^>]*)>/;
const REPORT_ID_PATTERN = /^r[0-9a-z]{1,13}$/;
const RESULTS = Object.freeze(['win', 'lose', 'escape']);
const SIDE_LINE = /我方：([^。\n]*)。/;
const STATUS_ENTRY = /^(.*?)\s+(无伤|轻伤|重创|濒死|倒下)$/;

// 战报伤势档换算成数值侧伤势档（HURT_TIERS）；无伤不记。
export const REPORT_HURT_TIER = Object.freeze({ 无伤: null, 轻伤: '轻伤', 重创: '中伤', 濒死: '重伤', 倒下: '重伤' });

export function parseBattleReport(text) {
    const match = REPORT_OPEN.exec(String(text || ''));
    if (!match) return null;
    const attrs = Object.fromEntries([...match[1].matchAll(/([a-z]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]]));
    if (!REPORT_ID_PATTERN.test(attrs.id || '') || !RESULTS.includes(attrs.result)) return null;
    const line = SIDE_LINE.exec(String(text));
    const party = line ? line[1].split('，').map((part) => STATUS_ENTRY.exec(part.trim())).filter(Boolean).map((m) => ({ name: m[1].trim(), status: m[2] })) : [];
    return { reportId: attrs.id, result: attrs.result, party };
}

// 合成数值侧的战斗指令；isHero 判断某个名字是不是主角（含用户名、别名）。floor 为战报所在楼。
export function battleDirectiveOf(report, { isHero = () => false, floor = null } = {}) {
    if (!report) return null;
    const hero = report.party.find((member) => PROTAGONIST_ALIASES.includes(member.name) || isHero(member.name));
    const allies = report.party.filter((member) => member !== hero && member.status !== '倒下').map((member) => member.name);
    const heroStatus = hero ? hero.status : '无伤';
    return {
        kind: 'battle', fromReport: true, reportId: report.reportId, result: report.result, floor,
        heroStatus, hurt: REPORT_HURT_TIER[heroStatus] || null, allies, allClean: report.party.length > 0 && report.party.every((member) => member.status === '无伤'),
    };
}
