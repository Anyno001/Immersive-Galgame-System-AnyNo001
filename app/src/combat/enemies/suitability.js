// 剧情适配指引只读最终技能组合；不按原作名字或立绘猜能力，也不改变抽取概率。
import { COMBAT_RULES } from '../rules.js';

const flatten = (effects) => (effects || []).flatMap((e) => [e, ...['then', 'a', 'b'].flatMap((key) => flatten(e?.[key]))]);

export function describeEnemySuitability(profile) {
    const skills = [...(profile?.skills || []), ...(profile?.phases || []).flatMap((p) => p.addSkills || [])];
    const passives = [...(profile?.passives || []), ...(profile?.phases || []).flatMap((p) => p.passives || [])];
    const effects = [...skills, ...passives].flatMap((item) => flatten(item.effects));
    const hasOp = (...ops) => effects.some((e) => ops.includes(e.op));
    const hasStatus = (...keys) => effects.some((e) => ['status', 'apply-status'].includes(e.op) && keys.includes(e.status));
    const fits = [];
    const add = (when, text) => { if (when) fits.push(text); };
    add(hasOp('summon-kin'), '统领、巢母、召唤师等驱使随从的敌人');
    add(hasOp('split-into'), '可分裂的黏体、虫群或聚合生物');
    add(profile?.deathSpawns?.length, '倒下后孵化或解体产生新个体的敌人');
    add(hasOp('drain'), '吸血、寄生或吞噬生命的敌人');
    add(hasOp('constrict'), '藤蔓、蛇类等持续缠绕对手的敌人');
    add(hasOp('steal-gold'), '劫匪、窃贼等掠夺财物的敌人');
    add(hasOp('offer-curse'), '以诅咒迫使对手作出抉择的恶魔或术士');
    add(profile?.script?.sleep, '休眠守卫或受惊后苏醒的巨兽');
    add(hasStatus('fuse') || hasOp('release', 'self-destruct'), '蓄压爆炸的机关、构装体或危险生物');
    add(hasStatus('thorns', 'barbed'), '带尖刺、棘皮或反击外壳的敌人');
    add(hasStatus('plated', 'plating', 'metallicize', 'barricade', 'shell'), '甲壳生物、盾卫或重装构装体');
    add(hasStatus('flying', 'soar'), '飞禽、翼兽或腾空作战的敌人');
    add(hasOp('foe-volley'), '攻击段数逐渐增多的连击型敌人');
    add(hasOp('foe-surge') || hasStatus('strength', 'ritual'), '会强化自身、越战越强的敌人');
    add(hasOp('create'), '会制造伤口、杂物或干扰对手牌组的敌人');
    add(effects.some((e) => ['status', 'apply-status'].includes(e.op) && e.target && e.target !== 'self'
        && !['strength', 'dexterity'].includes(e.status)), '使用毒素、咒术或削弱手段的敌人');
    add(hasOp('heal'), '能自愈或通过仪式恢复的敌人');
    const strikes = effects.filter((e) => ['damage', 'drain'].includes(e.op));
    add(strikes.some((e) => e.hits >= 3), '依靠连续扑击、快攻或连射的敌人');
    const cap = COMBAT_RULES.tiers[profile?.tier]?.damageCap ?? COMBAT_RULES.tiers.normal.damageCap;
    add(strikes.some((e) => e.amount * (e.hits || 1) >= cap * 0.75), '重击型猛兽、武者或大型机关');
    add(hasOp('block'), '交替进攻与防御的卫士或坚韧生物');
    return fits.slice(0, 4).join('；') || '以直接攻击为主的打手、猛兽或战斗机关';
}
