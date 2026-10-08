// 生图活动：给图像后端的出图入口套一层，开始 / 结束各发一次事件，阅读器据此点亮对话框顶边的细线。
// 只记种类和成败，不记提示词与图片。手动与自动出图都经过这里（CG、立绘、背景、物品、局部重绘）。
export const IMAGE_ACTIVITY_EVENT = 'igs:image-activity';

const KIND_OF = {
    generate: (args) => (args[2] && args[2].imageKind) || 'cg',
    generateDbgenCaption: (args) => (args[0] && args[0].imageKind) || 'cg',
    generateForReader: () => 'cg',
    edit: () => 'edit',
};

function failureText(result) {
    if (!result) return '没有返回结果';
    return String(result.error || result.reason || '出图失败').slice(0, 120);
}

export function trackImageActivity(backend, emit) {
    if (!backend || typeof emit !== 'function') return backend;
    let seq = 0;
    const wrapped = { ...backend };
    for (const [name, kindOf] of Object.entries(KIND_OF)) {
        if (typeof backend[name] !== 'function') continue;
        wrapped[name] = async (...args) => {
            const id = `img${seq += 1}`;
            const kind = kindOf(args);
            const safeEmit = (event) => { try { emit(event); } catch (_) { /* 界面回调出错不影响出图 */ } };
            safeEmit({ type: 'start', id, kind });
            try {
                const result = await backend[name](...args);
                // delegate：交回旧通道出图，不算成功也不算失败。
                const ok = result && result.delegate ? null : Boolean(result && result.ok !== false && (result.ok || result.url || result.dataUrl));
                safeEmit({ type: 'end', id, kind, ok, error: ok === false ? failureText(result) : '' });
                return result;
            } catch (error) {
                safeEmit({ type: 'end', id, kind, ok: false, error: String((error && error.message) || error || '出图失败').slice(0, 120) });
                throw error;
            }
        };
    }
    return wrapped;
}
