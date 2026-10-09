// 紧急求助：纯函数，只从来电对象名与正文里识别，不向 AI 要任何额外标签。
// emergencyOf 判断来电对象是不是 110 / 120 / 119 / 122；sirenOf 判断本页正文是否写到了警笛 / 警车到场。

const NUMBER_KINDS = Object.freeze({
    110: { kind: 'police', label: '110 报警中心' },
    120: { kind: 'ambulance', label: '120 急救中心' },
    119: { kind: 'fire', label: '119 消防指挥中心' },
    122: { kind: 'traffic', label: '122 交通事故报警台' },
});
const KIND_NUMBER = Object.freeze({ police: '110', ambulance: '120', fire: '119', traffic: '122' });
// 关键词按先后判定：交警先于警察局，免得「交警」被当成普通报警。
const KEYWORDS = Object.freeze([
    ['traffic', /交警|交通事故|122/],
    ['ambulance', /急救|救护/],
    ['fire', /消防/],
    ['police', /报警|警察局|派出所|警局/],
]);

function ascii(value) {
    return String(value == null ? '' : value)
        .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .trim();
}

// 返回 { kind, label, number } 或 null；号码命中用标准机构名，只靠关键词命中时保留原名。
export function emergencyOf(name) {
    const text = ascii(name);
    if (!text) return null;
    const hit = text.match(/(?<!\d)(110|120|119|122)(?!\d)/);
    if (hit) return { ...NUMBER_KINDS[hit[1]], number: hit[1] };
    for (const [kind, pattern] of KEYWORDS) {
        if (pattern.test(text)) return { kind, label: text, number: KIND_NUMBER[kind] };
    }
    return null;
}

// 古代 / 西幻 / 魔法 / 大正 / 末日没有现代警车，不触发；现代、科幻、恐怖可以。
const SIREN_BLOCKED = Object.freeze(['ancient', 'fantasy', 'magic', 'taisho', 'apocalypse']);
const SIREN_ANY = /警笛|警车|救护车|消防车|鸣笛声?由远及近|红蓝灯/g;
const SIREN_KIND = Object.freeze([['ambulance', /救护车/], ['fire', /消防车/], ['police', /警车|红蓝灯/]]);

export function sirenAllowed(worldview, ancient) {
    return ancient !== true && !SIREN_BLOCKED.includes(String(worldview || ''));
}

// 返回 'police' | 'ambulance' | 'fire' 或 null。hint 为本楼紧急来电的种类（只在泛指鸣笛时参考）。
export function sirenOf({ text, worldview = '', ancient = false, hint = '' } = {}) {
    if (!sirenAllowed(worldview, ancient)) return null;
    const body = String(text == null ? '' : text);
    SIREN_ANY.lastIndex = 0;
    if (!SIREN_ANY.test(body)) return null;
    let best = null;
    for (const [kind, pattern] of SIREN_KIND) {
        const at = body.search(pattern);
        if (at >= 0 && (!best || at < best.at)) best = { kind, at };
    }
    if (best) return best.kind;
    return hint === 'ambulance' || hint === 'fire' ? hint : 'police';
}
