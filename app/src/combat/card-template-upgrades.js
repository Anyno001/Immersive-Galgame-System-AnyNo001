// 版本化模板升级决策；来源只证明列出的组件，不宣称模板具有原卡身份。
import { CARD_TEMPLATES, TEMPLATE_COSTS, templateCardFace } from './card-template-definitions.js';
const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};
export const TEMPLATE_UPGRADE_PREFIX = 'template-v1:';
const delta = (path, amount, max = 99) => ({ kind: 'delta', path: path.split('.'), amount, max });
const at = (index, amount, max = 99, field = 'amount') => delta(`effects.${index}.${field}`, amount, max);
const stacks = (index, amount, max = 10) => at(index, amount, max, 'stacks');
const cost = { kind: 'cost', amount: -1 };
const flag = (key, value = true) => ({ kind: 'set', path: [key], value });
const source = (game, name, file, line) => ({ game, name,
    evidence: `.limcode/plans/combat-gameplay-overhaul/cards-${file}.md:${line}` });
const iron = (name, line) => source(2, name, 'ironclad', line);
const silent = (name, line) => source(2, name, 'silent', line);
const defect = (name, line) => source(2, name, 'defect', line);
const watcher = (name, line) => source(1, name, 'watcher', line);
const verified = (reference, changes, difference = '') => ({ origin: 'source-component', reference, changes,
    difference: `仅列出的升级轴沿用来源差值；基础数值及费用按项目参数化，未列组件和关键字保持项目定义。${difference}` });
const project = (changes, difference = '项目组合效果；不主张原卡来源。') => ({ origin: 'project', changes, difference });
const unknown = (changes, difference = '原卡来源未核实；升级是显式项目策略，不作为原版升级证据。') =>
    ({ origin: 'unverified', changes, difference });

