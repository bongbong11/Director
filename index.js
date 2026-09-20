import { defaults, initialState, active, roll, recentChat, isOoc, retrievalContext, buildState, activeGenres, villainProfile, decide } from './director.js';
import { evaluateJev } from './jev.js';
import { assemble } from './prompts.js';
import { supportedProfiles, translatePrompt } from './preview.js';

const ID = 'npc_event_director_v1';
const PROMPT_ID = 'npc_event_director_prompt';
const modeKeys = ['npcMode','eventMode','fightMode','autonomyMode','villainMode','pressureMode'];
let retrievalProvider = null; // A later provider only needs retrieve(messages) => relevant text records.
let busy = false;
let previewSerial = 0;
const context = () => SillyTavern.getContext();
function store() { const c = context(); return c.extensionSettings[ID] ||= { ...defaults, apiKey: '', model: 'jev-latest', chats: {} }; }
function chatKey(c) { return `${c.groupId ?? c.characters?.[c.characterId]?.avatar ?? 'none'}::${c.chatId ?? c.chatMetadata?.chat_id ?? 'default'}`; }
function stateFor(c) { const s = store(); return s.chats[chatKey(c)] ||= initialState(); }
function save() { context().saveSettingsDebounced(); }
function inject(text) { context().setExtensionPrompt(PROMPT_ID, text, 1, 0, false, 0); }
function status(text) { const el = document.querySelector('#ned-status'); if (el) el.textContent = text; }
function refreshProfiles() {
  const el = document.querySelector('#ned-profile'); if (!el) return;
  const selected = store().translationProfile || '';
  el.replaceChildren(new Option('선택 안 함', ''));
  for (const profile of supportedProfiles()) el.add(new Option(profile.name, profile.id));
  el.value = selected;
}
function render() {
  const s = store(), c = context(), st = stateFor(c);
  document.querySelectorAll('#npc-event-director [data-setting]').forEach(el => { if (el.type === 'checkbox') el.checked = !!s[el.dataset.setting]; else el.value = s[el.dataset.setting] ?? ''; });
  const villain = document.querySelector('#ned-villain-state'); if (villain) villain.textContent = `빌런: ${st.villain} · ${st.last}`;
  const genres = document.querySelector('#ned-active-genres'); if (genres) genres.textContent = activeGenres(c.chatMetadata) || '(현재 채팅의 GENRE 변수 없음)';
}
function mount() {
  const wand = document.querySelector('#extensionsMenu');
  if (!wand) { setTimeout(mount, 500); return; }
  if (document.querySelector('#ned-wand-button')) return;
  const container = document.createElement('div'); container.className = 'extension_container';
  const button = document.createElement('div'); button.id = 'ned-wand-button'; button.className = 'list-group-item flex-container flexGap5';
  button.setAttribute('role', 'button'); button.tabIndex = 0;
  const icon = document.createElement('div'); icon.className = 'fa-solid fa-dice-d20 extensionsMenuExtensionButton'; icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = 'NPC · 사건 생성';
  button.append(icon, label); container.append(button); wand.append(container);
  const panel = document.createElement('div'); panel.id = 'npc-event-director'; panel.hidden = true;
  panel.innerHTML = `<div class="ned-backdrop" data-close="panel"></div><div class="ned-dialog" role="dialog" aria-modal="true" aria-label="NPC · 사건 생성 설정">
    <header><strong>NPC · 사건 생성</strong><button type="button" data-close="panel" aria-label="닫기">×</button></header>
    <nav><button type="button" data-tab="general" class="selected">일반</button><button type="button" data-tab="negative">부정</button><button type="button" data-tab="settings">설정</button></nav>
    <main>
    <section data-pane="general">
      <div class="ned-grid">
        <label>NPC 개입 <select data-setting="npcMode"></select></label><label>사건 <select data-setting="eventMode"></select></label>
        <label>NPC 자율행동 <select data-setting="autonomyMode"></select></label><label>감정 과잉 억제 <select data-setting="emotionMode"></select></label>
        <label>NPC 기회 % <input type="number" min="0" max="100" data-setting="npcChance"></label>
        <label>사건 기회 % <input type="number" min="0" max="100" data-setting="eventChance"></label>
      </div>
      <label class="ned-toggle"><input type="checkbox" data-setting="previewGeneral"> 생성 후 실제 주입 내용 확인</label>
    </section><section data-pane="negative" hidden>
      <div class="ned-grid"><label>싸움 유지 <select data-setting="fightMode"></select></label><label>빌런 <select data-setting="villainMode"></select></label>
      <label>부정 세계 <select data-setting="worldMode"></select></label><label>원작 세계관 반영 <select data-setting="canonMode"></select></label>
      <label>부정 압력 <select data-setting="pressureMode"></select></label>
      <label>빌런 기회 % <input type="number" min="0" max="100" data-setting="villainChance"></label></div>
      <p>싸움 유지 ON이면 빌런 추첨과 진행 주입을 잠시 멈춥니다. 원작 세계관 반영은 부정 세계와 독립적으로 적용됩니다. 1% 동정 예외는 새 비시트 NPC에만 적용됩니다.</p>
      <button type="button" id="ned-end-villain">빌런 이벤트 종료</button><div id="ned-villain-state"></div>
      <label class="ned-toggle"><input type="checkbox" data-setting="previewNegative"> 생성 후 실제 주입 내용 확인</label>
    </section><section data-pane="settings" hidden>
      <label>Jev API key <input data-setting="apiKey" type="password" autocomplete="off" placeholder="TypeSafe API key"></label>
      <label>Jev model <input data-setting="model" type="text" placeholder="jev-latest"></label>
      <label>한국어 번역 연결 프로필 <select id="ned-profile" data-setting="translationProfile"></select></label>
      <button type="button" id="ned-refresh-profiles">프로필 새로고침</button>
      <label>최근 채팅 메시지 수 <input type="number" min="2" max="20" data-setting="recentCount"></label>
      <div class="ned-genres"><strong>현재 활성 장르 (GENRE 변수)</strong><pre id="ned-active-genres"></pre></div>
      <p class="ned-note">Jev는 판정만 합니다. 번역 프로필은 확인 창의 한국어 번역에만 사용하며, RP 생성 연결을 바꾸지 않습니다.</p>
    </section></main><footer id="ned-status">대기</footer>
  </div>`;
  for (const select of panel.querySelectorAll('select:not(#ned-profile)')) select.innerHTML = ['AUTO','OFF','ON'].map(x => `<option>${x}</option>`).join('');
  document.body.append(panel);
  const open = () => { refreshProfiles(); render(); panel.hidden = false; };
  button.addEventListener('click', open);
  button.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-close="panel"]')) panel.hidden = true;
    const tab = e.target.closest('[data-tab]');
    if (tab) { panel.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b === tab)); panel.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== tab.dataset.tab); }
    if (e.target.id === 'ned-refresh-profiles') refreshProfiles();
    if (e.target.id === 'ned-end-villain') { const st = stateFor(context()); Object.assign(st, initialState()); save(); render(); inject(''); }
  });
  panel.addEventListener('change', e => { const key = e.target.dataset.setting; if (!key) return; const s = store(); s[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Math.max(0, Math.min(key === 'recentCount' ? 20 : 100, Number(e.target.value))) : e.target.value; save(); render(); });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') panel.hidden = true; });
  refreshProfiles();
  render();
}

