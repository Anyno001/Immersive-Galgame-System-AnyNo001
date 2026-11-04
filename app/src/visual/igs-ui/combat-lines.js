// 登记角色的战斗台词：主模型在正文里写 [igs-combat:lines|角色|开场|出招|受击|倒下]（scene/combat-directives.js 解析为 start.lines），
// 战斗面板按单位在开场、出招、受击、倒下四个时刻显示小台词条并按声线朗读。文字只经 textContent 写入。
// 朗读复用 tts.js 的气泡接口（speakTtsBubble / prefetchTtsBubble）：面板准备好后一次性预取，演出时命中缓存；
// 朗读设置由宿主经 options.getTtsContext() 给出 { settings, sceneAssets }，没给或朗读关闭时只显示文字。
import { combatPortraitNames, isPlayerName } from '../../scene/creature-battle.js';
import { prefetchTtsBubble, speakTtsBubble } from './tts.js';

export const COMBAT_LINE_PHASES = Object.freeze(['open', 'attack', 'hit', 'down']);
// 朗读优先级：开场与倒下可以顶掉出招与受击，低优先级的只显示文字不抢声。
const PRIORITY = Object.freeze({ open: 3, down: 3, attack: 2, hit: 1 });
export const COMBAT_LINE_HIT_GAP_MS = 3500;
export const COMBAT_LINE_SHOW_MS = 2300;
const PREFETCH_MAX = 24;

// 把 start.lines 整理成 名字 -> 条目；非数组、缺字段一律忽略。
export function indexCombatLines(lines) {
    const map = new Map();
    for (const entry of Array.isArray(lines) ? lines : []) {
        const name = String(entry?.character || '').trim();
        if (!name || map.has(name)) continue;
        const clean = { character: name };
        for (const phase of COMBAT_LINE_PHASES) clean[phase] = (Array.isArray(entry[phase]) ? entry[phase] : []).map((t) => String(t || '').trim()).filter(Boolean);
        map.set(name, clean);
    }
    return map;
}

// 单位名对条目：先按战斗单位找立绘的候选名（去甲乙丙、去群体后缀）精确对，再认主角别名（我 / 主角 / 用户名）对操控的主角。
export function matchCombatLine(map, unit, { userName = '' } = {}) {
    if (!map?.size || !unit?.name) return null;
    for (const candidate of combatPortraitNames(unit.name)) if (map.has(candidate)) return map.get(candidate);
    if (unit.isHero) for (const [name, entry] of map) if (isPlayerName(name, userName)) return entry;
    return null;
}

export const COMBAT_LINE_STYLE_TEXT = `
#igs-combat-panel .igs-combat-line{position:absolute;z-index:44;max-width:46%;padding:5px 10px;border-radius:10px;background:#16171b;color:#f2f2f4;font-size:13px;line-height:1.4;letter-spacing:.02em;pointer-events:none;box-shadow:0 4px 14px #0a0a0c;transform:translate(-50%,-100%);animation:igs-combat-line-in 220ms ease-out both;}
#igs-combat-panel .igs-combat-line.is-out{opacity:0;transition:opacity 260ms ease-in;}
#igs-combat-panel .igs-combat-line[data-phase="down"]{color:#c9cad0;}
@keyframes igs-combat-line-in{0%{opacity:0;translate:0 6px;}100%{opacity:1;translate:0 0;}}
@media (prefers-reduced-motion:reduce){#igs-combat-panel .igs-combat-line{animation:none;}#igs-combat-panel .igs-combat-line.is-out{transition:none;}}
#igs-combat-panel[data-igs-combat-reduced] .igs-combat-line{animation:none;}
`;

