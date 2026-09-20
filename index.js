import { defaults, initialState, active, roll, recentChat, isOoc, retrievalContext, buildState, villainProfile, decide } from './director.js';
import { evaluateJev } from './jev.js';
import { assemble } from './prompts.js';

const ID = 'npc_event_director_v1';
const PROMPT_ID = 'npc_event_director_prompt';
const modeKeys = ['npcMode','eventMode','fightMode','autonomyMode','emotionMode','villainMode','worldMode','pressureMode'];
let retrievalProvider = null; // A later provider only needs retrieve(messages) => relevant text records.
let lastChatKey = '';
let busy = false;
const context = () => SillyTavern.getContext();
function store() { const c = context(); return c.extensionSettings[ID] ||= { ...defaults, apiKey: '', model: 'jev-latest', chats: {} }; }
function chatKey(c) { return `${c.groupId ?? c.characters?.[c.characterId]?.avatar ?? 'none'}::${c.chatId ?? c.chatMetadata?.chat_id ?? 'default'}`; }
function stateFor(c) { const s = store(); return s.chats[chatKey(c)] ||= initialState(); }
function save() { context().saveSettingsDebounced(); }
function inject(text) { context().setExtensionPrompt(PROMPT_ID, text, 1, 0, false, 0); }
function status(text) { document.querySelector('#ned-status').textContent = text; }
function render() {
  const s = store(), c = context(), st = stateFor(c);
  document.querySelectorAll('[data-setting]').forEach(el => { el.value = s[el.dataset.setting] ?? ''; });
  document.querySelector('#ned-villain-state').textContent = `빌런: ${st.villain} · ${st.last}`;
}
function mount() {
  const panel = document.createElement('div'); panel.id = 'npc-event-director';
  panel.innerHTML = `<details><summary>NPC · 사건 생성 확장</summary><div class="ned-body">
    <nav><button type="button" data-tab="general" class="selected">일반</button><button type="button" data-tab="negative">부정</button></nav>
    <section data-pane="general">
      <label>Jev API key <input data-setting="apiKey" type="password" autocomplete="off" placeholder="TypeSafe API key"></label>
      <label>Jev model <input data-setting="model" type="text" placeholder="jev-latest"></label>
      <p class="ned-note">Jev 판정만 별도로 호출합니다. 실제 서술은 현재 SillyTavern 모델이 생성합니다.</p>
      <div class="ned-grid">
        <label>NPC 개입 <select data-setting="npcMode"></select></label><label>사건 <select data-setting="eventMode"></select></label>
        <label>NPC 자율행동 <select data-setting="autonomyMode"></select></label><label>감정 과잉 억제 <select data-setting="emotionMode"></select></label>
        <label>NPC 기회 % <input type="number" min="0" max="100" data-setting="npcChance"></label>
        <label>사건 기회 % <input type="number" min="0" max="100" data-setting="eventChance"></label>
        <label>최근 메시지 수 <input type="number" min="2" max="20" data-setting="recentCount"></label>
      </div>
    </section><section data-pane="negative" hidden>
      <div class="ned-grid"><label>싸움 유지 <select data-setting="fightMode"></select></label><label>빌런 <select data-setting="villainMode"></select></label>
      <label>부정 세계 <select data-setting="worldMode"></select></label><label>원작 세계관 반영 <select data-setting="canonMode"></select></label>
      <label>부정 압력 <select data-setting="pressureMode"></select></label>
      <label>빌런 기회 % <input type="number" min="0" max="100" data-setting="villainChance"></label></div>
      <p>싸움 유지 ON이면 빌런 추첨과 진행 주입을 잠시 멈춥니다. 원작 세계관 반영은 부정 세계와 독립적으로 적용됩니다. 1% 동정 예외는 새 비시트 NPC에만 적용됩니다.</p>
      <button type="button" id="ned-end-villain">빌런 이벤트 종료</button><div id="ned-villain-state"></div>
    </section><small id="ned-status">대기</small>
  </div></details>`;
  for (const select of panel.querySelectorAll('select')) select.innerHTML = ['AUTO','OFF','ON'].map(x => `<option>${x}</option>`).join('');
  (document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings') || document.body).append(panel);
  panel.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { panel.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b === tab)); panel.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== tab.dataset.tab); }
    if (e.target.id === 'ned-end-villain') { const st = stateFor(context()); Object.assign(st, initialState()); save(); render(); inject(''); }
  });
  panel.addEventListener('change', e => { const key = e.target.dataset.setting; if (!key) return; const s = store(); s[key] = e.target.type === 'number' ? Math.max(0, Math.min(key === 'recentCount' ? 20 : 100, Number(e.target.value))) : e.target.value; save(); render(); });
  render();
}

globalThis.npcEventDirectorIntercept = async function (_chat, _contextSize, _abort, type) {
  inject('');
  if (busy || ['quiet','impersonate'].includes(type)) return;
  const c = context(), s = store(), st = stateFor(c), messages = recentChat(c.chat, s.recentCount);
  if (!messages.length || isOoc(messages)) return;
  const settings = { ...defaults, ...s };
  const chances = { npc: roll(s.npcChance), event: roll(s.eventChance), villain: roll(s.villainChance) };
  const needJev = modeKeys.some(k => settings[k] === 'ON') || chances.npc || chances.event || chances.villain || st.villain === 'active';
  if (!needJev) { inject(assemble({ actions: [] }, settings, { compassion: Math.random() < .01 })); st.last = '주사위 미당첨'; render(); return; }
  if (!s.apiKey || !s.model) { st.last = 'Jev key/model 필요'; render(); return; }
  busy = true;
  const capturedChat = chatKey(c);
  try {
    const memory = await retrievalContext(retrievalProvider, messages);
    const answers = await evaluateJev({ apiKey: s.apiKey, model: s.model, state: buildState(messages, st, memory) });
    if (chatKey(context()) !== capturedChat) return;
    const decision = decide(settings, st, answers, chances);
    if (decision.villain === 'pending') decision.profile = villainProfile();
    const text = assemble(decision, settings, { compassion: Math.random() < .01 });
    inject(text);
    st.last = decision.reason;
    st.pending = decision.villain === 'pending';
    if (decision.villain === 'idle') { st.villain = 'idle'; st.profile = null; }
    if (st.pending) st.profile = decision.profile;
    save(); render(); status(text ? '이번 생성에 지시 주입: ' + st.last : 'Jev veto · 주입 없음');
  } catch (error) { st.last = 'Jev 오류'; render(); status(error.message); console.error('[NPC Event Director]', error); }
  finally { busy = false; }
};

const c = context();
c.eventSource.on(c.event_types.MESSAGE_RECEIVED, () => { const st = stateFor(context()); if (st.pending) { st.pending = false; st.villain = 'active'; save(); render(); } inject(''); });
c.eventSource.on(c.event_types.CHAT_CHANGED, () => { inject(''); lastChatKey = chatKey(context()); render(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