export const TEMPLATE_UPGRADE_POLICIES = freeze({
    strike: verified(iron('Strike (Ironclad)', 8), [at(0, 3)]),
    twin: verified(iron('Twin Strike', 26), [at(0, 2)], '保留两段，每段伤害 +2。'),
    flurry: unknown([at(0, 1)]),
    sweep: unknown([at(0, 3)]),
    scatter: verified(iron('Sword Boomerang', 21), [at(0, 1, 5, 'hits')], '只增加一段，不增加每段伤害。'),
    bash: verified(iron('Iron Wave', 16), [at(0, 2), at(1, 2)], '项目先伤害后格挡，原卡先格挡后伤害；两组件各 +2。'),
    cripple: verified(silent('Sucker Punch', 26), [at(0, 2), stacks(1, 1)]),
    rend: verified(iron('Bash', 9), [at(0, 2), stacks(1, 1)]),
    venom: verified(silent('Poisoned Stab', 25), [at(0, 2), stacks(1, 1)]),
    quick: verified(iron('Pommel Strike', 18), [at(0, 1), at(1, 1, 5)]),
    guard: verified(iron('Defend (Ironclad)', 7), [at(0, 3)]),
    brace: verified(silent('Backflip', 15), [at(0, 3)], '抽牌固定为项目的 1 张，不继承原卡的 2 张。'),
    mend: project([at(0, 2, 60)]),
    cover: project([at(0, 3)]),
    rally: project([at(0, 2)]),
    expose: verified(iron('Taunt', 22), [stacks(0, 1), at(1, 1)], '项目先易伤后格挡。'),
    hex: unknown([stacks(0, 1)]),
    toxin: verified(silent('Deadly Poison', 20), [stacks(0, 2)], '格挡为项目附加组件，不升级。'),
    surge: project([at(1, 3)], '固定能量 1 不升级，只提高项目格挡。'),
    prepare: project([at(0, 1, 5)]),
    might: verified(iron('Inflame', 50), [stacks(0, 1)], '格挡为项目附加组件，不升级。'),
    agility: verified(silent('Footwork', 50), [stacks(0, 1)], '格挡为项目附加组件，不升级。'),
    spikes: unknown([stacks(0, 1)]),
    regrow: unknown([stacks(0, 1)]),
    shatter: project([at(0, 3)], '项目伤害＋易伤＋虚弱组合；不是原卡 Shatter。仅伤害 +3，减益不变。'),
    thunder: unknown([at(0, 3)]),
    jab: verified(silent('Neutralize', 7), [at(0, 1), stacks(1, 1)]),
    reap: unknown([at(0, 3)], '治疗为固定金额，不等于原卡按实际伤害吸血；不主张 Reaper 来源。'),
    execute: project([at(0, 3)]),
    desperate: project([at(0, 3)]),
    finisher: project([at(0, 3)]),
    'venom-draw': verified(silent('Poisoned Stab', 25), [at(0, 2), stacks(1, 1)], '抽 1 张为项目拼合部分，升级仍抽 1 张。'),
    trip: verified(silent('Leg Sweep', 62), [at(0, 3), stacks(1, 1)], '项目先格挡后虚弱。'),
    wail: unknown([stacks(0, 1), stacks(1, 1)]),
    flask: unknown([stacks(0, 1)], '项目一次向全体施毒，不等于 Bouncing Flask 的随机多段施毒。'),
    adrenal: verified(silent('Adrenaline', 70), [at(0, 1, 3)], '只升级能量，抽牌与消耗不变。'),
    bulwark: verified(iron('Impervious', 85), [at(0, 10)]),
    aegis: project([at(0, 3)]),
    'rally-draw': project([at(0, 2)]),
    counter: project([at(0, 3)]),
    inflame: verified(iron('Inflame', 50), [stacks(0, 1)]),
    bastion: project([stacks(0, 1)]),
    footwork: verified(silent('Footwork', 50), [stacks(0, 1)], '抽 1 张为项目附加组件，不升级。'),
    glance: unknown([at(0, 3)]),
    gut: project([at(0, 3)]),
    lure: unknown([at(0, 1, 4, 'mult')]),
    tear: project([{ kind: 'mutual', amount: 3 }], '只增加对敌伤害，显式保留原自伤金额。'),
    fumble: project([delta('effects.0.b.0.amount', 4)]),
    fleeting: unknown([at(0, 3)], '保留既有虚无，不据名称推测移除关键字。'),
    mimic: verified(iron('Anger', 10), [at(0, 2)], '项目限 1–3 费；复制到弃牌堆的机制保持不变。'),
    chain: project([at(0, 3)]),
    rampage: verified(iron('Rampage', 53), [at(1, 5, 10)], '只升级本场成长值，不提高初始伤害。'),
    momentum: project([at(0, 3)]),
    whirl: verified(iron('Whirlwind', 30), [at(0, 3)]),
    hone: unknown([at(0, 3)]),
    sift: project([at(0, 1, 5)], '随机弃 1 张与格挡不变，不冒充自选弃牌的 Acrobatics。'),
    purge: verified(silent('Calculated Gamble', 33), [flag('retain')], '项目无用后消耗并附加格挡；只继承新增保留。'),
    scrap: unknown([at(1, 1, 3)]),
    reflex: { ...unknown([], '不能打出的弃牌收益模板；本版明确不升级，保持既有 schema 与存档契约。'), noUpgrade: 'unplayable-contract' },
    opener: project([at(0, 3)]),
    echo: unknown([at(1, 3)]),
    encore: verified(iron('One-Two Punch', 78), [at(0, 1, 2)], '附加格挡不变；下一张攻击改为接下来两张。'),
    quicken: project([at(1, 3)]),
    forge: project([at(0, 1, 4)], '碎刃是项目临时牌；数量 +1，不认作原版暗刃。'),
    talisman: project([at(0, 1, 4)]),
    frenzy: project([delta('effects.0.then.0.amount', 1)], '触发次数与持续回合不变，只提高每次格挡。'),
    rhythm: project([delta('effects.0.then.0.amount', 2)]),
    scavenge: project([delta('effects.0.then.0.amount', 1)]),
    xguard: unknown([at(0, 3)]),
    plating: unknown([delta('effects.0.then.0.amount', 2)]),
    cull: verified(silent('Acrobatics', 43), [at(0, 1, 5)], '附加格挡与自选弃 1 张不变。'),
    toss: verified(silent('Dagger Throw', 19), [at(0, 3)], '模板不含原卡抽 1 张；只继承伤害差值。'),
    replicate: project([at(1, 3)]),
    temper: project([at(1, 3)]),
    slam: verified(iron('Body Slam', 12), [cost], '附加格挡不变；非原费用的参数化变体也按项目约定降 1，0 费明确无可降费用。'),
    entrench: verified(source(2, 'Entrench', 'colorless', 106), [cost], '附加格挡不变，非原费用变体按项目约定降 1。'),
    bloodlet: unknown([at(0, 1, 5)]),
    bloodrush: verified(iron('Bloodletting', 32), [at(0, 1, 3)], '自伤金额不变。'),
    bloodrage: unknown([stacks(0, 1)]),
    overdrive: unknown([stacks(0, 1)], '不推测 Limit Break 的移除消耗升级；保留项目消耗。'),
    'heavy-blade': unknown([at(0, 2, 5, 'strengthScale')], '原卡来源未核实；项目明确只提高力量倍率 3→5。'),
    catalyst: unknown([stacks(0, 2)], '本地来源未确认原版倍增升级；项目只增加施毒，翻倍组件保持不变。'),
    sap: unknown([at(0, 3)]),
    foresight: project([at(1, 1, 5)]),
    reserve: verified(defect('Charge Battery', 19), [at(0, 3)], '下回合能量不变。'),
    steadfast: unknown([at(0, 3)]),
    trance: verified(iron('Battle Trance', 31), [at(0, 1, 5)], '项目禁抽层数 1 不变。'),
    conflux: project([at(1, 1, 5)]),
    cascade: project([at(0, 3)]),
    tempo: project([at(0, 3)]),
    absolution: project([at(1, 3)]),
    sigil: unknown([stacks(0, 1)]),
    phase: unknown([at(1, 3)], '保留项目无实体 1 与消耗；不冒充 Wraith Form 的持续回合升级。'),
    deathward: project([at(1, 3)]),
    battlecry: unknown([stacks(0, 2)]),
    stance: unknown([stacks(0, 2)]),
    disarm: unknown([stacks(1, 1, 5)], '项目攻击＋永久攻击力下降；来源未核实，仅减益 +1，伤害不变。'),
    breach: project([stacks(1, 1, 5)]),
    'wind-up': verified(watcher('Wreath of Flame', 54), [stacks(0, 3)], '附加格挡不变，单次蓄势不改为持续力量。'),
    fervor: unknown([stacks(0, 1, 3)]),
    zenith: unknown([flag('innate')], '项目持续回合数已达机制上限，显式项目策略为新增固有。'),
    apex: project([flag('retain')]),
    ambush: unknown([at(1, 3)]),
    lifeguard: verified(defect('Buffer', 86), [stacks(0, 1, 3)], '护命次数 +1，附加格挡不变。'),
    siphon: unknown([at(0, 3, 40)]),
    spite: unknown([stacks(0, 1, 5)]),
    scout: unknown([at(0, 1, 2)]),
    hunt: unknown([at(0, 1, 2)]),
    headbutt: verified(iron('Headbutt', 15), [at(0, 3)]),
    salvage: project([at(1, 3)], '项目不含 Hologram 的基础消耗，不推测移除消耗；只提高格挡。'),
    exhume: unknown([cost], '回收与消耗不变；本地原卡来源未核实，降费为项目策略。'),
    stack: project([at(1, 3)]),
    boomerang: project([at(0, 3)]),
    rebound: project([at(0, 3)]),
    purify: project([at(1, 3)]),
    cinder: project([at(1, 3)]),
    reprise: project([at(1, 3)]),
    glimpse: project([at(1, 3)]),
    morph: project([at(1, 3)]),
    refine: project([at(0, 1, 2)], '升级选中的牌数量 1→2；格挡与选择方式不变。'),
    polish: project([at(1, 3)]),
    reverb: unknown([at(0, 3)]),
    resound: unknown([at(0, 3)]),
    gambit: unknown([at(0, 3)]),
    feint: unknown([at(0, 3)]),
    quickdraw: project([at(1, 3)]),
    flow: project([flag('innate')]),
    generator: project([flag('innate')], '固定每回合能量，不是 Deva Form 的逐回合成长；不推测移除虚无。'),
    hoard: project([at(1, 3)]),
    overcharge: verified(defect('Double Energy', 41), [cost], '格挡与消耗不变；参数化费用降 1，0 费明确无可降费用。'),
    xdraw: project([at(1, 3)]),
    xforge: project([at(1, 3)]),
    interrupt: project([at(0, 3)]),
    coup: project([at(0, 3)]),
    brim: project([at(0, 3)]),
    ashen: project([at(0, 3)]),
    linger: project([at(1, 1, 2)]),
    whetstone: unknown([at(0, 3)], '永久成长组件保持不变，不把本地未核实的成长差值当作原版。'),
    carapace: project([at(0, 3)], '模板无消耗，永久成长值不变，不冒充 Genetic Algorithm。'),
    trophy: project([at(0, 2)], '项目无消耗；仅伤害 +2，永久最大生命收益不变，不主张完整 Feed 来源。'),
    barricade: verified(iron('Barricade', 91), [cost], '附加格挡不变；非原费用变体按项目约定降 1。'),
    hunker: verified(silent('Blur', 44), [at(1, 3)], '只继承格挡差值；项目保留格挡持续回合参数不变。'),
    redouble: project([at(1, 3)]),
    'armor-plate': verified(source(2, 'Neutron Aegis', 'regent', 81), [stacks(0, 3, 14)], '原卡另需星辰；项目无第二费用。'),
    rebuke: project([at(1, 3)]),
    bramble: verified(iron('Flame Barrier', 60), [stacks(0, 2), at(1, 4)], '项目用临时荆棘表达每次受击反伤，触发语义依项目机制。'),
    juggernaut: verified(iron('Juggernaut', 86), [stacks(0, 2, 8)], '只提高每次获得格挡触发的伤害，费用不变。'),
    bodyguard: project([at(1, 3)]),
    phalanx: project([flag('innate')]),
    warpath: verified(iron('Demon Form', 92), [delta('effects.0.then.0.stacks', 1, 10)]),
    bloodoath: verified(iron('Rupture', 54), [delta('effects.0.then.0.stacks', 1, 10)], '项目为单回合增益，原卡为常驻能力；自伤不变。'),
    pyre: verified(iron('Corruption', 96), [cost]),
    ember: verified(iron('Feel No Pain', 45), [stacks(0, 1, 6)]),
    smith: verified(source(2, 'Refine Blade', 'regent', 25), [at(0, 4, 10)], '只取锻造组件，模板不含原卡下回合能量。'),
    'blade-sweep': project([at(1, 3)]),
    'blade-echo': project([at(1, 3)]),
    'blade-guard': verified(source(2, 'Parry', 'regent', 53), [at(0, 4, 20)], '模板为技能，原卡为能力；只继承锻刃格挡差值。'),
    bloodthirst: project([at(1, 3)]),
    rupture: project([stacks(0, 2)]),
    envenom: verified(silent('Envenom', 82), [stacks(0, 1, 5)]),
    miasma: verified(silent('Noxious Fumes', 55), [delta('effects.0.then.0.stacks', 1, 10)]),
    'toxic-burst': project([stacks(0, 1, 10)]),
    shiv: verified(silent('Blade Dance', 16), [at(0, 1, 4)], '只继承造刃数量 +1；模板没有来源的用后消耗，费用与关键字不变。'),
    'shiv-edge': verified(silent('Accuracy', 42), [at(0, 2, 6)], '附加格挡不变，模板为技能而非能力。'),
    'shiv-fan': project([at(1, 3)], '只拆出全体目标能力，无造刃组件可继承数量升级；格挡升级为项目策略。'),
    'shiv-keep': { ...verified(silent('Phantom Blades', 56), [], '仅拆出保留组件；原卡升级只改变第一张暗刃伤害，本组件不变。'), noUpgrade: 'source-component-unchanged' },
    'shiv-first': verified(silent('Phantom Blades', 56), [at(0, 3, 13)], '只取每回合第一张暗刃加伤，保留组件未包含在模板中。'),
    sleight: project([delta('effects.0.then.0.amount', 2)]),
    'palm-off': project([at(1, 3)]),
    garrote: verified(silent('Strangle', 57), [stacks(0, 1, 5)], '模板只取本回合出牌失去生命组件，不含原卡伤害，附加格挡不变。'),
    carrion: project([at(1, 3)], '项目尸裂比例上限 2，不主张原卡来源；只提高直接伤害。'),
    bladestorm: unknown([cost]),
    'quarry-mark': project([at(0, 3)]),
    nock: project([at(0, 3)]),
    snare: project([at(0, 3)]),
    deadeye: project([flag('innate')]),
    'rising-shot': project([at(1, 3)]),
    skybreak: project([at(1, 3)]),
    consecrate: verified(source(2, 'Gather Light', 'regent', 19), [at(1, 3)], '只升级格挡；项目先获得圣辉，圣辉数量不变。'),
    smite: unknown([at(0, 4)]),
    judgment: project([at(0, 3)], '项目圣辉 X 攻击，不是观者 Judgment 的斩杀判定。'),
    'halo-strike': project([stacks(0, 1, 6)], '项目只攻击生命最低敌人，不等价 Black Hole 的全体伤害。'),
    'halo-mend': project([stacks(0, 1, 4)]),
    verdant: project([stacks(0, 1)]),
    'steady-mend': project([stacks(0, 1, 5)]),
    aftercare: project([stacks(0, 2, 10)]),
    serene: verified(watcher('Vigilance', 10), [at(1, 4)], '项目先进入静心后格挡；若基础无格挡，升级仍不新增无关组件。'),
    fury: verified(watcher('Eruption', 9), [cost], '只降费，不提高伤害；非原费用变体降 1。'),
    compose: verified(watcher('Empty Body', 20), [at(0, 3)]),
    crescendo: verified(watcher('Prostrate', 15), [at(0, 1, 5)], '乐势对应 Mantra；格挡为项目参数，升级不变。'),
    chant: verified(watcher('Devotion', 70), [stacks(0, 1, 3)]),
    simmer: project([at(1, 3)], '模板没有 Simmering Fury 的抽牌组件；不以格挡冒充其抽牌升级。'),
    'stance-ward': verified(watcher('Mental Fortress', 44), [stacks(0, 2, 6)]),
    'rage-flow': verified(watcher('Rushdown', 48), [cost], '只降费，抽牌数不变；非原费用变体降 1。'),
    'still-water': verified(watcher('Like Water', 42), [stacks(0, 2, 10)]),
    foretell: project([at(1, 3)], '项目主动预知与格挡，不等价 Foresight 的回合开始预知。'),
    'third-eye': verified(watcher('Nirvana', 45), [stacks(0, 1, 6)]),
    sustain: verified(watcher('Establishment', 71), [flag('innate')], '保留减费和附加格挡不变。'),
    resonance: project([flag('innate')], '项目回响未带虚无，不伪造 Echo Form 的移除虚无升级；本版新增固有。'),
    'curtain-call': project([flag('retain')]),
    zap: verified(defect('Ball Lightning', 17), [at(0, 3)], '模板含伤害，参照 Ball Lightning，不按键名误认纯技能 Zap。'),
    chill: verified(defect('Glacier', 61), [at(1, 3)], '只取霜珠＋格挡组件，参数化霜珠数量不变；不是按敌人数造珠的 Chill。'),
    shade: project([at(1, 3)], '模板无 Darkness 的额外触发组件；不能继承其触发次数升级。'),
    'ion-core': unknown([at(1, 3)]),
    prism: project([at(1, 3)]),
    dualcast: verified(defect('Dualcast', 8), [cost], '项目引发最前珠，来源引发最右珠，另有附加格挡；仅降费，次数不变。'),
    'orb-loop': project([at(1, 3)]),
    capacitor: verified(defect('Capacitor', 37), [at(0, 1, 3)], '附加格挡不变。'),
    attune: verified(defect('Defragment', 75), [at(0, 1, 5)], '附加格挡不变。'),
    overload: unknown([at(0, 1, 3)], '能量 +1，负专注代价不变；来源未核实。'),
    flare: unknown([at(1, 3)], '临时专注保持不变，不冒充 Biased Cognition 的常驻专注与衰减。'),
    'arc-storm': project([flag('innate')]),
    'lock-on': unknown([at(0, 3)]),
    'power-spark': verified(defect('Storm', 54), [stacks(0, 1, 2)], '只升级每次打出能力牌时的造珠数量，不新增固有。'),
    'static-shell': unknown([flag('innate')]),
    'orb-burst': project([stacks(0, 1, 6)]),
    amplify: verified(defect('Signal Boost', 81), [cost], '只取能力牌额外执行组件；项目不含消耗并有附加格挡，非原费用变体降 1。'),
    'bone-call': verified(source(2, 'Bodyguard', 'necrobinder', 7), [at(0, 2, 20)], '附加格挡不变。'),
    'bone-poke': verified(source(2, 'Poke', 'necrobinder', 11), [at(0, 3, 40)]),
    'bone-sweep': project([at(0, 3, 40)], '项目全体随从攻击，不等价带额外易伤或牺牲的原卡。'),
    'bone-rush': verified(source(2, 'Unleash', 'necrobinder', 10), [at(0, 3, 40)], '追加当前生命的组件保持不变。'),
    'bone-wall': project([at(1, 3)], '项目牺牲按最大生命 2 倍给格挡，未核实原卡对应关系。'),
    'bone-nova': project([at(1, 3)], '项目牺牲伤害按随从最大生命，升级不改比例。'),
    'bone-armor': verified(source(2, 'Calcify', 'necrobinder', 36), [stacks(0, 2, 6)]),
    'soul-bind': { ...verified(source(2, 'Necro Mastery', 'necrobinder', 86), [], '仅取随从失去生命联动，原卡升级只增加召唤值；模板没有该组件，附加格挡不补偿升级。'), noUpgrade: 'source-component-unchanged' },
    'doom-mark': verified(source(2, 'Scourge', 'necrobinder', 24), [stacks(0, 3, 20)], '只取施加灾厄，不含来源抽牌；附加格挡不变。'),
    'doom-touch': project([stacks(0, 1, 4)], '常驻且需牌指定敌人，与 Oblivion 的本回合每出一张牌不同；升级为项目策略。'),
    'doom-reap': verified(source(2, 'Reaper Form', 'necrobinder', 93), [flag('retain')]),
    'soul-harvest': verified(source(2, 'Capture Spirit', 'necrobinder', 37), [at(0, 1, 5)], '只取造魂数量差值；项目加入手牌，原卡进入抽牌堆，且不含原卡失去生命。'),
    'soul-feast': verified(source(2, 'Devour Life', 'necrobinder', 76), [stacks(0, 1, 3)]),
    'soul-blight': verified(source(2, 'Haunt', 'necrobinder', 47), [stacks(0, 2, 9)], '只升级每次打出魂牌造成的随机敌人失去生命值。'),
    'void-draw': verified(source(2, 'Pagestorm', 'necrobinder', 50), [cost], '附加格挡和抽牌数量不变。'),
    'void-guard': verified(source(2, 'Spirit of Ash', 'necrobinder', 82), [stacks(0, 1, 6)]),
    'craft-might': verified(source(2, 'Arsenal', 'regent', 74), [flag('innate')]),
    'craft-guard': verified(source(2, 'Pillar of Creation', 'regent', 54), [stacks(0, 1, 6)]),
    hellraiser: verified(iron('Hellraiser', 84), [cost]),
    'dark-embrace': verified(iron('Dark Embrace', 82), [cost]),
    'fiend-fire': verified(iron('Fiend Fire', 83), [at(0, 3, 30)]),
    feed: verified(iron('Feed', 77), [at(0, 2), at(1, 1, 5)], '保留项目非爪牙与遭遇分组的击倒边界。'),
    'shadow-step': verified(silent('Shadow Step', 77), [cost]),
    nightmare: verified(silent('Nightmare', 93), [cost]),
    'grand-finale': verified(silent('Grand Finale', 72), [at(0, 15, 90)]),
    'storm-of-steel': verified(silent('Storm of Steel', 79), [{ kind: 'set', path: ['effects', 0, 'upgraded'], value: true }], '强化暗刃沿项目衍生牌数值，不主张原版暗刃数值等价。'),
    'phantom-blades': verified(silent('Phantom Blades', 56), [at(1, 3, 13)]),
    'calculated-gamble': verified(silent('Calculated Gamble', 33), [flag('retain')]),
    'wraith-form': verified(silent('Wraith Form', 97), [stacks(0, 1, 3)]),
    strangle: verified(silent('Strangle', 57), [at(0, 2), stacks(1, 1, 5)]),
    'echo-form': verified(defect('Echo Form', 92), [flag('ethereal', false)]),
    barrage: verified(defect('Barrage', 18), [at(0, 2, 30)]),
    'multi-cast': verified(defect('Multi-Cast', 69), [{ kind: 'set', path: ['effects', 0, 'bonus'], value: 1 }]),
    'biased-cognition': verified(defect('Biased Cognition', 96), [at(0, 1, 6)]),
    reboot: verified(defect('Reboot', 72), [at(0, 2, 8)]),
    'creative-ai': verified(defect('Creative AI', 91), [cost]),
    hologram: verified(defect('Hologram', 25), [at(0, 2), { kind: 'remove', path: ['effects', 2] }]),
    'foresight-power': verified(watcher('Foresight', 39), [delta('effects.0.then.0.amount', 1, 5)]),
    establishment: verified(watcher('Establishment', 71), [flag('innate')]),
    'deva-form': verified(watcher('Deva Form', 77), [flag('ethereal', false)]),
    'master-reality': verified(watcher('Master Reality', 73), [cost]),
    vault: verified(watcher('Vault', 79), [cost]),
    omniscience: verified(watcher('Omniscience', 81), [cost], '费用仍在项目 0–3 费模板域内参数化，内层选牌由程序处理。'),
    'necro-mastery': verified(source(2, 'Necro Mastery', 'necrobinder', 86), [at(0, 3, 20)]),
    oblivion: verified(source(2, 'Oblivion', 'necrobinder', 72), [at(0, 1, 8)]),
    'capture-spirit': verified(source(2, 'Capture Spirit', 'necrobinder', 37), [at(0, 1, 20), at(1, 1, 8)]),
    dirge: verified(source(2, 'Dirge', 'necrobinder', 31), [at(0, 1, 6), { kind: 'set', path: ['effects', 0, 'upgraded'], value: true }]),
    rattle: verified(source(2, 'Rattle', 'necrobinder', 54), [at(0, 2, 40)]),
    'end-of-days': verified(source(2, 'End of Days', 'necrobinder', 91), [at(0, 8, 60)]),
    'refine-blade': verified(source(2, 'Refine Blade', 'regent', 25), [at(0, 4, 14)]),
    'black-hole': verified(source(2, 'Black Hole', 'regent', 42), [delta('effects.0.then.0.amount', 1)], '星辰改用项目圣辉，保留每次资源变动触发全体攻击。'),
    arsenal: verified(source(2, 'Arsenal', 'regent', 74), [flag('innate')]),
    'pillar-of-creation': verified(source(2, 'Pillar of Creation', 'regent', 54), [delta('effects.0.then.0.amount', 1)]),
    genesis: verified(source(2, 'Genesis', 'regent', 87), [delta('effects.0.then.0.amount', 1, 5)], '星辰改用项目圣辉。'),
    'sealed-throne': verified(source(2, 'The Sealed Throne', 'regent', 97), [cost], '星辰费用与收益改用项目圣辉。'),
    furnace: verified(source(2, 'Furnace', 'regent', 48), [delta('effects.0.then.0.amount', 2, 14)]),
    conqueror: verified(source(2, 'Conqueror', 'regent', 45), [at(0, 2, 14)], '使用项目锻刃，倍伤只在当前回合且只对本次指定敌人生效。'),
    begone: verified(source(2, 'BEGONE!', 'regent', 15), [{ kind: 'set', path: ['effects', 0, 'upgraded'], value: true }]),
});

