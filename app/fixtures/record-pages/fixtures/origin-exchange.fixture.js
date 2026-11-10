import { syncOrigin, stopOrigin } from '../../../src/visual/igs-ui/origin-panel.js';
import { createStubOriginEngine } from '../../../src/visual/igs-ui/origin-panel-stub.js';
import { normalizeOriginSettings } from '../../../src/visual/igs-ui/origin-settings.js';
import { currencyForPoints } from '../../../src/scene/stats/stat-currency.js';

export function openOriginExchangePreview(front, params) {
    const engine = createStubOriginEngine(), state = engine.getState();
    const read = engine.getState;
    const currency = { name: '铜钱', rate: 0.25 };
    const completed = new Set();
    let points = state.points, sequence = 0, pending = null;
    let failCredit = params.get('exchange') === 'retry';
    engine.getState = () => ({ ...read(), points });
    const notice = (level, text) => {
        front.dataset.exchangeNotice = text;
        const node = front.ownerDocument.getElementById('exchange-notice');
        if (node) { node.textContent = text; node.dataset.level = level; }
    };
    const confirm = async quote => {
        if (completed.has(quote.exchangeId)) return { ok: true, done: true, present: true };
        if (!pending) {
            if (points < quote.points) return { ok: false, reason: 'points-insufficient' };
            pending = quote; points -= quote.points;
        }
        if (failCredit) { failCredit = false; return { ok: false, reason: 'inventory-write-failed' }; }
        const held = pending; completed.add(held.exchangeId); pending = null;
        return { ok: true, done: true, amount: held.amount, name: currency.name };
    };
    syncOrigin(front, {
        engine, settings: normalizeOriginSettings({ enabled: true }), notice,
        exchange: {
            info: () => ({ ok: true, name: currency.name, rate: currency.rate }),
            quote: async value => {
                const amount = currencyForPoints(currency, value);
                if (!amount) return { ok: false, reason: 'points-exchange-too-small' };
                if (value > points) return { ok: false, reason: 'points-insufficient' };
                return { ok: true, exchangeId: `preview-${++sequence}`, points: value, amount, currency };
            },
            confirm,
            retry: async () => pending ? confirm(pending) : { ok: true },
        },
    }, { doc: front.ownerDocument, size: 'medium', getStage: () => {
        const rect = front.getBoundingClientRect();
        return { stageW: rect.width, stageH: rect.height };
    } });
    front.querySelector('.igs-or-entry')?.click();
    if (params.get('menu') === '1') front.querySelector('[data-oa="menu"]')?.click();
    if (params.get('modal') === 'input') front.querySelector('[data-oa="exchange"]')?.click();
    return { close: () => stopOrigin(front) };
}
