import { defaults, initialState } from './director.js';

export const METADATA_KEY = 'npc_event_director_v1';
const baselineState = { villain: 'idle', profile: null, pending: false };

export function readChatSettings(metadata) { return { ...defaults, model: 'jev-latest', ...metadata?.[METADATA_KEY]?.settings }; }
export function readChatState(metadata) { return { ...initialState(), ...metadata?.[METADATA_KEY]?.state }; }
function prune(metadata) {
  const data = metadata[METADATA_KEY];
  if (data && !data.state && !Object.keys(data.settings || {}).length) delete metadata[METADATA_KEY];
}
export function writeChatSetting(metadata, key, value) {
  if (!metadata) return false;
  const baseline = key === 'model' ? 'jev-latest' : defaults[key];
  const old = metadata[METADATA_KEY]?.settings?.[key];
  if (old === value || old === undefined && value === baseline) return false;
  if (value === baseline) { delete metadata[METADATA_KEY].settings[key]; prune(metadata); }
  else { metadata[METADATA_KEY] ||= {}; metadata[METADATA_KEY].settings ||= {}; metadata[METADATA_KEY].settings[key] = value; }
  return true;
}
export function writeChatState(metadata, state) {
  if (!metadata) return false;
  const next = { villain: state.villain, profile: state.profile, pending: state.pending };
  const old = metadata[METADATA_KEY]?.state;
  if (JSON.stringify(next) === JSON.stringify(old)) return false;
  if (JSON.stringify(next) === JSON.stringify(baselineState)) {
    if (!old) return false;
    delete metadata[METADATA_KEY].state; prune(metadata);
  } else { metadata[METADATA_KEY] ||= {}; metadata[METADATA_KEY].state = next; }
  return true;
}
