import { traySvg } from './fx-selected-svg.js';
// 后宫妃子包的构建器。朱红、金、宣纸，装饰一律实色；古代专属，所以不再按 env.ancient 分支。
// 每个构建器：入场 -> 停留 -> 退场（退场由 igs-dfx-fade 统一收），减少动态效果时直接给终态；停留乘 env.hold。
import { esc } from './reader-value-utils.js';
import { charSpans, make } from './fx-daily-kit.js';
import { gaugeHtml } from './fx-panel-kit.js';
import { probeSceneSvg } from './fx-symbols.js';
import { rollNumber } from './fx-ticker.js';
import { drawLinks } from './fx-links.js';
import { resolveHeadAnchor, spriteElOf } from './stage-snapshot.js';
import { playSpriteSpec } from './sprite-actions.js';
import { HAREM_RANKS, parseRoster, rankEdictOf, rankIndexOf, sortRoster } from './fx-harem-model.js';

export const HAREM_LIFE_MS = Object.freeze({
    hmrank: 5400, hmfavor: 3600, hmboard: 5200, hmflip: 3800, hmselect: 3600, hmrecord: 5000, hmannounce: 3800, hmgreet: 4600,
    hmreward: 4800, hmprobe: 4600, hmpunish: 3400, hmtray: 4200, hmthread: 4200, hmcongrats: 3600, hmglare: 3600,
});

const life = (kind, env) => Math.round(HAREM_LIFE_MS[kind] * (env.hold || 1));
const card = (env, kind, extra, html) => make(env.doc, `igs-dfx igs-dfx-hm hm-${kind}${extra ? ` ${extra}` : ''}`, html);
const stagger = (index, step, base = 0) => `style="animation-delay:${base + index * step}ms"`;
const nameOf = (value, fallback = '') => esc(String(value || '').trim() || fallback);

const kneelSpec = (ms) => ({ duration: ms, easing: 'ease-in-out', frames: ['translate(0,0)', 'translate(0,3.4%)', 'translate(0,3.4%)', 'translate(0,3.4%)', 'translate(0,0)'] });
const NOD_SPEC = Object.freeze({ duration: 900, easing: 'ease-in-out', frames: ['translate(0,0)', 'translate(0,2%)', 'translate(0,0)'] });
const JOLT_SPEC = Object.freeze({ duration: 380, easing: 'ease-out', frames: ['translate(0,0)', 'translate(-2.4%,0)', 'translate(1.2%,0)', 'translate(0,0)'] });

function castSprites(env) {
    const out = [];
    const root = env.root;
    if (!root || typeof root.querySelector !== 'function') return out;
    const main = root.querySelector('#igs-sprite');
    if (main) out.push(main);
    if (typeof root.querySelectorAll === 'function') out.push(...Array.from(root.querySelectorAll('.igs-cast-sprite')));
    return out;
}

function tablet(name, cls = '') {
    return `<div class="hm-tab ${cls}"><i class="hm-tab-head"></i><b>${esc(name)}</b></div>`;
}

const RANK_ROW_EM = 1.9;

function ladderHtml(from, to, down) {
    const rows = HAREM_RANKS.map((name, i) => `<div class="hm-rung${i === from ? ' is-from' : ''}${i === to ? ' is-to' : ''}">${esc(name)}</div>`).join('');
    const start = from >= 0 ? from : Math.min(HAREM_RANKS.length - 1, to + 1);
    return `<div class="hm-ladder${down ? ' is-down' : ''}" style="--hm-from:${start};--hm-to:${to};--hm-row:${RANK_ROW_EM}em"><div class="hm-ladder-rows">${rows}<i class="hm-marker"></i></div></div>`;
}

