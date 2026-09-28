// 插件自身经酒馆 generateRaw 发起的后台请求会触发全局生成事件，
// 楼层内嵌流式观察器据此判断是否要忽略，避免把副 LLM 请求当成正文流式。
let depth = 0;

export async function runBackgroundGeneration(job) {
    depth += 1;
    try {
        return await job();
    } finally {
        depth = Math.max(0, depth - 1);
    }
}

export function isBackgroundGenerationActive() {
    return depth > 0;
}
