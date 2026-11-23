// 战斗特效皮肤主题模型与光栅美术素材索引：
// 为全部 10 套皮肤建立独立主题特效模型（去除卡通与手绘 SVG 几何风），直接引用 app/assets/combat-vfx/<套组>/<部位>.webp 光栅纹理。
// 必须保留完整字面量路径，供 app/scripts/build.js 识别并同步输出至 dist/combat-vfx/。

export const COMBAT_VFX_PACKS = Object.freeze({
    veil: Object.freeze({
        slash: new URL('../../../assets/combat-vfx/veil/slash.webp', import.meta.url).href,
        burst: new URL('../../../assets/combat-vfx/veil/burst.webp', import.meta.url).href,
        shield: new URL('../../../assets/combat-vfx/veil/shield.webp', import.meta.url).href,
        shatter: new URL('../../../assets/combat-vfx/veil/shatter.webp', import.meta.url).href,
        aura: new URL('../../../assets/combat-vfx/veil/aura.webp', import.meta.url).href,
    }),
    ink: Object.freeze({
        slash: new URL('../../../assets/combat-vfx/ink/slash.webp', import.meta.url).href,
        burst: new URL('../../../assets/combat-vfx/ink/burst.webp', import.meta.url).href,
        shield: new URL('../../../assets/combat-vfx/ink/shield.webp', import.meta.url).href,
        shatter: new URL('../../../assets/combat-vfx/ink/shatter.webp', import.meta.url).href,
        aura: new URL('../../../assets/combat-vfx/ink/aura.webp', import.meta.url).href,
    }),
    comic: Object.freeze({
        slash: new URL('../../../assets/combat-vfx/comic/slash.webp', import.meta.url).href,
        burst: new URL('../../../assets/combat-vfx/comic/burst.webp', import.meta.url).href,
        shield: new URL('../../../assets/combat-vfx/comic/shield.webp', import.meta.url).href,
        shatter: new URL('../../../assets/combat-vfx/comic/shatter.webp', import.meta.url).href,
        aura: new URL('../../../assets/combat-vfx/comic/aura.webp', import.meta.url).href,
    }),
    tech: Object.freeze({
        slash: new URL('../../../assets/combat-vfx/tech/slash.webp', import.meta.url).href,
        burst: new URL('../../../assets/combat-vfx/tech/burst.webp', import.meta.url).href,
        shield: new URL('../../../assets/combat-vfx/tech/shield.webp', import.meta.url).href,
        shatter: new URL('../../../assets/combat-vfx/tech/shatter.webp', import.meta.url).href,
        aura: new URL('../../../assets/combat-vfx/tech/aura.webp', import.meta.url).href,
    }),
    mystic: Object.freeze({
        slash: new URL('../../../assets/combat-vfx/mystic/slash.webp', import.meta.url).href,
        burst: new URL('../../../assets/combat-vfx/mystic/burst.webp', import.meta.url).href,
        shield: new URL('../../../assets/combat-vfx/mystic/shield.webp', import.meta.url).href,
        shatter: new URL('../../../assets/combat-vfx/mystic/shatter.webp', import.meta.url).href,
        aura: new URL('../../../assets/combat-vfx/mystic/aura.webp', import.meta.url).href,
    }),
    soft: Object.freeze({
        slash: new URL('../../../assets/combat-vfx/soft/slash.webp', import.meta.url).href,
        burst: new URL('../../../assets/combat-vfx/soft/burst.webp', import.meta.url).href,
        shield: new URL('../../../assets/combat-vfx/soft/shield.webp', import.meta.url).href,
        shatter: new URL('../../../assets/combat-vfx/soft/shatter.webp', import.meta.url).href,
        aura: new URL('../../../assets/combat-vfx/soft/aura.webp', import.meta.url).href,
    }),
    dark: Object.freeze({
        slash: new URL('../../../assets/combat-vfx/dark/slash.webp', import.meta.url).href,
        burst: new URL('../../../assets/combat-vfx/dark/burst.webp', import.meta.url).href,
        shield: new URL('../../../assets/combat-vfx/dark/shield.webp', import.meta.url).href,
        shatter: new URL('../../../assets/combat-vfx/dark/shatter.webp', import.meta.url).href,
        aura: new URL('../../../assets/combat-vfx/dark/aura.webp', import.meta.url).href,
    }),
});

export const COMBAT_VFX_COMMON = Object.freeze({
    poison: new URL('../../../assets/combat-vfx/common/poison.webp', import.meta.url).href,
    confused: new URL('../../../assets/combat-vfx/common/confused.webp', import.meta.url).href,
    lightning: new URL('../../../assets/combat-vfx/common/lightning.webp', import.meta.url).href,
});

