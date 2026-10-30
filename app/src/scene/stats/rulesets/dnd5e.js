// D&D 第五版（数值 v2 §4.2）：属性值 = 底数 / 5，修正 = floor((属性值 − 10) / 2)；
// 技能底数 50–74 熟练、75 以上专精（双倍熟练加值）；熟练加值看资历档。优势 / 劣势不叠加。
// 自然 20 / 1 只对攻击检定生效；属性与技能检定的分档（超出 DC 多少）只用于演出与结算，不改官方成败。

export const ID = 'dnd5e';
export const LABEL = 'D&D第五版（d20）';
export const EDGE_MAX = 1;
export const DC = Object.freeze({ 简单: 10, 普通: 15, 困难: 20, 极难: 25 });
export const RANK_BONUS = Object.freeze({ 普通人: 2, 老手: 3, 精英: 4, 大师: 5, 传奇: 6 });
export const PROFICIENT_AT = 50;
export const EXPERT_AT = 75;

export function scoreOf(value) {
    return Math.max(1, Math.min(30, Math.round((Number(value) || 0) / 5)));
}

export function modOf(value) {
    return Math.floor((scoreOf(value) - 10) / 2);
}

export function proficiencyOf(profile) {
    if (profile.kind === 'attribute' || !profile.learned) return 0;
    const v = Number(profile.value) || 0;
    return v >= EXPERT_AT ? 2 : v >= PROFICIENT_AT ? 1 : 0;
}

// 压力修正：百分制目标 −10 折成 −2（每 5 点约 1）。
export function bonusOf(profile, shift = 0) {
    const pb = RANK_BONUS[profile.rank] || RANK_BONUS.普通人;
    return modOf(profile.attributeValue ?? profile.value) + proficiencyOf(profile) * pb + Math.round((Number(shift) || 0) / 5);
}

export function rawRoll(random) {
    const d = () => 1 + Math.floor(random() * 20);
    return { d20: [d(), d()] };
}

const clampEdge = (n) => Math.sign(Math.round(Number(n) || 0));

function face(raw, edge) {
    const [a, b] = raw.d20;
    return edge > 0 ? Math.max(a, b) : edge < 0 ? Math.min(a, b) : a;
}

const LEGACY_TIER = Object.freeze({ crit: '大成功', extreme: '极难成功', hard: '困难成功', pass: '普通成功', fail: '失败', fumble: '大失败' });

// 中立等级（§4.5）：关闭自然 20/1 时按超出 / 差多少分档；开启时大成功、大失败只认自然 20 / 1。
function ladderOf(success, margin, natural, nat) {
    if (success) {
        if (natural ? nat === 20 : margin >= 10) return 'crit';
        return margin >= 5 ? 'extreme' : margin >= 1 ? 'hard' : 'pass';
    }
    return (natural ? nat === 1 : margin <= -10) ? 'fumble' : 'fail';
}

// opts：{ difficulty, edge, shift, dc, natural }。dc 优先于难度档（对抗被动值）。
export function resolve(profile, opts = {}, raw) {
    const edge = clampEdge(opts.edge);
    const dc = Number.isFinite(Number(opts.dc)) && opts.dc !== null && opts.dc !== undefined ? Math.round(Number(opts.dc)) : (DC[opts.difficulty] || DC.普通);
    const bonus = bonusOf(profile, opts.shift);
    const nat = face(raw, edge);
    const total = nat + bonus;
    let success = total >= dc;
    if (opts.natural && nat === 20) success = true;
    if (opts.natural && nat === 1) success = false;
    const margin = total - dc;
    const ladder = ladderOf(success, margin, opts.natural, nat);
    const sign = bonus >= 0 ? `+${bonus}` : String(bonus);
    const dice = edge ? `${edge > 0 ? '优势' : '劣势'} ${raw.d20[0]}/${raw.d20[1]}→${nat}` : `d20(${nat})`;
    const outcome = success
        ? (ladder === 'crit' ? '大成功' : margin > 0 ? `成功（超出 ${margin}）` : '成功')
        : (ladder === 'fumble' ? '大失败' : `失败（差 ${Math.max(1, -margin)}）`);
    return {
        ruleset: ID, die: 20, roll: nat, total, bonus, dc, target: dc, threshold: dc, edge, difficulty: opts.difficulty || '普通',
        tier: LEGACY_TIER[ladder], success, ladder, outcome,
        detail: `${dice}${sign}=${total}，DC${dc}`,
        sub: `${sign} · DC${dc}`,
    };
}

export function contest(left, right) {
    if (left.total === right.total) return 'tie';
    return left.total > right.total ? 'left' : 'right';
}

// 被动值 10 + 加值，优势 +5、劣势 −5；用作主动方的 DC。
export function passiveOpposition(profile, { edge = 0, shift = 0 } = {}) {
    return { dc: 10 + bonusOf(profile, shift) + clampEdge(edge) * 5 };
}

export function passiveValue(profile, opts = {}) {
    return passiveOpposition(profile, opts).dc;
}

// 攻击检定：自然 20 必中、自然 1 必失（官方）。
export function attack(bonus, ac, raw, edge = 0) {
    const nat = face(raw, clampEdge(edge));
    const hit = nat === 20 || (nat !== 1 && nat + bonus >= ac);
    return { roll: nat, total: nat + bonus, ac, hit, crit: nat === 20 };
}

export function rawNeed() {
    return 1;
}

export function chance(profile, opts = {}) {
    let pass = 0;
    let total = 0;
    for (let a = 1; a <= 20; a += 1) {
        for (let b = 1; b <= 20; b += 1) {
            total += 1;
            if (resolve(profile, opts, { d20: [a, b] }).success) pass += 1;
        }
    }
    return pass / total;
}