function showPreview(exactPrompt, settings, capturedChat) {
  if (!settings.previewGeneral && !settings.previewNegative) return;
  const serial = ++previewSerial;
  let popup = document.querySelector('#ned-preview');
  if (!popup) {
    popup = document.createElement('div'); popup.id = 'ned-preview';
    popup.innerHTML = `<div class="ned-backdrop" data-close="preview"></div><div class="ned-dialog" role="dialog" aria-modal="true" aria-label="이번 주입 확인">
      <header><strong>이번 생성의 실제 주입</strong><button type="button" data-close="preview" aria-label="닫기">×</button></header>
      <main><p id="ned-preview-state"></p><div id="ned-preview-ko"></div><details><summary>실제 영어 원문 보기</summary><pre id="ned-preview-raw"></pre></details></main>
    </div>`;
    popup.addEventListener('click', e => { if (e.target.closest('[data-close="preview"]')) popup.hidden = true; });
    popup.addEventListener('keydown', e => { if (e.key === 'Escape') popup.hidden = true; });
    document.body.append(popup);
  }
  popup.hidden = false;
  popup.querySelector('#ned-preview-raw').textContent = exactPrompt || '주입 없음';
  popup.querySelector('#ned-preview-state').textContent = exactPrompt ? 'SillyTavern에 등록된 depth 0 system 지시' : '이번에는 주입된 지시가 없습니다.';
  popup.querySelector('#ned-preview-ko').textContent = exactPrompt ? '한국어 번역 중…' : '주사위가 기회를 열지 않았거나 Jev가 개입을 보류했습니다.';
  if (!exactPrompt) return;
  translatePrompt(settings.translationProfile, exactPrompt).then(korean => {
    if (serial === previewSerial && chatKey(context()) === capturedChat) popup.querySelector('#ned-preview-ko').textContent = korean;
  }).catch(error => {
    if (serial === previewSerial) popup.querySelector('#ned-preview-ko').textContent = `번역할 수 없습니다: ${error.message} 아래에서 실제 주입 원문을 확인하세요.`;
  });
}