// getPrefs() 返回 { show, tts }（readerSettings.combatExpansion.lines）：show 为假时不显示也不朗读，tts 为假时只显示；缺省都为真。
export function createCombatLines({ doc, getRoot, getTtsContext = null, getPrefs = null, speed = () => 1, schedule, tts = null, now = () => Date.now() } = {}) {
    const api = tts || { speak: speakTtsBubble, prefetch: prefetchTtsBubble };
    let map = new Map();
    let combatId = '';
    let token = 0;
    let current = null;
    const bubbles = new Map();
    const lastHit = new Map();
    const prefetched = new Set();

    const prefs = () => {
        let value = null;
        try { value = typeof getPrefs === 'function' ? getPrefs() : null; } catch (error) { value = null; }
        return { show: value?.show !== false, tts: value?.tts !== false };
    };
    const context = () => {
        if (!prefs().tts) return null;
        let ctx = null;
        try { ctx = typeof getTtsContext === 'function' ? getTtsContext() : null; } catch (error) { ctx = null; }
        return ctx && ctx.settings && ctx.settings.enabled ? ctx : null;
    };
    const lineOf = (entry, phase, i, speaker) => ({
        key: `combat-lines:${combatId}:${entry.character}:${phase}:${i}`, textType: 'dialogue', text: entry[phase][i], speaker,
        speakerKey: '', mood: '', phone: false, nsfw: false, whisper: false,
    });

    function stopVoice() {
        const handle = current?.handle;
        current = null;
        try { handle?.cancel?.(); } catch (error) { /* 已停 */ }
    }
    function clearBubbles() {
        for (const node of bubbles.values()) node.remove?.();
        bubbles.clear();
    }
    // 关闭面板、换战斗或演出加速时调用：停声、收台词条、作废还没跑完的预取。
    function stop() { token += 1; stopVoice(); clearBubbles(); }

    // 换战斗时设台词；同一场重复调用不动。
    function setLines(lines, id) {
        const nextId = String(id || '');
        if (nextId === combatId && map.size) return false;
        stop();
        combatId = nextId;
        map = indexCombatLines(lines);
        lastHit.clear();
        prefetched.clear();
        return map.size > 0;
    }
    const entryFor = (unit, userName) => matchCombatLine(map, unit, { userName });

    // 面板准备好后预取：只取能对上本场单位的条目，逐句顺序请求（同声线命中缓存），不并发打接口。
    async function prefetch(units, { userName = '' } = {}) {
        const ctx = prefs().show ? context() : null;
        if (!ctx || !map.size) return;
        const mine = token;
        let count = 0;
        for (const unit of units || []) {
            const entry = entryFor(unit, userName);
            if (!entry) continue;
            for (const phase of COMBAT_LINE_PHASES) {
                for (let i = 0; i < entry[phase].length; i += 1) {
                    if (mine !== token || count >= PREFETCH_MAX) return;
                    const line = lineOf(entry, phase, i, unit.name);
                    if (prefetched.has(line.key)) continue;
                    prefetched.add(line.key);
                    count += 1;
                    try { await api.prefetch?.(line, ctx.settings, ctx.sceneAssets); } catch (error) { /* 预取失败不影响演出 */ }
                }
            }
        }
    }

    function show(unitEl, text, phase) {
        const root = getRoot?.();
        if (!root || !unitEl || !doc?.createElement) return;
        const key = unitEl.getAttribute?.('data-unit') || text;
        bubbles.get(key)?.remove?.();
        const rootRect = root.getBoundingClientRect?.();
        const rect = unitEl.getBoundingClientRect?.();
        if (!rootRect?.width || !rect?.width) return;
        const node = doc.createElement('div');
        node.className = 'igs-combat-line';
        node.setAttribute('data-phase', phase);
        node.setAttribute('aria-hidden', 'true');
        node.textContent = text;
        const x = Math.min(rootRect.width * 0.82, Math.max(rootRect.width * 0.18, rect.left - rootRect.left + rect.width / 2));
        node.style.left = `${Math.round(x)}px`;
        node.style.top = `${Math.round(Math.max(28, rect.top - rootRect.top + rect.height * 0.28))}px`;
        root.appendChild(node);
        bubbles.set(key, node);
        const mine = token;
        const life = COMBAT_LINE_SHOW_MS;
        schedule?.(() => { if (mine === token) node.classList?.add('is-out'); }, life);
        schedule?.(() => { node.remove?.(); if (bubbles.get(key) === node) bubbles.delete(key); }, life + 300);
    }

    // 某单位说一句：phase 为 open / attack / hit / down；受击按同单位间隔节流。返回是否出了台词。
    function say(unit, unitEl, phase, { userName = '' } = {}) {
        if (!map.size || !unit?.name || !unitEl || !prefs().show) return false;
        const entry = entryFor(unit, userName);
        const list = entry?.[phase];
        if (!list?.length) return false;
        if (phase === 'hit') {
            const stamp = now();
            if (stamp - (lastHit.get(unit.name) || -Infinity) < COMBAT_LINE_HIT_GAP_MS) return false;
            lastHit.set(unit.name, stamp);
        }
        const i = Math.floor(Math.random() * list.length);
        show(unitEl, list[i], phase);
        const ctx = context();
        if (!ctx || speed() > 1) return true;
        const pri = PRIORITY[phase] || 1;
        if (current && current.pri > pri) return true;
        stopVoice();
        let handle = null;
        try { handle = api.speak?.(lineOf(entry, phase, i, unit.name), ctx.settings, ctx.sceneAssets) || null; } catch (error) { handle = null; }
        if (handle) {
            const mine = { handle, pri };
            current = mine;
            handle.done?.then?.(() => { if (current === mine) current = null; });
        }
        return true;
    }

    return { setLines, prefetch, say, stop, has: () => map.size > 0, knows: (unit, userName = '') => Boolean(entryFor(unit, userName)) };
}
