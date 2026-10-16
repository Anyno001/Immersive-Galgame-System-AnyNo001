// 场景时段四档：清晨 / 白天 / 黄昏 / 夜晚。深夜、午夜并入夜晚，一个场景最多补四张时段图。
// 中文名按子串命中，先具体后泛化；key 供场景差分挑英文光照标签用。

export const TIME_WORDS = [
    ['midnight', '夜晚', ['深夜', '午夜', '凌晨', '半夜', 'midnight']],
    ['dusk', '黄昏', ['黄昏', '傍晚', '日落', '夕', 'dusk', 'evening', 'sunset']],
    ['morning', '清晨', ['清晨', '黎明', '拂晓', '早晨', '早上', '日出', '晨', 'dawn', 'morning', 'sunrise']],
    ['night', '夜晚', ['夜', '晚', 'night']],
    ['day', '白天', ['白天', '白日', '日间', '上午', '中午', '正午', '下午', '午后', '午', 'day', 'noon', 'afternoon']],
];

export function sceneTimeBucket(label) {
    const text = String(label || '').trim().toLowerCase();
    if (!text) return '';
    const hit = TIME_WORDS.find(([, , words]) => words.some((word) => text.includes(word)));
    return hit ? hit[1] : '';
}
