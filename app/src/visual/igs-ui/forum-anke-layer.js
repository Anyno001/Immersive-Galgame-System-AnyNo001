import { ABILITY_LABELS } from '../../combat/abilities.js';
import { forumHash } from './forum-reader-model.js';
import { ankeCheckPlay, ankeCocPlay, ankeCocValueOf, ankeFillLine, ankeOutcomeOf, ankeRoll, ankeVotePlay } from './forum-anke-play.js';
import { ankeReactions } from './forum-anke-react.js';

// 论坛安科楼的 DOM：多数决 / 安价 / 征集 / 判定四种新形式加旧的四选一（pick）。
// 第一次决定性点击算出结果、写锁（view.onAnkeLock）、填入输入框；之后重建列表都从锁原样恢复。
const ROLL_STEPS = 10;
const ROLL_FIRST_MS = 55;
const ROLL_GROWTH = 1.15;
const REACT_FIRST_MS = 600;
const REACT_GAP_MIN = 300;
const REACT_GAP_SPAN = 501;
const CHECK_SIDES = 100;
const KIND_TAG = { pick: '安价', vote: '多数决', anchor: '安价', collect: '征集', check: '判定', coc: '检定' };
const PIPS = { 1: [[8, 8]], 2: [[5, 5], [11, 11]], 3: [[4.6, 4.6], [8, 8], [11.4, 11.4]], 4: [[5, 5], [11, 5], [5, 11], [11, 11]], 5: [[4.6, 4.6], [11.4, 4.6], [8, 8], [4.6, 11.4], [11.4, 11.4]], 6: [[5, 4.4], [11, 4.4], [5, 8], [11, 8], [5, 11.6], [11, 11.6]] };
const TICK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path pathLength="1" d="M2.6 8.6C4 9.8 5.2 11 6.3 12.5C8.3 8.9 10.5 5.9 13.6 3.2"/></svg>';

export function ankeDiceSvg(v) {
    const pips = PIPS[v];
    const face = pips ? pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.25"/>`).join('') : `<text x="8" y="11.2" text-anchor="middle">${v}</text>`;
    return `<svg class="igs-fm-anke-die" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.2" y="1.2" width="13.6" height="13.6" rx="3"/>${face}</svg>`;
}

