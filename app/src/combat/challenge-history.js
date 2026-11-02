// 日常挑战历史与成就：从聊天里的战报楼只读推导，不新增账本类型，楼层删除或回退后历史随之消失。纯函数。
import { parseChallengeReport } from './challenge-report.js';

const EVENT_PATTERN = /挑战：([^。）]*)/;
const WINS = new Set(['圆满', '勉强']);
const STREAK_GOAL = 3;
const TOTAL_GOAL = 10;

export const CHALLENGE_ACHIEVEMENTS = Object.freeze({
    'first-win': '初战告捷',
    perfect: '圆满完成',
    'hard-win': '迎难而上',
    'streak-3': '连战连捷',
    'allied-win': '并肩同行',
    'ten-challenges': '百炼成钢',
});

// messages：{ floor?, text } 或字符串数组，按楼层顺序；同一战报编号只记第一次。返回 { entries, stats, achievements }。
export function deriveChallengeHistory(messages) {
    const entries = [];
    const seen = new Set();
    (Array.isArray(messages) ? messages : []).forEach((message, index) => {
        const text = typeof message === 'string' ? message : String(message?.text ?? message?.mes ?? '');
        const report = parseChallengeReport(text);
        if (!report || seen.has(report.reportId)) return;
        seen.add(report.reportId);
        const floor = Number.isInteger(message?.floor) ? message.floor : index;
        entries.push({ floor, event: EVENT_PATTERN.exec(text)?.[1]?.trim() || '', ...report });
    });
    return { entries, stats: statsOf(entries), achievements: achievementsOf(entries) };
}

function statsOf(entries) {
    const stats = { total: entries.length, wins: 0, losses: 0, escapes: 0, byOutcome: { 圆满: 0, 勉强: 0, 失败: 0, 放弃: 0 }, byDomain: {}, bestStreak: 0, currentStreak: 0 };
    for (const entry of entries) {
        stats.byOutcome[entry.outcome] += 1;
        if (entry.result === 'win') stats.wins += 1;
        else if (entry.result === 'lose') stats.losses += 1;
        else stats.escapes += 1;
        const domain = entry.domain || '通用';
        const slot = stats.byDomain[domain] || (stats.byDomain[domain] = { total: 0, wins: 0 });
        slot.total += 1;
        if (entry.result === 'win') slot.wins += 1;
        stats.currentStreak = entry.result === 'win' ? stats.currentStreak + 1 : 0;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    }
    return stats;
}

// 每项成就给出首次达成的楼层。
function achievementsOf(entries) {
    const found = new Map();
    const grant = (id, entry) => { if (!found.has(id)) found.set(id, { id, name: CHALLENGE_ACHIEVEMENTS[id], floor: entry.floor }); };
    let streak = 0;
    entries.forEach((entry, index) => {
        const won = WINS.has(entry.outcome);
        streak = entry.result === 'win' ? streak + 1 : 0;
        if (won) grant('first-win', entry);
        if (entry.outcome === '圆满') grant('perfect', entry);
        if (won && entry.tier === '艰难') grant('hard-win', entry);
        if (streak >= STREAK_GOAL) grant('streak-3', entry);
        if (won && entry.allies.length >= 1) grant('allied-win', entry);
        if (index + 1 >= TOTAL_GOAL) grant('ten-challenges', entry);
    });
    return [...found.values()];
}
