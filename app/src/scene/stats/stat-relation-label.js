// 关系定义（只给用户看，不注入提示词、不进状态栏、不推表格）：按好感、信任、了解、芥蒂、欲望的组合给出一个名称与说明。
// 规则表自上而下，先中先得；欲望条件只在 NSFW 开启时参与匹配，关闭时含欲望条件的规则整条跳过。
// 区间：好感用九阶段边界（正负 25、50、75）；信任、了解高为大于 50，低为不高于 0；芥蒂有为不低于 1，中、高、极分别不低于 26、51、76；欲望高为大于 50。
// 三套名称：非恋爱且为亲人（kin）时用 kin 一套，未列出的沿用友情向。
// 两套名称：规则本身的 name、desc 为恋爱向；friend 为非恋爱对象的友情向名称与说明，缺省表示两套共用。

import { stageOf } from './stat-favor.js';

const pair = (p) => (p ? Object.freeze({ name: p[0], desc: p[1] }) : null);
const rule = (name, desc, test, needsDesire = false, friend = null, kin = null) => Object.freeze({
    name, desc, test, needsDesire,
    friend: pair(friend),
    kin: pair(kin),
});

export const RELATION_RULES = Object.freeze([
    rule('相爱相杀', '放不下对方，恨意也深', (f, t, k, g) => f > 25 && g >= 51, false, ['亦敌亦友', '放不下对方，恨意也深'], ['又爱又恨', '放不下彼此，心里的怨也深']),
    rule('灵犀相通', '深爱、信赖，且彼此知根知底', (f, t, k, g) => f > 75 && t > 50 && k > 50 && g === 0, false, ['肝胆相照', '情谊深厚、信赖，且知根知底'], ['亲密无间', '亲情深厚、信赖，且知根知底']),
    rule('两心相许', '深爱且全然信赖', (f, t, k, g) => f > 75 && t > 50 && k > 50 && g < 26, false, ['莫逆之交', '情谊深厚且全然信赖'], ['至亲至信', '亲情深厚且全然信赖']),
    rule('爱恨交织', '爱得深，心里的刺也深', (f, t, k, g) => f > 75 && g >= 26, false, ['恩怨难断', '情谊深，心里的刺也深']),
    rule('爱而生疑', '放不下，却也不敢信', (f, t) => f > 75 && t <= 0, false, ['亲而生疑', '放不下，却也不敢信']),
    // 狂信徒、私生饭：好感与信任都极高，却几乎不了解主角本人；三套共用。
    rule('奉若神明', '全心信奉，却并不了解真实的你', (f, t, k) => f > 75 && t > 75 && k <= 25),
    rule('情根深种', '深爱，仍有未解的隔阂', (f) => f > 75, false, ['情同手足', '情谊深厚，仍有未解的隔阂'], ['亲情深厚', '感情很深，仍有未解的隔阂']),
    rule('情热难抑', '在意且渴求', (f, t, k, g, d) => f > 50 && d > 50, true, ['欲念暗生', '亲近之外，另有渴求']),
    rule('各取所需', '交情不深，只在身体上亲近', (f, t, k, g, d) => f > 0 && d > 50, true),
    rule('心有芥蒂', '在意，但旧事未了', (f, t, k, g) => f > 50 && g >= 26),
    rule('心动设防', '心动，却处处提防', (f, t) => f > 50 && t <= 0, false, ['亲近设防', '亲近，却处处提防']),
    rule('情投意合', '强烈在意且信得过', (f, t) => f > 50 && t > 50, false, ['志同道合', '交情深厚且信得过'], ['亲厚可依', '关系亲厚且信得过']),
    rule('暧昧未明', '强烈在意，关系尚未挑明', (f) => f > 50, false, ['交情匪浅', '十分亲近，彼此看重'], ['亲近和睦', '十分亲近，彼此看重']),
    rule('欢喜冤家', '喜欢，却总有摩擦', (f, t, k, g) => f > 25 && g >= 26),
    rule('知己', '喜欢、信赖且相知', (f, t, k) => f > 25 && t > 50 && k > 50),
    rule('可托之人', '喜欢且可以托付', (f, t) => f > 25 && t > 50),
    rule('雾里看花', '喜欢，却并不真正了解', (f, t, k) => f > 25 && k <= 0),
    rule('颇有好感', '明确喜欢，相处自在', (f) => f > 25, false, ['意气相投', '合得来，相处自在'], ['关系融洽', '合得来，相处自在']),
    rule('可靠旧识', '交情不深，但靠得住', (f, t) => f > 0 && t > 50),
    rule('面和心远', '表面客气，心里记着账', (f, t, k, g) => f > 0 && g >= 26),
    rule('熟稔之交', '好感不多，却很熟悉', (f, t, k) => f > 0 && k > 50),
    rule('点头之交', '初有好感', (f) => f > 0),
    rule('身不由己', '不喜欢，身体却诚实', (f, t, k, g, d) => f < 0 && d > 50, true),
    rule('不喜但信得过', '合不来，但信得过', (f, t) => f > -50 && f < 0 && t > 50),
    rule('误会丛生', '不喜多半出于误解', (f, t, k, g) => f > -50 && f < 0 && k <= 0 && g === 0),
    rule('势不两立', '仇深似海', (f, t, k, g) => f <= -75 || g >= 76),
    rule('积怨已深', '厌恶且怨恨难消', (f, t, k, g) => f <= -50 && g >= 51),
    rule('深恶痛绝', '强烈反感', (f) => f <= -50),
    rule('针锋相对', '互相看不顺眼且心存怨气', (f, t, k, g) => f <= -25 && g >= 26),
    rule('敬而远之', '厌烦、排斥', (f) => f <= -25),
    rule('心生嫌隙', '有些不喜，且有疙瘩', (f, t, k, g) => f < 0 && g >= 1),
    rule('淡淡疏离', '有些不喜', (f) => f < 0),
    rule('素昧平生', '尚无交集', (f, t, k, g) => f === 0 && t === 0 && k === 0 && g === 0),
    rule('萍水相逢', '关系尚浅，难以归类', () => true),
]);

