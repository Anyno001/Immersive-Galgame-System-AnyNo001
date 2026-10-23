import { WAIT_STAGE_STYLE_TEXT } from '../../src/visual/igs-ui/wait-stage.js';
import { WAIT_STAGE_GAME_STYLE_TEXT } from '../../src/visual/igs-ui/wait-stage-games.js';
import { startMahjong } from '../../src/visual/igs-ui/wait-stage-mahjong.js';
import { buildWaitStageModel } from '../../src/visual/igs-ui/wait-stage-runtime.js';
import { CG_PIXEL_CAP, fitCgSize } from '../../src/generated-images/illustration/cg-pixel-cap.js';

const style = document.createElement('style');
style.textContent = `${WAIT_STAGE_STYLE_TEXT}
${WAIT_STAGE_GAME_STYLE_TEXT}
html,body{margin:0;height:100%;background:#16181a;color:#e8e5df;font-family:"PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif;}
#igs-overlay{position:fixed;inset:0;overflow:hidden;background:#16181a;}
`;
document.head.appendChild(style);

const FACE = {
    平和: '<ellipse cx="306" cy="318" rx="16" ry="22" fill="#2b2140"/><ellipse cx="406" cy="318" rx="16" ry="22" fill="#2b2140"/><path d="M332 388q24 16 48 0" stroke="#8a3b4a" stroke-width="7" fill="none" stroke-linecap="round"/>',
    喜悦: '<path d="M286 322q20-24 40 0M386 322q20-24 40 0" stroke="#2b2140" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M322 376q34 44 68 0z" fill="#c2414f"/>',
    愤怒: '<path d="M280 272l50 20M432 272l-50 20" stroke="#2b2140" stroke-width="10" stroke-linecap="round"/><ellipse cx="306" cy="320" rx="14" ry="16" fill="#2b2140"/><ellipse cx="406" cy="320" rx="14" ry="16" fill="#2b2140"/><path d="M330 396q26-18 52 0" stroke="#8a3b4a" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M450 200l20 8-8 20M478 216l-20 8 8 20" stroke="#e0283c" stroke-width="7" fill="none"/>',
    悲伤: '<path d="M282 280l46-14M430 280l-46-14" stroke="#2b2140" stroke-width="8" stroke-linecap="round"/><path d="M290 326q16 10 32 0M390 326q16 10 32 0" stroke="#2b2140" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M300 340q-8 30 0 44q8-14 0-44z" fill="#7cc3ff"/><path d="M334 400q22-14 44 0" stroke="#8a3b4a" stroke-width="7" fill="none" stroke-linecap="round"/>',
    惊讶: '<circle cx="306" cy="316" r="24" fill="#fff" stroke="#2b2140" stroke-width="6"/><circle cx="406" cy="316" r="24" fill="#fff" stroke="#2b2140" stroke-width="6"/><circle cx="306" cy="316" r="9" fill="#2b2140"/><circle cx="406" cy="316" r="9" fill="#2b2140"/><ellipse cx="356" cy="396" rx="16" ry="20" fill="#c2414f"/>',
    害羞: '<ellipse cx="282" cy="360" rx="34" ry="16" fill="#ff8fa8" opacity=".75"/><ellipse cx="430" cy="360" rx="34" ry="16" fill="#ff8fa8" opacity=".75"/><ellipse cx="316" cy="322" rx="13" ry="18" fill="#2b2140"/><ellipse cx="416" cy="322" rx="13" ry="18" fill="#2b2140"/><path d="M330 390q9-8 18 0t18 0t18 0" stroke="#8a3b4a" stroke-width="6" fill="none" stroke-linecap="round"/>',
    紧张: '<ellipse cx="306" cy="318" rx="12" ry="14" fill="#2b2140"/><ellipse cx="406" cy="318" rx="12" ry="14" fill="#2b2140"/><path d="M328 392q7-10 14 0t14 0t14 0t14 0" stroke="#8a3b4a" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M462 250q-14 26 0 34q14-8 0-34z" fill="#7cc3ff"/>',
    思考: '<path d="M286 316h40" stroke="#2b2140" stroke-width="9" stroke-linecap="round"/><ellipse cx="406" cy="318" rx="15" ry="20" fill="#2b2140"/><path d="M336 392h40" stroke="#8a3b4a" stroke-width="7" stroke-linecap="round"/><circle cx="480" cy="190" r="10" fill="#fff"/><circle cx="508" cy="160" r="16" fill="#fff"/>',
};

