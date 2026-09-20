import { score } from './jev.js';

const LEGACY_KEY = 'npc_event_director_jev_key_v1';
const BASE = '/api/plugins/npc-event-director';

function headers() {
  const value = SillyTavern.getContext().getRequestHeaders?.();
  return value || { 'Content-Type': 'application/json' };
}

async function call(path, body = {}) {
  let response;
  try {
    response = await fetch(`${BASE}/${path}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new Error('Jev 요청 시간이 초과되었습니다.');
    throw new Error('Jev 서버 플러그인에 연결할 수 없습니다. SillyTavern 서버가 실행 중인지 확인하세요.');
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    if (response.status === 404) throw new Error('Jev 서버 플러그인이 없습니다. README의 서버 플러그인 설치 단계를 확인하세요.');
    throw new Error(data.error || text.slice(0, 500) || `서버 오류 HTTP ${response.status}`);
  }
  return data;
}

export async function keyStatus() {
  const state = await call('key/status');
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!state.configured && legacy) {
    await saveKey(legacy);
    return { configured: true, migrated: true };
  }
  if (state.configured && legacy) localStorage.removeItem(LEGACY_KEY);
  return state;
}

export async function saveKey(key) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('Jev 키를 입력하세요.');
  const result = await call('key/save', { key: key.trim() });
  localStorage.removeItem(LEGACY_KEY);
  return result;
}

export async function deleteKey() {
  localStorage.removeItem(LEGACY_KEY);
  return call('key/delete');
}

export async function evaluateViaBridge({ model, state }) {
  const result = await call('evaluate', { model, state });
  if (!result?.answers || score(result.answers, 'busy') === null) throw new Error('Jev 응답 형식이 올바르지 않습니다.');
  return result.answers;
}
