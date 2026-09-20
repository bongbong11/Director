import { defaults, initialState, roll, recentChat, isOoc, retrievalContext, buildState, activeGenres, decide, alwaysOn } from './director.js';
import { evaluateViaBridge, keyStatus, saveKey, deleteKey } from './bridge.js';
import { assemble } from './prompts.js';
import { supportedProfiles, translatePrompt } from './preview.js';
import { METADATA_KEY, readChatSettings, readChatState, writeChatSetting, writeChatState } from './storage.js';

const ID = METADATA_KEY;
const PROMPT_ID = 'npc_event_director_prompt';
let retrievalProvider = null; // A later provider only needs retrieve(messages) => relevant text records.
let busy = false;
let previewSerial = 0;
let keyConfigured = false;
let legacyKey = '';
const context = () => SillyTavern.getContext();
function store(c = context()) { return readChatSettings(c.chatMetadata); }
function chatKey(c) { return c.chatMetadata; }
function stateFor(c) { return readChatState(c.chatMetadata); }
function saveMetadata(c) { if (typeof c.saveMetadataDebounced === 'function') c.saveMetadataDebounced(); else void c.saveMetadata(); }
function saveState(c, state) { if (writeChatState(c.chatMetadata, state)) saveMetadata(c); }
function saveSetting(c, key, value) { if (writeChatSetting(c.chatMetadata, key, value)) saveMetadata(c); }
function cleanLegacy() {
  const c = context(), legacy = c.extensionSettings?.[ID];
  if (!legacy) return;
  legacyKey = typeof legacy.apiKey === 'string' ? legacy.apiKey : '';
  if (c.chatMetadata && !c.chatMetadata[ID]) {
    const settings = Object.fromEntries([...Object.keys(defaults), 'model'].filter(k => k in legacy && k !== 'apiKey').map(k => [k, legacy[k]]));
    c.chatMetadata[ID] = { settings, state: legacy.chats?.[`${c.groupId ?? c.characters?.[c.characterId]?.avatar ?? 'none'}::${c.chatId ?? c.chatMetadata?.chat_id ?? 'default'}`] || initialState() };
    saveMetadata(c);
  }
}
function removeLegacy() {
  const c = context();
  if (!c.extensionSettings?.[ID]) return;
  delete c.extensionSettings[ID];
  c.saveSettingsDebounced();
}
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
  document.querySelectorAll('#npc-event-director [data-fixed]').forEach(el => { el.checked = s[el.dataset.fixed] === 'ON'; });
  document.querySelectorAll('#npc-event-director [data-auto]').forEach(el => { el.checked = s[el.dataset.auto] === 'AUTO'; });
  const villain = document.querySelector('#ned-villain-state'); if (villain) villain.textContent = `빌런: ${st.villain} · ${st.last}`;
  const genres = document.querySelector('#ned-active-genres'); if (genres) genres.textContent = activeGenres(c.chatMetadata) || '(현재 채팅의 GENRE 변수 없음)';
  const keyState = document.querySelector('#ned-key-state'); if (keyState) keyState.textContent = keyConfigured ? 'Jev 키 저장됨 (이 브라우저)' : 'Jev 키 없음';
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
  const modeLabels = [
    ['npcMode','NPC 개입'], ['eventMode','사건 생성'], ['villainMode','빌런'],
    ['autonomyMode','NPC 자율행동'], ['emotionMode','감정 과잉 억제'], ['fightMode','싸움 유지'],
    ['worldMode','부정 세계'], ['pressureMode','부정 압력'], ['canonMode','원작 세계관 반영'],
  ];
  const fixedRows = modeLabels.map(([key, name]) => `<label class="ned-mode"><input type="checkbox" data-fixed="${key}"><span>${name}</span></label>`).join('');
  const autoRows = modeLabels.map(([key, name]) => `<label class="ned-mode"><input type="checkbox" data-auto="${key}"><span>${name}</span></label>`).join('');
  const panel = document.createElement('div'); panel.id = 'npc-event-director'; panel.hidden = true;
  panel.innerHTML = `<div class="ned-backdrop" data-close="panel"></div><div class="ned-dialog" role="dialog" aria-modal="true" aria-label="NPC · 사건 생성 설정">
    <header><strong>NPC · 사건 생성</strong><button type="button" data-close="panel" aria-label="닫기">×</button></header>
    <nav><button type="button" data-tab="general" class="selected">일반·수동</button><button type="button" data-tab="negative">확률·Jev</button><button type="button" data-tab="settings">설정</button></nav>
    <main>
    <section data-pane="general">
      <p>켜면 Jev 없이 매 IC 생성마다 해당 지시를 주입합니다. 끄면 해당 기능이 OFF가 됩니다.</p>
      <div class="ned-modes">${fixedRows}</div>
      <label class="ned-toggle"><input type="checkbox" data-setting="previewGeneral"> 실제 주입 플로팅 카드 보기</label>
    </section><section data-pane="negative" hidden>
      <p>켜면 AUTO가 됩니다. NPC·사건·빌런은 아래 기회 주사위가 성공할 때 Jev가 판정합니다. 다른 AUTO 항목은 그 판정에 맞춰 함께 적용됩니다.</p>
      <div class="ned-modes">${autoRows}</div>
      <div class="ned-grid"><label>NPC 기회 % <input type="number" min="0" max="100" data-setting="npcChance"></label>
      <label>사건 기회 % <input type="number" min="0" max="100" data-setting="eventChance"></label>
      <label>빌런 기회 % <input type="number" min="0" max="100" data-setting="villainChance"></label></div>
      <p>싸움 유지 ON 중에는 빌런 진행·추첨을 잠시 멈춥니다. 부정 세계의 1% 동정 예외는 새 비시트 NPC에만 적용됩니다.</p>
      <button type="button" id="ned-end-villain">빌런 이벤트 종료</button><div id="ned-villain-state"></div>
      <label class="ned-toggle"><input type="checkbox" data-setting="previewNegative"> 실제 주입 플로팅 카드 보기</label>
    </section><section data-pane="settings" hidden>
      <label>Jev API key <input id="ned-key-input" type="password" autocomplete="off" placeholder="새 키 입력"></label>
      <div class="ned-key-actions"><button type="button" id="ned-save-key">키 저장</button><button type="button" id="ned-delete-key">키 삭제</button><span id="ned-key-state"></span></div>
      <label>Jev model <input data-setting="model" type="text" placeholder="jev-latest"></label>
      <label>한국어 번역 연결 프로필 <select id="ned-profile" data-setting="translationProfile"></select></label>
      <button type="button" id="ned-refresh-profiles">프로필 새로고침</button>
      <label>최근 채팅 메시지 수 <input type="number" min="2" max="20" data-setting="recentCount"></label>
      <div class="ned-genres"><strong>현재 활성 장르 (GENRE 변수)</strong><pre id="ned-active-genres"></pre></div>
      <p class="ned-note">Jev 키는 이 브라우저의 로컬 저장소에 보관합니다. 이 브라우저를 쓰는 사람과 같은 출처의 스크립트가 키에 접근할 수 있습니다. 모델, 기능, 번역 프로필 선택은 이 채팅에만 저장됩니다. Jev 직접 연결이 차단되면 SillyTavern의 내장 CORS 프록시 설정이 필요할 수 있습니다.</p>
    </section></main><footer id="ned-status">대기</footer>
  </div>`;
  document.body.append(panel);
  const open = () => { refreshProfiles(); render(); panel.hidden = false; };
  button.addEventListener('click', open);
  button.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  panel.addEventListener('click', e => {
    if (e.target.closest('[data-close="panel"]')) panel.hidden = true;
    const tab = e.target.closest('[data-tab]');
    if (tab) { panel.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('selected', b === tab)); panel.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== tab.dataset.tab); }
    if (e.target.id === 'ned-refresh-profiles') refreshProfiles();
    if (e.target.id === 'ned-end-villain') { const c = context(); saveState(c, initialState()); render(); inject(''); }
    if (e.target.id === 'ned-save-key') {
      const input = panel.querySelector('#ned-key-input');
      const key = input.value.trim(); if (!key) { status('저장할 키를 입력하세요.'); return; }
      saveKey(key).then(() => { keyConfigured = true; input.value = ''; render(); status('Jev 키 저장됨'); }).catch(error => status(error.message));
    }
    if (e.target.id === 'ned-delete-key') deleteKey().then(() => { keyConfigured = false; render(); status('Jev 키 삭제됨'); }).catch(error => status(error.message));
  });
  panel.addEventListener('change', e => {
    const modeKey = e.target.dataset.fixed || e.target.dataset.auto;
    if (modeKey) { saveSetting(context(), modeKey, e.target.checked ? e.target.dataset.fixed ? 'ON' : 'AUTO' : 'OFF'); render(); return; }
    const key = e.target.dataset.setting; if (!key) return;
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Math.max(0, Math.min(key === 'recentCount' ? 20 : 100, Number(e.target.value))) : e.target.value;
    saveSetting(context(), key, value);
    render();
  });
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') panel.hidden = true; });
  refreshProfiles();
  render();
}

