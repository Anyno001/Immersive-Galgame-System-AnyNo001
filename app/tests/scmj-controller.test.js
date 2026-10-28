import assert from 'node:assert/strict';
import test from 'node:test';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { youlinSuit } from '../src/visual/igs-ui/scmj/profile.js';
import { greedyDecide } from '../scripts/scmj-players.mjs';

test('gate:scmj:missing-suit-tiles-are-the-only-legal-discards', () => {
    const controller = createScmjController({ seed: 1 });
    controller.start();
    let checked = false;
    const decide = (view) => {
        if (view.pending === 'turn' && !checked) {
            const suit = ['p', 's', 'm'][view.que];
            const queIds = view.holds.filter((id) => youlinSuit(id) === suit);
            if (queIds.length && view.holds.some((id) => youlinSuit(id) !== suit)) {
                checked = true;
                assert.deepEqual(view.legal.slice().sort((a, b) => a - b), queIds.slice().sort((a, b) => a - b));
                const other = view.holds.find((id) => youlinSuit(id) !== suit);
                return { dapai: other };
            }
        }
        return greedyDecide(view);
    };
    assert.throws(() => controller.play(decide, 400), /这张牌现在不能打/);
    assert.equal(checked, true);
});

test('gate:scmj:huan-must-be-three-of-one-suit', () => {
    const mixed = createScmjController({ seed: 2 });
    mixed.start();
    assert.throws(() => mixed.step(() => ({ huan: [0, 1, 9] })), /同花色/);
    const short = createScmjController({ seed: 2 });
    short.start();
    assert.throws(() => short.step(() => ({ huan: [0, 1] })), /同花色/);
    const ok = createScmjController({ seed: 2 });
    ok.start();
    assert.doesNotThrow(() => ok.step(greedyDecide));
});