export const templateUpgradeModel = key => `${TEMPLATE_UPGRADE_PREFIX}${key}`;
export function templateUpgradePolicy(model) {
    if (typeof model !== 'string' || !model.startsWith(TEMPLATE_UPGRADE_PREFIX)) return null;
    const key = model.slice(TEMPLATE_UPGRADE_PREFIX.length);
    return Object.hasOwn(TEMPLATE_UPGRADE_POLICIES, key) ? TEMPLATE_UPGRADE_POLICIES[key] : null;
}
const clone = value => JSON.parse(JSON.stringify(value));
const valueAt = (value, path) => path.reduce((node, field) => node?.[field], value);

export function templateUpgradeDecision(key, card) {
    const policy = Object.hasOwn(TEMPLATE_UPGRADE_POLICIES, key) ? TEMPLATE_UPGRADE_POLICIES[key] : null;
    if (!policy) return { error: 'template-upgrade-unregistered', detail: { template: key } };
    const upgradeModel = templateUpgradeModel(key);
    if (policy.noUpgrade) return { upgradeModel, reason: policy.noUpgrade };
    const face = clone(card);
    const changed = new Set();
    const skipped = [];
    for (const change of policy.changes) {
        if (change.kind === 'cost') {
            if (!Number.isInteger(face.cost)) return { error: 'template-upgrade-invalid-cost', detail: { template: key } };
            if (face.cost === 0) { skipped.push('cost-floor'); continue; }
            face.cost += change.amount;
            changed.add('cost');
            continue;
        }
        if (change.kind === 'mutual') {
            const effect = face.effects[0];
            effect.selfAmount ??= effect.amount;
            effect.amount += change.amount;
            if (effect.amount > 40) return { error: 'template-upgrade-out-of-range', detail: { template: key, path: 'effects.0.amount' } };
            changed.add('effects');
            continue;
        }
        const parent = valueAt(face, change.path.slice(0, -1));
        const field = change.path.at(-1);
        if (!parent || (change.kind === 'delta' && !Number.isInteger(parent[field]))) {
            return { error: 'template-upgrade-component-missing', detail: { template: key, path: change.path.join('.') } };
        }
        if (change.kind === 'remove') {
            if (!Array.isArray(parent) || !parent[field]) return { error: 'template-upgrade-component-missing', detail: { template: key, path: change.path.join('.') } };
            parent.splice(Number(field), 1);
            changed.add(change.path[0]);
            continue;
        }
        if (change.kind === 'set') {
            if (parent[field] === change.value) { skipped.push('already-applied'); continue; }
            parent[field] = change.value;
        } else {
            const next = parent[field] + change.amount;
            if (next > change.max || next < 1) return { error: 'template-upgrade-out-of-range',
                detail: { template: key, path: change.path.join('.'), value: next, max: change.max } };
            parent[field] = next;
        }
        changed.add(change.path[0]);
    }
    return changed.size ? { upgradeModel, upgraded: Object.fromEntries([...changed].map(field => [field, face[field]])) }
        : { upgradeModel, reason: skipped.join(',') || 'source-component-unchanged' };
}

