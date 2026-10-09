import { spamBrandColor, spamKindOf, spamLeadTitle } from '../../scene/spam-sms.js';

// 垃圾广告短信卡：只改 notify 弹出卡的外观与附加界面字，正文一律 textContent 写入。
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = Object.freeze({
    shop: svg('<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>'),
    bank: svg('<path d="M12 3.2 19 6v5.4c0 4.3-2.8 7.6-7 9.4-4.2-1.8-7-5.1-7-9.4V6z"/><path d="M9 12l2.2 2.2L15.2 10"/>'),
});
const AMOUNT_RE = /(¥\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*元)/g;

function node(doc, tag, className, content) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (content != null) el.textContent = content;
    return el;
}

// 把正文拆成纯文本段与金额段，全部走 textContent。
function fillAmounts(doc, box, text) {
    box.textContent = '';
    let last = 0;
    for (const m of text.matchAll(AMOUNT_RE)) {
        if (m.index > last) box.appendChild(node(doc, 'span', '', text.slice(last, m.index)));
        box.appendChild(node(doc, 'b', 'igs-spam-amount', m[0]));
        last = m.index + m[0].length;
    }
    if (last < text.length) box.appendChild(node(doc, 'span', '', text.slice(last)));
}

function fillLead(doc, box, text) {
    const title = spamLeadTitle(text);
    box.textContent = '';
    if (!title) {
        box.textContent = text;
        return;
    }
    const lead = text.match(/^\s*【[^【】]{1,24}】/)[0];
    box.appendChild(node(doc, 'b', 'igs-spam-lead', lead.trim()));
    box.appendChild(node(doc, 'span', '', text.slice(lead.length)));
}

// 命中则给卡片换广告样式并返回 true；调用方只需传已建好的卡、发送者与正文节点。
export function applySpamCard(doc, card, effect) {
    const hit = spamKindOf(effect.sender, effect.text);
    if (!hit) return false;
    const textEl = card.querySelector('.igs-fx-notify-text');
    if (!textEl) return false;
    const text = String(effect.text || '');
    card.classList.add('is-spam');
    card.classList.add(`is-spam-${hit.kind}`);
    card.setAttribute('data-spam', hit.kind);
    if (card.style && typeof card.style.setProperty === 'function') card.style.setProperty('--igs-spam-c', spamBrandColor(hit.brand));
    else if (card.style) card.style['--igs-spam-c'] = spamBrandColor(hit.brand);
    if (hit.kind === 'shop') {
        const ico = node(doc, 'span', 'igs-spam-ico');
        ico.innerHTML = ICONS.shop;
        card.insertBefore(ico, card.children[0] || null);
        card.appendChild(node(doc, 'span', 'igs-spam-go', '去看看'));
        card.appendChild(node(doc, 'span', 'igs-spam-ad', '广告'));
    } else if (hit.kind === 'carrier') {
        const sender = card.querySelector('.igs-fx-notify-sender');
        if (!sender) card.insertBefore(node(doc, 'div', 'igs-fx-notify-sender', hit.brand), textEl);
        if (!text.includes('退订')) card.appendChild(node(doc, 'span', 'igs-spam-unsub', '退订回T'));
    } else if (hit.kind === 'bank') {
        const ico = node(doc, 'span', 'igs-spam-ico');
        ico.innerHTML = ICONS.bank;
        card.insertBefore(ico, card.children[0] || null);
        fillAmounts(doc, textEl, text);
    } else {
        fillLead(doc, textEl, text);
        if (text.includes('限时')) card.appendChild(node(doc, 'span', 'igs-spam-tag', '限时'));
    }
    return true;
}

export const SPAM_SMS_STYLE_TEXT = `
.igs-fx-notify.is-spam[data-spam]{--igs-spam-c:#ff5000;padding:10px 14px 12px;border-radius:10px;color:#1d1d24;background:#fffdf8;border:0;border-top:5px solid var(--igs-spam-c);box-shadow:0 6px 22px rgba(0,0,0,.3);font-family:inherit;letter-spacing:0;}
.igs-fx-notify.is-spam[data-spam] .igs-fx-notify-text{white-space:normal;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;}
.igs-spam-ico{position:absolute;top:12px;left:12px;width:22px;height:22px;color:var(--igs-spam-c);}
.igs-spam-ico svg{display:block;width:100%;height:100%;}
.igs-fx-notify.is-spam-shop[data-spam],.igs-fx-notify.is-spam-bank[data-spam]{padding-left:44px;}
.igs-spam-go{display:inline-block;margin-top:6px;margin-left:auto;float:right;padding:3px 12px;border-radius:12px;background:var(--igs-spam-c);color:#fff;font-size:12px;font-weight:700;pointer-events:none;}
.igs-spam-ad{position:absolute;top:8px;right:10px;font-size:10px;color:#9a9a9a;}
.igs-fx-notify.is-spam-carrier[data-spam]{background:#e8edf3;border-top-color:#5c7a99;color:#27303a;}
.igs-fx-notify.is-spam-carrier[data-spam] .igs-fx-notify-sender{color:#3b5a7a;opacity:1;}
.igs-spam-unsub{display:block;margin-top:4px;font-size:11px;color:#8a929b;}
.igs-fx-notify.is-spam-bank[data-spam]{background:#102a54;color:#f2f5fb;border-top:0;border:2px solid #d4a93a;--igs-spam-c:#d4a93a;}
.igs-fx-notify.is-spam-bank[data-spam] .igs-fx-notify-sender{color:#e9cf85;opacity:1;}
.igs-spam-amount{color:#ffd45e;font-weight:800;font-size:1.08em;}
.igs-fx-notify.is-spam-promo[data-spam]{background:#fff6cf;border-top-color:#d62828;}
.igs-spam-lead{color:#d62828;font-weight:800;}
.igs-spam-tag{position:absolute;top:8px;right:10px;padding:1px 7px;border-radius:3px;background:#ffd633;color:#d62828;font-size:11px;font-weight:800;}
.igs-nc-ad{margin-left:6px;font-size:10px;color:#8f8c86;}
.igs-nc-spamdot{display:inline-block;width:7px;height:7px;margin-right:5px;border-radius:50%;vertical-align:middle;}
`.trim();