function showPreview(exactPrompt, settings, capturedChat, actions = [], sources = {}) {
  if (!exactPrompt || !(sources.fixed && settings.previewGeneral || sources.automatic && settings.previewNegative)) return;
  const serial = ++previewSerial;
  let popup = document.querySelector('#ned-preview');
  if (!popup) {
    popup = document.createElement('div'); popup.id = 'ned-preview';
    popup.innerHTML = `<div class="ned-dialog" role="status" aria-label="이번 주입 확인">
      <header><strong id="ned-preview-title">이번 주입</strong><button type="button" data-close="preview" aria-label="닫기">×</button></header>
      <main><p id="ned-preview-state">실제 영어 주입문</p><pre id="ned-preview-raw"></pre><button type="button" id="ned-translate">한글 번역</button><div id="ned-preview-ko" hidden></div></main>
    </div>`;
    popup.addEventListener('click', e => { if (e.target.closest('[data-close="preview"]')) popup.hidden = true; });
    popup.addEventListener('click', e => {
      if (e.target.id !== 'ned-translate') return;
      const currentSerial = popup.nedSerial;
      const output = popup.querySelector('#ned-preview-ko'); output.hidden = false; output.textContent = '한글 번역 중…';
      translatePrompt(popup.nedProfile, popup.nedPrompt).then(korean => {
        if (currentSerial === previewSerial && chatKey(context()) === popup.nedChat) output.textContent = korean;
      }).catch(error => { if (currentSerial === previewSerial) output.textContent = `번역할 수 없습니다: ${error.message}`; });
    });
    popup.addEventListener('keydown', e => { if (e.key === 'Escape') popup.hidden = true; });
    document.body.append(popup);
  }
  popup.nedSerial = serial; popup.nedPrompt = exactPrompt; popup.nedProfile = settings.translationProfile; popup.nedChat = capturedChat;
  popup.hidden = false;
  const titles = [];
  if (actions.some(x => ['existingNpc','newNpc','autonomy'].includes(x))) titles.push('NPC 생성·행동');
  if (actions.includes('event')) titles.push('사건 생성');
  if (actions.some(x => ['villainStart','villainContinue'].includes(x))) titles.push('빌런');
  if (actions.some(x => ['fight','pressure','escalate'].includes(x))) titles.push('갈등·압력');
  popup.querySelector('#ned-preview-title').textContent = titles.join(' · ') || '세계관·상시 보정';
  popup.querySelector('#ned-preview-raw').textContent = exactPrompt;
  popup.querySelector('#ned-preview-ko').hidden = true;
  popup.querySelector('#ned-preview-ko').textContent = '';
}

