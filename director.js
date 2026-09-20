import { score } from './jev.js';

export const defaults = Object.freeze({
  npcMode: 'AUTO', eventMode: 'AUTO', fightMode: 'OFF', autonomyMode: 'OFF',
  emotionMode: 'OFF', villainMode: 'AUTO', worldMode: 'OFF', canonMode: 'AUTO', pressureMode: 'AUTO',
  previewGeneral: false, previewNegative: false, translationProfile: '',
  npcChance: 20, eventChance: 15, villainChance: 10, recentCount: 10
});
export const initialState = () => ({ villain: 'idle', profile: null, pending: false, last: '대기' });
const yes = (a, k, threshold = .68) => score(a, k) >= threshold;
const no = (a, k, threshold = .55) => score(a, k) !== null && score(a, k) < threshold;
export const active = mode => mode !== 'OFF';
export const roll = (chance, random = Math.random) => random() * 100 < Number(chance);
export function recentChat(chat, count = 10) {
  return (chat || []).filter(m => !m.is_system && !m.is_hidden && typeof m.mes === 'string' && m.mes.trim())
    .slice(-Math.max(2, Math.min(20, count))).map(m => ({ role: m.is_user ? 'user' : 'assistant', name: m.name || '', text: m.mes.slice(0, 3500) }));
}
export function isOoc(messages) { return /\(ooc\s*:/i.test([...messages].reverse().find(m => m.role === 'user')?.text || ''); }
export async function retrievalContext(provider, messages) { return provider ? await provider.retrieve(messages) : []; }
export function activeGenres(chatMetadata) {
  const value = chatMetadata?.variables?.GENRE;
  return typeof value === 'string' ? value.trim().slice(0, 1200) : '';
}
export function buildState(messages, state, retrieved = [], genres = '') {
  return { current_user: [...messages].reverse().find(m => m.role === 'user')?.text || '', recent_chat: messages,
    ongoing_antagonist: state.villain === 'active', antagonist_profile: state.profile, active_genres: genres, relevant_memory: retrieved };
}
const axes = {
  access: ['stranger with ordinary access','local regular or neighbour','work or institutional contact','acquaintance with limited history','indirect contact or intermediary','existing rival if supported'],
  leverage: ['little beyond persistence','social embarrassment','information or a rumour','small practical control','money or access','narrow institutional power'],
  motive: ['entitlement','resentment','opportunism','jealousy or possessiveness','desperation','self-interest'],
  method: ['intrusion','obstruction','deception','public pressure','demands or harassment','direct confrontation'],
  competence: ['clumsy','inconsistent','ordinary','capable in one area','prepared','highly capable in a narrow way'],
  composure: ['volatile','irritable','brazen','controlled','patient','shifting under pressure']
};
export function villainProfile(random = Math.random) { return Object.fromEntries(Object.entries(axes).map(([k, v]) => [k, v[Math.floor(random() * v.length)]])); }
export function decide(settings, state, answers, chances) {
  const result = { ...state, actions: [], reason: 'Jev veto' };
  if (!answers) return result;
  const crowded = yes(answers, 'busy', .72), forced = yes(answers, 'forced', .7);
  const eligible = !crowded && !forced;
  const mode = (key, eligibleFlag) => settings[key] === 'ON' || (settings[key] === 'AUTO' && eligibleFlag);
  if (state.villain === 'active' && active(settings.villainMode) && settings.fightMode !== 'ON') {
    if (yes(answers, 'resolve', .75)) { result.villain = 'idle'; result.profile = null; }
    else result.actions.push('villainContinue');
  }
  if (mode('fightMode', yes(answers, 'fight')) && (settings.fightMode === 'ON' || yes(answers, 'fight'))) result.actions.push('fight');
  if (settings.autonomyMode === 'ON' || settings.autonomyMode === 'AUTO' && yes(answers, 'existing')) result.actions.push('autonomy');
  if (settings.emotionMode === 'ON' || settings.emotionMode === 'AUTO') result.actions.push('emotion');
  if (eligible && mode('npcMode', chances.npc || yes(answers, 'due'))) {
    if (yes(answers, 'npc') || yes(answers, 'due')) {
      if (yes(answers, 'existing')) result.actions.push('existingNpc');
      else if (yes(answers, 'newcomer')) result.actions.push('newNpc');
    }
  }
  if (eligible && mode('eventMode', chances.event || yes(answers, 'due')) && (yes(answers, 'event') || yes(answers, 'due'))) result.actions.push('event');
  if (eligible && mode('pressureMode', yes(answers, 'pressure')) && yes(answers, 'pressure')) result.actions.push('pressure');
  if (eligible && state.villain === 'idle' && settings.fightMode !== 'ON' && mode('villainMode', chances.villain) && yes(answers, 'npc') && (yes(answers, 'existing') || yes(answers, 'newcomer')) && yes(answers, 'pressure')) {
    result.villain = 'pending'; result.actions.push('villainStart');
  }
  if (yes(answers, 'indirect')) result.actions.push('indirect');
  if (yes(answers, 'escalate') && result.actions.includes('fight')) result.actions.push('escalate');
  result.reason = result.actions.length ? result.actions.join(', ') : 'Jev veto';
  return result;
}
