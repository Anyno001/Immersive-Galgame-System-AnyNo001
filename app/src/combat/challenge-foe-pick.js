// 日常挑战选难关：优先让副模型按事件名与领域挑难关键和名称，不可用或被拒收时退回本地 pickFoe。纯逻辑，请求函数由调用方注入。
import { generateWithRetry } from './generation-retry.js';
import { hashString } from './random.js';
import { CHALLENGE_FOES, pickFoe } from './challenge-foes.js';

// 追加在通用系统提示词之后，不改动战斗生成的提示词；程序给定强度与出招，模型只选键与起名。
export const CHALLENGE_FOE_SYSTEM = '- challenge-foe：{"foe":"input.foes 中的难关键","name":"这个难关的名称，≤20 字"}——日常挑战 input.event（领域 input.domain）里要面对的那一方，从 input.foes 里选最贴合的一项，名称贴合事件与剧情；强度与出招由程序给定。';

// 难关请求：输入事件名与领域，模型只回难关键与名称。
export function challengeFoeEntity({ event, domain = '' } = {}) {
    const id = `challenge-${hashString([event, domain].join('|'))}`;
    const foes = Object.entries(CHALLENGE_FOES).map(([key, foe]) => ({ key, name: foe.name, hints: foe.words.slice(0, 4) }));
    return { key: `challenge-foe:${id}`, kind: 'challenge-foe', role: 'challenge', owner: id, input: { event, domain, foes }, fixed: {} };
}

const localFoe = (event, domain, reason) => ({ foe: pickFoe(event, domain), name: '', source: 'local', reason });

// 返回 { foe, name, source: 'llm' | 'local', reason? }；name 为空表示沿用难关登记的日常名称。
export async function chooseChallengeFoe({ event, domain = '', request, llm, signal, context = {}, retryDelays } = {}) {
    if (typeof request !== 'function') return localFoe(event, domain, 'combat-llm-unavailable');
    const withLine = (req, config) => request({ ...req, system: `${req.system}\n${CHALLENGE_FOE_SYSTEM}` }, config);
    let result;
    try {
        result = await generateWithRetry([challengeFoeEntity({ event, domain })], { request: withLine, llm, signal, context, ...(retryDelays ? { retryDelays } : {}) });
    } catch {
        return localFoe(event, domain, 'combat-llm-request-failed');
    }
    const picked = result?.accepted?.find((item) => item.kind === 'challenge-foe')?.challengeFoe;
    if (picked && Object.hasOwn(CHALLENGE_FOES, picked.foe)) return { foe: picked.foe, name: picked.name, source: 'llm' };
    return localFoe(event, domain, result?.reason || result?.rejected?.[0]?.errors?.[0]?.reason || 'combat-llm-rejected');
}
