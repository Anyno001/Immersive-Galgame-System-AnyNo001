// 校园演出：日常演出标签的解析 + 「教室 / 图书馆 / 操场 / 学校天台 / 樱花校门」常驻氛围层的地点词。
// 纯数据与纯函数，不碰 DOM、不碰音频；渲染见 visual/igs-ui/fx-daily-campus.js，样式见 fx-daily-campus-style.js，音效见 fx-daily-campus-sfx.js，
// 环境音见 visual/igs-ui/scene-audio-campus.js。校园里已有的铃声 bell、广播 broadcast、成绩 score、便签 note、信件 letter 沿用，不重复造。
// 八个单次标签：黑板写字 chalk、传纸条 passnote、抽屉里的发现 drawer、点名起立 rollcall、考试发卷 exam、文化祭开场 festival、
// 毕业入学典礼 graduate、第二颗纽扣 button。
export const CAMPUS_FX_KINDS = Object.freeze(['chalk', 'passnote', 'drawer', 'rollcall', 'exam', 'festival', 'graduate', 'button']);

export const CAMPUS_FX_LABELS = Object.freeze({
    chalk: '黑板写字', passnote: '传纸条', drawer: '抽屉里的发现', rollcall: '点名起立', exam: '考试发卷',
    festival: '文化祭开场', graduate: '毕业 / 入学典礼', button: '第二颗纽扣',
});

// 每种校园演出各自的中文触发词（并入 prompt-triggers 的 DAILY_TRIGGER_WORDS，点亮 campus 块）。
export const CAMPUS_TRIGGER_WORDS = Object.freeze({
    chalk: ['黑板', '粉笔', '板书', '讲台'],
    passnote: ['传纸条', '递纸条', '小纸条', '纸团', '传条子'],
    drawer: ['抽屉', '课桌里', '桌肚', '鞋柜'],
    rollcall: ['点名', '被点到', '叫起来', '站起来回答', '起立', '出席簿'],
    exam: ['考试', '考场', '发卷', '试卷', '监考', '交卷', '期末', '期中'],
    festival: ['文化祭', '学园祭', '社团', '校庆', '开幕式', '摊位', '招新', '运动会'],
    graduate: ['毕业', '毕业典礼', '毕业照', '入学典礼', '开学典礼'],
    button: ['第二颗纽扣', '第二颗扣子', '纽扣', '扣子'],
});

const text = (value) => String(value == null ? '' : value).trim();

// 考试时长：认 1–180 的数字（「45分钟」「90」「1小时」都可），写错或没写返回 0（只出试卷与开考，不画时长）。
export function examMinutesOf(value) {
    const raw = text(value);
    const m = raw.match(/\d+(?:\.\d+)?/);
    if (!m) return 0;
    const n = Number(m[0]);
    const minutes = /小时|h/i.test(raw) ? Math.round(n * 60) : Math.round(n);
    return minutes >= 1 && minutes <= 180 ? minutes : 0;
}

// 毕业还是入学：写了入学 / 开学 / 新生就是入学（不抛学士帽），其余按毕业。
export function graduateVariantOf(value) {
    return /入学|开学|新生|迎新/.test(text(value)) ? 'enroll' : 'graduate';
}

// 抽屉里发现的是信（情书、卡片）还是礼物：看物品名，认不出按信。
export function drawerKindOf(value) {
    const name = text(value);
    if (!name) return 'letter';
    return /信|书|卡|纸|条|笺|贺/.test(name) ? 'letter' : 'gift';
}

// 返回 fx-directives 统一的参数数组；字段写错按最宽松的合法形式处理。
export function parseCampusFxBody(type, fields) {
    const [a = '', b = ''] = (fields || []).map(text);
    switch (type) {
    // 黑板写字：板书内容可省（省了只是一阵粉笔划痕），最多 20 字，一行写完。
    case 'chalk': return ['chalk', a.slice(0, 20)];
    // 传纸条：内容必填（展开后的字迹），最多 30 字。
    case 'passnote': return a ? ['passnote', a.slice(0, 30)] : null;
    // 抽屉里的发现：物品名可省（默认一封信），最多 12 字。
    case 'drawer': return ['drawer', a.slice(0, 12)];
    // 点名：被点到的名字可省，应答可省（如「到」「是」）。
    case 'rollcall': return ['rollcall', a.slice(0, 8), b.slice(0, 8)];
    // 考试发卷：科目、时长都可省；时长换算成分钟。
    case 'exam': return ['exam', a.slice(0, 8), String(examMinutesOf(b || (/\d/.test(a) ? a : '')))];
    // 文化祭 / 社团活动开场：名称可省（默认文化祭），副标题可省。
    case 'festival': return ['festival', a.slice(0, 10), b.slice(0, 12)];
    // 毕业 / 入学典礼：字样可省（默认毕业典礼）。
    case 'graduate': return ['graduate', a.slice(0, 10)];
    // 第二颗纽扣：交给谁（角色名）可省。
    case 'button': return ['button', a.slice(0, 8)];
    default: return null;
    }
}

