import { BUILTIN_NUDE_OUTFIT, isBuiltinNudeOutfit, outfitsOfCharacter } from '../../scene/character-outfits.js';

// 感官调度：每段只有一个主导感官，放大它、压下其余。来源优先 [igs-fx:sense] 区间，没有标签时按本页正文关键词兜底（只管本页）。
// 这里全是纯函数：感官判定、声画混合参数、脱衣判定、CG 镜头运镜表。DOM 与声音由 romance-runtime / romance-intimate-runtime 落地。
export const SENSES = Object.freeze(['blind', 'ear', 'touch', 'heat', 'cool', 'scent', 'hush', 'daze']);

// 关键词按优先级排列：剥夺型（蒙眼、屏息、失神）先于放大型。只认比较明确的说法，宁可漏也不乱触发。
const SENSE_WORDS = Object.freeze([
    ['blind', /蒙(住|上|着)[^，。！？\n]{0,4}眼|眼罩|遮住[^，。！？\n]{0,3}(眼睛|视线)|闭(上|着)[^，。！？\n]{0,2}眼|一片漆黑|黑暗中/],
    ['hush', /屏住[^，。！？\n]{0,2}(呼吸|气)|屏息|大气[^，。！？\n]{0,2}不敢出|不敢出声/],
    ['daze', /失神|一片空白|意识[^，。！？\n]{0,2}(模糊|涣散|远去)|眼前[^，。！？\n]{0,3}发白|恍惚/],
    ['ear', /耳(边|畔|垂|廓|尖|根|后)|贴着[^，。！？\n]{0,3}耳|呢喃|耳语|往[^，。！？\n]{0,3}耳[^，。！？\n]{0,3}吹/],
    ['touch', /指尖|抚(摸|过|上)|摩挲|触(碰|到)|轻抚|划过|游移/],
    ['heat', /滚烫|灼热|发烫|燥热|热气|体温/],
    ['cool', /冰凉|微凉|凉意|寒意|鸡皮疙瘩|凉飕飕/],
    ['scent', /香(气|味)|芬芳|清香|幽香|发香|体香|嗅/],
]);

export function detectSenseByText(text) {
    const src = String(text || '');
    if (!src) return '';
    for (const [sense, re] of SENSE_WORDS) {
        if (re.test(src)) return sense;
    }
    return '';
}

// 本页感官：标签区间优先；keywords 关时只认标签。返回 { sense, source: 'tag' | 'text' | '' }。
export function resolvePageSense({ fx, text, keywords = true } = {}) {
    const tagged = fx && SENSES.includes(fx.sense) ? fx.sense : '';
    if (tagged) return { sense: tagged, source: 'tag' };
    const found = keywords ? detectSenseByText(text) : '';
    return found ? { sense: found, source: 'text' } : { sense: '', source: '' };
}

// 声画混合：duck 为场景声（BGM / 环境）再乘的比例；heart / breath / creak 为原有声音的增益倍数；
// breathStretch 拉长呼吸周期；sway 为晃动倍数（0 = 定格）；pan 表示呼吸贴到一侧耳朵；
// tinnitus 开耳鸣；haze 开热浪；slowText 打字机降一档；cgHold 让 CG 镜头停住。
export const SENSE_MIX = Object.freeze({
    blind: Object.freeze({ duck: 0.7, heart: 1.3, breath: 1.25, creak: 0.85, sway: 0.6, cgHold: true }),
    ear: Object.freeze({ duck: 0.6, heart: 0.8, breath: 1.5, creak: 0.6, sway: 0.8, pan: true }),
    touch: Object.freeze({ duck: 0.85, heart: 1.15, breath: 1, creak: 0.8, sway: 0.8, cloth: true }),
    heat: Object.freeze({ duck: 0.85, heart: 1.1, breath: 1.15, creak: 1, sway: 1, haze: true }),
    cool: Object.freeze({ duck: 0.9, heart: 0.9, breath: 0.9, creak: 0.9, sway: 0.9 }),
    scent: Object.freeze({ duck: 0.8, heart: 0.85, breath: 1.1, breathStretch: 1.35, creak: 0.6, sway: 0.7, slowText: true }),
    hush: Object.freeze({ duck: 0.25, heart: 1.25, breath: 0, creak: 0, sway: 0, slowText: true, cgHold: true }),
    daze: Object.freeze({ duck: 0.35, heart: 0.7, breath: 0.6, creak: 0, sway: 0.3, tinnitus: true, slowText: true }),
});

