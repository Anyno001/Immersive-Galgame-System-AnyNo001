// 弹幕轨道：观众弹幕视频窗、内心弹幕横飞、直播间横飞共用的宽度估算与 B 站式防追尾选轨。
export const LANE_GAP = 24;

// 按字形估算宽度，免去逐条测量：CJK 记 1em，半角记 0.55em。
export function estimateTextWidth(value, fontSize) {
    let units = 0;
    for (const ch of String(value || '')) units += ch.charCodeAt(0) > 0xff ? 1 : 0.62;
    return Math.ceil(units * fontSize) + 12;
}

// B 站式防追尾：轨道空出（前一条尾巴离开右缘）且新弹幕在前一条完全出屏之前追不上它时才可用。
export function pickScrollTrack(tracks, count, now, width, stageW, durationMs) {
    const speed = (stageW + width) / durationMs;
    const reachLeft = now + stageW / speed;
    const start = count > 1 ? Math.floor(Math.random() * count) : 0;
    for (let k = 0; k < count; k += 1) {
        const i = (start + k) % count;
        const lane = tracks[i];
        if (!lane || (now >= lane.freeAt && reachLeft >= lane.exitAt)) return i;
    }
    return -1;
}

// 占用轨道：记下尾巴离开右缘（freeAt）与整条出屏（exitAt）的时刻。
export function occupyTrack(tracks, lane, now, width, stageW, durationMs) {
    tracks[lane] = { freeAt: now + (width + LANE_GAP) / ((stageW + width) / durationMs), exitAt: now + durationMs };
}