export function campusFxOf(args) {
    const [type, a = '', b = ''] = args || [];
    switch (type) {
    case 'chalk': return { type, text: a };
    case 'passnote': return { type, text: a };
    case 'drawer': return { type, item: a };
    case 'rollcall': return { type, who: a, reply: b };
    case 'exam': return { type, subject: a, minutes: Number(b) || 0 };
    case 'festival': return { type, title: a, sub: b };
    case 'graduate': return { type, text: a };
    case 'button': return { type, who: a };
    default: return null;
    }
}

// ── 地点氛围层 ──
const CLUB_WORDS = Object.freeze(['社团', '部室', '活动室', '学生会', '文艺部', '手工部', '轻音部', '美术室', '音乐室']);
const CLASSROOM_WORDS = Object.freeze(['教室', '课堂', '班里', '班级', '讲台', '补习班', '教学楼']);
const LIBRARY_WORDS = Object.freeze(['图书馆', '图书室', '阅览室', '书库', '自习室', '资料室']);
const PLAYGROUND_WORDS = Object.freeze(['操场', '运动场', '跑道', '田径场', '篮球场', '足球场', '体育场', '网球场']);
const ROOF_WORDS = Object.freeze(['天台', '屋顶', '楼顶']);
const SCHOOL_WORDS = Object.freeze(['学校', '校舍', '校园', '教学楼', '学院', '学园', '中学', '高中', '大学', '小学', '班级', '女校', '男校', '书院']);
const GATE_WORDS = Object.freeze(['校门', '校门口', '校园门口', '樱花道', '樱花大道', '樱花林荫', '学园坡道']);

// 古代与西幻没有现代校园（魔法学院按魔法世界观放行）。
const NO_CAMPUS_WORLDS = Object.freeze(['ancient', 'fantasy']);

export const CAMPUS_AMBIENCE_KINDS = Object.freeze(['classroom', 'library', 'playground', 'rooftop', 'campusgate']);
// 校园氛围都是环境叠色、不扫光带：NSFW 页也保留。
export const CAMPUS_STILL_KINDS = CAMPUS_AMBIENCE_KINDS;
// 环境音的 kind：天台借夜景高处的风声，校门不另出声（沿用既有的鸟鸣）。
export const CAMPUS_AUDIO_KIND = Object.freeze({ classroom: 'classroom', library: 'library', playground: 'playground', rooftop: 'nightview', campusgate: '' });

// 每层只有两三个动画元素；样式见 fx-daily-campus-style.js。
export const CAMPUS_AMBIENCE_HTML = Object.freeze({
    classroom: '<i class="igs-dfx-amb-sunbeam"></i><i class="igs-dfx-amb-sunbeam is-b"></i><i class="igs-dfx-amb-chalkdust"></i><i class="igs-dfx-amb-clubglow"></i>',
    library: '<i class="igs-dfx-amb-libshade"></i><i class="igs-dfx-amb-libwindow"></i><i class="igs-dfx-amb-libmote"></i>',
    playground: '<i class="igs-dfx-amb-fieldsun"></i><i class="igs-dfx-amb-fieldhaze"></i><i class="igs-dfx-amb-fieldcloud"></i>',
    rooftop: '<i class="igs-dfx-amb-fence"></i><i class="igs-dfx-amb-fencelight"></i><i class="igs-dfx-amb-roofwind"></i>',
    campusgate: '<i class="igs-dfx-amb-gatehaze"></i><i class="igs-dfx-amb-gatepetals"></i><i class="igs-dfx-amb-gatepetals is-b"></i>',
});

function rawOf(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function includesAny(text, words) {
    return words.some((word) => text.includes(word));
}

// 返回 { kind: 'classroom'|'library'|'playground'|'rooftop'|'campusgate', variant } 或 null；variant 目前只有 classroom 的 club（社团活动室），其余空串。
// 学校天台先判（「天台」单独出现是夜景高处，归约会氛围）；校门其次；图书馆、操场、社团、教室依次排后：「图书馆自习室」是图书馆，「社团教室」是社团活动室。
export function resolveCampusAmbience(location, { worldview = '' } = {}) {
    const raw = rawOf(location);
    if (!raw || NO_CAMPUS_WORLDS.includes(String(worldview || ''))) return null;
    if (includesAny(raw, ROOF_WORDS) && includesAny(raw, SCHOOL_WORDS)) return { kind: 'rooftop', variant: '' };
    if (includesAny(raw, GATE_WORDS)) return { kind: 'campusgate', variant: '' };
    if (includesAny(raw, LIBRARY_WORDS)) return { kind: 'library', variant: '' };
    if (includesAny(raw, PLAYGROUND_WORDS)) return { kind: 'playground', variant: '' };
    if (includesAny(raw, CLUB_WORDS)) return { kind: 'classroom', variant: 'club' };
    if (includesAny(raw, CLASSROOM_WORDS)) return { kind: 'classroom', variant: '' };
    return null;
}
