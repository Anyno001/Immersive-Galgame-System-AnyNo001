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

// 战斗开启时的背包预览（?gear=1）：在上面十件剧情物品之外加入装备、道具、杂物，并给出主角背包投影。
// 投影与 combat/inventory-view.js 的 heroInventoryView 同形；数量仍以物品表为准，others 由预览页按上面十件补齐。
export const combatInventoryFixture = {
  items: [
    { name: '旧式短剑', quantity: 1, description: '护手刻着褪色的家纹，刃口仍然锋利。' },
    { name: '皮革轻甲', quantity: 1, description: '贴身的鞣皮短甲，肩部有修补过的针脚。' },
    { name: '铁护手', quantity: 1, description: '沉重的铁制护手，和轻甲同属防具，只能换着穿。' },
    { name: '月光吊坠', quantity: 1, description: '夜里会泛起微光的银色吊坠。' },
    { name: '疗伤药', quantity: 3, description: '涂抹后能止血镇痛的药膏。' },
    { name: '烟雾弹', quantity: 1, description: '摔碎后迅速弥漫白烟。' },
    { name: '褪色徽章', quantity: 1, description: '某支早已解散的护卫队的徽章。' }
  ],
  view: {
    ok: true,
    gear: {
      slots: {
        weapon: { gearId: 'gear-preview-sword', name: '旧式短剑', slot: 'weapon', rarity: 'rare', bonus: { ability: 'str', amount: 3 }, passive: { id: 'gear-preview-sword-p', name: '旧式短剑', description: '攻击时额外造成 2 点伤害。' }, count: 1 },
        armor: { gearId: 'gear-preview-leather', name: '皮革轻甲', slot: 'armor', rarity: 'uncommon', bonus: { ability: 'con', amount: 2 }, count: 1 }
      },
      bag: [
        { gearId: 'gear-preview-gauntlet', name: '铁护手', slot: 'armor', rarity: 'common', bonus: { ability: 'str', amount: 1 }, count: 1 },
        { gearId: 'gear-preview-pendant', name: '月光吊坠', slot: 'accessory', rarity: 'epic', bonus: { ability: 'wis', amount: 4 }, passive: { id: 'gear-preview-pendant-p', name: '月光吊坠', description: '回合开始时回复 1 点体力。' }, count: 1 }
      ]
    },
    items: [
      { itemId: 'item-preview-salve', name: '疗伤药', count: 3 },
      { itemId: 'item-preview-smoke', name: '烟雾弹', count: 1 }
    ],
    collection: [{ itemId: 'item-preview-badge', name: '褪色徽章', origin: '旧护卫队', rarity: 'rare', count: 1 }],
    others: [],
    diagnostics: []
  }
};
