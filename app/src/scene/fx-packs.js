// 题材包登记中心：静态 import 各包的清单模块，合并成日常演出各中心表要用的数据。
// 包只填自己的 PACK 对象（V fx-pack-<id>.js），不碰中心表；字段与约定见 docs/FX_PACK_CONTRACT.md。
// 清单模块及其辅助文件不许 import daily-fx-directives / fx-daily-model / fx-daily-prompt / prompt-triggers / fx-era /
// fx-daily / fx-daily-sfx / scene-audio / 本文件（会成环）；需要的原语由调用方传参。
import { PACK as transform } from '../visual/igs-ui/fx-pack-transform.js';
import { PACK as beats } from '../visual/igs-ui/fx-pack-beats.js';
import { PACK as festival } from '../visual/igs-ui/fx-pack-festival.js';
import { PACK as variety } from '../visual/igs-ui/fx-pack-variety.js';
import { PACK as harem } from '../visual/igs-ui/fx-pack-harem.js';
import { PACK as abo } from '../visual/igs-ui/fx-pack-abo.js';
import { PACK as myth } from '../visual/igs-ui/fx-pack-myth.js';
import { PACK as wuxia } from '../visual/igs-ui/fx-pack-wuxia.js';
import { PACK as nsfw } from '../visual/igs-ui/fx-pack-nsfw.js';
import { PACK as coc } from '../visual/igs-ui/fx-pack-coc.js';
import { PACK as places } from '../visual/igs-ui/fx-pack-places.js';
import { PACK as idol } from '../visual/igs-ui/fx-pack-idol.js';
import { PACK as camera } from '../visual/igs-ui/fx-pack-camera.js';

const ERAS = Object.freeze(['modern', 'ancient']);
const KIND_RE = /^[a-z]+$/;
const SWITCH_RE = /^[a-zA-Z]+\.enabled$/;
const empty = Object.freeze({});
const emptyList = Object.freeze([]);

function table(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : empty;
}

function list(value) {
    return Array.isArray(value) ? value : emptyList;
}

function fn(value, fallback) {
    return typeof value === 'function' ? value : fallback;
}

// 把清单补全成统一形状；缺的字段一律给空值，空壳包合并后对中心表零影响。
export function normalizePack(raw) {
    const pack = table(raw);
    const ambience = table(pack.ambience);
    const ambient = table(pack.ambient);
    return Object.freeze({
        id: String(pack.id || ''),
        label: String(pack.label || pack.id || ''),
        when: String(pack.when || '对应场面发生时才用'),
        era: ERAS.includes(pack.era) ? pack.era : null,
        eraKinds: table(pack.eraKinds),
        worldviewOff: table(pack.worldviewOff),
        requires: typeof pack.requires === 'string' ? pack.requires : '',
        // 通用演出包（不挑题材）声明 defaultOn：总开关与各 kind 默认开，用户显式关掉才关。
        defaultOn: pack.defaultOn === true,
        packSwitch: typeof pack.packSwitch === 'string' && SWITCH_RE.test(pack.packSwitch) ? pack.packSwitch : '',
        settings: fn(pack.settings, null),
        allowNsfw: pack.allowNsfw === true,
        kinds: Object.freeze([...list(pack.kinds)]),
        labels: table(pack.labels),
        triggers: table(pack.triggers),
        promptLines: table(pack.promptLines),
        grammarLines: table(pack.grammarLines),
        parse: fn(pack.parse, () => null),
        of: fn(pack.of, null),
        builders: table(pack.builders),
        sfx: table(pack.sfx),
        cssText: String(pack.cssText || ''),
        states: table(pack.states),
        ambience: Object.freeze({
            html: table(ambience.html),
            still: list(ambience.still),
            resolve: fn(ambience.resolve, () => null),
        }),
        ambient: Object.freeze({
            kinds: list(ambient.kinds),
            labels: table(ambient.labels),
            voices: fn(ambient.voices, () => empty),
            plan: fn(ambient.plan, () => emptyList),
        }),
    });
}

