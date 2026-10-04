// 「演出」页的一键档位：只切换各演出的 readerSettings.<key>.enabled，细项设置保留不动。
// tier 表示从哪一档开始开启：1 轻量、2 推荐、3 全开。
export const PERFORMANCE_FEATURES = Object.freeze([
    Object.freeze({ key: 'typewriter', label: '打字机', group: 'text', tier: 1 }),
    Object.freeze({ key: 'clickWaitMark', label: '句末等待符号', group: 'text', tier: 1 }),
    Object.freeze({ key: 'textFx', label: '行内文字效果', group: 'text', tier: 2 }),
    Object.freeze({ key: 'sceneTransition', label: '转场', group: 'stage', tier: 1 }),
    Object.freeze({ key: 'timeTint', label: '环境滤镜', group: 'stage', tier: 2 }),
    Object.freeze({ key: 'camera', label: '镜头语言', group: 'stage', tier: 2 }),
    Object.freeze({ key: 'weatherFx', label: '天气', group: 'stage', tier: 2 }),
    Object.freeze({ key: 'stageShake', label: '震动', group: 'stage', tier: 2 }),
    Object.freeze({ key: 'spriteMotion', label: '立绘活动', group: 'character', tier: 1 }),
    Object.freeze({ key: 'spriteActions', label: '情绪动作', group: 'character', tier: 2 }),
    Object.freeze({ key: 'mangaFx', label: '情绪符号', group: 'emotion', tier: 2 }),
    Object.freeze({ key: 'heartbeatFx', label: '心跳脉动', group: 'emotion', tier: 2 }),
    Object.freeze({ key: 'flashFx', label: '闪白耳鸣', group: 'special', tier: 3 }),
    Object.freeze({ key: 'innerFx', label: '内心弹幕', group: 'special', tier: 3 }),
    Object.freeze({ key: 'titleCard', label: '标题卡', group: 'story', tier: 1 }),
    Object.freeze({ key: 'favorToast', label: '数值提示', group: 'story', tier: 2 }),
    Object.freeze({ key: 'itemFx', label: '获得物品', group: 'story', tier: 2 }),
    Object.freeze({ key: 'fxTags', label: '演出标签', group: 'event', tier: 2 }),
    Object.freeze({ key: 'dailyFx', label: '日常演出', group: 'special', tier: 2 }),
    Object.freeze({ key: 'battleFx', label: '战斗', group: 'special', tier: 3 }),
    Object.freeze({ key: 'chatShow', label: '线上交流', group: 'special', tier: 3 }),
    Object.freeze({ key: 'liveFx', label: '直播间', group: 'special', tier: 3 }),
    Object.freeze({ key: 'audienceFx', label: '观众弹幕', group: 'special', tier: 3 }),
    Object.freeze({ key: 'romanceFx', label: '亲密演出', group: 'romance', tier: 3 }),
    Object.freeze({ key: 'fxSound', label: '演出音效', group: 'sound', tier: 2 }),
    Object.freeze({ key: 'ambientSound', label: '环境音', group: 'sound', tier: 2 }),
    Object.freeze({ key: 'uiSound', label: '界面音效', group: 'sound', tier: 2 }),
    Object.freeze({ key: 'bgm', label: '背景音乐', group: 'sound', tier: 3 }),
]);

export const PERFORMANCE_PRESETS = Object.freeze([
    Object.freeze(['off', '全部关闭', 0]),
    Object.freeze(['light', '轻量', 1]),
    Object.freeze(['standard', '推荐', 2]),
    Object.freeze(['full', '全开', 3]),
]);

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// fxSound 未保存时默认开启，其余演出默认关闭。
export function isPerformanceFeatureOn(reader, key) {
    const enabled = plain(plain(reader)[key]).enabled;
    return key === 'fxSound' ? enabled !== false : enabled === true;
}

function presetLevel(preset) {
    const found = PERFORMANCE_PRESETS.find(([id]) => id === preset);
    return found ? found[2] : null;
}

// 原地写入草稿的 enabled；未知档位返回 false 且不改动。
export function applyPerformancePreset(reader, preset) {
    const level = presetLevel(preset);
    if (level == null || !reader || typeof reader !== 'object') return false;
    for (const { key, tier } of PERFORMANCE_FEATURES) {
        reader[key] = { ...plain(reader[key]), enabled: tier <= level };
    }
    return true;
}

// 当前开关恰好等于某一档时返回该档 id，否则返回 ''（自定义）。
// 演出音效默认开启且单独无效果，判断「全部关闭」时不看它。
export function detectPerformancePreset(reader) {
    const found = PERFORMANCE_PRESETS.find(([, , level]) => PERFORMANCE_FEATURES
        .every(({ key, tier }) => (level === 0 && key === 'fxSound') || isPerformanceFeatureOn(reader, key) === (tier <= level)));
    return found ? found[0] : '';
}