globalThis.npcEventDirectorIntercept = async function (_chat, _contextSize, _abort, type) {
  await inject('');
  if (busy || ['quiet','impersonate'].includes(type)) return;
  const c = context(), s = store(), st = stateFor(c), messages = recentChat(c.chat, s.recentCount);
  if (!messages.length || isOoc(messages)) return;
  const settings = { ...defaults, ...s };
  const chances = {
    npc: settings.npcMode === 'AUTO' && roll(s.npcChance),
    event: settings.eventMode === 'AUTO' && roll(s.eventChance),
    villain: settings.villainMode === 'AUTO' && roll(s.villainChance),
  };
  const fixed = alwaysOn(settings, st);
  const needJev = settings.fightMode === 'AUTO' ||
    (settings.npcMode === 'AUTO' && chances.npc) || (settings.eventMode === 'AUTO' && chances.event) ||
    (settings.villainMode === 'AUTO' && chances.villain) || (settings.villainMode === 'AUTO' && st.villain === 'active');
  const applyDecision = async decision => {
    const text = assemble(decision, settings, { compassion: Math.random() < .01 });
    await inject(text);
    if (decision.villain === 'idle') { st.villain = 'idle'; st.profile = null; st.pending = false; }
    if (decision.villain === 'pending') { st.pending = true; st.profile = decision.profile; }
    saveState(c, st);
    showPreview(text, settings, chatKey(c), decision.actions, { fixed: fixed.actions.length > 0 || settings.canonMode === 'ON' || settings.worldMode === 'ON', automatic: !!decision.automatic });
    status(text ? '이번 생성에 지시 주입: ' + decision.actions.join(', ') : '주입 없음');
  };
  if (!needJev) {
    await applyDecision(fixed); render(); return;
  }
  if (!keyConfigured || !s.model) { await applyDecision(fixed); render(); status('AUTO 판정에는 설정 탭의 Jev 키와 모델이 필요합니다. ON 지시는 적용했습니다.'); return; }
  busy = true;
  const capturedChat = chatKey(c);
  try {
    const memory = await retrievalContext(retrievalProvider, messages);
    const answers = await evaluateViaBridge({ model: s.model, state: buildState(messages, st, memory, activeGenres(c.chatMetadata)) });
    if (chatKey(context()) !== capturedChat) return;
    const automatic = decide(settings, st, answers, chances);
    const decision = { ...automatic, automatic: automatic.actions.length > 0, actions: [...new Set([...fixed.actions, ...automatic.actions])] };
    if (fixed.villain === 'pending') { decision.villain = 'pending'; decision.profile = fixed.profile; }
    await applyDecision(decision); render();
  } catch (error) { await applyDecision(fixed); render(); status('Jev 오류 · ON 지시만 적용: ' + error.message); console.error('[NPC Event Director]', error); }
  finally { busy = false; }
};

const c = context();
c.eventSource.on(c.event_types.MESSAGE_RECEIVED, () => { const current = context(), st = stateFor(current); if (st.pending) { st.pending = false; st.villain = 'active'; saveState(current, st); render(); } inject(''); });
c.eventSource.on(c.event_types.CHAT_CHANGED, () => { inject(''); previewSerial++; const p = document.querySelector('#ned-preview'); if (p) p.hidden = true; render(); });
cleanLegacy();
keyStatus().then(async state => {
  keyConfigured = !!state.configured;
  if (legacyKey && !keyConfigured) { await saveKey(legacyKey); keyConfigured = true; }
  removeLegacy();
  legacyKey = '';
  render();
}).catch(error => { legacyKey = ''; status('Jev 키 저장소 오류: ' + error.message); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
