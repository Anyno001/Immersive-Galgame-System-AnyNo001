// 旁白页沿用上一位说话人的立绘（纯函数）：
// - 旁白写到「这个人 + 离开」的那一句起，立绘清掉，之后的旁白也不再沿用（再开口才回来）；
// - 否则紧跟台词的 2 页旁白照常沿用；再往后只有旁白里还写着这个人才留着。
// 第二人称视角的角色（玩家本人、或本楼有心里话的人）在旁白里写作「你」，也算写到。

export const NARRATION_HOLD_PAGES = 2;

const LEAVE_RE = /离开|离去|走了|走远|走出|走开|退下|退出|退向|退到|退回|告辞|告退|出门|出了门|下楼|转身离|消失在|不见了|身影远去/g;
// 名字到离开动作之间最多隔多少字（同一句里）。
const LEAVE_REACH = 20;

function namesOf(name, aliases) {
    const list = [name, ...(Array.isArray(aliases) ? aliases : [])].map((s) => String(s || '').trim()).filter(Boolean);
    // 三四个字的中文名也认后两字：李哪吒 → 哪吒。
    for (const n of [...list]) if (/^[一-鿿]{3,4}$/.test(n)) list.push(n.slice(-2));
    return [...new Set(list)];
}

function leaves(text, names) {
    for (const sentence of String(text || '').split(/[。！？!?\n]/)) {
        for (const m of sentence.matchAll(LEAVE_RE)) {
            if (names.some((n) => {
                const at = sentence.lastIndexOf(n, m.index);
                return at >= 0 && m.index - at <= LEAVE_REACH;
            })) return true;
        }
    }
    return false;
}

// pages：说话页之后到本页为止的各页文字（按顺序，最后一项是本页）。
export function narrationKeepsSprite({ name, aliases = [], pov = false, pages = [] } = {}) {
    const names = namesOf(name, aliases);
    if (!names.length || !pages.length) return false;
    if (pages.some((text) => leaves(text, names))) return false;
    if (pages.length <= NARRATION_HOLD_PAGES) return true;
    const current = String(pages[pages.length - 1] || '');
    return names.some((n) => current.includes(n)) || (pov && current.includes('你'));
}