export function checkTemplateUpgradeCoverage() {
    const missing = Object.keys(CARD_TEMPLATES).filter(key => !Object.hasOwn(TEMPLATE_UPGRADE_POLICIES, key));
    const extra = Object.keys(TEMPLATE_UPGRADE_POLICIES).filter(key => !Object.hasOwn(CARD_TEMPLATES, key));
    if (missing.length || extra.length) throw new Error(`template-upgrade-coverage: ${JSON.stringify({ missing, extra })}`);
    return true;
}
checkTemplateUpgradeCoverage();

// 缓存模板可产生的完整基础面；由同一 builder 生成，不维护第二份形状键表。
const faceCache = new Map();
export function templateBaseMatches(key, card, faceKey) {
    const tpl = Object.hasOwn(CARD_TEMPLATES, key) ? CARD_TEMPLATES[key] : null;
    if (!tpl || !(tpl.costs || TEMPLATE_COSTS).includes(card.cost)) return false;
    if (!faceCache.has(key)) {
        let values = [[]];
        for (const [min, max] of tpl.vars) {
            const next = [];
            for (const prior of values) for (let n = min; n <= max; n += 1) next.push([...prior, n]);
            values = next;
        }
        faceCache.set(key, new Set(values.map(value => faceKey(templateCardFace(tpl, value)))));
    }
    return faceCache.get(key).has(faceKey(card));
}