function sprite(hair, cloth, label, mood) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="712" height="1024" viewBox="0 0 712 1024"><path d="M196 300c0-150 80-220 160-220s160 70 160 220v260H196z" fill="${hair}"/><path d="M120 1024c0-220 90-330 236-330s236 110 236 330z" fill="${cloth}"/><rect x="316" y="420" width="80" height="120" fill="#f8e3d4"/><path d="M236 640q120 90 240 0l-40-56H276z" fill="#fff" opacity=".9"/><ellipse cx="356" cy="310" rx="140" ry="156" fill="#fbe9dd"/><path d="M212 300c4-130 76-190 144-190s140 60 144 190c-30-60-70-84-110-90l-34 40-30-44c-50 10-92 46-114 94z" fill="${hair}"/>${FACE[mood]}<text x="356" y="900" text-anchor="middle" font-size="72" font-weight="700" fill="#fff" font-family="sans-serif">${label} · ${mood}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function wardrobe(hair, cloth, label, moods) {
    return { moods: Object.fromEntries(moods.map((mood) => [mood, sprite(hair, cloth, label, mood)])) };
}

const ALL_MOODS = Object.keys(FACE);
const real = (url) => ({ moods: { 平和: url } });
const characterOutfits = {
    小葵: { 冬装: real('./ref-sprite.jpg') },
    小葵长图: { 冬装: real('./ref-sprite-long.jpg') },
    小葵宽图: { 冬装: real('./ref-sprite-wide.jpg') },
    绫: { 校服: wardrobe('#5b3a6e', '#3b4a8c', '绫', ALL_MOODS) },
    凛: { 便服: wardrobe('#24364f', '#7a7f88', '凛·便服', ['平和']), 礼服: wardrobe('#24364f', '#8c2b45', '凛', ALL_MOODS), 裸体: wardrobe('#24364f', '#f3cdb6', '凛·裸体', ALL_MOODS) },
    绫裸: { 校服: wardrobe('#5b3a6e', '#3b4a8c', '绫裸', ALL_MOODS), 裸体: wardrobe('#5b3a6e', '#f3cdb6', '绫裸·裸体', ['平和', '害羞']) },
    咲: { 运动服: wardrobe('#a4552a', '#2f7a52', '咲', ALL_MOODS), 泳装: wardrobe('#a4552a', '#2a8ec2', '咲·泳装', ['平和', '喜悦', '害羞']) },
    雪: { 和服: wardrobe('#e9e6f2', '#6d5a9c', '雪', ['平和', '喜悦']) },
};
for (let i = 1; i <= 40; i += 1) {
    const hue = (i * 37) % 360;
    characterOutfits[`路人${i}`] = { 便服: wardrobe(`hsl(${hue} 40% 30%)`, `hsl(${hue} 50% 45%)`, `路人${i}`, ['平和']) };
}
const sceneAssets = { characterOutfits, characterDefaultOutfits: { 凛: { version: 1, outfitName: '礼服' } } };

function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text) item.textContent = text;
    return item;
}

const overlay = node('div');
overlay.id = 'igs-overlay';
const stage = node('div', 'igs-waitstage');
stage.setAttribute('data-igs-waitstage-game', 'mahjong');
const body = node('div', 'igs-ws-body');
const note = node('div', 'igs-ws-note igs-ws-state');
const board = node('div', 'igs-ws-board');
const actions = node('div', 'igs-ws-actions');
actions.appendChild(node('button', 'igs-ws-chip', '返回当前楼'));
actions.appendChild(node('button', 'igs-ws-chip', '加载下一楼'));
body.appendChild(note);
body.appendChild(board);
body.appendChild(actions);
stage.appendChild(body);
overlay.appendChild(stage);
document.body.appendChild(overlay);

