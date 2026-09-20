import { questions, score } from './jev.js';

const KEY = 'npc_event_director_jev_key_v1';
const API = 'https://api.typesafe.ai/v1/systemone';
const PROXY = `/proxy/${encodeURIComponent(API)}`;

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
  let response;
  try {
    response = await fetch(PROXY, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, state, questions }),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw new Error('Jev 요청 시간이 초과되었습니다.');
    throw new Error(`Jev 프록시에 연결할 수 없습니다: ${error.message}`);
  }
  const raw = await response.text();
  if (!response.ok) {
    if (response.status === 404) throw new Error('SillyTavern config.yaml에서 enableCorsProxy: true를 설정하고 서버를 완전히 재시작하세요.');
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.error || parsed?.message || raw;
    } catch { /* Keep text response. */ }
    detail = typeof detail === 'string' ? detail.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
    const hint = response.status === 401 ? 'API 키가 유효하지 않습니다.'
      : response.status === 403 ? '이 키 또는 계정에 Jev API 이용 권한이 없습니다.'
        : response.status === 429 ? 'Jev 요청 한도를 초과했습니다.' : `Jev HTTP ${response.status}`;
    throw new Error(detail ? `${hint} · ${detail}` : hint);
  }
  let result;
  try { result = JSON.parse(raw); } catch { throw new Error('Jev가 올바른 JSON을 반환하지 않았습니다.'); }
  if (!result?.answers || score(result.answers, 'busy') === null) throw new Error('Jev 응답 형식이 올바르지 않습니다.');
  return result.answers;
}
