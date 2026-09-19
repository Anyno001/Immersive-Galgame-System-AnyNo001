import { createIgsReaderHost } from './src/visual/igs-ui/reader-host.js';

let store = { bridge: { openMode: 'pc', sceneAssets: { enabled: true, scenes: {}, characters: { '小林海斗': { '默认': 'http://x/sprite.png' } } } }, readerMode: 'pc', readerSettingsByMode: {} };

function getUnifiedSettings(input = {}) {
  const mode = (input && input.mode) || store.readerMode || 'pc';
  return {
    version: '0.5.1',
    bridge: JSON.parse(JSON.stringify(store.bridge)),
    readerMode: mode,
    readerSettings: JSON.parse(JSON.stringify(store.readerSettingsByMode[mode] || {})),
  };
}
function saveUnifiedSettings(payload) {
  const mode = payload.readerMode || 'pc';
  store.readerSettingsByMode[mode] = JSON.parse(JSON.stringify(payload.readerSettings));
  console.log('[SAVE] mode=', mode, 'layouts=', JSON.stringify(payload.readerSettings.spriteLayouts && payload.readerSettings.spriteLayouts.pc), '_v=', payload.readerSettings._v);
  return { ok: true };
}

const host = createIgsReaderHost({ version: '0.5.1', global: globalThis, getUnifiedSettings, saveUnifiedSettings });
const payload = { mode: 'pc', message: '@igs-scene:小林海斗|默认||[测试]', scene: { speaker: '小林海斗' } };
const opened = host.openReader(payload, { mode: 'pc' });
const controller = opened.controller;

let snap = host.getState().activeReader.snapshot;
console.log('[OPEN] mode=', snap.mode, 'layouts.pc=', JSON.stringify(snap.readerSettings.spriteLayouts && snap.readerSettings.spriteLayouts.pc));

// Save new layout directly to store (simulating what saveReaderSettingsPatch persists)
const cur = getUnifiedSettings({mode:'pc'}).readerSettings;
saveUnifiedSettings({ bridge: store.bridge, readerMode: 'pc', readerSettings: { ...cur, _v: '0.5.1', spriteLayouts: { pc: { posX: 70, posY: 30, scale: 180 }, mobile:{posX:50,posY:100,scale:100}, web:{posX:50,posY:100,scale:100}, fullscreen:{posX:50,posY:100,scale:100} } } });

// Now trigger a rerender via a no-op action and inspect the new snapshot
controller.toggleHidden(); controller.toggleHidden();
snap = host.getState().activeReader.snapshot;
console.log('[AFTER-RERENDER] layouts.pc=', JSON.stringify(snap.readerSettings.spriteLayouts && snap.readerSettings.spriteLayouts.pc));

// Check what's in the live DOM sprite
const spriteEl = globalThis.document && globalThis.document.querySelector('#igs-sprite');
console.log('[DOM] sprite bgSize=', spriteEl && spriteEl.style.backgroundSize, 'bgPos=', spriteEl && spriteEl.style.backgroundPosition);
