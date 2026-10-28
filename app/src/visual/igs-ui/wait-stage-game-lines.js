// 等待小游戏共用的台词池；单独成文件，各游戏模块都能引入而不互相依赖。
export const WAIT_STAGE_GAME_LINES = Object.freeze({
    win: ['……这局算你的。', '运气不错嘛。', '好吧，你赢了。', '再来，我不信了。'],
    lose: ['承让了。', '还是我比较稳。', '再来一局？', '下次可别怪我不客气。'],
    draw: ['想到一块去了。', '平手，再来。', '这么巧？'],
    right: ['答对了。', '没错，是我说的。', '记得挺清楚嘛。'],
    wrong: ['……不是这句。', '再想想？', '记岔了吧。'],
    start: ['闲着也是闲着，来一局？', '要不要玩点什么？', '等着的工夫，来一把？'],
});

export function waitStageGameLine(kind, random = Math.random) {
    const pool = WAIT_STAGE_GAME_LINES[kind] || WAIT_STAGE_GAME_LINES.start;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
