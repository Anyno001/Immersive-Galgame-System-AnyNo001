// 垃圾广告短信识别：只看正文里 AI 写的发送者与内容，不编任何广告文字。
// 返回 null 或 { kind: 'shop' | 'carrier' | 'bank' | 'promo', brand }；品牌只用来取颜色与运营商名。

const SHOP_BRANDS = Object.freeze(['淘宝', '天猫', '拼多多', '京东', '美团', '饿了么', '闲鱼', '抖音商城']);
const CARRIER_NUMBERS = Object.freeze({ 10086: '中国移动', 10010: '中国联通', 10000: '中国电信' });
const CARRIER_NAMES = Object.freeze(['中国移动', '中国联通', '中国电信']);
const PROMO_WORDS = /退订|回T|点击领取|限时|优惠券/;
const BRAND_COLORS = Object.freeze({
    淘宝: '#ff5000', 天猫: '#ff0036', 拼多多: '#e02e24', 京东: '#e1251b', 美团: '#ffc300', 饿了么: '#0a8cf0', 闲鱼: '#ffd800', 抖音商城: '#fe2c55',
});
export const SPAM_DEFAULT_COLOR = '#ff5000';
// 允许套广告样式的世界观；空值按默认现代处理。
const SPAM_WORLDVIEWS = Object.freeze(['modern', 'horror', 'scifi']);

const clean = (v) => String(v == null ? '' : v).trim();

// 内容开头的【…】标题，没有则空串。
export function spamLeadTitle(text) {
    const m = /^\s*【([^【】]{1,24})】/.exec(clean(text));
    return m ? m[1] : '';
}

export function spamKindOf(sender, text) {
    const from = clean(sender);
    const body = clean(text);
    if (!from && !body) return null;
    const bare = from.replace(/^【(.*)】$/, '$1').trim();
    const shop = SHOP_BRANDS.find((b) => bare === b || bare.startsWith(b));
    if (shop) return { kind: 'shop', brand: shop };
    const carrierNo = CARRIER_NUMBERS[bare];
    if (carrierNo) return { kind: 'carrier', brand: carrierNo };
    const carrier = CARRIER_NAMES.find((b) => bare.includes(b));
    if (carrier) return { kind: 'carrier', brand: carrier };
    const lead = spamLeadTitle(body);
    if (bare.includes('银行') || /^95\d{3}$/.test(bare) || lead.includes('银行')) return { kind: 'bank', brand: bare || lead };
    const wrapped = from !== bare || lead;
    if (wrapped || PROMO_WORDS.test(body)) return { kind: 'promo', brand: bare || lead };
    return null;
}

export function spamBrandColor(brand) {
    return BRAND_COLORS[brand] || SPAM_DEFAULT_COLOR;
}

// 世界观门：现代 / 恐怖 / 科幻，或随身手机时才套广告样式。
export function spamAllowed(readerSettings) {
    const rs = readerSettings || {};
    if (rs.fxTags && rs.fxTags.spam === false) return false;
    if (rs._carryPhone === true) return true;
    const wv = clean(rs._worldview) || 'modern';
    return rs._ancientEra !== true && SPAM_WORLDVIEWS.includes(wv);
}