// 清单自检：重复 kind、非法 kind 名、缺标签 / 触发词 / 提示词 / 构建器、音效名无定义。返回问题列表，空表示通过。
export function validatePacks(packs) {
    const problems = [];
    const seen = new Map();
    for (const pack of packs) {
        if (!KIND_RE.test(pack.id)) problems.push(`${pack.id}: id 只能是小写字母`);
        for (const kind of pack.kinds) {
            if (!KIND_RE.test(kind)) problems.push(`${pack.id}.${kind}: kind 只能是小写字母`);
            if (seen.has(kind)) problems.push(`${pack.id}.${kind}: 与 ${seen.get(kind)} 重复`);
            seen.set(kind, pack.id);
            if (!pack.labels[kind]) problems.push(`${pack.id}.${kind}: 缺中文标签`);
            if (!list(pack.triggers[kind]).length) problems.push(`${pack.id}.${kind}: 缺触发词`);
            if (!pack.promptLines[kind]) problems.push(`${pack.id}.${kind}: 缺提示词`);
            if (typeof pack.builders[kind] !== 'function') problems.push(`${pack.id}.${kind}: 缺构建器`);
        }
        for (const name of Object.keys(pack.builders)) if (!pack.kinds.includes(name)) problems.push(`${pack.id}.${name}: 构建器没有对应 kind`);
        for (const kind of pack.ambient.kinds) {
            if (!pack.ambient.labels[kind]) problems.push(`${pack.id}.ambient.${kind}: 缺中文标签`);
        }
        for (const kind of pack.ambience.still) if (!pack.ambience.html[kind]) problems.push(`${pack.id}.ambience.${kind}: still 里的类型没有氛围 HTML`);
    }
    return problems;
}

