import assert from 'node:assert/strict';
import test from 'node:test';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { createScmjPlayer } from '../src/visual/igs-ui/scmj/player.js';
import { MAHJONG_STYLES } from '../src/visual/igs-ui/wait-stage-mahjong-mind.js';

const REJECTION = /not your turn|already hued|no need chupai|plz guo before|can't find mj|peng == false|gang == false|can't be ganged|invalid request|no need guo|it's your turn|lack of mj|can't recv huansanzhang|player has done this action|can't recv dingQue|can't find user game data|invalid pai count/;

function playMatches(matches, seatOptions) {
    for (let seed = 1; seed <= matches; seed += 1) {
        const controller = createScmjController({ seed, strict: true });
        const userIds = controller.host.userIds;
        const ais = userIds.map((userId, index) => createScmjPlayer(index, userId, controller.xzdd.__internals, { userIds, seed: seed * 4 + index, ...seatOptions(seed, index) }));
        let cursor = 0;
        const played = controller.play((view) => {
            for (const step of controller.trace.slice(cursor)) {
                for (const msg of step.messages) {
                    const ai = ais.find((item) => item.userId === msg.userId);
                    if (ai) ai.feed(msg);
                }
            }
            cursor = controller.trace.length;
            return ais[view.index].decide(view);
        }, 4000);
        assert.ok(played.over && played.over.endinfo, `seed ${seed} did not finish the match`);
        const bad = played.logs.find((line) => REJECTION.test(line));
        assert.equal(bad, undefined, `seed ${seed} ${bad}`);
        const total = played.over.results.reduce((sum, row) => sum + row.score, 0);
        assert.equal(total, 0, `seed ${seed} scores do not sum to 0`);
    }
}

test('gate:scmj:plain-matches-finish-without-rejection', () => {
    playMatches(Number(process.env.SCMJ_PLAIN_MATCHES || 50), () => ({}));
});

test('gate:scmj:persona-matches-finish-without-rejection', () => {
    const styles = Object.keys(MAHJONG_STYLES);
    playMatches(Number(process.env.SCMJ_PERSONA_MATCHES || 14), (seed, index) => ({
        plain: false,
        persona: { style: styles[(seed + index) % styles.length] },
    }));
});
