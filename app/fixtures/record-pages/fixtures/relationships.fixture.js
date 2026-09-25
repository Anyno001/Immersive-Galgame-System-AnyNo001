// 匿名固定样例：人际关系。四人三边，全部为显式成对关系行。
export const relationshipsFixture = {
  uid: 'sheet_demo_rel',
  tableName: '示例人际关系',
  people: [
    { id: 'c-linxia', name: '林夏', role: '书店常客', kind: 'person', description: '常在傍晚来书店，喜欢坐在靠窗的位置。与陈屿相识多年，最近开始整理旧日的来信。' },
    { id: 'c-chenyu', name: '陈屿', role: '旧友', kind: 'person', description: '多年在外，最近回到这座城市。随身带着一把旧钥匙。' },
    { id: 'c-xuning', name: '许宁', role: '店员', kind: 'person', description: '河畔咖啡馆的店员，记性好，记得每位熟客的点单。' },
    { id: 'c-shenzhiyuan', name: '沈知远', role: '邻居', kind: 'person', description: '住在书店楼上的邻居，傍晚常在河畔公园散步。' }
  ],
  edges: [
    { from: 'c-linxia', to: 'c-chenyu', label: '同学' },
    { from: 'c-linxia', to: 'c-shenzhiyuan', label: '邻居' },
    { from: 'c-linxia', to: 'c-xuning', label: '旧识' }
  ]
};
// 覆盖点：林夏三条一阶显式关系用于局部关系图主样例；选其他人物时图与描述同步切换。
// 另见 legacy 样例：只有“名称+关系”而无另一端的行不得产生边（保留为原始字段）。
