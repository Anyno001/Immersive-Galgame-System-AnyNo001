// 匿名固定样例：你的背包。十件物品，含未知图标、缺数量、零数量与长名称。
export const inventoryFixture = {
  uid: 'sheet_demo_items',
  tableName: '示例物品',
  items: [
    { rowIndex: 0, name: '旧钥匙', icon: 'key', quantity: 1, description: '钥匙柄上的刻痕已经磨浅。它似乎属于旧书店后门的那把锁。' },
    { rowIndex: 1, name: '车票', icon: 'ticket', quantity: 1, description: '一张回程的车票，日期还没过期。' },
    { rowIndex: 2, name: '便笺', icon: 'note', quantity: 2, description: '写着零碎记事的便笺纸。' },
    { rowIndex: 3, name: '手电筒', icon: 'flashlight', quantity: 1, description: '老式的金属手电筒，电量还算足。' },
    { rowIndex: 4, name: '怀表', icon: 'watch', quantity: 1, description: '走得慢五分钟的旧怀表。' },
    { rowIndex: 5, name: '信封', icon: 'envelope', quantity: 1, description: '没有贴邮票的信封。' },
    { rowIndex: 6, name: '笔记本', icon: 'notebook', quantity: 1, description: '写了一半的牛皮纸笔记本。' },
    { rowIndex: 7, name: '药瓶', icon: 'bottle', quantity: 2, description: '贴着药店标签的小药瓶。' },
    { rowIndex: 8, name: '一串已经看不出用途的黄铜钥匙圈', icon: null, quantity: null, description: '图标未知且数量未记录的示例：格位不显示角标，详情写“数量未记录”。' },
    { rowIndex: 9, name: '空墨水瓶', icon: 'ink', quantity: 0, description: '数量为零的示例：角标必须显示 ×0，不能变成 ×1。' }
  ]
};
// 覆盖点：未知图标走通用回退；缺数量不补 ×1；零数量如实显示；长名称格位最多两行、详情显示全名。