export function senseMix(sense) {
    return SENSE_MIX[sense] || null;
}

// 把感官叠到亲密声画的 plan 上（返回新对象）。soundOk 为当前是否允许出声；edge 为是否允许画面边缘效果。
export function applySenseToPlan(plan, sense, { edge = true, soundOk = true, coarse = false, low = false } = {}) {
    const mix = senseMix(sense);
    if (!plan || !mix) return plan;
    const next = { ...plan, sense, senseVisual: edge };
    // 只在本来就压低场景声时（开了亲密声音）再加压，不替关掉声音的人压 BGM。
    if (plan.duck > 0) next.duck = Math.max(0.05, Number((plan.duck * mix.duck).toFixed(3)));
    next.heartGain = mix.heart;
    next.breathGain = mix.breath;
    next.creakGain = mix.creak;
    if (!(mix.breath > 0)) next.breath = 0;
    else if (next.breath && mix.breathStretch) next.breath = Number((next.breath * mix.breathStretch).toFixed(2));
    if (!(mix.creak > 0)) {
        next.creak = false;
        next.knock = false;
    }
    if (next.sway) {
        next.sway = mix.sway > 0 ? scaleAmplitude(next.sway, mix.sway) : null;
    }
    next.breathPan = Boolean(mix.pan);
    next.senseCloth = Boolean(mix.cloth) && soundOk && Boolean(plan.cloth);
    if (mix.tinnitus && soundOk && plan.level === 3) next.tinnitus = true;
    if (mix.haze && edge && !coarse && !low && plan.level >= 2) next.haze = Math.max(plan.haze || 0, 0.5);
    return next;
}

function scaleAmplitude(amplitude, k) {
    return {
        x: Number((amplitude.x * k).toFixed(3)),
        y: Number((amplitude.y * k).toFixed(3)),
        r: Number((amplitude.r * k).toFixed(4)),
        shake: Number(((amplitude.shake || 0) * k).toFixed(3)),
    };
}

// ── 脱衣 ──
// 正文里的脱衣动作：动词 + 衣物，或衣物 + 滑落类结果。
const UNDRESS_RE = /(脱(下|掉|去)|解开|褪(下|去)|扯(下|开|掉)|剥(下|去)|拉(下|开)[^，。！？\n]{0,2}拉链)[^，。！？\n]{0,6}(衣|裙|衫|裤|扣|带|罩|袜|浴巾|和服|睡袍|外套|领口)|(衣|裙|衫|浴巾|睡袍|肩带|和服)[^，。！？\n]{0,4}(滑落|落地|褪下|散开)/;

export function detectUndressByText(text) {
    return UNDRESS_RE.test(String(text || ''));
}

// 这一套服装是不是「裸体」：服装名就是内置的裸体，或衣柜里这一套引用了裸体。
export function isNudeOutfit(sceneAssets, character, outfit) {
    const name = String(outfit || '').trim();
    if (!name) return false;
    if (isBuiltinNudeOutfit(name)) return true;
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const found = outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, character);
    const entry = found && found.outfits ? found.outfits[name] : null;
    return Boolean(entry && entry.wardrobe === BUILTIN_NUDE_OUTFIT);
}

// 纯函数：本页要不要播脱衣。memory 为 Map(角色 → 上一页是否裸体)，会被更新。
// 衣柜路线：同一角色从穿衣切到裸体；正文路线：出现脱衣动作。只在往前翻到新页时触发，翻回旧页不重播。
export function planUndress(memory, { character, nude, text, forward = true } = {}) {
    const who = String(character || '').trim();
    let outfitHit = false;
    if (who) {
        const before = memory.get(who);
        memory.delete(who);
        memory.set(who, nude === true);
        while (memory.size > 64) memory.delete(memory.keys().next().value);
        outfitHit = before === false && nude === true;
    }
    if (!forward) return '';
    if (outfitHit) return 'outfit';
    return detectUndressByText(text) ? 'text' : '';
}

// ── CG 镜头 ──
// 运镜只用 transform：scale(s) translate(x%, y%)，平移量不超过放大留出的余量，画面边缘不会露底。
// y 为正表示画面下移、看到 CG 上部（通常是脸）。
function frame(s, x, y) {
    const room = ((s - 1) / (2 * s)) * 100 * 0.9;
    const clamp = (v) => Math.max(-room, Math.min(room, v * room));
    return { s, x: Number(clamp(x).toFixed(2)), y: Number(clamp(y).toFixed(2)) };
}

