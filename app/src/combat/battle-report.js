// 卡牌战斗战报（<igs-combat-report>）供数值系统读取：合成一个只带结果与伤势的战斗指令，不含任何数值结算。
// 主角自称（与 ledger.js 的 PROTAGONIST_ALIASES 一致；本文件不引入账本，免得数值侧加载整套战斗账本）。
const PROTAGONIST_ALIASES = Object.freeze(['我', '{{user}}', '主角']);

const REPORT_OPEN = /<igs-combat-report\s+([^>]*)>/;
const REPORT_ID_PATTERN = /^r[0-9a-z]{1,13}$/;
const RESULTS = Object.freeze(['win', 'lose', 'escape']);
const SIDE_LINE = /我方：([^。\n]*)。/;
const FOE_LINE = /敌方：([^。\n]*)。/;
const FOE_ENTRY = /^(.*?)\s+(\S+)$/;
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
    // 旧战报没有 weak 与敌方一行时按旧行为：weak=false、foes=[]。
    const foeLine = FOE_LINE.exec(String(text));
    const foes = foeLine ? foeLine[1].split('，').map((part) => FOE_ENTRY.exec(part.trim())).filter(Boolean).map((m) => ({ name: m[1].trim(), status: m[2] })) : [];
    // 敌人模板 M7 盗金：gold-lost 为被敌人带走的金币；旧战报不带时为 0。
    const goldText = /\sgold-lost="(\d{1,9})"/.exec(match[1])?.[1];
    const goldLost = goldText === undefined ? 0 : Number(goldText);
    return { reportId: attrs.id, result: attrs.result, party, weak: attrs.weak === '1', foes, ...(goldLost > 0 ? { goldLost } : {}) };
}

// 合成数值侧的战斗指令；isHero 判断某个名字是不是主角（含用户名、别名）。floor 为战报所在楼。
export function battleDirectiveOf(report, { isHero = () => false, floor = null } = {}) {
    if (!report) return null;
    const hero = report.party.find((member) => PROTAGONIST_ALIASES.includes(member.name) || isHero(member.name));
    const allies = report.party.filter((member) => member !== hero && member.status !== '倒下').map((member) => member.name);
    const heroStatus = hero ? hero.status : '无伤';
    // 同伴（不含主角）的伤势与倒下名单、弱小战、敌方名单，供特质读取；allies 仍只含未倒下的同伴。
    const mates = report.party.filter((member) => member !== hero);
    return {
        party: mates.map((member) => ({ name: member.name, status: member.status })),
        fallen: mates.filter((member) => member.status === '倒下').map((member) => member.name),
        weak: report.weak === true,
        foes: Array.isArray(report.foes) ? report.foes.map((foe) => ({ name: foe.name, status: foe.status })) : [],
        kind: 'battle', fromReport: true, reportId: report.reportId, result: report.result, floor,
        heroStatus, hurt: REPORT_HURT_TIER[heroStatus] || null, allies, allClean: report.party.length > 0 && report.party.every((member) => member.status === '无伤'),
        // 敌人模板 M7 盗金：数值侧按增减扣剧情货币；旧战报不带此字段。
        ...(Number.isSafeInteger(report.goldLost) && report.goldLost > 0 ? { goldLost: report.goldLost } : {}),
    };
}