// 把一组清单合并成所有中心表要用的数据。默认注册表由下面登记的各个包生成；测试可传入假清单单独验证合并规则。
export function buildPackRegistry(manifests) {
    const packs = Object.freeze(manifests.map(normalizePack));
    const active = Object.freeze(packs.filter((pack) => pack.kinds.length));
    const byId = new Map(packs.map((pack) => [pack.id, pack]));
    const ownerOf = new Map();
    for (const pack of packs) for (const kind of pack.kinds) if (!ownerOf.has(kind)) ownerOf.set(kind, pack);
    const merge = (pick) => Object.freeze(Object.assign({}, ...packs.map(pick)));
    const states = merge((pack) => pack.states);
    const promptLines = merge((pack) => pack.promptLines);
    const settingGroups = Object.fromEntries(active.filter((pack) => pack.packSwitch).map((pack) => {
        const normalize = pack.settings || (() => ({}));
        return [pack.packSwitch.split('.')[0], (value) => ({
            ...normalize(value),
            enabled: pack.defaultOn ? !(value && typeof value === 'object' && value.enabled === false)
                : Boolean(value && typeof value === 'object' && value.enabled === true),
        })];
    }));
    const eraTables = { modern: [], ancient: [] };
    const worldviewOff = {};
    for (const pack of packs) {
        for (const kind of pack.kinds) {
            const era = Object.hasOwn(pack.eraKinds, kind) ? pack.eraKinds[kind] : pack.era;
            if (era === 'modern' || era === 'ancient') eraTables[era].push(kind);
        }
        for (const [worldview, kinds] of Object.entries(pack.worldviewOff)) {
            worldviewOff[worldview] = [...(worldviewOff[worldview] || []), ...list(kinds)];
        }
    }
    return Object.freeze({
        packs,
        active,
        ids: Object.freeze(packs.map((pack) => pack.id)),
        kinds: Object.freeze(packs.flatMap((pack) => pack.kinds)),
        labels: merge((pack) => pack.labels),
        triggerWords: merge((pack) => pack.triggers),
        promptLines,
        // 精简语法行缺省时沿用 promptLines（已含完整方括号写法，wrapFxLine 原样保留）。
        grammarLines: Object.freeze({ ...promptLines, ...merge((pack) => pack.grammarLines) }),
        builders: merge((pack) => pack.builders),
        sfx: merge((pack) => pack.sfx),
        styleText: packs.map((pack) => pack.cssText).filter(Boolean).join('\n'),
        ambienceHtml: merge((pack) => pack.ambience.html),
        stillKinds: Object.freeze(packs.flatMap((pack) => pack.ambience.still)),
        ambientKinds: Object.freeze(packs.flatMap((pack) => pack.ambient.kinds)),
        ambientLabels: merge((pack) => pack.ambient.labels),
        stateAliases: Object.freeze(Object.fromEntries(Object.entries(states).map(([id, spec]) => [id, list(spec && spec.aliases)]))),
        stateStyles: Object.freeze(Object.fromEntries(Object.entries(states).map(([id, spec]) => [id, { filter: spec && spec.filter, edge: spec && spec.edge }]))),
        settingGroups: Object.freeze(settingGroups),
        eraTables: Object.freeze(eraTables),
        worldviewOff: Object.freeze(worldviewOff),
        get: (id) => byId.get(String(id)) || null,
        ownerOf: (kind) => ownerOf.get(kind) || null,
        parse(type, fields) {
            const pack = ownerOf.get(type);
            return pack ? pack.parse(type, fields) || null : null;
        },
        itemOf(args) {
            const type = Array.isArray(args) ? args[0] : '';
            const pack = ownerOf.get(type);
            if (!pack) return null;
            if (pack.of) return pack.of(args) || null;
            return { type, fields: args.slice(1) };
        },
        // enabled 为启用的包 id 列表；返回 { kind, variant } 或 null。靠前的包先判。
        resolveAmbience(location, { worldview = '', enabled = [] } = {}) {
            for (const pack of packs) {
                if (!enabled.includes(pack.id)) continue;
                const hit = pack.ambience.resolve(location, { worldview });
                if (hit && hit.kind) return { kind: hit.kind, variant: hit.variant || '' };
            }
            return null;
        },
        // 包环境音候选 [{ kind, level, variant }]；ctx 即 resolveAmbientPlan 的 context（ctx.packs 是启用的包 id）。
        ambientCandidates(ctx, { night = false } = {}) {
            const enabled = ctx && Array.isArray(ctx.packs) ? ctx.packs : [];
            const out = [];
            for (const pack of packs) {
                if (!enabled.includes(pack.id)) continue;
                for (const item of pack.ambient.plan(ctx, { night }) || []) {
                    if (item && pack.ambient.kinds.includes(item.kind)) out.push({ kind: item.kind, level: item.level || 'medium', variant: item.variant || '' });
                }
            }
            return out;
        },
        // 包环境音的合成函数：h 是 scene-audio 传入的合成原语（同 createCampusVoices）。
        voices: (h) => Object.assign({}, ...packs.map((pack) => pack.ambient.voices(h))),
    });
}

const REGISTRY = buildPackRegistry([transform, beats, festival, variety, harem, abo, myth, wuxia, nsfw, coc, places, idol, camera]);