globalThis.npcEventDirectorIntercept = async function (_chat, _contextSize, _abort, type) {
  await inject('');
  if (busy || ['quiet','impersonate'].includes(type)) return;
  const c = context(), s = store(), st = stateFor(c), messages = recentChat(c.chat, s.recentCount);
  if (!messages.length || isOoc(messages)) return;
  const settings = { ...defaults, ...s };
  const chances = { npc: roll(s.npcChance), event: roll(s.eventChance), villain: roll(s.villainChance) };
  const needJev = modeKeys.some(k => settings[k] === 'ON') ||
    (settings.npcMode === 'AUTO' && chances.npc) || (settings.eventMode === 'AUTO' && chances.event) ||
    (settings.villainMode === 'AUTO' && chances.villain) || st.villain === 'active';
  if (!needJev) {
    const text = assemble({ actions: [] }, settings, { compassion: Math.random() < .01 });
    await inject(text); showPreview(text, settings, chatKey(c));
    st.last = '주사위 미당첨'; render(); return;
  }
  if (!s.apiKey || !s.model) { st.last = 'Jev key/model 필요'; render(); return; }
  busy = true;
  const capturedChat = chatKey(c);
  try {
    const memory = await retrievalContext(retrievalProvider, messages);
    const answers = await evaluateJev({ apiKey: s.apiKey, model: s.model, state: buildState(messages, st, memory, activeGenres(c.chatMetadata)) });
    if (chatKey(context()) !== capturedChat) return;
    const decision = decide(settings, st, answers, chances);
    if (decision.villain === 'pending') decision.profile = villainProfile();
    const text = assemble(decision, settings, { compassion: Math.random() < .01 });
    await inject(text);
    st.last = decision.reason;
    st.pending = decision.villain === 'pending';
    if (decision.villain === 'idle') { st.villain = 'idle'; st.profile = null; }
    if (st.pending) st.profile = decision.profile;
    save(); render(); status(text ? '이번 생성에 지시 주입: ' + st.last : 'Jev veto · 주입 없음');
    showPreview(text, settings, capturedChat);
  } catch (error) { st.last = 'Jev 오류'; render(); status(error.message); console.error('[NPC Event Director]', error); }
  finally { busy = false; }
};

const c = context();
c.eventSource.on(c.event_types.MESSAGE_RECEIVED, () => { const st = stateFor(context()); if (st.pending) { st.pending = false; st.villain = 'active'; save(); render(); } inject(''); });
c.eventSource.on(c.event_types.CHAT_CHANGED, () => { inject(''); previewSerial++; const p = document.querySelector('#ned-preview'); if (p) p.hidden = true; render(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
