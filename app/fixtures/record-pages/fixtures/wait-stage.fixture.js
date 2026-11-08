import { buildWaitStageModel, createWaitStageRuntime } from '../../../src/visual/igs-ui/wait-stage-runtime.js';
import { installWaitStageGames, uninstallWaitStageGames } from '../../../src/plugins/wait-stage-games-entry.js';

export function openWaitStagePreview(host, query) {
    const doc = host.ownerDocument;
    const root = doc.defaultView;
    installWaitStageGames(root);
    const image = time => new URL(`../assets/scene-demo-clean-${time}.png`, import.meta.url).href;
    const settings = { enabled: query.get('wait') !== 'off', games: query.get('games') !== 'off', voice: false };
    const model = buildWaitStageModel({
        settings, random: () => 0.25,
        turns: [{ id: 12, text: '[igs-char:林夏|微笑|先挑一个游戏吧。]\n[igs-char:陈屿|平和|下一页还没写完。]' }],
        sceneAssets: {
            characters: { 林夏: { 平和: image('day'), 微笑: image('dawn') }, 陈屿: { 平和: image('night') } },
            scenes: { 教室: { url: image('day') }, 走廊: { url: image('dawn') }, 天台: { url: image('night') } },
        },
    });
    const runtime = createWaitStageRuntime({
        doc, random: () => 0.25,
        onSettings: () => { location.search = '?page=perf-text&size=' + (query.get('size') || 'desktop'); },
        onClose: () => runtime.close(),
    });
    const layer = runtime.open(host, { model, settings, play: query.get('play') !== 'off' });
    const game = query.get('game');
    if (game) Array.from(layer.querySelectorAll('[data-game]')).find(button => button.getAttribute('data-game') === game)?.click();
    return { model, runtime, close() { runtime.dispose(); uninstallWaitStageGames(root); } };
}
