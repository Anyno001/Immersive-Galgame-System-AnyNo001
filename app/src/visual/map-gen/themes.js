// 世界观主题只是数据：配色与少量形态参数，渲染器不按主题写分支。
const MODERN = Object.freeze({
    ground: '#d5d1c5', groundAlt: '#cdc9bd', pad: '#c8c3b6',
    lawn: '#9ec476', lawnAlt: '#8db766',
    bank: '#c3bfb3', bankEdge: '#a29e92', sand: '#e7d8ae',
    waterEdge: '#5fabe0', water: '#4497d5', waterDeep: '#3887ca',
    roadEdge: '#a9a59b', road: '#f2efe8', streetEdge: '#b9b5ab', street: '#e7e3da',
    pathEdge: '#cfc2a2', path: '#ebe1c9', plaza: '#e6e0d2', plazaEdge: '#c6bfae',
    railBed: '#b1aa9e', rail: '#5b5650', tie: '#7f776c',
    roofs: ['#5f6f8c', '#6a7b99', '#55647e', '#72819c', '#627596', '#7d6a62'],
    flat: '#cbc8c1', flatInner: '#d9d6cf',
    trees: [['#3b7433', '#5a9744', '#86bf5e'], ['#33693a', '#4d8c47', '#7bb666'], ['#437d37', '#67a14b', '#94c768']],
    shadow: 'rgba(38,42,58,.30)',
    accent: '#c0735a', brick: '#b66d52', track: '#c8694b', field: '#92bf67', stone: '#bab3a5', torii: '#c9442e', white: '#eeece7',
});

export const MAP_THEMES = Object.freeze({
    modern: MODERN,
    wafu: Object.freeze({
        ...MODERN,
        ground: '#d8d0bb', groundAlt: '#cfc6b0', lawn: '#a5c47c', lawnAlt: '#93b76a',
        road: '#eee7d6', street: '#e4dccb', roofs: ['#4a5058', '#565d66', '#40464e', '#5d5a57', '#4d5563', '#6b5a4e'],
    }),
    fantasy: Object.freeze({
        ...MODERN,
        ground: '#d9ceb5', groundAlt: '#d0c4a9', road: '#e6dac1', roadEdge: '#a8987c', street: '#dfd2b7', streetEdge: '#b4a589',
        roofs: ['#b5654a', '#a95a42', '#c07556', '#8e4d3b', '#9c6a4f', '#6f6f7a'],
    }),
    ancient: Object.freeze({
        ...MODERN,
        ground: '#d9d0bd', groundAlt: '#d0c6b1', road: '#ebe3d2', street: '#e2d9c6',
        roofs: ['#5b5f63', '#686c70', '#50555a', '#73706b', '#5f6770', '#7a5a4c'],
    }),
    scifi: Object.freeze({
        ...MODERN,
        ground: '#3a4049', groundAlt: '#343a43', pad: '#30363e', lawn: '#4d7a63', lawnAlt: '#446f59',
        bank: '#5a6370', bankEdge: '#4a525e', waterEdge: '#2f6f9e', water: '#255d8a', waterDeep: '#1f5079',
        roadEdge: '#2a3038', road: '#58616e', streetEdge: '#2f353e', street: '#4d5561', path: '#6b7482', pathEdge: '#4d5561',
        plaza: '#5f6875', plazaEdge: '#474f5a',
        roofs: ['#6b7890', '#7a88a0', '#5d6980', '#8792a8', '#65748f', '#5b6c7c'], flat: '#727d8c', flatInner: '#808b99',
        shadow: 'rgba(8,10,16,.42)',
    }),
});

export function getMapTheme(name) {
    return MAP_THEMES[name] || MODERN;
}
