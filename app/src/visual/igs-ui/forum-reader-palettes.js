// 论坛体配色：全部不透明实色；键与 forum-reader-style.js 里的 --igs-fm-* 变量一一对应。
// pg 页底与回帖底  card 楼主首楼与栏底  card2 其余楼底  line 边线  main 栏字与按钮  title 标题与 PO 主  nm 名字  sub 次要字  body 正文  gt 摘引  ref 引用楼号
export const FORUM_PALETTE_KEYS = Object.freeze(['pg', 'card', 'card2', 'line', 'main', 'title', 'nm', 'sub', 'body', 'gt', 'ref']);

export const FORUM_PALETTES = Object.freeze([
    { id: 'classic', name: '匿名版米黄',
        l: { pg: '#f0e0d6', card: '#ffffee', card2: '#ead6ca', line: '#d9bfb7', main: '#800000', title: '#cc1105', nm: '#117743', sub: '#707070', body: '#222222', gt: '#789922', ref: '#dd0000' },
        d: { pg: '#131314', card: '#1d1d1f', card2: '#18181a', line: '#2c2c2f', main: '#f0e6c8', title: '#ff6b5e', nm: '#5fc08a', sub: '#8e8e93', body: '#e2e0dc', gt: '#9ccc5a', ref: '#ff7a6e' } },
    { id: 'mist', name: '雾蓝灰',
        l: { pg: '#e9edf3', card: '#ffffff', card2: '#f3f5f9', line: '#d3d9e3', main: '#1f2a44', title: '#c8372d', nm: '#2a7d5b', sub: '#6b7483', body: '#1d2330', gt: '#5b8a2e', ref: '#c8372d' },
        d: { pg: '#121316', card: '#1c1d22', card2: '#17181c', line: '#2a2c33', main: '#e8eaee', title: '#ff6b6b', nm: '#5fc08a', sub: '#8b909c', body: '#dcdfe5', gt: '#8fbf5a', ref: '#ff7a7a' } },
    { id: 'sakura', name: '樱粉',
        l: { pg: '#f6e6ea', card: '#fffafb', card2: '#f9edf0', line: '#ebcfd6', main: '#7a1f3d', title: '#d6336c', nm: '#2f8f6b', sub: '#8a6f77', body: '#2a1f23', gt: '#6f9a2d', ref: '#d6336c' },
        d: { pg: '#141215', card: '#1e1b20', card2: '#19171b', line: '#2e2a31', main: '#f0e8ec', title: '#ff7aa8', nm: '#6fd1a3', sub: '#a0939a', body: '#e6dde1', gt: '#9ccc5a', ref: '#ff8ab3' } },
    { id: 'mint', name: '薄荷青',
        l: { pg: '#e2eeec', card: '#fbfefd', card2: '#eef6f5', line: '#c6dcd9', main: '#0f4a45', title: '#d1493f', nm: '#0e8f7f', sub: '#5f7b7c', body: '#16292a', gt: '#5e9a2a', ref: '#d1493f' },
        d: { pg: '#101414', card: '#191e1e', card2: '#151919', line: '#262d2d', main: '#e4eeed', title: '#ff7066', nm: '#2dc4b2', sub: '#85989a', body: '#d8e4e3', gt: '#94c95a', ref: '#ff8077' } },
    { id: 'lavender', name: '薰衣草紫',
        l: { pg: '#ebe6f6', card: '#fdfcff', card2: '#f3f0fa', line: '#d9d1ee', main: '#3b2a78', title: '#c8372d', nm: '#2b8a62', sub: '#756d8f', body: '#221d33', gt: '#5f9430', ref: '#c8372d' },
        d: { pg: '#131217', card: '#1d1b24', card2: '#18171e', line: '#2c2a37', main: '#eae7f3', title: '#ff7a7a', nm: '#6fd1a3', sub: '#8f8aa3', body: '#dedaea', gt: '#9cc85a', ref: '#ff8a8a' } },
    { id: 'ink', name: '石墨黑金',
        l: { pg: '#e8e8ea', card: '#ffffff', card2: '#f2f2f3', line: '#d4d4d8', main: '#18181b', title: '#b8860b', nm: '#3f6f4f', sub: '#71717a', body: '#18181b', gt: '#6b8f2a', ref: '#9a7208' },
        d: { pg: '#0f0f0f', card: '#181818', card2: '#141414', line: '#262626', main: '#ececec', title: '#e6c35c', nm: '#7fbf99', sub: '#8a8a8a', body: '#dedede', gt: '#9ccc5a', ref: '#e6c35c' } },
    { id: 'cinnabar', name: '朱砂白纸',
        l: { pg: '#ebe9e6', card: '#fdfdfc', card2: '#f3f2f0', line: '#d9d6d1', main: '#a02820', title: '#c8372d', nm: '#2d7a4f', sub: '#76716b', body: '#1f1b19', gt: '#6a8f2c', ref: '#c8372d' },
        d: { pg: '#131314', card: '#1d1d1f', card2: '#18181a', line: '#2c2c2f', main: '#f0eeee', title: '#ff6b5e', nm: '#6fd1a3', sub: '#8e8e93', body: '#e2e0e0', gt: '#9ccc5a', ref: '#ff7a6e' } },
]);

export const FORUM_PALETTE_IDS = Object.freeze(FORUM_PALETTES.map((p) => p.id));
export const FORUM_MODES = Object.freeze(['light', 'dark', 'auto']);

export function forumPaletteColors(id, mode, systemDark) {
    const pal = FORUM_PALETTES.find((p) => p.id === id) || FORUM_PALETTES[0];
    const dark = mode === 'dark' || (mode === 'auto' && systemDark === true);
    return dark ? pal.d : pal.l;
}
