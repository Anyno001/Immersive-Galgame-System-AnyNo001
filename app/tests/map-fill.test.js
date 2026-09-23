import test from 'node:test';
import assert from 'node:assert/strict';
import { createTavernHelperAdapter } from '../src/host/tavern-helper-adapter.js';

function host(draft = '') {
  const input = { value: draft, focus() {}, dispatchEvent() {} };
  let writes = 0;
  let sends = 0;
  const doc = { querySelector: selector => selector === '#send_textarea' ? input : null };
  const adapter = createTavernHelperAdapter({ document: doc, TavernHelper: {
    setInputText: () => { writes++; }, typeAndSend: () => { sends++; },
  } });
  return { adapter, input, counts: () => ({ writes, sends }) };
}

test('map draft fills only an empty host input and never sends', async () => {
  const { adapter, input, counts } = host('');
  assert.equal((await adapter.fillEmptyInputText('前往房间')).ok, true);
  assert.equal(input.value, '前往房间');
  assert.deepEqual(counts(), { writes: 0, sends: 0 });
  assert.deepEqual(await adapter.fillEmptyInputText('前往另一个地点'), { ok: false, reason: 'draft-not-empty' });
  assert.equal(input.value, '前往房间');
});

test('map draft keeps special location names as literal text without sending', async () => {
  const { adapter, input, counts } = host('');
  const draft = '前往<楼层 & "房间">地点';
  assert.equal((await adapter.fillEmptyInputText(draft)).ok, true);
  assert.equal(input.value, draft);
  assert.deepEqual(counts(), { writes: 0, sends: 0 });
  assert.deepEqual(await adapter.fillEmptyInputText(draft), { ok: false, reason: 'draft-not-empty' });
});

test('map draft preserves any nonempty text and needs an observable input', async () => {
  const filled = host('  ');
  assert.deepEqual(await filled.adapter.fillEmptyInputText('前往我家'), { ok: false, reason: 'draft-not-empty' });
  assert.equal(filled.input.value, '  ');
  assert.deepEqual(filled.counts(), { writes: 0, sends: 0 });
  const unavailable = createTavernHelperAdapter({ TavernHelper: { setInputText() {} } });
  assert.deepEqual(await unavailable.fillEmptyInputText('前往我家'), { ok: false, reason: 'missing-readable-input' });
});

test('helper-only host reads the draft and rejects unreadable or failed writes', async () => {
  let draft = '';
  let sent = 0;
  const helper = { getInputText: () => draft, setInputText: text => { draft = text; }, send: () => { sent++; } };
  const adapter = createTavernHelperAdapter({ TavernHelper: helper });
  assert.equal((await adapter.fillEmptyInputText('前往<房间>地点')).ok, true);
  assert.equal(draft, '前往<房间>地点');
  assert.deepEqual(await adapter.fillEmptyInputText('前往别处地点'), { ok: false, reason: 'draft-not-empty' });
  assert.equal(sent, 0);
  draft = null;
  assert.deepEqual(await adapter.fillEmptyInputText('新地点'), { ok: false, reason: 'missing-readable-input' });
  draft = '';
  helper.setInputText = () => false;
  assert.deepEqual(await adapter.fillEmptyInputText('新地点'), { ok: false, reason: 'input-fill-failed' });
});
