import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.typesafe.ai/v1/systemone';
const FILE = '.npc-event-director.json';
const questions = {
  due: { type: 'noul', instructions: 'An established promise, plan, deadline, or consequence is due now.' },
  busy: { type: 'noul', instructions: 'The present scene already has enough active development; a new intervention would crowd it.' },
  forced: { type: 'noul', instructions: 'A new intervention would need coincidence, invented history, or implausible access.' },
  npc: { type: 'noul', instructions: 'An NPC has a plausible reason to affect the scene now.' },
  existing: { type: 'noul', instructions: 'An established NPC has both a current motive and a plausible route to act.' },
  newcomer: { type: 'noul', instructions: 'A new NPC is needed for a plausible role that established people cannot fill.' },
  event: { type: 'noul', instructions: 'A concrete non-NPC event or consequence can naturally affect the scene now.' },
  fight: { type: 'noul', instructions: 'An existing interpersonal conflict remains active and unresolved.' },
  pressure: { type: 'noul', instructions: 'Adverse social or world pressure naturally follows from current circumstances.' },
  escalate: { type: 'noul', instructions: 'The active conflict has a concrete cause to escalate now.' },
  resolve: { type: 'noul', instructions: 'The ongoing antagonist has a sufficient in-world cause to withdraw or resolve.' },
  indirect: { type: 'noul', instructions: 'Indirect action, contact, an intermediary, or a later visible consequence fits better than physical arrival.' },
};

export const info = {
  id: 'npc-event-director', name: 'NPC Event Director Jev bridge',
  description: 'Keeps the Jev API key on the SillyTavern server and proxies Director evaluations.',
};

function secretPath(request) {
  const root = request.user?.directories?.root;
  if (!root) throw new Error('SillyTavern 사용자 저장소를 확인할 수 없습니다.');
  return path.join(root, FILE);
}

function readKey(request) {
  try {
    const data = JSON.parse(fs.readFileSync(secretPath(request), 'utf8'));
    return typeof data.apiKey === 'string' ? data.apiKey : '';
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

function writeKey(request, apiKey) {
  const target = secretPath(request);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ apiKey }), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, target);
  try { fs.chmodSync(target, 0o600); } catch { /* Windows does not fully support POSIX modes. */ }
}

function removeKey(request) {
  try { fs.unlinkSync(secretPath(request)); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

function upstreamError(status, raw) {
  let detail = raw;
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message || parsed?.error || parsed?.message || raw;
  } catch { /* Keep the text response. */ }
  detail = typeof detail === 'string' ? detail.replace(/\s+/g, ' ').trim().slice(0, 500) : '';
  const hint = status === 401 ? 'API 키가 유효하지 않습니다.'
    : status === 403 ? '이 키 또는 계정에 Jev API 이용 권한이 없습니다.'
      : status === 429 ? 'Jev 요청 한도를 초과했습니다.' : `Jev HTTP ${status}`;
  return detail ? `${hint} · ${detail}` : hint;
}

export async function init(router) {
  router.post('/key/status', (request, response) => {
    try { response.send({ configured: !!readKey(request) }); }
    catch (error) { response.status(500).send({ error: error.message }); }
  });
  router.post('/key/save', (request, response) => {
    try {
      const key = request.body?.key;
      if (typeof key !== 'string' || !key.trim() || key.length > 4096) return response.status(400).send({ error: '유효한 Jev 키를 입력하세요.' });
      writeKey(request, key.trim());
      response.send({ configured: true });
    } catch (error) { response.status(500).send({ error: error.message }); }
  });
  router.post('/key/delete', (request, response) => {
    try { removeKey(request); response.send({ configured: false }); }
    catch (error) { response.status(500).send({ error: error.message }); }
  });
  router.post('/evaluate', async (request, response) => {
    try {
      const key = readKey(request);
      if (!key) return response.status(400).send({ error: 'Jev 키가 서버에 저장되지 않았습니다.' });
      const { model, state } = request.body || {};
      if (typeof model !== 'string' || !model.trim() || model.length > 128) return response.status(400).send({ error: 'Jev 모델 이름이 올바르지 않습니다.' });
      if (typeof state !== 'string' || !state.trim() || state.length > 100000) return response.status(400).send({ error: 'Jev 판정 문맥이 올바르지 않습니다.' });
      let upstream;
      try {
        upstream = await fetch(API, {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model.trim(), state, questions }), signal: AbortSignal.timeout(12000),
        });
      } catch (error) {
        if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return response.status(504).send({ error: 'Jev 요청 시간이 초과되었습니다.' });
        return response.status(502).send({ error: `Jev 서버에 연결할 수 없습니다: ${error.message}` });
      }
      const raw = await upstream.text();
      if (!upstream.ok) return response.status(upstream.status).send({ error: upstreamError(upstream.status, raw) });
      try { return response.send(JSON.parse(raw)); }
      catch { return response.status(502).send({ error: 'Jev가 올바른 JSON을 반환하지 않았습니다.' }); }
    } catch (error) {
      console.error('[NPC Event Director]', error);
      return response.status(500).send({ error: error.message });
    }
  });
}