export const CG_SHOTS = Object.freeze({
    'tilt-down': Object.freeze({ from: frame(1.2, 0, 1), to: frame(1.2, 0, -1), dur: 26, loop: true }),
    'tilt-up': Object.freeze({ from: frame(1.2, 0, -1), to: frame(1.2, 0, 1), dur: 26, loop: true }),
    'drift-left': Object.freeze({ from: frame(1.14, 1, 0.3), to: frame(1.14, -1, 0.1), dur: 30, loop: true }),
    'drift-right': Object.freeze({ from: frame(1.14, -1, 0.3), to: frame(1.14, 1, 0.1), dur: 30, loop: true }),
    push: Object.freeze({ from: frame(1.06, 0, 0.3), to: frame(1.24, 0, 0.75), dur: 16, loop: true }),
    pull: Object.freeze({ from: frame(1.22, 0, 0.6), to: frame(1.02, 0, 0), dur: 18, loop: false }),
    breathe: Object.freeze({ from: frame(1.04, 0, 0), to: frame(1.1, 0, 0.3), dur: 22, loop: true }),
});

function hash(text) {
    let h = 0;
    for (const ch of String(text || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h;
}

// 选镜头：情事按阶段（升温缓扫、平稳交替扫与横移、顶点推近、余韵拉远）；暧昧 / 亲密轻缓横移或呼吸推镜。
// 同一张 CG、同一阶段、同一感官总选同一个镜头（重绘不换）；触碰推近。剥夺型感官定格由 cgHold 控制。
export function pickCgShot({ url, level = 0, phase = '', sense = '' } = {}) {
    if (!url || !(level > 0)) return '';
    if (phase === 'after') return 'pull';
    if (phase === 'climax' || sense === 'touch') return 'push';
    const h = hash(`${url}|${phase}`);
    if (level === 3) {
        if (phase === 'rise') return h % 2 ? 'tilt-down' : 'tilt-up';
        return ['tilt-down', 'drift-left', 'tilt-up', 'drift-right'][h % 4];
    }
    return ['breathe', 'drift-left', 'drift-right'][h % 3];
}

export function cgShotTransform(f) {
    return `scale(${f.s}) translate(${f.x}%, ${f.y}%)`;
}

// ── 独处 ──
// 标签 [igs-fx:solo] 优先；没有标签时，情事段里出现明确说法就把这一段记为独处（只往后生效，前面已经播过的不改）。
const SOLO_RE = /自慰|自渎|手淫|抚慰着?自己/;
const NOISE_WORDS = Object.freeze([
    ['steps', /脚步声|(传来|响起)[^，。！？\n]{0,4}脚步/],
    ['knock', /敲门|叩门|咚咚[^，。！？\n]{0,2}门/],
    ['phone', /手机[^，。！？\n]{0,4}(震|振)动|(震|振)动起来|来电铃/],
    ['door', /门把|开门声|门[^，。！？\n]{0,2}被?(推开|打开)|钥匙[^，。！？\n]{0,4}(转动|插进)/],
]);
const IMAGINE_RE = /(想着|想起|想象|幻想|浮现|脑海里|满脑子)[^，。！？\n]{0,10}/g;

export function detectSoloByText(text) {
    return SOLO_RE.test(String(text || ''));
}

export function detectNoiseByText(text) {
    const src = String(text || '');
    if (!src) return '';
    const hit = NOISE_WORDS.find(([, re]) => re.test(src));
    return hit ? hit[0] : '';
}

// 从「想着 / 幻想 / 脑海里……」后面 10 个字里认已登记的角色名；names 为 [[角色, [别名…]], …]，self 为正在独处的角色（不算）。
export function detectImaginedTarget(text, names, self = '') {
    const src = String(text || '');
    if (!src || !Array.isArray(names) || !names.length) return '';
    const me = String(self || '').trim();
    for (const match of src.matchAll(IMAGINE_RE)) {
        const window = match[0];
        for (const [name, aliases] of names) {
            if (!name || name === me) continue;
            if ([name, ...(aliases || [])].some((word) => Array.from(String(word || '')).length >= 2 && window.includes(word))) return name;
        }
    }
    return '';
}

// 已登记角色与别名，供 detectImaginedTarget 使用。
export function registeredNames(sceneAssets) {
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const aliases = assets.characterAliases && typeof assets.characterAliases === 'object' ? assets.characterAliases : {};
    return Object.keys(assets.characters || {}).map((name) => [name, Array.isArray(aliases[name]) ? aliases[name] : []]);
}
