import test from 'node:test';
import assert from 'node:assert/strict';
import { collectWaitStageLines } from '../src/visual/igs-ui/wait-stage-runtime.js';

test('回放台词池认带服装栏的四栏标签，否则「这句是谁说的」永远凑不齐', () => {
    const turns = [{ id: 1, text: '[igs-char:绫|平和|校服|早上好。]\n[igs-char:林|害羞|默认|嗯，是啊。]\n[igs-char:绫|平和|今天也请多关照。]' }];
    const lines = collectWaitStageLines(turns, { random: () => 0, sceneAssets: { characterOutfits: { 绫: { 校服: { moods: { 平和: 'igs-gen:a' } } } } } });
    assert.deepEqual(lines.map((line) => `${line.who}:${line.text}`).sort(), ['林:嗯，是啊。', '绫:今天也请多关照。', '绫:早上好。'].sort());
});
