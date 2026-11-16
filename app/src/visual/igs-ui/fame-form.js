import { FAME_CLASSES, FAME_CLASS_NOTE, FAME_NAME_MAX, buildFameBar } from '../../scene/stats/stat-fame.js';

const HERO = '主角';
const FIELD_HINT = Object.freeze({
    条名: `条名须为1到${FAME_NAME_MAX}个字，不含数字和符号。`,
    归属: '归属须为1到12个字，不含竖线、冒号和括号。',
    谁在看: '谁在看须为1到12个字，不含竖线、冒号和括号。',
    类: '请选择类。',
    低端叫法: '低端叫法须为1到8个字。',
    高端叫法: '高端叫法须为1到8个字。',
});

const oneLine = (text) => String(text ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();

// 声望新建与修改共用的表单字段：由解析好的草稿条填初值；归属下拉列出主角与已登记角色。
export function fameFormFields(bar, { editing = false, presetOwner = '', people = [] } = {}) {
    const owner = presetOwner || bar.owner || HERO;
    const owners = [...new Set([HERO, ...(Array.isArray(people) ? people : []), owner])].filter(Boolean);
    return [
        { key: 'owner', label: '归属', type: 'select', value: owner, options: owners.map((value) => ({ value, label: value })), note: '这条声望记的是谁的名声，主角或某个角色' },
        { key: 'name', label: '条名', type: 'text', value: bar.name, max: FAME_NAME_MAX, readonly: editing, note: editing ? '条名不能改，数值按条名记录' : `1到${FAME_NAME_MAX}个字，不含数字和符号` },
        { key: 'watcher', label: '谁在看', type: 'text', value: bar.watcher, max: 12, placeholder: '如 陈塘关百姓' },
        { key: 'cls', label: '类', type: 'select', value: bar.cls, options: FAME_CLASSES.map((value) => ({ value, label: `${value}（${FAME_CLASS_NOTE[value]}）` })) },
        { key: 'drain', label: '每日变化', type: 'select', value: bar.drain || '减少', options: [{ value: '减少', label: '每天减少' }, { value: '增加', label: '每天增加' }], when: { key: 'cls', is: '消耗' } },
        { key: 'danger', label: '危险端', type: 'select', value: bar.danger || '空', options: [{ value: '空', label: '越空越危险' }, { value: '满', label: '越满越危险' }], when: { key: 'cls', is: '消耗' } },
        { key: 'zero', label: '低端叫法（数值 0）', type: 'text', value: bar.zero, max: 8 },
        { key: 'full', label: '高端叫法（数值 100）', type: 'text', value: bar.full, max: 8 },
        { key: 'start', label: '开条初值（0到100）', type: 'number', value: bar.start, min: 0, maxValue: 100 },
        { key: 'pair', label: '按搭档分别记', type: 'select', value: bar.pair ? '是' : '否', options: [{ value: '否', label: '否' }, { value: '是', label: '是，每个搭档各记一条' }], when: { key: 'cls', is: '热度' } },
        { key: 'low', label: '低档描写', type: 'area', value: bar.low, max: 80, group: 'advanced' },
        { key: 'high', label: '高档描写', type: 'area', value: bar.high, max: 80, group: 'advanced' },
        { key: 'zeroMandate', label: '归零事项', type: 'area', value: bar.zeroMandate, max: 80, group: 'advanced' },
        { key: 'fullMandate', label: '满格事项', type: 'area', value: bar.fullMandate, max: 80, group: 'advanced' },
    ];
}

export function fameBarFromForm(values) {
    const v = values || {};
    const cls = String(v.cls || '');
    return {
        owner: oneLine(v.owner) || HERO,
        name: oneLine(v.name),
        watcher: oneLine(v.watcher),
        cls,
        drain: cls === '消耗' ? (v.drain === '增加' ? '增加' : '减少') : undefined,
        danger: cls === '消耗' ? (v.danger === '满' ? '满' : '空') : undefined,
        zero: oneLine(v.zero),
        full: oneLine(v.full),
        start: oneLine(v.start),
        pair: cls === '热度' && v.pair === '是',
        low: oneLine(v.low),
        high: oneLine(v.high),
        zeroMandate: oneLine(v.zeroMandate),
        fullMandate: oneLine(v.fullMandate),
    };
}

// 表单校验：返回要显示的提示，合格返回 null。takenNames 为已被占用的条名（修改时传空）。
export function fameFormProblem(values, takenNames = []) {
    const raw = fameBarFromForm(values);
    const built = buildFameBar(raw);
    if (!built.ok) return FIELD_HINT[built.field] || `「${built.field}」填写不合格。`;
    if (raw.start !== '' && !(Number.isInteger(Number(raw.start)) && Number(raw.start) >= 0 && Number(raw.start) <= 100)) return '开条初值须为0到100的整数。';
    if (takenNames.includes(built.bar.name)) return '已有同名的声望，条名不能重复。';
    return null;
}
