import { questions, score } from './jev.js';

const KEY = 'npc_event_director_jev_key_v1';
const API = 'https://api.typesafe.ai/v1/systemone';

export const keyStatus = async () => ({ configured: !!localStorage.getItem(KEY) });
export async function saveKey(key) {
  if (typeof key !== 'string' || !key.trim()) throw new Error('Jev 키를 입력하세요.');
  localStorage.setItem(KEY, key.trim());
  return { configured: true };
}
export async function deleteKey() {
  localStorage.removeItem(KEY);
  return { configured: false };
}

export async function evaluateViaBridge({ model, state }) {
  const key = localStorage.getItem(KEY);
  if (!key) throw new Error('Jev 키가 저장되지 않았습니다.');
  const request = {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, state, questions }),
    signal: AbortSignal.timeout(12000),
  };
  let response;
  try {
    response = await fetch(API, request);
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new Error('Jev 요청 시간이 초과되었습니다.');
    // SillyTavern's built-in proxy is available only when enableCorsProxy is enabled.
    response = await fetch(`/proxy/${encodeURIComponent(API)}`, request).catch(() => null);
    if (!response || response.status === 404) throw new Error('브라우저 직접 연결이 차단되었습니다. SillyTavern config.yaml에서 enableCorsProxy를 켜야 Jev AUTO가 동작합니다.');
  }
  if (!response.ok) throw new Error(`Jev HTTP ${response.status}`);
  const result = await response.json();
  if (!result?.answers || score(result.answers, 'busy') === null) throw new Error('Jev 응답 형식이 올바르지 않습니다.');
  return result.answers;
}
