// 匿名固定样例：珍藏心事。三册日记、每册多篇，覆盖新字段（作者/篇名/日期/正文）。
export const diaryFixture = {
  uid: 'sheet_demo_diary',
  tableName: '示例日记',
  entries: [
    { rowIndex: 0, author: '林夏', chapterTitle: '雨后的约定', date: '2024-06-18', body: '雨停的时候，我们还站在旧书店门口。\n他把那本书递给我，说下次可以一起读。\n我答应得很快，回去的路上却一直想着这句话。\n原来一个普通的下午，也会让人舍不得结束。' },
    { rowIndex: 1, author: '林夏', chapterTitle: '窗边的下午', date: '2024-06-16', body: '窗边的位置空了一整个下午。\n我把新到的书按高矮排好，其实只是在等一个人推门进来。' },
    { rowIndex: 2, author: '林夏', chapterTitle: '没有寄出的信', date: '2024-06-12', body: '写了一封很长的信，最后折好夹进了账本里。\n有些话写下来就够了，不必真的寄出去。' },
    { rowIndex: 3, author: '陈屿', chapterTitle: '回程车票', date: '2024-06-15', body: '车票在口袋里攥出了折痕。\n我还是没能告诉她，这次回来就不走了。' },
    { rowIndex: 4, author: '陈屿', chapterTitle: '旧钥匙', date: '2024-06-10', body: '书店后门那把锁一直没换。\n老板说他留着钥匙，等一个还记得回来的人。' },
    { rowIndex: 5, author: null, chapterTitle: '无名页', date: null, body: '没有署名的一页，字迹被水渍晕开了一半。' }
  ]
};
// 覆盖点：未署名条目归“未署名册”，不默认归为“我”；日期为合法 ISO，可演示按最新在前排序。