export const HAREM_BUILDERS = {
    // 册封 / 降位：左边位份阶梯，标记自旧位走到新位；右边一卷圣旨徐徐展开，落款盖朱印。
    hmrank(item, env) {
        const from = rankIndexOf(item.from);
        const to = rankIndexOf(item.to);
        const down = from >= 0 && to >= 0 && to > from;
        const body = esc(rankEdictOf(item.who, item.from, item.to));
        const ladder = to >= 0 ? ladderHtml(from, to, down) : '';
        const html = `<div class="hm-rank-row">${ladder}<div class="hm-edict">${body}<span class="hm-seal">${down ? '黜' : '册'}</span></div></div>`;
        return { layer: 'front', life: life('hmrank', env), sounds: [down ? 'hm-rank-down' : 'hm-rank-up', 'hm-seal'], node: card(env, 'rank', down ? 'is-down' : '', html) };
    },

    // 恩宠值：一方宣纸牌，朱红条自旧值涨到新值，数字同步滚动。
    hmfavor(item, env) {
        const from = item.from == null ? 0 : item.from;
        const built = gaugeHtml({ label: '恩宠', value: item.value, max: 100, text: String(item.value) });
        const delta = item.from == null ? '' : `<span class="hm-delta ${item.value >= item.from ? 'is-up' : 'is-down'}">${item.value >= item.from ? '+' : '−'}${Math.abs(item.value - item.from)}</span>`;
        const html = `<div class="hm-plaque"><div class="hm-plaque-name">${nameOf(item.who)}</div><div class="${built.className} hm-gauge" style="${built.style};--hm-from-pct:${from}%">${built.html}</div>${delta}</div>`;
        const node = card(env, 'favor', '', html);
        const value = typeof node.querySelector === 'function' ? node.querySelector('.igs-gauge-value') : null;
        if (value) rollNumber(value, from, item.value, 900, { reduced: env.reduced });
        return { layer: 'front', life: life('hmfavor', env), sounds: ['hm-favor'], node };
    },

    // 六宫位份榜：竖挂的榜文，按位份高低自上而下一行行浮现。
    hmboard(item, env) {
        const rows = sortRoster(parseRoster(item.rows)).map((row, i) => `<div class="hm-board-row" ${stagger(i, 130, 500)}><span class="hm-chip">${esc(row.rank || '—')}</span><span class="hm-board-name">${esc(row.name)}</span></div>`).join('');
        return { layer: 'front', life: life('hmboard', env), sounds: ['hm-board'], node: card(env, 'board', '', `<div class="hm-hang"><div class="hm-hang-title">六宫位份榜</div><div class="hm-board-rows">${rows}</div></div>`) };
    },

    // 翻牌子：漆盘上一排绿头牌，被点中的那块翻起、抬高，其余微微压暗。
    hmflip(item, env) {
        const others = String(item.others || '').split(';').filter(Boolean);
        const mid = Math.floor(others.length / 2);
        const slots = [...others.slice(0, mid).map((n) => tablet(n, 'is-dim')), tablet(item.who, 'is-pick'), ...others.slice(mid).map((n) => tablet(n, 'is-dim'))];
        const html = `<div class="hm-tray-wrap"><div class="hm-tray-title">翻牌</div><div class="hm-tray-plate"><div class="hm-tabs">${slots.join('')}</div></div></div>`;
        return { layer: 'front', life: life('hmflip', env), sounds: ['hm-tablet'], node: card(env, 'flip', '', html) };
    },

    // 殿选：留牌子盖朱印，赐花递上一枝绒花，撂牌子则牌面翻扣、印色转灰。
    hmselect(item, env) {
        const mode = item.mode;
        const stamp = { keep: '留牌子', flower: '赐花', drop: '撂牌子' }[mode] || '殿选';
        const flower = mode === 'flower' ? `<div class="hm-flower"><i></i><span>${nameOf(item.gift, '绒花')}</span></div>` : '';
        const html = `<div class="hm-select-card"><div class="hm-select-head">殿选</div><div class="hm-select-body">${tablet(item.who || '佳人', mode === 'drop' ? 'is-turn' : 'is-pick')}${flower}</div><div class="hm-stamp">${stamp}</div></div>`;
        return { layer: 'front', life: life('hmselect', env), sounds: [mode === 'drop' ? 'hm-clapper' : 'hm-tablet', 'hm-seal'], node: card(env, 'select', `is-${mode}`, html) };
    },

    // 敬事房记档：账页上朱批“留”或“不留”；留则凤鸾春恩车驶过；亲密声画由正文页的情事档驱动，本卡不另发信。
    hmrecord(item, env) {
        const keep = item.keep;
        const who = item.who ? `「${nameOf(item.who)}」` : '';
        const line = keep ? `圣上召幸${who}，留` : `圣上翻牌${who}，未留`;
        const cart = keep ? '<div class="hm-cart"><span>凤鸾春恩</span><i class="hm-cart-line"></i></div>' : '';
        const html = `<div class="hm-ledger"><div class="hm-ledger-title">敬事房 · 记档</div><div class="hm-ledger-line">${line}</div><div class="hm-stamp">${keep ? '留' : '不留'}</div></div>${cart}`;
        return { layer: 'front', life: life('hmrecord', env), sounds: keep ? ['paper', 'hm-seal', 'hm-cart'] : ['paper', 'hm-seal'], node: card(env, 'record', keep ? 'is-keep' : 'is-no', html) };
    },

    // 太监通传：一条朱红绶带横过画面，“皇上驾到”逐字砸下，铜锣一响，在场的人一并伏身。
    hmannounce(item, env) {
        const ms = life('hmannounce', env);
        if (!env.reduced) for (const el of castSprites(env)) playSpriteSpec(el, kneelSpec(ms));
        const html = `<div class="hm-herald"><i class="hm-herald-tassel"></i><div class="hm-herald-text">${env.reduced ? esc(item.text) : charSpans(item.text, 220, 420)}</div><i class="hm-herald-tassel is-b"></i></div>`;
        return { layer: 'front', life: ms, sounds: ['hm-gong'], node: card(env, 'announce', '', html) };
    },

    // 晨昏定省：按位份高低排成阶梯的名牌，高位在前在上；在场立绘各自欠身。
    hmgreet(item, env) {
        const rows = sortRoster(parseRoster(item.roster));
        if (!env.reduced) for (const el of castSprites(env)) playSpriteSpec(el, NOD_SPEC);
        const plaques = rows.map((row, i) => `<div class="hm-step" style="--hm-i:${i};animation-delay:${600 + i * 160}ms"><span>${esc(row.rank || '')}</span><b>${esc(row.name)}</b></div>`).join('');
        const dusk = item.part === 'dusk';
        const html = `<div class="hm-greet-head"><i class="hm-orb${dusk ? ' is-moon' : ''}"></i><span>${dusk ? '昏定' : '晨省'}</span></div><div class="hm-steps">${plaques}</div>`;
        return { layer: 'front', life: life('hmgreet', env), sounds: ['hm-clapper'], node: card(env, 'greet', dusk ? 'is-dusk' : 'is-dawn', html) };
    },

    // 赏赐清单：一卷红绸衬底的清单自上而下展开，逐行写上赏赐的物件。
    hmreward(item, env) {
        const items = String(item.items || '').split(';').filter(Boolean);
        const lines = items.map((name, i) => `<li ${stagger(i, 180, 700)}><i></i>${esc(name)}</li>`).join('');
        const to = item.who ? `<div class="hm-reward-to">赐 ${nameOf(item.who)}</div>` : '';
        const html = `<div class="hm-roll"><i class="hm-roll-rod"></i><div class="hm-roll-paper"><div class="hm-roll-title">赏赐清单</div>${to}<ul>${lines}</ul></div><i class="hm-roll-rod is-b"></i></div>`;
        return { layer: 'front', life: life('hmreward', env), sounds: ['hm-reward'], node: card(env, 'reward', '', html) };
    },

    // 验毒 / 验亲 / 巫蛊：三件证物各一张小景，结果落在底下一行字上。
    hmprobe(item, env) {
        const good = item.result === 'good';
        const scene = probeSceneSvg(item.mode, good);
        const title = { needle: '银针验毒', blood: '滴血验亲', doll: '搜出人偶' }[item.mode];
        const verdict = item.note || { needle: good ? '银针无恙' : '银针发黑', blood: good ? '两血相融' : '两血不融', doll: '厌胜之物' }[item.mode];
        const html = `<div class="hm-probe-card"><div class="hm-probe-title">${title}</div><div class="hm-probe-scene">${scene}</div><div class="hm-probe-verdict ${good ? 'is-good' : 'is-bad'}">${esc(verdict)}</div></div>`;
        const sound = item.mode === 'blood' ? 'hm-drop' : item.mode === 'needle' ? 'hm-needle' : 'hm-cold';
        return { layer: 'front', life: life('hmprobe', env), sounds: [sound], node: card(env, 'probe', `is-${item.mode}`, html) };
    },

    // 惩处：掌嘴=掌印闪在目标头旁、立绘一震；禁足=两扇宫门合拢、封条交叉；冷宫=灰幕压下，匾额斜挂。
    hmpunish(item, env) {
        const ms = life('hmpunish', env);
        if (item.mode === 'slap') {
            if (!env.reduced) playSpriteSpec(spriteElOf(env, item.who), JOLT_SPEC);
            const anchor = resolveHeadAnchor(env, item.who);
            const x = Math.max(8, Math.min(92, anchor.x + 4));
            const html = `<i class="hm-impact" style="left:${x}%;top:${Math.max(8, anchor.y)}%"></i><i class="hm-impact is-b" style="left:${x}%;top:${Math.max(8, anchor.y)}%"></i><div class="hm-brush">掌嘴</div>`;
            return { layer: 'stage', life: ms, sounds: ['hm-slap'], node: card(env, 'punish', 'is-slap', html) };
        }
        if (item.mode === 'lock') {
            const html = '<div class="hm-gate"><i class="hm-door"></i><i class="hm-door is-b"></i><i class="hm-strip"></i><i class="hm-strip is-b"></i></div><div class="hm-brush is-low">禁足</div>';
            return { layer: 'front', life: ms, sounds: ['hm-lock'], node: card(env, 'punish', 'is-lock', html) };
        }
        const html = '<div class="hm-greyveil"></div><div class="hm-board-hang"><i class="hm-chain"></i><div class="hm-plank">冷宫</div></div>';
        return { layer: 'front', life: ms, sounds: ['hm-cold'], node: card(env, 'punish', 'is-cold', html) };
    },

    // 赐死托盘：黑漆盘静静托着一件物事，背后压暗；只有一声低鸣。
    hmtray(item, env) {
        const label = { silk: '白绫三尺', wine: '鸩酒一杯', dagger: '匕首一柄' }[item.mode];
        const html = `<div class="hm-dim"></div><div class="hm-trayfull"><div class="hm-trayfull-plate">${traySvg(item.mode)}</div><div class="hm-trayfull-label">${esc(label)}</div>${item.who ? `<div class="hm-trayfull-who">赐 ${nameOf(item.who)}</div>` : ''}</div>`;
        return { layer: 'front', life: life('hmtray', env), sounds: ['hm-tray'], node: card(env, 'tray', item.mode === 'silk' ? 'is-silk' : '', html) };
    },

    // 悬丝诊脉：一根红丝从帘后牵到手腕，旁边一条脉象线缓缓起伏。
    hmthread(item, env) {
        const node = card(env, 'thread', '', `<div class="hm-pulse"><div class="hm-pulse-title">悬丝诊脉</div><svg viewBox="0 0 120 30" aria-hidden="true"><polyline points="0,15 20,15 26,15 30,4 34,26 38,15 60,15 66,15 70,4 74,26 78,15 120,15"/></svg>${item.pulse ? `<div class="hm-pulse-note">${esc(item.pulse)}</div>` : ''}</div>`);
        try {
            const head = resolveHeadAnchor(env, item.who);
            const wrist = { x: Math.max(6, Math.min(94, head.x + 5)), y: Math.min(90, head.y + 30) };
            drawLinks(node, [{ from: { x: 8, y: 10 }, to: wrist, tone: '#b3261e', style: 'line' }], env, { reduced: env.reduced });
        } catch { /* 无舞台几何时只留脉象线 */ }
        return { layer: 'stage', life: life('hmthread', env), sounds: ['hm-pulse'], node };
    },

    // 恭喜娘娘：朱红底金边的贺帖，几片金红花瓣落一遍就停。
    hmcongrats(item, env) {
        const petals = Array.from({ length: 8 }, (_, i) => `<i class="hm-petal${i % 2 ? ' is-gold' : ''}" style="left:${8 + i * 11}%;animation-delay:${i * 140}ms"></i>`).join('');
        const sub = item.text ? esc(item.text) : (item.who ? `${nameOf(item.who)}娘娘` : '');
        const html = `<div class="hm-petals">${petals}</div><div class="hm-bless"><div class="hm-bless-main">${env.reduced ? '恭喜娘娘' : charSpans('恭喜娘娘', 160, 300)}</div>${sub ? `<div class="hm-bless-sub">${sub}</div>` : ''}</div>`;
        return { layer: 'front', life: life('hmcongrats', env), sounds: ['hm-congrats'], node: card(env, 'congrats', '', html) };
    },

    // 众妃嫉妒目光：几道暗红视线自各人头旁汇向同一个人，线上缀一个“妒”字。
    hmglare(item, env) {
        const sources = String(item.sources || '').split(';').filter(Boolean);
        const node = card(env, 'glare', '', '<div class="hm-glare-vig"></div>');
        try {
            drawLinks(node, sources.map((who) => ({ from: who, to: item.target, tone: '#8e1b16', style: 'line', label: '妒' })), env, { reduced: env.reduced });
        } catch { /* 无舞台几何时只留暗角 */ }
        return { layer: 'stage', life: life('hmglare', env), sounds: ['hm-glare'], node };
    },
};