export const FX_PACKS = REGISTRY.packs;
export const FX_PACK_IDS = REGISTRY.ids;
// 有 kind 的包才进设置器、提示词块与按需触发；空壳包不产生任何东西。
export const FX_PACKS_ACTIVE = REGISTRY.active;
export const FX_PACK_KINDS = REGISTRY.kinds;
export const FX_PACK_LABELS = REGISTRY.labels;
export const FX_PACK_TRIGGER_WORDS = REGISTRY.triggerWords;
export const FX_PACK_PROMPT_LINES = REGISTRY.promptLines;
export const FX_PACK_GRAMMAR_LINES = REGISTRY.grammarLines;
export const FX_PACK_BUILDERS = REGISTRY.builders;
export const FX_PACK_SFX_DEFS = REGISTRY.sfx;
export const FX_PACK_STYLE_TEXT = REGISTRY.styleText;
export const FX_PACK_AMBIENCE_HTML = REGISTRY.ambienceHtml;
export const FX_PACK_STILL_KINDS = REGISTRY.stillKinds;
export const FX_PACK_AMBIENT_KINDS = REGISTRY.ambientKinds;
export const FX_PACK_AMBIENT_LABELS = REGISTRY.ambientLabels;
// 持续状态滤镜（B5）：包登记的类型 { id: { aliases, filter, edge } } 拆出的别名表与样式表。
export const FX_PACK_STATE_ALIASES = REGISTRY.stateAliases;
export const FX_PACK_STATE_STYLES = REGISTRY.stateStyles;
// 带自有开关的包在 readerSettings 顶层多一个设置组（如 aboFx），归一化函数由 FX_SETTINGS_NORMALIZERS 并入。
export const FX_PACK_SETTING_GROUPS = REGISTRY.settingGroups;
export const FX_PACK_WORLDVIEW_OFF = REGISTRY.worldviewOff;

export const getPack = REGISTRY.get;
export const packOfKind = REGISTRY.ownerOf;
export const parsePackFxBody = REGISTRY.parse;
export const packFxOf = REGISTRY.itemOf;
export const resolvePackAmbience = REGISTRY.resolveAmbience;
export const packAmbientCandidates = REGISTRY.ambientCandidates;
export const createPackVoices = REGISTRY.voices;

export function isPackKind(kind) {
    return REGISTRY.ownerOf(kind) !== null;
}

// 时代：整包 era 加逐 kind 覆盖（eraKinds 的值为 'modern' | 'ancient' | null，null 表示该 kind 不限）。
export function packEraTables() {
    return REGISTRY.eraTables;
}

// 默认的包总开关存在 readerSettings.dailyFx.pack<Id>（如 packAbo），和各 kind 的勾选同级；题材包默认关，清单声明 defaultOn 的通用包默认开。
export function packSwitchKey(id) {
    const s = String(id);
    return `pack${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

// 包清单可用 packSwitch 指到 readerSettings 里自己的开关（如 'aboFx.enabled'）；没写就用上面的默认键。
export function packSwitchPath(pack) {
    return pack.packSwitch || `dailyFx.${packSwitchKey(pack.id)}`;
}

export function packSwitchOn(pack, readerSettings) {
    const [group, key] = packSwitchPath(pack).split('.');
    const src = readerSettings && readerSettings[group];
    // defaultOn 的通用包：只有显式写 false 才算关；从未设置过按开处理（normalize 层同口径）。
    if (pack && pack.defaultOn === true) return !(src && typeof src === 'object' && src[key] === false);
    return Boolean(src && typeof src === 'object' && src[key] === true);
}

// 设置动作允许写入的包开关路径（readerSettings. 之后的部分）。
export function isPackSwitchPath(path) {
    return FX_PACKS_ACTIVE.some((pack) => packSwitchPath(pack) === path);
}

// 提示词按需块的键：pack<id>（小写字母，满足提示词条目路径的 [a-z]+）。
export function packBlockKey(id) {
    return `pack${id}`;
}

export const FX_PACK_BLOCK_KEYS = Object.freeze(FX_PACKS_ACTIVE.map((pack) => packBlockKey(pack.id)));

// readerSettings 里某包的前置开关是否满足（如直白型要求亲密演出总开关开着）。
export function packRequiresMet(pack, readerSettings) {
    if (!pack || !pack.requires) return true;
    const group = readerSettings && readerSettings[pack.requires];
    return Boolean(group && typeof group === 'object' && group.enabled === true);
}