const signedText = (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

// d：layer 传来的小工具 { el, esc, winOf, reducedMotion, stateOf, replyNode, headHtml, scrollEnd }。
export function syncAnke(overlay, list, view, revealing, d) {
    const anke = view.anke;
    const old = [...list.querySelectorAll('[data-anke-of]')];
    if (!anke) { old.forEach((n) => n.remove()); return; }
    const sig = JSON.stringify([anke.key, anke.readonly === true]);
    if (old.length && old[0].dataset.ankeOf === sig) return;
    old.forEach((n) => n.remove());
    if (view.upto < view.rows.length - 1) return;
    build(overlay, list, view, revealing, d, sig);
}

function build(overlay, list, view, revealing, d, sig) {
    const doc = overlay.ownerDocument;
    const win = d.winOf(overlay);
    const s = d.stateOf(overlay);
    const anke = view.anke;
    const kind = anke.kind;
    const floorKind = kind === 'anchor' || kind === 'collect';
    const n = anke.options.length;
    const live = Boolean(revealing);
    const st = { lock: anke.lock || null, busy: false };
    const latest = () => s.view || view;
    const bonusNow = () => (kind === 'check' && latest().ankeBonus ? latest().ankeBonus(anke.actor, anke.ability) : null);
    const mkLink = (cls, text) => { const b = d.el(doc, 'button', `igs-fm-anke-link ${cls}`); b.type = 'button'; b.textContent = text; return b; };

    const node = d.el(doc, 'div', 'igs-fm-post igs-fm-anke' + (live ? '' : ' is-in'));
    node.dataset.ankeOf = sig;
    node.dataset.ankeKind = kind;
    const meta = d.el(doc, 'div', 'igs-fm-meta');
    meta.innerHTML = d.headHtml({ id: anke.id, no: anke.no, time: anke.time, po: true });
    const body = d.el(doc, 'div', 'igs-fm-body');
    const q = d.el(doc, 'div', 'igs-fm-anke-q');
    const tag = d.el(doc, 'b', 'igs-fm-anke-tag');
    tag.textContent = KIND_TAG[kind];
    const qText = d.el(doc, 'span');
    qText.innerHTML = d.textHtml(anke.question, view, `${anke.key}:q`);
    q.append(tag, qText);
    body.append(q);

    const picks = [];
    const tickNode = () => { const t = d.el(doc, 'span', 'igs-fm-anke-tick'); t.innerHTML = TICK_SVG; return t; };
    if (kind === 'pick' || kind === 'vote') {
        anke.options.forEach((text, i) => {
            const row = d.el(doc, 'div', 'igs-fm-anke-opt');
            row.dataset.pick = String(i);
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            const no = d.el(doc, 'span', 'igs-fm-anke-no');
            no.textContent = `${i + 1}`;
            no.append(tickNode());
            const label = d.el(doc, 'span', 'igs-fm-anke-text');
            label.innerHTML = d.textHtml(text, view, `${anke.key}:o${i}`);
            row.append(no, label);
            body.append(row);
            picks.push(row);
        });
    }
    const floorNodes = floorKind ? anke.floors.map((f, i) => {
        const row = d.el(doc, 'div', 'igs-fm-reply igs-fm-anke-floor' + (live ? '' : ' is-in'));
        row.dataset.ankeOf = sig;
        row.dataset.floor = String(i);
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        const head = d.el(doc, 'div', 'igs-fm-meta');
        head.innerHTML = d.headHtml({ id: f.id, no: f.no, time: f.time, po: false });
        const text = d.el(doc, 'div', 'igs-fm-body');
        const no = d.el(doc, 'span', 'igs-fm-anke-no');
        no.textContent = `${i + 1}`;
        no.append(tickNode());
        const label = d.el(doc, 'span', 'igs-fm-anke-text');
        label.innerHTML = d.textHtml(f.text, view, `${anke.key}:f${i}`);
        text.append(no, label);
        row.append(head, text);
        return row;
    }) : [];
    const targets = floorKind ? floorNodes : picks;

    if (kind === 'check') {
        const mods = d.el(doc, 'div', 'igs-fm-anke-mods');
        const bonus = bonusNow();
        const parts = [`<span>判定对象 ${d.esc(anke.actor)}</span>`];
        if (anke.ability && bonus !== null) parts.push(`<span>${d.esc(ABILITY_LABELS[anke.ability])} <b class="${bonus > 0 ? 'is-up' : bonus < 0 ? 'is-down' : ''}">${bonus >= 0 ? '+' : '−'}${Math.abs(bonus)}</b></span>`);
        parts.push(`<span>成功线 ${anke.line}</span>`);
        mods.innerHTML = parts.join('');
        body.append(mods);
    }

    if (kind === 'coc') {
        const mods = d.el(doc, 'div', 'igs-fm-anke-mods');
        const cocValue = ankeCocValueOf(anke, st.lock);
        const need = ankeCocPlay({ die: 50, value: cocValue, level: anke.level }).need;
        mods.innerHTML = [`<span>检定对象 ${d.esc(anke.actorLabel || anke.actor)}</span>`, `<span>${d.esc(anke.skill)} ${cocValue}</span>`, anke.level === '普通' ? '' : `<span>${anke.level}线 ${need}</span>`].join('');
        body.append(mods);
    }

    const ops = d.el(doc, 'div', 'igs-fm-anke-ops');
    const hint = d.el(doc, 'span', 'igs-fm-anke-hint');
    const dice = d.el(doc, 'span', 'igs-fm-anke-dice');
    dice.hidden = true;
    if (kind === 'pick') { hint.textContent = '直接选择↑'; ops.append(hint, mkLink('is-roll', '不，我要随机ROLL点！'), mkLink('is-free', '自由安价'), dice); }
    else if (kind === 'vote') { hint.textContent = '点选项投一票↑'; ops.append(hint, mkLink('is-free', '自由安价')); }
    else if (kind === 'anchor') { hint.textContent = '直接点一楼↓'; ops.append(hint, mkLink('is-roll', `ROLL楼层 1D${n}`), mkLink('is-free', '自由安价'), dice); }
    else if (kind === 'collect') { hint.textContent = '直接点一楼↓'; ops.append(hint, mkLink('is-roll', '不，我要随机ROLL点！'), mkLink('is-free', '自己写一楼'), dice); }
    else if (kind === 'coc') { hint.textContent = '≤5 大成功 · 100 大失败'; ops.append(mkLink('is-roll', `掷骰！1D${CHECK_SIDES}`), hint, dice); }
    else { hint.textContent = '≤5 大成功 · ≥96 大失败'; ops.append(mkLink('is-roll', `掷骰！1D${CHECK_SIDES}`), hint, dice); }
    body.append(ops);
    node.append(meta, body);

    const all = [node, ...floorNodes];
    const show = () => all.forEach((x) => x.classList.add('is-in'));
    if (kind === 'pick') list.append(...all);
    else {
        const lastPost = list.querySelector(`.igs-fm-post[data-post="${view.plan.length - 1}"]`);
        if (lastPost) lastPost.after(...all); else list.append(...all);
    }
    if (revealing) revealing.then(show, show);

    const setDice = (v, text) => { dice.hidden = !text; const html = text ? ankeDiceSvg(v) + `<span>${d.esc(text)}</span>` : ''; if (dice.innerHTML !== html) dice.innerHTML = html; };
    const markAt = (i, animate) => {
        targets.forEach((o, j) => { o.classList.toggle('is-pick', j === i); o.classList.remove('is-tick', 'is-still'); });
        if (i < 0 || !targets[i]) return;
        if (animate) { void targets[i].offsetWidth; targets[i].classList.add('is-tick'); } else targets[i].classList.add('is-tick', 'is-still');
    };
    const fill = (text) => {
        const prev = s.ankeLine && s.ankeLine[anke.key] || '';
        const cb = latest().onAnke;
        if (!cb) return;
        Promise.resolve(cb(text, prev)).then((r) => { if (!r || r.ok !== false) s.ankeLine = { ...s.ankeLine, [anke.key]: text }; }).catch(() => {});
    };

    const showTally = (lock, animate) => {
        const box = d.el(doc, 'div', 'igs-fm-anke-tally');
        const max = Math.max(...lock.tally);
        lock.tally.forEach((v, i) => {
            const row = d.el(doc, 'div', 'igs-fm-anke-trow' + (i === lock.roll ? ' is-win' : ''));
            const no = d.el(doc, 'span');
            no.textContent = `${i + 1}`;
            const bar = d.el(doc, 'span', 'igs-fm-anke-bar');
            const fillBar = d.el(doc, 'i');
            const width = `${Math.round((v / max) * 100)}%`;
            fillBar.style.width = animate ? '0%' : width;
            if (animate) win.requestAnimationFrame(() => win.requestAnimationFrame(() => { fillBar.style.width = width; }));
            bar.append(fillBar);
            const count = d.el(doc, 'span');
            count.textContent = `${v}票`;
            row.append(no, bar, count);
            box.append(row);
        });
        body.insertBefore(box, ops);
        ops.hidden = true;
        const you = d.el(doc, 'span', 'igs-fm-anke-you');
        you.textContent = '你投了这个';
        picks[lock.pick].querySelector('.igs-fm-anke-text').append(you);
    };
    const showCoc = (lock) => {
        const play = ankeCocPlay({ die: lock.die, value: ankeCocValueOf(anke, lock), level: anke.level });
        const big = play.tier === '大成功' || play.tier === '大失败';
        ops.innerHTML = `<span class="igs-fm-anke-dice">${ankeDiceSvg(lock.die)}<span>1D${CHECK_SIDES} = ${lock.die}</span></span>`
            + (big ? '' : `<span class="igs-fm-anke-calc"><b>${lock.die}</b> ${lock.die <= play.need ? '≤' : '>'} ${play.need}</span>`)
            + `<b class="igs-fm-anke-res">${d.esc(play.ok || big ? play.tier : `${play.tier}，没达到${anke.level}`)}</b>`;
    };
    const showCheck = (lock) => {
        const bonus = lock.total - lock.die;
        const ok = lock.tier === '成功' || lock.tier === '大成功';
        const big = lock.tier === '大成功' || lock.tier === '大失败';
        const expr = bonus ? `${lock.die} ${signedText(bonus)} = <b>${lock.total}</b>` : `<b>${lock.die}</b>`;
        ops.innerHTML = `<span class="igs-fm-anke-dice">${ankeDiceSvg(lock.die)}<span>1D${CHECK_SIDES} = ${lock.die}</span></span>`
            + (big ? '' : `<span class="igs-fm-anke-calc">${expr} ${ok ? '≥' : '<'} ${anke.line}</span>`)
            + `<b class="igs-fm-anke-res">${d.esc(lock.tier)}</b>`;
    };
    const showReact = (react, animate) => {
        const calm = d.reducedMotion(overlay);
        let delay = REACT_FIRST_MS;
        react.forEach((r, j) => {
            const make = (fresh) => {
                const rn = d.replyNode(doc, { id: r.id, no: r.no, time: r.time, text: r.text, quote: '', ref: 0, po: false }, latest(), fresh);
                rn.classList.add('is-builtin');
                rn.dataset.ankeOf = sig;
                return rn;
            };
            if (!animate || calm) { list.append(make(false)); return; }
            win.setTimeout(() => {
                if (!node.isConnected) return;
                const rn = make(true);
                list.append(rn);
                win.requestAnimationFrame(() => rn.classList.add('is-in'));
                d.scrollEnd(list.closest('#igs-forum-reader'), true);
            }, delay);
            delay += REACT_GAP_MIN + (forumHash(`${anke.key}:gap${j}`) % REACT_GAP_SPAN);
        });
    };
    const paint = (animate) => {
        const lock = st.lock;
        all.forEach((x) => x.classList.add('is-locked'));
        if (!lock) return;
        if (kind === 'pick') markAt(lock.pick, animate);
        if (kind === 'vote' && lock.pick >= 0) { markAt(lock.roll, animate); showTally(lock, animate); }
        if (floorKind) markAt(lock.pick, animate);
        if ((kind === 'pick' || floorKind) && lock.roll > 0) setDice(lock.die, `1D${lock.roll} = ${lock.die}`);
        if (kind === 'check') showCheck(lock);
        if (kind === 'coc') showCoc(lock);
        showReact(lock.react || [], animate);
    };

    const commit = (part) => {
        const lock = { kind, pick: -1, roll: 0, die: 0, total: 0, tier: '', tally: [], ...part };
        lock.at = Date.now();
        lock.floors = floorKind ? anke.floors.map((f) => ({ no: f.no, text: f.text })) : [];
        const slots = anke.reactSlots || [];
        const noReact = latest().settings && latest().settings.replies === 'off';
        lock.react = kind === 'pick' || noReact ? [] : ankeReactions({ kind: kind === 'vote' && lock.pick < 0 ? 'anchor' : kind === 'coc' ? 'check' : kind, outcome: ankeOutcomeOf(anke, lock), seed: `${anke.key}:${lock.pick}:${lock.die}:${lock.roll}`, ids: anke.passers || [], avoid: anke.aiTexts || [] })
            .slice(0, slots.length).map((r, j) => ({ no: slots[j].no, id: r.id, time: slots[j].time, text: r.text }));
        st.lock = lock;
        if (latest().onAnkeLock) latest().onAnkeLock(anke.key, lock);
        fill(ankeFillLine({ ...anke, bonus: kind === 'check' ? lock.total - lock.die : null }, lock));
    };
    const settle = (part) => { commit(part); paint(true); };
    const runRoll = (result, count, shown, done) => {
        st.busy = true;
        if (d.reducedMotion(overlay)) { done(); return; }
        let step = 0;
        const tick = () => {
            if (!node.isConnected) { st.busy = false; return; }
            if (step >= ROLL_STEPS - 1) { done(); return; }
            shown((((result - 1 - (ROLL_STEPS - 1 - step)) % count) + count) % count);
            win.setTimeout(tick, ROLL_FIRST_MS * ROLL_GROWTH ** step);
            step += 1;
        };
        tick();
    };

    const onClick = (event) => {
        event.stopPropagation();
        const t = event.target && event.target.closest ? event.target : null;
        if (!t || anke.readonly || st.lock || st.busy || (latest().anke && latest().anke.key === anke.key && latest().anke.lock)) return;
        const row = t.closest('.igs-fm-anke-opt');
        if (row) {
            const i = Number(row.dataset.pick);
            if (kind === 'vote') {
                const play = ankeVotePlay({ visible: anke.visible || Array(n).fill(0), pick: i, seed: `${anke.key}:${i}` });
                settle({ pick: i, roll: play.winner, tally: play.tally });
            } else settle({ pick: i });
            return;
        }
        const floor = t.closest('.igs-fm-anke-floor');
        if (floor) { settle({ pick: Number(floor.dataset.floor) }); return; }
        if (t.closest('.is-free')) { settle({ pick: -1 }); return; }
        if (!t.closest('.is-roll')) return;
        if (kind === 'coc') {
            const die = ankeRoll(CHECK_SIDES);
            commit({ die, total: die, value: anke.value, tier: ankeCocPlay({ die, value: anke.value, level: anke.level }).tier });
            runRoll(die, CHECK_SIDES, (at) => setDice(at + 1, `1D${CHECK_SIDES} = ${at + 1}`), () => { st.busy = false; paint(true); });
            return;
        }
        if (kind === 'check') {
            const die = ankeRoll(CHECK_SIDES);
            const play = ankeCheckPlay({ die, bonus: bonusNow(), line: anke.line });
            commit({ die, total: play.total, tier: play.tier });
            runRoll(die, CHECK_SIDES, (at) => setDice(at + 1, `1D${CHECK_SIDES} = ${at + 1}`), () => { st.busy = false; paint(true); });
            return;
        }
        const result = ankeRoll(n);
        commit({ pick: result - 1, roll: n, die: result });
        runRoll(result, n, (at) => { targets.forEach((o, j) => { o.classList.toggle('is-pick', j === at); o.classList.remove('is-tick', 'is-still'); }); setDice(at + 1, `1D${n} → ${at + 1}`); },
            () => { st.busy = false; paint(true); });
    };
    const onKey = (event) => {
        const row = event.target.closest && event.target.closest('.igs-fm-anke-opt, .igs-fm-anke-floor');
        if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); row.click(); }
    };
    for (const x of all) { x.addEventListener('click', onClick); x.addEventListener('keydown', onKey); }
    if (anke.readonly || st.lock) paint(false);
}
