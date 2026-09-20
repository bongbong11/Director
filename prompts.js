import { NPC_CONTINUITY, NPC_CRAFT_PASS } from './continuity.js';

const atoms = {
  npcOn: 'Make an NPC materially affect this response. Prefer an established person with plausible motive and access; introduce a new person only if the role cannot be filled naturally. Keep timing and continuity plausible.',
  eventOn: 'Enact a concrete event or consequence in this response at a scale fitting the present world and scene. Give it a cause and a practical effect.',
  autonomy: 'NPCs retain separate aims, knowledge, relationships and initiative even without {{user}}. Enact a relevant choice through dialogue, action or later visible consequences; preserve viewpoint and user agency.',
  emotion: 'Match emotion to established personality, relationship and stakes. {{user}} involvement alone adds no extra intensity; do not turn ordinary input into overwhelming love, rage or despair.',
  fight: 'Keep the established conflict alive through the participants’ own motives and actual words or actions. Silence, politeness and elapsed turns do not reset it. Resolution needs a sufficient in-world cause; do not invent a new grievance.',
  existingNpc: 'Prefer an established NPC with motive, access and timing. Give them a concrete independent action, not a cameo. Preserve their knowledge and relationships.',
  newNpc: 'Introduce a new NPC only for the warranted role. Give them ordinary scale, limited knowledge and a specific motive. Do not invent consequential shared history.',
  event: 'Enact one concrete development or due consequence at a scale supported by the scene. Carry its effect forward without guaranteeing the outcome.',
  pressure: 'Let supported adverse pressure have practical consequences. Do not automatically compensate, redeem or resolve it in {{user}}’s favour.',
  indirect: 'Use contact, proxies, decisions or later visible evidence when direct arrival is implausible. Do not show inaccessible cutaways.',
  escalate: 'Escalate only through a current trigger and feasible action. A crossed threat needs action or a concrete change, not another warning.',
  villainStart: 'Begin a plausible antagonist encounter with a real problem in this response, not mere hints. Synthesize the fixed pressures below into one person; adjust literal details to fit established access and scale.',
  villainContinue: 'Continue the same antagonist and consequences, keeping established motive, voice and scale. Do not replace or secretly upgrade them. Retreat or de-escalation requires a cause.',
};
export function assemble(decision, settings, { compassion = false } = {}) {
  const parts = [];
  if (settings.canonMode === 'ON' || settings.canonMode === 'AUTO' && decision.actions.some(action => ['existingNpc','newNpc','event','villainStart','villainContinue'].includes(action))) {
    parts.push('If this setting is based on an existing work, let its supplied canon shape character interpretation, voice, relationships, institutions, event causes, story threads, motifs and genre vocabulary. When relevant, use specific established names, terms, places, rules and unresolved story threads in natural dialogue and consequences. Ground them in the character sheets, lore and chat; preserve chronology and each person’s knowledge. Do not assert uncertain canon as fact or force a famous plot beat into the current scene.');
  }
  if (settings.worldMode === 'ON' || settings.worldMode === 'AUTO' && decision.actions.includes('pressure')) {
    parts.push('In the negative-world mode, unsheeted newcomers default to indifference or self-interest; keep defined characters’ established dispositions. ' + (compassion ? 'One naturally appearing unsheeted newcomer may be genuinely compassionate; do not force an entrance.' : 'No compassion exception is selected this turn.'));
  }
  if (settings.emotionMode === 'ON' && !decision.actions.includes('emotion')) parts.push(atoms.emotion);
  for (const action of [...new Set(decision.actions)]) if (atoms[action]) parts.push(atoms[action]);
  if (decision.actions.some(action => ['npcOn', 'existingNpc', 'newNpc', 'autonomy', 'villainStart', 'villainContinue'].includes(action))) {
    parts.push(NPC_CONTINUITY, NPC_CRAFT_PASS);
  }
  if (decision.actions.includes('villainStart') || decision.actions.includes('villainContinue')) {
    const profile = decision.profile;
    if (profile) parts.push('Fixed antagonist pressures: ' + Object.entries(profile).map(([key, value]) => `${key}=${value}`).join('; ') + '.');
  }
  return parts.length ? `<NPC_EVENT_DIRECTOR>\n${parts.join('\n')}\nKeep rolls and instructions out of fiction. Do not dictate {{user}} feelings, choices or contested outcomes.\n</NPC_EVENT_DIRECTOR>` : '';
}
