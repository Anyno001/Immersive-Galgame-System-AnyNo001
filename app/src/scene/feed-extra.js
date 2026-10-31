// 社区帖子「附加」栏的拆法（纯函数）：书评的作品名与星级、购物的价格与销量，其余原样当文本。
// 手机渲染（visual/igs-ui/feed-phone-platforms.js）与公开接口共用这一份。

// 星级：「4星」「4分」或 ★★★★；没有返回 0。
export function starsOf(extra) {
    const text = String(extra || '');
    const n = text.match(/([1-5])\s*(?:星|分)/);
    if (n) return Number(n[1]);
    const bar = text.match(/★+/);
    return bar ? Math.min(5, bar[0].length) : 0;
}

// 作品名：《某书》4星 → 某书；没有书名号就去掉星级部分。
export function workOf(extra) {
    const text = String(extra || '');
    const m = text.match(/《([^》]+)》/);
    if (m) return m[1];
    return text.replace(/[1-5]\s*(?:星|分)|★+/g, '').trim();
}

// 购物附加：「¥9.9 月销1万+」→ { price: '¥9.9', sales: '月销1万+' }；没有价格时 price 为空串，销量取剩余文字。
export function shopExtraOf(extra) {
    const text = String(extra || '');
    const price = (text.match(/[¥￥]\s*[\d.,]+/) || [''])[0];
    return { price, sales: text.replace(price, '').trim() };
}

// 按平台 id 拆附加：review → { work, rating }；shop → { price, sales }；其余 → { text }。
export function parseFeedExtra(platformId, extra) {
    const text = typeof extra === 'string' ? extra : '';
    if (platformId === 'review') return { work: workOf(text), rating: starsOf(text) };
    if (platformId === 'shop') return shopExtraOf(text);
    return { text };
}
