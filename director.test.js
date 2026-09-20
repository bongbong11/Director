import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, initialState, decide, villainProfile, recentChat } from './director.js';
import { assemble } from './prompts.js';
const answers = values => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { type: 'noul', noul: v }]));
test('Jev veto prevents a successful die from forcing NPC creation', () => {
  const d = decide(defaults, initialState(), answers({ busy: .9, forced: .1, npc: .9, newcomer: .9 }), { npc: true });
  assert.ok(!d.actions.includes('newNpc'));
});
test('established NPC takes precedence over newcomer', () => {
  const d = decide(defaults, initialState(), answers({ busy: .1, forced: .1, npc: .9, existing: .9, newcomer: .9 }), { npc: true });
  assert.ok(d.actions.includes('existingNpc'));
  assert.ok(!d.actions.includes('newNpc'));
});
test('villain pressure is fixed and assembled briefly', () => {
  const d = decide(defaults, initialState(), answers({ busy: .1, forced: .1, npc: .9, existing: .9, pressure: .9 }), { villain: true });
  assert.equal(d.villain, 'pending'); d.profile = villainProfile(() => 0);
  assert.match(assemble(d, defaults), /access=stranger/);
});
test('recent chat excludes hidden and system messages', () => {
  assert.deepEqual(recentChat([{ mes: 'secret', is_hidden: true }, { mes: 'hello', is_user: true }]).map(m => m.text), ['hello']);
});
test('source-work guidance works independently of negative world', () => {
  const prompt = assemble({ actions: [] }, { worldMode: 'OFF', canonMode: 'ON' });
  assert.match(prompt, /character interpretation/);
  assert.match(prompt, /genre vocabulary/);
  assert.match(prompt, /Do not assert uncertain canon/);
});
