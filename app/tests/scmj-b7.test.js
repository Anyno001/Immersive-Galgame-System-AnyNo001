import assert from 'node:assert/strict';
import test from 'node:test';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { greedyDecide } from '../scripts/scmj-players.mjs';
import { runDiff } from '../scripts/scmj-diff.mjs';

function tileToDiscard(view) {
    const suit = ['p', 's', 'm'][view.que];
    const queIds = suit ? view.holds.filter((id) => (id < 9 ? 'p' : id < 18 ? 's' : 'm') === suit) : [];
    return (queIds.length ? queIds : view.holds).slice().sort((a, b) => a - b)[0];
}

function huVersusPeng(mode) {
    let phase = 'seek';
    let targets = null;
    const decide = (view, api) => {
        const acts = (api?.seats || []).filter((seat) => seat.pending === 'action' && seat.action);
        const huSeat = acts.find((seat) => seat.action.hu && !seat.action.peng);
        const pengSeat = acts.find((seat) => seat.action.peng && !seat.action.hu && huSeat && seat.action.pai === huSeat.action.pai);
        if (phase === 'seek' && huSeat && pengSeat) {
            phase = 'hit';
            targets = { hu: huSeat.index, peng: pengSeat.index };
            decide.at = api.calls.length;
        }
        if (phase === 'hit' && view.pending === 'action') {
            if (targets && view.index === targets.hu) return mode === 'hu' ? { hu: true } : { guo: true };
            if (targets && view.index === targets.peng) return { peng: true };
            return { guo: true };
        }
        if (phase === 'hit') phase = 'done';
        return greedyDecide(view);
    };
    return decide;
}

function twoHu(passSecond) {
    let phase = 'seek';
    let ids = null;
    const decide = (view, api) => {
        const acts = (api?.seats || []).filter((seat) => seat.pending === 'action' && seat.action && seat.action.hu);
        if (phase === 'seek' && acts.length >= 2 && acts.every((seat) => seat.action.pai === acts[0].action.pai)) {
            phase = 'hit';
            ids = acts.map((seat) => seat.index);
            decide.at = api.calls.length;
        }
        if (phase === 'hit' && view.pending === 'action') {
            if (ids && ids.includes(view.index)) {
                if (passSecond && view.index === ids[1]) return { guo: true };
                return { hu: true };
            }
            return { guo: true };
        }
        if (phase === 'hit') phase = 'done';
        return greedyDecide(view);
    };
    return decide;
}

function robKong(pass) {
    let phase = 'seek';
    const decide = (view, api) => {
        const last = api && api.calls[api.calls.length - 1];
        if (phase === 'seek' && view.pending === 'action' && view.action && view.action.hu && !view.action.peng && last && last.name === 'gang') {
            phase = 'hit';
            decide.at = api.calls.length;
            return pass ? { guo: true } : { hu: true };
        }
        return greedyDecide(view);
    };
    return decide;
}

function discardInsteadOfKong() {
    let phase = 'seek';
    const decide = (view, api) => {
        if (phase === 'seek' && view.pending === 'action' && view.action && view.action.gang && !view.action.peng && !view.action.hu) {
            phase = 'need-discard';
            decide.at = api.calls.length;
            return { dapai: tileToDiscard(view) };
        }
        if (phase === 'need-discard' && view.pending === 'turn') {
            phase = 'done';
            return { dapai: tileToDiscard(view) };
        }
        return greedyDecide(view);
    };
    return decide;
}

function callsFrom(played, at) {
    return played.calls.slice(at, at + 4).map((call) => `${call.name}:${call.args.join(',')}`);
}

async function agrees(seed, make) {
    const result = await runDiff({ matches: 1, seedBase: seed, makeDecide: make });
    assert.equal(result.at, undefined, JSON.stringify({ seed: result.seed, at: result.at }));
}

test('gate:scmj:claim-order-matches-youlin', async () => {
    const huWin = createScmjController({ seed: 11, strict: true });
    const huDecide = huVersusPeng('hu');
    huWin.play(huDecide, 800);
    const huCalls = callsFrom(huWin, huDecide.at);
    assert.equal(huCalls[0], 'hu:1003');
    assert.equal(huCalls.includes('peng:1002'), false);

    const huPass = createScmjController({ seed: 11, strict: true });
    const passDecide = huVersusPeng('guo');
    huPass.play(passDecide, 800);
    const passCalls = callsFrom(huPass, passDecide.at);
    assert.equal(passCalls[0], 'peng:1002');
    assert.equal(passCalls[1], 'guo:1003');

    const both = createScmjController({ seed: 4, strict: true });
    const bothDecide = twoHu(false);
    both.play(bothDecide, 800);
    assert.deepEqual(callsFrom(both, bothDecide.at).slice(0, 2), ['hu:1002', 'hu:1003']);

    const half = createScmjController({ seed: 4, strict: true });
    const halfDecide = twoHu(true);
    half.play(halfDecide, 800);
    assert.deepEqual(callsFrom(half, halfDecide.at).slice(0, 2), ['hu:1002', 'guo:1003']);

    const robbed = createScmjController({ seed: 47, strict: true });
    const robDecide = robKong(false);
    const robbedPlay = robbed.play(robDecide, 800);
    assert.equal(callsFrom(robbedPlay, robDecide.at)[0], 'hu:1004');
    const passed = createScmjController({ seed: 47, strict: true });
    const passKong = robKong(true);
    const passedPlay = passed.play(passKong, 800);
    assert.equal(callsFrom(passedPlay, passKong.at)[0], 'guo:1004');
    const robbedTypes = robbedPlay.trace.flatMap((step) => step.messages).flatMap((msg) => (msg.data && msg.data.results) || []).flatMap((row) => (row.actions || []).map((action) => action.type));
    const passedTypes = passedPlay.trace.flatMap((step) => step.messages).flatMap((msg) => (msg.data && msg.data.results) || []).flatMap((row) => (row.actions || []).map((action) => action.type));
    assert.equal(robbedTypes.includes('qiangganghu'), true);
    assert.equal(passedTypes.includes('qiangganghu'), false);

    const discard = createScmjController({ seed: 2, strict: true });
    const discardDecide = discardInsteadOfKong();
    const discarded = discard.play(discardDecide, 800);
    assert.deepEqual(callsFrom(discarded, discardDecide.at).slice(0, 2), ['guo:1001', 'chuPai:1001,7']);
    assert.equal(discarded.logs.some((line) => /not your turn|invalid request|can't find|plz guo|no need/.test(line)), false);

    await agrees(11, () => huVersusPeng('hu'));
    await agrees(11, () => huVersusPeng('guo'));
    await agrees(4, () => twoHu(false));
    await agrees(4, () => twoHu(true));
    await agrees(47, () => robKong(false));
    await agrees(47, () => robKong(true));
    await agrees(2, () => discardInsteadOfKong());
});