const FALLBACK = RELATION_RULES[RELATION_RULES.length - 1];

function level(value) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? n : 0;
}

// dims：{ 好感, 信任, 了解, 芥蒂, 欲望 }，缺项按零。romance 为真用恋爱向名称；否则 kin 为真用亲情向，其余用友情向。返回 { name, desc }。
export function relationLabel(dims, { nsfw = false, romance = false, kin = false } = {}) {
    const d = dims && typeof dims === 'object' ? dims : {};
    const f = level(d.好感);
    const t = level(d.信任);
    const k = level(d.了解);
    const g = Math.max(0, level(d.芥蒂));
    const desire = level(d.欲望);
    const hit = RELATION_RULES.find((r) => (!r.needsDesire || nsfw) && r.test(f, t, k, g, desire)) || FALLBACK;
    const shown = romance ? hit : (kin && hit.kin) || hit.friend || hit;
    return { name: shown.name, desc: shown.desc };
}

const FRIEND_STAGES = Object.freeze([
    { min: 26, max: 50, name: '相处融洽' },
    { min: 51, max: 75, name: '亲近信赖' },
    { min: 76, max: 100, name: '情深义重' },
]);

// 阶段名的显示：非恋爱对象好感 26 以上换友情向，其余沿用九阶段原名。只用于显示，注入提示词的阶段名不经过这里。
export function stageLabel(favor, romance = false) {
    const value = level(favor);
    if (!romance) {
        const hit = FRIEND_STAGES.find((s) => value >= s.min && value <= s.max);
        if (hit) return hit.name;
    }
    return stageOf(value).name;
}
