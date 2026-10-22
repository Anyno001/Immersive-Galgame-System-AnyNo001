// 人类战斗演出基线：固定一组人类对手（单对手）的战斗文本，收集指令解析、区间状态、跨楼继承与 planBattleFx 的输出。
// 改动前用 HEAD 源码取得快照固化到 fixtures/human-battle-baseline.json；之后同一组输入的输出必须逐项相同。
// mods：{ extractFxDirectives, resolveFxAtPage, readBattleCarry, createBattleHistoryScanner, planBattleFx }，取自要比对的那一份源码。

export const HUMAN_BATTLE_TEXTS = Object.freeze({
    full: '[igs-fx:battle|史莱姆|王国护卫]他挥剑。[igs-fx:hit|爱丽丝|史莱姆|冰霜新星|暴击]她笑了。[igs-fx:hit|史莱姆|我|撞击|命中]对方退后。[igs-fx:hit|爱丽丝|史莱姆|终结|击倒]结束了。[igs-fx:battle-end|胜利]',
    open: '[igs-fx:battle|强盗头目]对峙。[igs-fx:hit|我|强盗头目|斩击|闪避]然后[igs-fx:hit|强盗头目|我|重击|格挡]',
    follow: '[igs-fx:hit|我|强盗头目|反击|命中]战斗继续。[igs-fx:hit|强盗头目|爱丽丝|挥砍|治疗]',
    lose: '最后[igs-fx:hit|强盗头目|我|终结一击|击倒]你倒下了。[igs-fx:battle-end|败北]',
    escape: '[igs-fx:battle|守卫|城门]追来。[igs-fx:battle-end|撤退]',
    plain: '没有任何战斗标签的一段正文。',
});

const OPTION_SETS = Object.freeze([
    { name: 'base', settings: { enabled: true, letterbox: true } },
    { name: 'foeImage', settings: { enabled: true }, foeImage: 'https://example.test/foe.png', holdScale: 1.4 },
    { name: 'onStage', settings: { enabled: true }, spriteName: '史莱姆', castNames: ['爱丽丝'], foeImage: 'data:image/png;base64,AAAA' },
    { name: 'off', settings: { enabled: false } },
    { name: 'nsfw', settings: { enabled: true }, nsfw: true },
]);

// battle.down（本场已击倒 / 收服的目标名）是第三期新增的只读字段，人类路径不读取；比对时去掉，其余字段逐项相同。
const clone = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value, (key, item) => (key === 'down' ? undefined : item)));

export function captureHumanBattle(mods, extraPlanOptions = null) {
    const out = { directives: {}, carry: {}, scanner: {}, pages: {} };
    for (const [key, text] of Object.entries(HUMAN_BATTLE_TEXTS)) {
        const directives = mods.extractFxDirectives(text);
        out.directives[key] = clone(directives);
        out.carry[key] = clone(mods.readBattleCarry(text));
        const offsets = [-1, ...directives.map((d) => d.offset), text.length];
        const pages = [];
        for (const initial of [null, { battle: { foe: '强盗头目', title: '' } }]) {
            let prev = -1;
            for (const offset of offsets.slice(1)) {
                const fx = mods.resolveFxAtPage(directives, offset, prev, initial, -1);
                prev = offset;
                const input = { battle: clone(fx.battle), battleStart: fx.battleStart, battleEnd: fx.battleEnd, hits: clone(fx.hits), userName: '旅人' };
                const plans = OPTION_SETS.map((opts) => {
                    const { name, ...rest } = opts;
                    const base = { ...rest, identity: { chatId: 'c', messageId: 1, swipeId: 0, page: offset } };
                    const plan = mods.planBattleFx(clone(input), base);
                    const extra = extraPlanOptions ? mods.planBattleFx(clone(input), { ...base, ...extraPlanOptions }) : null;
                    return { name, plan: clone(plan), extra: extra ? clone(extra) : undefined };
                });
                pages.push({ initial: clone(initial), offset, input, plans });
            }
        }
        out.pages[key] = pages;
    }
    const history = [
        [{ isUser: false, text: HUMAN_BATTLE_TEXTS.follow }, { isUser: false, text: HUMAN_BATTLE_TEXTS.open }],
        [{ isUser: true, text: '<meta:检定结果>结果：大成功</meta:检定结果>' }, { isUser: false, text: HUMAN_BATTLE_TEXTS.follow }, { isUser: false, text: HUMAN_BATTLE_TEXTS.plain }],
        [{ isUser: false, text: HUMAN_BATTLE_TEXTS.lose }],
    ];
    history.forEach((list, index) => {
        const scanner = mods.createBattleHistoryScanner();
        for (const message of list) if (scanner.push(message)) break;
        out.scanner[index] = clone(scanner.result());
    });
    return out;
}