// 预览没有真生图：假接口等一会儿交回一张写着画面要求的示意图，照片存在 localStorage 里当 CG 库。
const PHOTO_KEY = 'igs-preview-penalty-photos';
const photos = () => { try { return JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}'); } catch { return {}; } };
// 尺寸和主程序 cgSizeForAspect 一样：按牌桌的宽高比在像素上限内取 64 倍数。
const sizeFor = (aspect) => {
    const fitted = aspect && aspect.width > 0 && aspect.height > 0 ? fitCgSize(aspect.width / aspect.height, CG_PIXEL_CAP) : null;
    return fitted ? { width: fitted.width, height: fitted.height } : { width: 1216, height: 832 };
};
const fakeCg = (brief, { width, height }) => {
    const worn = brief.characters.map((name) => (brief.nude.includes(name) ? `${name}（裸体）` : `${name}（${brief.outfits[name] || '默认'}）`)).join('、');
    const lines = brief.description.split('\n').flatMap((line) => line.match(/.{1,30}/g) || ['']).slice(0, 9);
    const text = lines.map((line, i) => `<text x="48" y="${330 + i * 40}" font-size="28" fill="#fff" font-family="sans-serif">${line.replace(/[<&]/g, '')}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${brief.nsfw ? '#6b1f3a' : '#1f3a6b'}"/><stop offset="1" stop-color="#0b0f24"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="#f0cf86" stroke-width="4" stroke-dasharray="18 10"/><text x="48" y="120" font-size="60" font-weight="700" fill="#f0cf86" font-family="sans-serif">惩罚 CG（预览示意）${width}×${height}</text><text x="48" y="200" font-size="32" fill="#ffd0dc" font-family="sans-serif">主体：${worn} · ${brief.nsfw ? '成人向' : '全年龄'}</text><text x="48" y="260" font-size="24" fill="#aeb8e0" font-family="sans-serif">虚线框是图片边缘：全图铺满牌桌，不裁边</text>${text}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
window.__penaltyCalls = [];
const penalty = {
    status: () => ({ ok: true, nsfw: !/nsfw=0/.test(location.search) }),
    async paint(brief) {
        window.__penaltyCalls.push(brief);
        await new Promise((resolve) => { setTimeout(resolve, 1800); });
        if (/fail=1/.test(location.search)) return { ok: false, error: '预览模拟失败：图像来源没有交回图片' };
        const id = `p${Date.now().toString(36)}`;
        const size = sizeFor(brief.aspect);
        const url = fakeCg(brief, size);
        localStorage.setItem(PHOTO_KEY, JSON.stringify({ ...photos(), [id]: url }));
        return { ok: true, url, id, size: `${size.width}x${size.height}`, request: brief.description,
            prompt: { positive: '（预览没有真写词。主程序里这里是实际发给图像来源的正向提示词）', negative: '（同上，负向提示词）' } };
    },
    async read(id) {
        const url = photos()[id];
        return url ? { ok: true, url } : { ok: false };
    },
};

// 预览没有酒馆：绫和咲有世界书条目，副 API 等 1.5 秒交回打法；其他人没条目，随机配。
const PREVIEW_LORE = {
    绫: [{ title: '绫', content: '学生会长，好胜心极强，输了就要立刻赢回来，口头禅「本小姐」。' }],
    咲: [{ title: '咲', content: '田径部王牌，做什么都图快，性子急，说话短。' }],
};
const PREVIEW_PERSONA = {
    绫: { style: 'attack', adjust: { tilt: 0.3 }, summary: '好胜，被立直也要追', lines: { riichi: ['本小姐立直了，退下吧！'], chase: ['想压过本小姐？追立！'], win: ['哼，本小姐的胜利。'], dealIn: ['刚才那张不算！'], tilt: ['本小姐要全力了！'], push: ['本小姐不会退。'] } },
    咲: { style: 'swift', summary: '图快，能鸣就鸣', lines: { call: ['拿来！', '这张归我！'], win: ['抢到了！'], riichi: ['快，立直！'] } },
};
window.__personaAsks = [];
const persona = {
    status: () => (/persona=busy/.test(location.search) ? { ok: false, reason: 'busy' } : { ok: true, via: 'secondary' }),
    lore: (names) => ({ ok: true, list: names.map((name) => ({ name, entries: PREVIEW_LORE[name] || [] })) }),
    async ask(prompt) {
        window.__personaAsks.push(prompt);
        await new Promise((resolve) => { setTimeout(resolve, 1500); });
        const names = Object.keys(PREVIEW_PERSONA).filter((name) => prompt.user.includes(`【${name}】`));
        return { ok: true, text: JSON.stringify(Object.fromEntries(names.map((name) => [name, PREVIEW_PERSONA[name]]))) };
    },
};

startMahjong({
    doc: document,
    board,
    model: buildWaitStageModel({ sceneAssets }),
    penalty,
    persona,
    onVoice(line) { (window.__voices = window.__voices || []).push(line); },
    setNote(text) { note.textContent = text || ''; },
    requestClose() { note.textContent = '牌桌先收起了，这一局还在。刷新页面会接着打。'; },
    // ?next 模拟回复已经写好：工具栏换成「下一楼」。
    host: {
        state: () => (/next/.test(location.search) ? { back: '', next: true, nextBusy: false } : { back: '返回阅读', next: false, nextBusy: false }),
        back() { note.textContent = '（预览）返回阅读'; },
        next() { note.textContent = '（预览）加载下一楼'; },
        onChange: () => () => {},
    },
});
if (/next/.test(location.search)) note.textContent = '下一楼已经写好，点「加载下一楼」再进去。';
