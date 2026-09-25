// 匿名固定样例：地图页。坐标为 0–1 归一化，对应 assets/map-demo-clean-night.png（1672×941，默认夜景）。
// 不含任何真实用户数据；字段来源说明见 visual-checklist.md。
export const mapFixture = {
  uid: 'sheet_demo_map',
  tableName: '示例城市地图',
  currentSceneName: '临河街道',
  basemap: 'assets/map-demo-clean-night.png',
  places: [
    { id: 'p-station', parentId: null, name: '车站', x: 0.10, y: 0.25, description: '老城区的尽头站，末班车之后只剩售票厅的灯。', characters: [] },
    { id: 'p-bookstore', parentId: null, name: '旧书店', x: 0.245, y: 0.44, description: '临街的旧书店，窗边留着一张阅读桌。', characters: ['林夏', '陈屿'] },
    { id: 'p-cafe', parentId: null, name: '咖啡馆', x: 0.135, y: 0.60, description: '靠河的小咖啡馆，雨天总是坐满躲雨的人。', characters: ['许宁'] },
    { id: 'p-riverside-street', parentId: null, name: '临河街道', x: 0.355, y: 0.66, description: '沿河的主路，夜里能听见桥下的水声。', characters: [] },
    { id: 'p-tower', parentId: null, name: '钟楼', x: 0.495, y: 0.22, description: '城北的钟楼广场，整点敲钟。', characters: [] },
    { id: 'p-park', parentId: null, name: '河畔公园', x: 0.53, y: 0.57, description: '环水的散步道，傍晚有人在这里遛狗。', characters: ['沈知远'] },
    { id: 'p-alley', parentId: null, name: '小巷', x: null, y: null, description: '没有坐标记录的窄巷，只在列表中出现。', characters: [] }
  ]
};
// 状态约定：currentSceneName 唯一命中 p-riverside-street（当前位置）；
// 验收截图选中 p-bookstore（旧书店），用于演示选中针与详情面板。
