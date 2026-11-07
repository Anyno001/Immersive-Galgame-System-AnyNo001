import { skillFromTemplate } from './card-templates.js';

export const INTIMATE_FOE_ID = 'foe';
export const INTIMATE_INTERRUPT_SKILL = 'im-interrupt';
export const INTIMATE_REVENGE_SKILL = 'im-revenge';
export const INTIMATE_BAIT_SKILL = 'im-bait';
export const INTIMATE_WATCH_SKILL = 'im-watch';
export const INTIMATE_REVENGE_WEIGHT = 40;

const intent = (id, name, template) => Object.freeze({ id, name, template });

export const INTIMATE_INTENTS = Object.freeze({
    合拍: Object.freeze([
        intent('im-nervous', '紧张', 'guard'), intent('im-shy', '羞涩', 'curse'),
        intent('im-offbeat', '节奏不对', 'slash'), intent(INTIMATE_INTERRUPT_SKILL, '打断', 'heavy'),
    ]),
    主导: Object.freeze([
        intent(INTIMATE_REVENGE_SKILL, '还击', 'slash'), intent('im-provoke', '撩拨', 'crush'),
        intent(INTIMATE_BAIT_SKILL, '示弱', 'barb'), intent('im-press', '施压', 'heavy'), intent(INTIMATE_WATCH_SKILL, '观望', 'guard'),
    ]),
});

const PERSONA_BIAS = Object.freeze([
    [/傲娇|嘴硬|口是心非/, 'im-provoke'],
    [/腹黑|心机|狡黠|腹中/, INTIMATE_BAIT_SKILL],
    [/强势|霸道|支配|控制欲|女王/, 'im-press'],
]);

export function personaBiasOf(text) {
    const source = String(text || '');
    const hit = PERSONA_BIAS.find(([pattern]) => pattern.test(source));
    return hit ? hit[1] : null;
}

export function buildIntimateFoeSkills({ mechanic = '合拍', damageCap, tension = 0, mark = null, persona = '' } = {}) {
    const kind = mechanic === '主导' ? '主导' : '合拍';
    const bias = kind === '主导' ? personaBiasOf(persona) : null;
    const extra = kind === '合拍' ? Math.max(0, Math.floor(Number(tension) || 0)) : 0;
    const skills = INTIMATE_INTENTS[kind].map((spec) => {
        const base = skillFromTemplate(spec.template, damageCap);
        let weight = base.weight;
        if (spec.id === 'im-nervous') weight += extra;
        if (spec.id === 'im-shy') weight += Math.floor(extra / 2);
        if (spec.id === bias) weight += 2;
        if (spec.id === INTIMATE_REVENGE_SKILL && mark === 'suppressed') weight += INTIMATE_REVENGE_WEIGHT;
        return { id: spec.id, name: spec.name, ...base, weight };
    });
    return skills;
}