// 10 套皮肤各自的特效效果模型：包含视觉语言、配色、质感滤镜、顿帧倍率与动画节奏系数。
export const COMBAT_VFX_THEMES = Object.freeze({
    veil: Object.freeze({
        id: 'veil',
        pack: 'veil',
        label: '黑幕·锐光暗金',
        hitstopScale: 1,
        shakeScale: 1,
        palette: Object.freeze({
            hit: '#f7e5c0', heavy: '#ffb766', ko: '#ff6c4c',
            guard: '#a4dcff', break: '#8be0ff',
            buff: '#ffe29a', heal: '#78ebb0',
            debuff: '#c87aff', poison: '#8be858', confused: '#d496ff', vulnerable: '#ff667c',
            artifact: '#fff0be', cleanse: '#b4f4ff',
        }),
        filters: Object.freeze({
            buff: 'saturate(1.15) brightness(1.08)',
            heal: 'hue-rotate(88deg) saturate(1.25) brightness(1.08)',
            block: 'hue-rotate(155deg) saturate(1.2) brightness(1.12)',
            debuff: 'hue-rotate(235deg) saturate(1.35) contrast(1.12)',
            vulnerable: 'hue-rotate(-32deg) saturate(1.5) contrast(1.15)',
            artifact: 'saturate(1.25) brightness(1.2)',
            cleanse: 'hue-rotate(138deg) saturate(1.15) brightness(1.22)',
        }),
    }),
    initial: Object.freeze({
        id: 'initial',
        pack: 'veil',
        label: '经典·霜夜映画',
        hitstopScale: 0.95,
        shakeScale: 0.95,
        palette: Object.freeze({
            hit: '#f2e0be', heavy: '#ffba66', ko: '#ff7054',
            guard: '#9ad6ff', break: '#84dcff',
            buff: '#f2d49b', heal: '#6ce6a4',
            debuff: '#c280ff', poison: '#8be858', confused: '#d298ff', vulnerable: '#ff6b80',
            artifact: '#ffefc2', cleanse: '#b4f2ff',
        }),
        filters: Object.freeze({
            buff: 'saturate(1.1) brightness(1.06)',
            heal: 'hue-rotate(88deg) saturate(1.2) brightness(1.08)',
            block: 'hue-rotate(155deg) saturate(1.15) brightness(1.1)',
            debuff: 'hue-rotate(232deg) saturate(1.3) contrast(1.1)',
            vulnerable: 'hue-rotate(-30deg) saturate(1.45) contrast(1.12)',
            artifact: 'saturate(1.2) brightness(1.18)',
            cleanse: 'hue-rotate(138deg) saturate(1.1) brightness(1.2)',
        }),
    }),
    ink: Object.freeze({
        id: 'ink',
        pack: 'ink',
        label: '水墨·飞白朱砂',
        hitstopScale: 1.05,
        shakeScale: 1,
        palette: Object.freeze({
            hit: '#f2e8d6', heavy: '#e85a46', ko: '#d93c2a',
            guard: '#9fd8cc', break: '#8fe3d0',
            buff: '#f3d48c', heal: '#8ae0b8',
            debuff: '#b56ae8', poison: '#8be262', confused: '#c688f2', vulnerable: '#e85046',
            artifact: '#f5e4b0', cleanse: '#c6f0e6',
        }),
        filters: Object.freeze({
            buff: 'saturate(1.18) brightness(1.08)',
            heal: 'hue-rotate(96deg) saturate(1.2) brightness(1.06)',
            block: 'hue-rotate(135deg) saturate(1.12) brightness(1.08)',
            debuff: 'hue-rotate(245deg) saturate(1.28) contrast(1.12)',
            vulnerable: 'hue-rotate(-24deg) saturate(1.45) contrast(1.14)',
            artifact: 'saturate(1.2) brightness(1.18)',
            cleanse: 'hue-rotate(128deg) saturate(1.1) brightness(1.18)',
        }),
    }),
    comic: Object.freeze({
        id: 'comic',
        pack: 'comic',
        label: '漫画·赤墨网点',
        hitstopScale: 1.12,
        shakeScale: 1.15,
        palette: Object.freeze({
            hit: '#fff5e4', heavy: '#ff4848', ko: '#ff2638',
            guard: '#86d4ff', break: '#76e0ff',
            buff: '#ffd968', heal: '#62e89d',
            debuff: '#d458ff', poison: '#8cf052', confused: '#df8cff', vulnerable: '#ff3a58',
            artifact: '#fff0b2', cleanse: '#a8f0ff',
        }),
        filters: Object.freeze({
            buff: 'saturate(1.22) contrast(1.1) brightness(1.1)',
            heal: 'hue-rotate(92deg) saturate(1.28) contrast(1.08)',
            block: 'hue-rotate(165deg) saturate(1.25) contrast(1.08)',
            debuff: 'hue-rotate(242deg) saturate(1.38) contrast(1.15)',
            vulnerable: 'hue-rotate(-12deg) saturate(1.5) contrast(1.16)',
            artifact: 'saturate(1.22) contrast(1.1) brightness(1.18)',
            cleanse: 'hue-rotate(148deg) saturate(1.18) brightness(1.22)',
        }),
    }),
    tech: Object.freeze({
        id: 'tech',
        pack: 'tech',
        label: '科技·全息离子',
        hitstopScale: 0.96,
        shakeScale: 1.05,
        palette: Object.freeze({
            hit: '#8cf2ff', heavy: '#ffb84d', ko: '#ff5c48',
            guard: '#6ee8ff', break: '#5ce4ff',
            buff: '#74f5d8', heal: '#62f2b4',
            debuff: '#e858a8', poison: '#88f560', confused: '#c688ff', vulnerable: '#ff5270',
            artifact: '#c2f8ff', cleanse: '#a8ffff',
        }),
        filters: Object.freeze({
            buff: 'hue-rotate(-14deg) saturate(1.22) brightness(1.12)',
            heal: 'hue-rotate(-46deg) saturate(1.25) brightness(1.1)',
            block: 'saturate(1.2) brightness(1.14)',
            debuff: 'hue-rotate(138deg) saturate(1.42) contrast(1.14)',
            vulnerable: 'hue-rotate(168deg) saturate(1.5) contrast(1.16)',
            artifact: 'saturate(1.15) brightness(1.24)',
            cleanse: 'hue-rotate(-8deg) saturate(1.1) brightness(1.24)',
        }),
    }),
    mystic: Object.freeze({
        id: 'mystic',
        pack: 'mystic',
        label: '星秘·占星深空',
        hitstopScale: 1.02,
        shakeScale: 0.96,
        palette: Object.freeze({
            hit: '#f2dd9c', heavy: '#e8a8ff', ko: '#ff7094',
            guard: '#a6c6ff', break: '#b4d6ff',
            buff: '#f6de94', heal: '#86e8c8',
            debuff: '#b876ff', poison: '#8ee668', confused: '#d698ff', vulnerable: '#ff6488',
            artifact: '#fff0bc', cleanse: '#c6ecff',
        }),
        filters: Object.freeze({
            buff: 'saturate(1.18) brightness(1.1)',
            heal: 'hue-rotate(96deg) saturate(1.2) brightness(1.08)',
            block: 'hue-rotate(170deg) saturate(1.18) brightness(1.1)',
            debuff: 'hue-rotate(228deg) saturate(1.36) contrast(1.12)',
            vulnerable: 'hue-rotate(-36deg) saturate(1.45) contrast(1.12)',
            artifact: 'saturate(1.22) brightness(1.2)',
            cleanse: 'hue-rotate(150deg) saturate(1.12) brightness(1.2)',
        }),
    }),
    'soft-a': Object.freeze({
        id: 'soft-a',
        pack: 'soft',
        label: '柔粉A·琉璃花瓣',
        hitstopScale: 0.92,
        shakeScale: 0.88,
        palette: Object.freeze({
            hit: '#ffd4dc', heavy: '#ff96a8', ko: '#f05a76',
            guard: '#a8d8f0', break: '#9ad8f5',
            buff: '#ffe2a6', heal: '#90e2be',
            debuff: '#c688e8', poison: '#96e274', confused: '#d89eff', vulnerable: '#f0627e',
            artifact: '#fff0c6', cleanse: '#c4f2ec',
        }),
        filters: Object.freeze({
            buff: 'saturate(1.15) brightness(1.1)',
            heal: 'hue-rotate(92deg) saturate(1.18) brightness(1.08)',
            block: 'hue-rotate(162deg) saturate(1.15) brightness(1.1)',
            debuff: 'hue-rotate(238deg) saturate(1.26) contrast(1.08)',
            vulnerable: 'hue-rotate(-14deg) saturate(1.4) contrast(1.1)',
            artifact: 'saturate(1.18) brightness(1.18)',
            cleanse: 'hue-rotate(136deg) saturate(1.12) brightness(1.18)',
        }),
    }),
    'soft-c': Object.freeze({
        id: 'soft-c',
        pack: 'soft',
        label: '柔粉C·暖珊瑚光',
        hitstopScale: 0.92,
        shakeScale: 0.88,
        palette: Object.freeze({
            hit: '#ffd8c4', heavy: '#ff9070', ko: '#eb5846',
            guard: '#a6d8e8', break: '#98daf2',
            buff: '#ffe09c', heal: '#8ee0b8',
            debuff: '#c282e4', poison: '#94e070', confused: '#d498f8', vulnerable: '#f06458',
            artifact: '#fff0c0', cleanse: '#c4f2e8',
        }),
        filters: Object.freeze({
            buff: 'hue-rotate(-12deg) saturate(1.18) brightness(1.1)',
            heal: 'hue-rotate(84deg) saturate(1.18) brightness(1.08)',
            block: 'hue-rotate(155deg) saturate(1.15) brightness(1.1)',
            debuff: 'hue-rotate(232deg) saturate(1.28) contrast(1.08)',
            vulnerable: 'hue-rotate(-20deg) saturate(1.42) contrast(1.1)',
            artifact: 'saturate(1.18) brightness(1.18)',
            cleanse: 'hue-rotate(130deg) saturate(1.12) brightness(1.18)',
        }),
    }),
    'dark-a': Object.freeze({
        id: 'dark-a',
        pack: 'dark',
        label: '暗黑A·冷铁余烬',
        hitstopScale: 1.1,
        shakeScale: 1.12,
        palette: Object.freeze({
            hit: '#e6dfd4', heavy: '#ff6e48', ko: '#e03038',
            guard: '#8db7ee', break: '#7cc4ff',
            buff: '#ebd29a', heal: '#62d3b0',
            debuff: '#c868e8', poison: '#84dc58', confused: '#cc88f0', vulnerable: '#ff4e64',
            artifact: '#f4e6c2', cleanse: '#a4e4f4',
        }),
        filters: Object.freeze({
            buff: 'saturate(1.14) brightness(1.08)',
            heal: 'hue-rotate(102deg) saturate(1.22) brightness(1.06)',
            block: 'hue-rotate(168deg) saturate(1.18) brightness(1.1)',
            debuff: 'hue-rotate(246deg) saturate(1.36) contrast(1.16)',
            vulnerable: 'hue-rotate(-22deg) saturate(1.5) contrast(1.18)',
            artifact: 'saturate(1.18) brightness(1.18)',
            cleanse: 'hue-rotate(148deg) saturate(1.14) brightness(1.18)',
        }),
    }),
    'dark-b': Object.freeze({
        id: 'dark-b',
        pack: 'dark',
        label: '暗黑B·炽铁烬火',
        hitstopScale: 1.1,
        shakeScale: 1.12,
        palette: Object.freeze({
            hit: '#f0dec4', heavy: '#ff7a42', ko: '#e63434',
            guard: '#8cbef0', break: '#78c8ff',
            buff: '#f2d28a', heal: '#66d8aa',
            debuff: '#cc6ae6', poison: '#88df56', confused: '#d08af2', vulnerable: '#ff505c',
            artifact: '#f6e8be', cleanse: '#a6e8f6',
        }),
        filters: Object.freeze({
            buff: 'hue-rotate(-6deg) saturate(1.18) brightness(1.1)',
            heal: 'hue-rotate(96deg) saturate(1.22) brightness(1.06)',
            block: 'hue-rotate(164deg) saturate(1.18) brightness(1.1)',
            debuff: 'hue-rotate(242deg) saturate(1.36) contrast(1.16)',
            vulnerable: 'hue-rotate(-26deg) saturate(1.52) contrast(1.18)',
            artifact: 'saturate(1.2) brightness(1.18)',
            cleanse: 'hue-rotate(144deg) saturate(1.14) brightness(1.18)',
        }),
    }),
});

export function resolveVfxTheme(skin) {
    const key = String(skin || '').trim();
    return COMBAT_VFX_THEMES[key] || COMBAT_VFX_THEMES.veil;
}

export function vfxTextureUrl(skin, slot) {
    if (COMBAT_VFX_COMMON[slot]) return COMBAT_VFX_COMMON[slot];
    const theme = resolveVfxTheme(skin);
    const pack = COMBAT_VFX_PACKS[theme.pack] || COMBAT_VFX_PACKS.veil;
    return pack[slot] || pack.burst;
}
