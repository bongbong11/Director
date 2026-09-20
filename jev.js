const n = instructions => ({ type: 'noul', instructions });
export const questions = {
  due: n('An established promise, plan, deadline, or consequence is due now.'),
  busy: n('The present scene already has enough active development; a new intervention would crowd it.'),
  forced: n('A new intervention would need coincidence, invented history, or implausible access.'),
  npc: n('An NPC has a plausible reason to affect the scene now.'),
  existing: n('An established NPC has both a current motive and a plausible route to act.'),
  newcomer: n('A new NPC is needed for a plausible role that established people cannot fill.'),
  event: n('A concrete non-NPC event or consequence can naturally affect the scene now.'),
  fight: n('An existing interpersonal conflict remains active and unresolved.'),
  pressure: n('Adverse social or world pressure naturally follows from current circumstances.'),
  escalate: n('The active conflict has a concrete cause to escalate now.'),
  resolve: n('The ongoing antagonist has a sufficient in-world cause to withdraw or resolve.'),
  indirect: n('Indirect action, contact, an intermediary, or a later visible consequence fits better than physical arrival.')
};

export function score(answers, key) {
  const value = answers?.[key]?.noul;
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : null;
}
