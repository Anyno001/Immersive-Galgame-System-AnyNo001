// 世界观主题只是数据：配色与少量布局参数（urban：城区占比），渲染器不按主题写分支。
const MODERN = Object.freeze({
    urban: 0.9,
    // 地面：城区铺装 → 郊区草地 → 草甸；林下、公园、沙滩、水岸各有底色，低分辨率着色后平滑放大。
    paving: '#dcd6c9', suburb: '#cfd5b3', meadow: '#bccf95', meadowAlt: '#b2c98a',
    forestFloor: '#8db468', lawn: '#a9cd7d', lawnAlt: '#9dc473', sand: '#ecdcb0', sandWet: '#d9c796', bankGround: '#cfc7ad',
    fields: ['#e2c97e', '#bcd27e', '#9fc56c', '#d4b47c', '#c6d88e', '#a9bf6a', '#dcd49a'],
    fieldLine: 'rgba(80,74,30,.2)', hedge: '#6f9a4f',
    bank: '#d6ceb4', bankEdge: '#a79f88',
    shallow: '#86c6e2', water: '#5aa6d6', waterDeep: '#3f8cc6', foam: 'rgba(255,255,255,.55)',
    roadEdge: '#b7b0a1', road: '#fbf8f1', roadLine: 'rgba(236,196,120,.85)',
    linkEdge: '#bdb6a7', link: '#f7f3eb', streetEdge: '#c9c2b3', street: '#f2eee5',
    laneEdge: '#cdbf9c', lane: '#e8dfc7', pathEdge: '#d3c6a4', path: '#efe6cf',
    plaza: '#e8e2d4', plazaEdge: '#c9c1af', parking: '#c9c6c0', parkingLine: 'rgba(255,255,255,.75)',
    railBed: '#b8b1a4', rail: '#5d5850', tie: '#877e71',
    roofs: ['#6f819b', '#8f97a6', '#b8765d', '#5f7f82', '#9b8a79', '#c38d62', '#7c7189', '#a35f52'],
    flats: ['#d9d4ca', '#c3cad3', '#e0d3bf', '#b9bec8', '#d2cabb', '#c9d0cd', '#a9b1bd'], flatDetail: '#b4b0a8', roofGarden: '#9cc378', solar: '#4d5f7e',
    trees: [['#3f7a37', '#5c9a45', '#8cc463'], ['#35703c', '#4f8f49', '#7fbb69'], ['#4c8438', '#6ea64c', '#9ccb6a'], ['#2f5f3a', '#3f7a45', '#66a05c']],
    accentTrees: ['#a7784c', '#c99357', '#e0b778'],
    shadow: '#262c46',
    accent: '#c0735a', brick: '#b66d52', track: '#c8694b', field: '#92bf67', stone: '#bab3a5', torii: '#c9442e', white: '#f1efe9',
    cars: ['#e9e6e0', '#c44d45', '#4c6c9c', '#3c3f47', '#e0b54c', '#8aa3b8'], boat: '#f6f4ee',
});

export const MAP_THEMES = Object.freeze({
    modern: MODERN,
    wafu: Object.freeze({
        ...MODERN,
        urban: 0.62,
        paving: '#d9d0bb', suburb: '#cbd2a9', meadow: '#b7cc8a',
        fields: ['#c7d48a', '#b4cd7a', '#d6c98b', '#a7c575', '#c0cf86', '#d0c27f'],
        road: '#f1eadb', street: '#e9e1cf', link: '#eee6d6',
        roofs: ['#4c535c', '#5a616b', '#43494f', '#626058', '#505866', '#6f5c4f', '#7b6a5b'],
        accentTrees: ['#e8a9b8', '#f1bfca', '#dc8fa4'],
    }),
    fantasy: Object.freeze({
        ...MODERN,
        urban: 0.7,
        paving: '#dccfb3', suburb: '#cdd0a6', road: '#ece0c6', roadEdge: '#a8987c', roadLine: 'rgba(0,0,0,0)',
        link: '#e8dcc2', linkEdge: '#ae9e82', street: '#e3d6bb', streetEdge: '#b6a78b',
        roofs: ['#b5654a', '#a95a42', '#c07556', '#8e4d3b', '#9c6a4f', '#6f6f7a', '#b98457'],
        flats: ['#c9bfae', '#d1c6b2', '#bfb6a6', '#cbbfa8', '#c4baa8'],
        cars: ['#8a6a48', '#9a7b55', '#6f5a44'],
    }),
    ancient: Object.freeze({
        ...MODERN,
        urban: 0.72,
        paving: '#dcd2bf', suburb: '#cfd2ad', road: '#eee6d5', street: '#e5dcc9', link: '#ebe2d0', roadLine: 'rgba(0,0,0,0)',
        roofs: ['#5b5f63', '#686c70', '#50555a', '#73706b', '#5f6770', '#7a5a4c', '#4f5b58'],
        flats: ['#cfc6b4', '#d6ccb9', '#c7bfae', '#d1c7b3', '#cbc2af'],
        cars: ['#8a6a48', '#7a5d40'],
    }),
    scifi: Object.freeze({
        ...MODERN,
        urban: 1.05,
        paving: '#3c424c', suburb: '#3f4a4a', meadow: '#3e5248', meadowAlt: '#3a4c43', forestFloor: '#2f4a3e',
        lawn: '#4d7a63', lawnAlt: '#446f59', sand: '#6b6a62', sandWet: '#5c5b54', bankGround: '#4a525e',
        fields: ['#3f6b5a', '#456f62', '#3b5f55', '#4a7462'], fieldLine: 'rgba(140,220,200,.12)', hedge: '#2f5a48',
        bank: '#5a6370', bankEdge: '#4a525e', shallow: '#3d82ad', water: '#2d6a96', waterDeep: '#235a84',
        roadEdge: '#2a3038', road: '#5a6370', roadLine: 'rgba(120,220,255,.6)', linkEdge: '#2c323a', link: '#545d69',
        streetEdge: '#2f353e', street: '#4d5561', laneEdge: '#333a42', lane: '#474f59', path: '#6b7482', pathEdge: '#4d5561',
        plaza: '#5f6875', plazaEdge: '#474f5a', parking: '#454c56',
        roofs: ['#6b7890', '#7a88a0', '#5d6980', '#8792a8', '#65748f', '#5b6c7c', '#6f7f96'],
        flats: ['#727d8c', '#7b8696', '#687382', '#838e9c', '#6e7988'], flatDetail: '#5a6472', roofGarden: '#4d7a63', solar: '#2c4466',
        trees: [['#2f5a44', '#3f7258', '#5f9a78'], ['#2b5244', '#3a6a58', '#5a9080'], ['#34604a', '#467a5e', '#6aa682'], ['#27483c', '#35604e', '#4f8670']],
        accentTrees: ['#4f8f9c', '#62a6b0'],
        shadow: '#07090f', white: '#c9d2dc', cars: ['#9fe6ff', '#e0f0ff', '#ff9ad0', '#8a95a8'], boat: '#c9d2dc',
    }),
});

export function getMapTheme(name) {
    return MAP_THEMES[name] || MODERN;
}

export function hexToRgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// amount > 0 向白色提亮，< 0 按比例压暗。
export function shadeColor(hex, amount) {
    const rgb = hexToRgb(hex).map(c => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)));
    return `rgb(${rgb.join(',')})`;
}
