'use strict';

const STORAGE_KEY = 'horseBetBattle.v1';
const CONNECTION_KEY = 'horseBetBattle.supabaseConnection.v1';
const CLOUD_ROW_ID = 'main';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modalBody');
const toastEl = document.querySelector('#toast');
const newCompetitionBtn = document.querySelector('#newCompetitionBtn');

const yen = value => `${Number(value || 0).toLocaleString('ja-JP')}円`;
const pct = value => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const digits = Math.abs(n) >= 100 ? 0 : 1;
  return `${n.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
};
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const SILK_PRESETS = [
  { id:'forest', name:'Deep Green', color:'#2f9f73' },
  { id:'navy', name:'Navy', color:'#416fae' },
  { id:'burgundy', name:'Burgundy', color:'#a84f61' },
  { id:'violet', name:'Violet', color:'#7653a2' },
  { id:'teal', name:'Teal', color:'#32979a' },
  { id:'orange', name:'Amber', color:'#bd7540' },
  { id:'rose', name:'Rose', color:'#b96888' },
  { id:'slate', name:'Slate', color:'#74817a' },
  { id:'white', name:'Ivory', color:'#e6e2d7' },
  { id:'black', name:'Black', color:'#202522' },
  { id:'red', name:'Racing Red', color:'#b33e3e' },
  { id:'blue', name:'Royal Blue', color:'#315eaf' }
];

const SILK_PATTERNS = [
  { id:'solid', name:'無地' },
  { id:'band', name:'一本輪' },
  { id:'double-band', name:'二本輪' },
  { id:'vertical', name:'縦縞' },
  { id:'sash', name:'たすき' },
  { id:'check', name:'市松' },
  { id:'chevron', name:'山形' }
];

const SILK_SLEEVE_PATTERNS = [
  { id:'solid', name:'無地' },
  { id:'band', name:'一本輪' },
  { id:'double-band', name:'二本輪' },
  { id:'stripe', name:'縦切替' }
];

const SILK_DEFAULT_PATTERN_COLORS = ['#ece9df','#d7b85b','#202522','#b33e3e','#315eaf'];

function normalizeHex(value, fallback) {
  const v = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

function participantStyle(competition, participant) {
  const index = Math.max(0, competition.participants.findIndex(p => p.id === participant.id));
  const preset = SILK_PRESETS.find(item => item.id === participant.silksColor) || SILK_PRESETS[index % SILK_PRESETS.length];
  const legacyPattern = participant.silksPattern || SILK_PATTERNS[index % 4].id;
  const defaultPattern = SILK_PATTERNS.some(x => x.id === legacyPattern) ? legacyPattern : 'solid';
  const body = normalizeHex(participant.silksBodyColor, preset.color);
  const sleeve = normalizeHex(participant.silksSleeveColor, body);
  const patternColor = normalizeHex(participant.silksPatternColor, SILK_DEFAULT_PATTERN_COLORS[index % SILK_DEFAULT_PATTERN_COLORS.length]);
  return {
    colorId: preset.id,
    bodyColor: body,
    sleeveColor: sleeve,
    patternColor,
    bodyPattern: participant.silksBodyPattern || defaultPattern,
    sleevePattern: participant.silksSleevePattern || 'solid'
  };
}

let silkSvgCounter = 0;

function silkBodyPatternSvg(style, clipId) {
  const c = esc(style.patternColor);
  if (style.bodyPattern === 'band') return `<g clip-path="url(#${clipId})"><rect x="15" y="29" width="34" height="8" fill="${c}"/></g>`;
  if (style.bodyPattern === 'double-band') return `<g clip-path="url(#${clipId})"><rect x="15" y="25" width="34" height="5" fill="${c}"/><rect x="15" y="36" width="34" height="5" fill="${c}"/></g>`;
  if (style.bodyPattern === 'vertical') return `<g clip-path="url(#${clipId})"><rect x="23" y="8" width="6" height="52" fill="${c}"/><rect x="35" y="8" width="6" height="52" fill="${c}"/></g>`;
  if (style.bodyPattern === 'sash') return `<g clip-path="url(#${clipId})"><path d="M12 16 L20 10 L52 51 L44 59 Z" fill="${c}"/></g>`;
  if (style.bodyPattern === 'check') {
    let squares = '';
    const size = 8;
    for (let y = 12; y < 60; y += size) {
      for (let x = 18; x < 48; x += size) {
        if (((x + y) / size) % 2 === 0) squares += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${c}"/>`;
      }
    }
    return `<g clip-path="url(#${clipId})" opacity=".94">${squares}</g>`;
  }
  if (style.bodyPattern === 'chevron') return `<g clip-path="url(#${clipId})"><path d="M17 26 L32 39 L47 26 L47 35 L32 48 L17 35 Z" fill="${c}"/></g>`;
  return '';
}

function silkSleevePatternSvg(style, leftClip, rightClip) {
  const c = esc(style.patternColor);
  if (style.sleevePattern === 'band') {
    return `<g fill="${c}"><g clip-path="url(#${leftClip})"><path d="M6 24 L17 18 L20 24 L9 30 Z"/></g><g clip-path="url(#${rightClip})"><path d="M58 24 L47 18 L44 24 L55 30 Z"/></g></g>`;
  }
  if (style.sleevePattern === 'double-band') {
    return `<g fill="${c}"><g clip-path="url(#${leftClip})"><path d="M5 21 L16 15 L19 19 L8 25 Z"/><path d="M9 29 L20 23 L22 27 L12 33 Z"/></g><g clip-path="url(#${rightClip})"><path d="M59 21 L48 15 L45 19 L56 25 Z"/><path d="M55 29 L44 23 L42 27 L52 33 Z"/></g></g>`;
  }
  if (style.sleevePattern === 'stripe') {
    return `<g fill="${c}"><g clip-path="url(#${leftClip})"><path d="M11 13 L16 11 L21 33 L16 36 Z"/></g><g clip-path="url(#${rightClip})"><path d="M53 13 L48 11 L43 33 L48 36 Z"/></g></g>`;
  }
  return '';
}

function silkMark(competition, participant, className='silk-mark') {
  const style = participantStyle(competition, participant);
  const key = `silk_${++silkSvgCounter}`;
  const bodyClip = `${key}_body`, leftClip = `${key}_left`, rightClip = `${key}_right`;
  const bodyPath = 'M21 13 L27 8 H37 L43 13 L46 58 H18 Z';
  const leftSleeve = 'M21 13 L14 14 L4 25 L12 34 L20 28 Z';
  const rightSleeve = 'M43 13 L50 14 L60 25 L52 34 L44 28 Z';
  return `<svg class="${className} jockey-silk" viewBox="0 0 64 64" role="img" aria-label="${esc(participant.name)}の勝負服">
    <defs>
      <clipPath id="${bodyClip}"><path d="${bodyPath}"/></clipPath>
      <clipPath id="${leftClip}"><path d="${leftSleeve}"/></clipPath>
      <clipPath id="${rightClip}"><path d="${rightSleeve}"/></clipPath>
    </defs>
    <path class="silk-sleeve" d="${leftSleeve}" fill="${esc(style.sleeveColor)}"/>
    <path class="silk-sleeve" d="${rightSleeve}" fill="${esc(style.sleeveColor)}"/>
    ${silkSleevePatternSvg(style, leftClip, rightClip)}
    <path class="silk-body" d="${bodyPath}" fill="${esc(style.bodyColor)}"/>
    ${silkBodyPatternSvg(style, bodyClip)}
    <path d="M27 8 Q32 15 37 8" fill="#090c0a" opacity=".92"/>
    <path class="silk-outline" d="${leftSleeve} M43 13 L50 14 L60 25 L52 34 L44 28 Z M21 13 L27 8 H37 L43 13 L46 58 H18 Z"/>
  </svg>`;
}

let state = { competitions: [] };
let currentCompetitionId = parseCompetitionId();
let currentView = parseView();
let connection = null;
let saveQueue = Promise.resolve();
let lastRevision = 0;
let isReady = false;
let pollTimer = null;
let isSaving = false;

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getConnection() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CONNECTION_KEY) || '{}'); } catch { saved = {}; }
  const configured = window.APP_CONFIG || {};
  return {
    supabaseUrl: normalizeUrl(saved.supabaseUrl || configured.supabaseUrl),
    supabasePublishableKey: String(saved.supabasePublishableKey || configured.supabasePublishableKey || '').trim()
  };
}

function validConnection(candidate = getConnection()) {
  const key = candidate.supabasePublishableKey || '';
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(candidate.supabaseUrl)
    && /^(sb_publishable_|eyJ)[A-Za-z0-9._-]+$/.test(key)
    && !/YOUR_KEY|YOUR_PROJECT/i.test(key);
}

function apiHeaders(extra = {}) {
  return {
    apikey: connection.supabasePublishableKey,
    Authorization: `Bearer ${connection.supabasePublishableKey}`,
    ...extra
  };
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${connection.supabaseUrl}/rest/v1/${path}`, {
      cache: 'no-store',
      ...options,
      headers: apiHeaders(options.headers || {})
    });
  } catch (error) {
    throw new Error(`ネットワーク接続に失敗しました（${error.message || 'Load failed'}）`);
  }
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    const message = body?.message || body?.hint || body?.details || `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return body;
}

function localState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && Array.isArray(parsed.competitions) ? parsed : { competitions: [] };
  } catch {
    return { competitions: [] };
  }
}

async function loadCloudState({ allowMigration = true } = {}) {
  const rows = await apiRequest(`app_state?id=eq.${encodeURIComponent(CLOUD_ROW_ID)}&select=data,revision,updated_at`, {
    headers: { Accept: 'application/json' }
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('app_state の main 行がありません。SQLをもう一度実行してください。');
  }
  const row = rows[0];
  lastRevision = Number(row.revision || 0);
  const cloudState = row.data && Array.isArray(row.data.competitions) ? row.data : { competitions: [] };
  const savedLocal = localState();
  if (allowMigration && !cloudState.competitions.length && savedLocal.competitions.length) {
    const migrate = confirm('この端末に保存されている以前のデータをSupabaseへ移行しますか？');
    if (migrate) {
      state = savedLocal;
      await persistState(state, { force: true });
      return;
    }
  }
  state = cloudState;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveState() {
  const snapshot = typeof structuredClone === 'function' ? structuredClone(state) : JSON.parse(JSON.stringify(state));
  saveQueue = saveQueue
    .then(() => persistState(snapshot))
    .catch(async error => {
      console.error(error);
      if (error.code === 'CONFLICT') {
        await loadCloudState({ allowMigration: false });
        render();
        showToast('別端末の更新を反映しました。操作をもう一度行ってください');
      } else {
        showToast(`保存に失敗しました：${error.message || '通信エラー'}`);
      }
    });
  return saveQueue;
}

async function persistState(snapshot = state, { force = false } = {}) {
  if (!connection) return;
  isSaving = true;
  const revision = Date.now();
  const filter = force ? '' : `&revision=eq.${encodeURIComponent(lastRevision)}`;
  try {
    const rows = await apiRequest(`app_state?id=eq.${encodeURIComponent(CLOUD_ROW_ID)}${filter}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({
        data: snapshot,
        revision,
        updated_at: new Date().toISOString()
      })
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      const error = new Error('別端末で先に更新されました');
      error.code = 'CONFLICT';
      throw error;
    }
    lastRevision = revision;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } finally {
    isSaving = false;
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!isReady || isSaving || document.hidden) return;
    try {
      const rows = await apiRequest(`app_state?id=eq.${encodeURIComponent(CLOUD_ROW_ID)}&select=data,revision`, {
        headers: { Accept: 'application/json' }
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      const revision = Number(row?.revision || 0);
      if (revision > lastRevision && row?.data && Array.isArray(row.data.competitions)) {
        lastRevision = revision;
        state = row.data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
        showToast('別端末の変更を反映しました');
      }
    } catch (error) {
      console.warn('同期確認に失敗しました', error);
    }
  }, 5000);
}

function showSetupError(message) {
  newCompetitionBtn.disabled = true;
  app.innerHTML = `<section class="section card setup-card">
    <p class="eyebrow">SETUP REQUIRED</p>
    <h2>Supabaseの接続設定が必要です</h2>
    <p>${esc(message)}</p>
    <ol>
      <li>SupabaseのSQL Editorで初期設定SQLを実行します。</li>
      <li>Project URLとPublishable Keyを設定します。</li>
      <li>接続テストを行います。</li>
    </ol>
    <button class="button primary" type="button" data-action="open-connection-settings">接続情報を設定</button>
  </section>`;
}

function openConnectionSettings() {
  const current = getConnection();
  openModal(`
    <form id="connectionSettingsForm">
      <h2>Supabase接続設定</h2>
      <p class="form-help">設定はこの端末のブラウザに保存されます。GitHub上の <code>config.js</code> に書けば、他端末でも入力不要になります。</p>
      <div class="form-grid">
        <label class="wide">Project URL<input name="supabaseUrl" type="url" required value="${esc(current.supabaseUrl)}" placeholder="https://xxxxxxxx.supabase.co"></label>
        <label class="wide">Publishable Key<textarea name="supabasePublishableKey" required rows="4" placeholder="sb_publishable_...">${esc(current.supabasePublishableKey)}</textarea></label>
      </div>
      <div class="form-actions">
        <button class="button ghost" type="button" data-close-modal>閉じる</button>
        <button class="button primary" type="submit">保存して接続</button>
      </div>
    </form>`);
}

async function startApp() {
  newCompetitionBtn.disabled = true;
  app.innerHTML = '<div class="empty">データを読み込んでいます…</div>';
  connection = getConnection();
  if (!validConnection(connection)) {
    return showSetupError('Project URLまたはPublishable Keyが未設定です。');
  }
  try {
    await loadCloudState();
    isReady = true;
    newCompetitionBtn.disabled = false;
    startPolling();
    render();
  } catch (error) {
    console.error(error);
    showSetupError(`Supabaseへの接続に失敗しました。SQLと接続情報を確認してください。（${error.message || '不明なエラー'}）`);
  }
}

function parseCompetitionId() {
  const match = location.hash.match(/^#\/competition\/([^/]+)(?:\/admin)?$/);
  return match ? match[1] : null;
}
function parseView() {
  return /\/admin$/.test(location.hash) ? 'admin' : 'competition';
}

function getCompetition(id = currentCompetitionId) {
  return state.competitions.find(item => item.id === id) || null;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function openModal(html) {
  modalBody.innerHTML = `<div class="modal-content">${html}</div>`;
  modalBody.querySelectorAll('form').forEach(form => form.classList.add('mobile-form'));
  if (typeof modal.showModal === 'function') modal.showModal();
  else modal.setAttribute('open', '');
}

function closeModal() {
  if (typeof modal.close === 'function') modal.close();
  else modal.removeAttribute('open');
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function rightsForParticipant(competition, participantId) {
  let bonusUsed = 0;
  let nonG1Used = 0;
  competition.races.forEach(race => {
    const entry = race.entries.find(item => item.participantId === participantId);
    if (!entry || entry.status !== 'join') return;
    if (entry.use5000) bonusUsed += 1;
    if (race.gradeType === 'NON_G1' && entry.useNonG1) nonG1Used += 1;
  });
  return { bonusRemaining: Math.max(0, 3 - bonusUsed), nonG1Remaining: Math.max(0, 3 - nonG1Used) };
}

function summaryFor(competition) {
  const rows = competition.participants.map(participant => {
    const records = competition.races.flatMap(race => {
      const entry = race.entries.find(item => item.participantId === participant.id);
      return entry && entry.status === 'join' ? [{ race, entry }] : [];
    });
    const totalBet = records.reduce((sum, item) => sum + Number(item.entry.betAmount || 0), 0);
    const totalPayout = records.reduce((sum, item) => sum + Number(item.entry.payoutAmount || 0), 0);
    const maxRecord = records.reduce((best, item) => !best || Number(item.entry.payoutAmount || 0) > Number(best.entry.payoutAmount || 0) ? item : best, null);
    return {
      participantId: participant.id,
      name: participant.name,
      totalBet,
      totalPayout,
      profit: totalPayout - totalBet,
      recoveryRate: totalBet > 0 ? totalPayout / totalBet * 100 : null,
      maxPayout: maxRecord ? Number(maxRecord.entry.payoutAmount || 0) : 0,
      maxPayoutRace: maxRecord ? maxRecord.race.name : '—'
    };
  });
  const maxSorted = [...rows].sort((a, b) => b.maxPayout - a.maxPayout || a.name.localeCompare(b.name, 'ja'));
  let lastAmount = null;
  let lastRank = 0;
  const maxPayoutRanking = maxSorted.map((row, index) => {
    if (row.maxPayout !== lastAmount) lastRank = index + 1;
    lastAmount = row.maxPayout;
    return { ...row, rank: lastRank };
  });
  const recoveryRanking = [...rows].sort((a, b) => (b.recoveryRate ?? -1) - (a.recoveryRate ?? -1) || b.profit - a.profit);
  return { rows, maxPayoutRanking, recoveryRanking };
}

function openCompetitionCreate() {
  openModal(`
    <form id="competitionCreateForm" class="compact-admin-form">
      <div class="compact-form-head">
        <div><p class="eyebrow">NEW MEETING</p><h2>新大会</h2></div>
        <small>例：2027年 春競馬</small>
      </div>
      <div class="compact-fields">
        <label class="wide">大会名<input name="name" required maxlength="100" placeholder="2027年 春競馬"></label>
        <label>開始日<input name="startDate" type="date"></label>
        <label>終了日<input name="endDate" type="date"></label>
      </div>
      <details class="compact-details">
        <summary>ルール・賞品・連絡事項</summary>
        <textarea name="topContent" maxlength="5000" placeholder="必要な場合のみ入力"></textarea>
      </details>
      <p id="competitionCreateError" class="error" hidden></p>
      <div class="modal-actions compact-actions">
        <button type="button" class="button ghost" data-close-modal>キャンセル</button>
        <button type="submit" class="button primary">作成</button>
      </div>
    </form>`);
}
newCompetitionBtn.addEventListener('click', openCompetitionCreate);

modal.addEventListener('click', event => {
  if (event.target === modal || event.target.closest('[data-close-modal]')) closeModal();
});

modalBody.addEventListener('input', event => {
  if (event.target.closest('#participantEditForm')) refreshSilkEditorPreview();
});
modalBody.addEventListener('change', event => {
  if (event.target.closest('#participantEditForm')) refreshSilkEditorPreview();
});
modalBody.addEventListener('click', event => {
  const swatch = event.target.closest('[data-silk-preset]');
  if (!swatch) return;
  const form = event.target.closest('#participantEditForm');
  if (!form) return;
  form.elements.silksBodyColor.value = swatch.dataset.silkPreset;
  form.elements.silksSleeveColor.value = swatch.dataset.silkPreset;
  refreshSilkEditorPreview();
});
modalBody.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'competitionCreateForm') createCompetition(form);
  if (form.id === 'competitionEditForm') updateCompetition(form);
  if (form.id === 'participantForm') createParticipant(form);
  if (form.id === 'participantEditForm') updateParticipant(form);
  if (form.id === 'raceForm') createRace(form);
  if (form.id === 'raceEditForm') updateRace(form);
  if (form.id === 'entryForm') saveEntry(form);
  if (form.id === 'connectionSettingsForm') saveConnectionSettings(form);
});

window.addEventListener('hashchange', () => {
  currentCompetitionId = parseCompetitionId();
  currentView = parseView();
  render();
});

app.addEventListener('click', event => {
  const competitionCard = event.target.closest('[data-open-competition]');
  if (competitionCard) location.hash = `#/competition/${competitionCard.dataset.openCompetition}`;

  const scrollEl = event.target.closest('[data-scroll-target]');
  if (scrollEl) {
    document.querySelector(scrollEl.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  const action = actionEl?.dataset.action;
  if (!action) return;
  if (action === 'open-connection-settings') openConnectionSettings();
  if (action === 'create-meeting') openCompetitionCreate();
  if (action === 'new-competition') openCompetitionCreate();
  if (action === 'back') location.hash = '';
  if (action === 'edit-competition') openCompetitionEdit();
  if (action === 'open-admin') location.hash = `#/competition/${currentCompetitionId}/admin`;
  if (action === 'back-dashboard') location.hash = `#/competition/${currentCompetitionId}`;
  if (action === 'add-participant') openParticipantForm();
  if (action === 'add-race') openRaceForm();
  if (action === 'edit-entry') openEntryForm(event.target.closest('[data-race-id]').dataset.raceId, event.target.closest('[data-participant-id]').dataset.participantId);
  if (action === 'view-race') openRaceDetail(event.target.closest('[data-race-id]').dataset.raceId);
  if (action === 'view-participant') openParticipantDetail(event.target.closest('[data-participant-id]').dataset.participantId);
  if (action === 'view-ticket') openDigitalTicket(actionEl.dataset.raceId, actionEl.dataset.participantId);
  if (action === 'edit-participant') openParticipantEditForm(event.target.closest('[data-participant-id]').dataset.participantId);
  if (action === 'view-rank-history') openRankHistory();
  if (action === 'view-recovery-ranking') openRecoveryRanking();
  if (action === 'view-jackpot-ticket') openJackpotTicket();
  if (action === 'delete-participant') deleteParticipant(event.target.closest('[data-participant-id]').dataset.participantId);
  if (action === 'delete-competition') deleteCompetition();
});


async function saveConnectionSettings(form) {
  const data = readForm(form);
  const candidate = {
    supabaseUrl: normalizeUrl(data.supabaseUrl),
    supabasePublishableKey: String(data.supabasePublishableKey || '').trim()
  };
  if (!validConnection(candidate)) {
    showToast('URLまたはPublishable Keyの形式を確認してください');
    return;
  }
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(candidate));
  closeModal();
  isReady = false;
  clearInterval(pollTimer);
  await startApp();
}

function createCompetition(form) {
  const data = readForm(form);
  const error = form.querySelector('#competitionCreateError');
  const name = String(data.name || '').trim();
  if (!name) return showFormError(error, '勝負名を入力してください。');
  if (data.startDate && data.endDate && data.startDate > data.endDate) return showFormError(error, '終了日は開始日以降にしてください。');
  const competition = {
    id: uid('competition'), name, startDate: data.startDate || '', endDate: data.endDate || '',
    topContent: String(data.topContent || '').trim(), status: 'active', participants: [], races: [], createdAt: new Date().toISOString()
  };
  state.competitions.unshift(competition);
  saveState();
  closeModal();
  location.hash = `#/competition/${competition.id}`;
  showToast('勝負を作成しました');
}

function openCompetitionEdit() {
  const competition = getCompetition();
  openModal(`
    <form id="competitionEditForm" class="compact-admin-form">
      <div class="compact-form-head">
        <div><p class="eyebrow">MEETING SETTINGS</p><h2>開催設定</h2></div>
        <small>${esc(competition.name)}</small>
      </div>
      <div class="compact-fields">
        <label class="wide">大会名<input name="name" required maxlength="100" value="${esc(competition.name)}"></label>
        <label>開始日<input name="startDate" type="date" value="${esc(competition.startDate)}"></label>
        <label>終了日<input name="endDate" type="date" value="${esc(competition.endDate)}"></label>
      </div>
      <details class="compact-details" ${competition.topContent ? 'open' : ''}>
        <summary>ルール・賞品・連絡事項</summary>
        <textarea name="topContent" maxlength="5000">${esc(competition.topContent)}</textarea>
      </details>
      <p id="competitionEditError" class="error" hidden></p>
      <div class="modal-actions compact-actions">
        <button type="button" class="button ghost" data-close-modal>閉じる</button>
        <button type="submit" class="button primary">保存</button>
      </div>
    </form>`);
}
function updateCompetition(form) {
  const data = readForm(form);
  const competition = getCompetition();
  const error = form.querySelector('#competitionEditError');
  const name = String(data.name || '').trim();
  if (!name) return showFormError(error, '勝負名を入力してください。');
  if (data.startDate && data.endDate && data.startDate > data.endDate) return showFormError(error, '終了日は開始日以降にしてください。');
  Object.assign(competition, { name, startDate: data.startDate || '', endDate: data.endDate || '', topContent: String(data.topContent || '').trim() });
  saveState(); closeModal(); render(); showToast('保存しました');
}

function openParticipantForm() {
  const competition = getCompetition();
  if (competition.participants.length >= 8) return alert('参加者は最大8人までです。');
  openModal(`
    <form id="participantForm">
      <h2>参加者を追加</h2>
      <label>名前<input name="name" required maxlength="50" placeholder="表示名"></label>
      <p id="participantError" class="error" hidden></p>
      <div class="modal-actions"><button type="button" class="button ghost" data-close-modal>キャンセル</button><button type="submit" class="button primary">追加</button></div>
    </form>`);
}

function createParticipant(form) {
  const competition = getCompetition();
  const name = String(readForm(form).name || '').trim();
  const error = form.querySelector('#participantError');
  if (!name) return showFormError(error, '名前を入力してください。');
  if (competition.participants.length >= 8) return showFormError(error, '参加者は最大8人までです。');
  if (competition.participants.some(item => item.name === name)) return showFormError(error, '同じ名前の参加者が登録されています。');
  const index = competition.participants.length;
  const preset = SILK_PRESETS[index % SILK_PRESETS.length];
  const participant = {
    id: uid('participant'), name,
    silksColor: preset.id,
    silksPattern: SILK_PATTERNS[index % 4].id,
    silksBodyColor: preset.color,
    silksSleeveColor: preset.color,
    silksPatternColor: SILK_DEFAULT_PATTERN_COLORS[index % SILK_DEFAULT_PATTERN_COLORS.length],
    silksBodyPattern: SILK_PATTERNS[index % 4].id,
    silksSleevePattern: 'solid'
  };
  competition.participants.push(participant);
  competition.races.forEach(race => race.entries.push(defaultEntry(participant.id)));
  saveState(); closeModal(); render(); showToast('参加者を追加しました');
}

function silkPreviewMarkup(competition, participant, style, className) {
  const previewParticipant = {
    ...participant,
    silksBodyColor: style.bodyColor,
    silksSleeveColor: style.sleeveColor,
    silksPatternColor: style.patternColor,
    silksBodyPattern: style.bodyPattern,
    silksSleevePattern: style.sleevePattern
  };
  return silkMark(competition, previewParticipant, className);
}

function openParticipantEditForm(participantId) {
  const competition = getCompetition();
  const participant = competition.participants.find(item => item.id === participantId);
  if (!participant) return;
  const current = participantStyle(competition, participant);
  openModal(`
    <form id="participantEditForm" class="compact-admin-form compact-silk-form">
      <div class="compact-form-head">
        <div><p class="eyebrow">JOCKEY SILKS</p><h2>参加者設定</h2></div>
        <small>勝負服は即時プレビュー</small>
      </div>
      <div class="compact-silk-preview">
        <div data-silk-preview-large>${silkPreviewMarkup(competition, participant, current, 'silk-preview-svg large-preview')}</div>
        <div>
          <strong class="compact-preview-name">${esc(participant.name)}</strong>
          <span data-silk-preview-mini>${silkPreviewMarkup(competition, participant, current, 'silk-preview-svg mini-preview')}</span>
          <small>一覧表示</small>
        </div>
      </div>
      <div class="compact-fields">
        <label class="wide">参加者名<input name="name" required maxlength="50" value="${esc(participant.name)}"></label>
      </div>
      <div class="silk-inline-colors">
        <label><span>胴色</span><input type="color" name="silksBodyColor" value="${esc(current.bodyColor)}"></label>
        <label><span>袖色</span><input type="color" name="silksSleeveColor" value="${esc(current.sleeveColor)}"></label>
        <label><span>柄色</span><input type="color" name="silksPatternColor" value="${esc(current.patternColor)}"></label>
      </div>
      <div class="silk-inline-patterns">
        <label>胴柄<select name="silksBodyPattern">${SILK_PATTERNS.map(item => `<option value="${item.id}" ${item.id === current.bodyPattern ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
        <label>袖柄<select name="silksSleevePattern">${SILK_SLEEVE_PATTERNS.map(item => `<option value="${item.id}" ${item.id === current.sleevePattern ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>
      </div>
      <details class="compact-details silk-quick-details">
        <summary>クイックカラー</summary>
        <div class="silk-preset-swatches">${SILK_PRESETS.map(item => `<button type="button" data-silk-preset="${esc(item.color)}" title="${esc(item.name)}" style="--swatch:${esc(item.color)}" aria-label="${esc(item.name)}"></button>`).join('')}</div>
      </details>
      <input type="hidden" name="participantId" value="${esc(participant.id)}">
      <p id="participantEditError" class="error" hidden></p>
      <div class="modal-actions compact-actions three-actions">
        <button type="button" class="button ghost" data-close-modal>閉じる</button>
        <button type="button" class="button danger" data-action="delete-participant" data-participant-id="${esc(participant.id)}">削除</button>
        <button type="submit" class="button primary">保存</button>
      </div>
    </form>`);
  refreshSilkEditorPreview();
}
function refreshSilkEditorPreview() {
  const form = modalBody.querySelector('#participantEditForm');
  if (!form) return;
  const competition = getCompetition();
  const participant = competition?.participants.find(p => p.id === form.elements.participantId?.value);
  if (!competition || !participant) return;
  const style = {
    bodyColor: normalizeHex(form.elements.silksBodyColor?.value, '#2f9f73'),
    sleeveColor: normalizeHex(form.elements.silksSleeveColor?.value, '#2f9f73'),
    patternColor: normalizeHex(form.elements.silksPatternColor?.value, '#ece9df'),
    bodyPattern: form.elements.silksBodyPattern?.value || 'solid',
    sleevePattern: form.elements.silksSleevePattern?.value || 'solid'
  };
  const large = form.querySelector('[data-silk-preview-large]');
  const mini = form.querySelector('[data-silk-preview-mini]');
  if (large) large.innerHTML = silkPreviewMarkup(competition, participant, style, 'silk-preview-svg large-preview');
  if (mini) mini.innerHTML = silkPreviewMarkup(competition, participant, style, 'silk-preview-svg mini-preview');
  const nameNode = form.querySelector('.compact-preview-name');
  if (nameNode) nameNode.textContent = form.elements.name?.value || participant.name;
}

function updateParticipant(form) {
  const competition = getCompetition();
  const data = readForm(form);
  const participant = competition.participants.find(item => item.id === data.participantId);
  const error = form.querySelector('#participantEditError');
  const name = String(data.name || '').trim();
  if (!participant) return showFormError(error, '参加者が見つかりません。');
  if (!name) return showFormError(error, '名前を入力してください。');
  if (competition.participants.some(item => item.id !== participant.id && item.name === name)) return showFormError(error, '同じ名前の参加者が登録されています。');
  participant.name = name;
  participant.silksBodyColor = normalizeHex(data.silksBodyColor, participantStyle(competition, participant).bodyColor);
  participant.silksSleeveColor = normalizeHex(data.silksSleeveColor, participant.silksBodyColor);
  participant.silksPatternColor = normalizeHex(data.silksPatternColor, '#ece9df');
  participant.silksBodyPattern = SILK_PATTERNS.some(item => item.id === data.silksBodyPattern) ? data.silksBodyPattern : 'solid';
  participant.silksSleevePattern = SILK_SLEEVE_PATTERNS.some(item => item.id === data.silksSleevePattern) ? data.silksSleevePattern : 'solid';
  saveState(); closeModal(); render(); showToast('参加者・勝負服を保存しました');
}

function openRaceForm() {
  openModal(`
    <form id="raceForm" class="compact-admin-form">
      <div class="compact-form-head"><div><p class="eyebrow">NEW RACE</p><h2>レース追加</h2></div></div>
      <div class="compact-fields race-compact-fields">
        <label class="wide">レース名<input name="name" required maxlength="100" placeholder="例：有馬記念"></label>
        <label class="race-date-field">開催日<input name="raceDateTime" type="date"></label>
        <label>競馬場<input name="racecourse" maxlength="50" placeholder="中山"></label>
        <label>格<select name="gradeType"><option value="G1">G1</option><option value="NON_G1">非G1</option></select></label>
        <label>距離<input name="distance" inputmode="numeric" maxlength="10" placeholder="2500"></label>
      </div>
      <p id="raceFormError" class="error" hidden></p>
      <div class="modal-actions compact-actions">
        <button type="button" class="button ghost" data-close-modal>キャンセル</button>
        <button type="submit" class="button primary">保存</button>
      </div>
    </form>`);
}
function createRace(form) {
  const competition = getCompetition();
  const data = readForm(form);
  const name = String(data.name || '').trim();
  const error = form.querySelector('#raceError');
  if (!name) return showFormError(error, 'レース名を入力してください。');
  competition.races.push({
    id: uid('race'), name, raceDateTime: data.raceDateTime || '', racecourse: String(data.racecourse || '').trim(),
    gradeType: data.gradeType === 'NON_G1' ? 'NON_G1' : 'G1', note: String(data.note || '').trim(),
    entries: competition.participants.map(participant => defaultEntry(participant.id))
  });
  saveState(); closeModal(); render(); showToast('レースを追加しました');
}

function openRaceEditForm(raceId) {
  const competition = getCompetition();
  const race = competition.races.find(item => item.id === raceId);
  if (!race) return;
  openModal(`
    <form id="raceEditForm" class="compact-admin-form">
      <input type="hidden" name="raceId" value="${esc(race.id)}">
      <div class="compact-form-head">
        <div><p class="eyebrow">RACE SETTINGS</p><h2>レース編集</h2></div>
        <small>${esc(race.name)}</small>
      </div>
      <div class="compact-fields race-compact-fields">
        <label class="wide">レース名<input name="name" required maxlength="100" value="${esc(race.name)}"></label>
        <label class="race-date-field">開催日<input name="raceDateTime" type="date" value="${esc(String(race.raceDateTime || '').split('T')[0])}"></label>
        <label>競馬場<input name="racecourse" maxlength="50" value="${esc(race.racecourse || '')}" placeholder="中山"></label>
        <label>格<select name="gradeType"><option value="G1" ${race.gradeType === 'G1' ? 'selected' : ''}>G1</option><option value="NON_G1" ${race.gradeType !== 'G1' ? 'selected' : ''}>非G1</option></select></label>
        <label>距離<input name="distance" inputmode="numeric" maxlength="10" value="${esc(race.distance || '')}" placeholder="2500"></label>
      </div>
      <p id="raceEditError" class="error" hidden></p>
      <div class="modal-actions compact-actions three-actions">
        <button type="button" class="button ghost" data-close-modal>閉じる</button>
        <button type="button" class="button danger" data-action="delete-race" data-race-id="${esc(race.id)}">削除</button>
        <button type="submit" class="button primary">保存</button>
      </div>
    </form>`);
}
function updateRace(form) {
  const competition = getCompetition();
  const data = readForm(form);
  const race = competition.races.find(item => item.id === data.raceId);
  const error = form.querySelector('#raceEditError');
  const name = String(data.name || '').trim();
  if (!race) return showFormError(error, 'レースが見つかりません。');
  if (!name) return showFormError(error, 'レース名を入力してください。');
  race.name = name;
  race.raceDateTime = data.raceDateTime || '';
  race.racecourse = String(data.racecourse || '').trim();
  race.gradeType = data.gradeType === 'NON_G1' ? 'NON_G1' : 'G1';
  race.note = String(data.note || '').trim();
  if (race.gradeType === 'G1') {
    race.entries.forEach(entry => { entry.useNonG1 = false; });
  }
  saveState(); closeModal(); render(); showToast('レース情報を更新しました');
}

function defaultEntry(participantId) {
  return { participantId, status: 'undecided', betAmount: null, payoutAmount: null, use5000: false, useNonG1: false, enthusiasm: '' };
}

function openEntryForm(raceId, participantId) {
  const competition = getCompetition();
  const race = competition.races.find(item => item.id === raceId);
  const participant = competition.participants.find(item => item.id === participantId);
  const entry = race.entries.find(item => item.participantId === participantId);
  const rights = rightsForParticipant(competition, participantId);
  const currentBonusCredit = entry.status === 'join' && entry.use5000 ? 1 : 0;
  const currentNonG1Credit = entry.status === 'join' && entry.useNonG1 ? 1 : 0;
  openModal(`
    <form id="entryForm">
      <input type="hidden" name="raceId" value="${esc(raceId)}"><input type="hidden" name="participantId" value="${esc(participantId)}">
      <h2>${esc(participant.name)}｜${esc(race.name)}</h2>
      <div class="form-grid">
        <label>参加状況<select name="status"><option value="undecided" ${entry.status === 'undecided' ? 'selected' : ''}>未定</option><option value="join" ${entry.status === 'join' ? 'selected' : ''}>参加</option><option value="skip" ${entry.status === 'skip' ? 'selected' : ''}>不参加</option></select></label>
        <label>賭け金<input name="betAmount" type="number" inputmode="numeric" min="0" max="5000" step="1" value="${entry.betAmount ?? ''}" placeholder="通常上限3,000円"></label>
        <label>払戻額<input name="payoutAmount" type="number" inputmode="numeric" min="0" step="1" value="${entry.payoutAmount ?? ''}" placeholder="レース後に入力"></label>
        <div>
          <label class="check-row"><input name="use5000" type="checkbox" value="1" ${entry.use5000 ? 'checked' : ''}>5,000円権を使う</label>
          <p class="help">残り ${rights.bonusRemaining + currentBonusCredit} 回（選択時は上限5,000円）</p>
        </div>
        ${race.gradeType === 'NON_G1' ? `<div><label class="check-row"><input name="useNonG1" type="checkbox" value="1" ${entry.useNonG1 ? 'checked' : ''}>G1以外権を使う</label><p class="help">残り ${rights.nonG1Remaining + currentNonG1Credit} 回</p></div>` : ''}
        <label class="wide">意気込み<textarea name="enthusiasm" rows="3" maxlength="500" placeholder="このレースへの意気込み">${esc(entry.enthusiasm)}</textarea></label>
      </div>
      <p id="entryError" class="error" hidden></p>
      <div class="modal-actions"><button type="button" class="button ghost" data-close-modal>キャンセル</button><button type="submit" class="button primary">保存</button></div>
    </form>`);
}

function saveEntry(form) {
  const competition = getCompetition();
  const data = readForm(form);
  const race = competition.races.find(item => item.id === data.raceId);
  const entry = race.entries.find(item => item.participantId === data.participantId);
  const error = form.querySelector('#entryError');
  const status = data.status;
  let betAmount = data.betAmount === '' ? null : Number(data.betAmount);
  let payoutAmount = data.payoutAmount === '' ? null : Number(data.payoutAmount);
  const use5000 = data.use5000 === '1';
  const useNonG1 = data.useNonG1 === '1';

  if (!['undecided', 'join', 'skip'].includes(status)) return showFormError(error, '参加状況が正しくありません。');
  if (status === 'join') {
    if (!Number.isInteger(betAmount) || betAmount < 1) return showFormError(error, '参加する場合、賭け金を1円以上で入力してください。');
    if (!use5000 && betAmount > 3000) return showFormError(error, '3,000円を超える場合は、5,000円権を選択してください。');
    if (use5000 && betAmount > 5000) return showFormError(error, '5,000円権を使用しても上限は5,000円です。');
    if (race.gradeType === 'NON_G1' && !useNonG1) return showFormError(error, 'G1以外のレースに参加する場合は、G1以外権を選択してください。');
    if (payoutAmount != null && (!Number.isInteger(payoutAmount) || payoutAmount < 0)) return showFormError(error, '払戻額は0円以上の整数で入力してください。');

    const rights = rightsForParticipant(competition, data.participantId);
    const hadBonus = entry.status === 'join' && entry.use5000;
    const hadNonG1 = entry.status === 'join' && entry.useNonG1;
    if (use5000 && !hadBonus && rights.bonusRemaining <= 0) return showFormError(error, '5,000円権の残数がありません。');
    if (race.gradeType === 'NON_G1' && useNonG1 && !hadNonG1 && rights.nonG1Remaining <= 0) return showFormError(error, 'G1以外権の残数がありません。');
  } else {
    betAmount = status === 'skip' ? 0 : null;
    payoutAmount = status === 'skip' ? 0 : null;
  }

  Object.assign(entry, {
    status,
    betAmount,
    payoutAmount,
    use5000: status === 'join' ? use5000 : false,
    useNonG1: status === 'join' && race.gradeType === 'NON_G1' ? useNonG1 : false,
    enthusiasm: String(data.enthusiasm || '').trim()
  });
  saveState(); closeModal(); render(); showToast('入力を保存しました');
}

function showFormError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function deleteCompetition() {
  const competition = getCompetition();
  if (!competition || !confirm(`「${competition.name}」を削除しますか？\n元に戻せません。`)) return;
  state.competitions = state.competitions.filter(item => item.id !== competition.id);
  saveState(); location.hash = ''; showToast('勝負を削除しました');
}

function render() {
  newCompetitionBtn.hidden = Boolean(currentCompetitionId);
  document.body.classList.toggle('competition-open', Boolean(currentCompetitionId));
  if (!currentCompetitionId) return renderList();
  const competition = getCompetition();
  if (!competition) {
    currentCompetitionId = null;
    location.hash = '';
    return;
  }
  if (currentView === 'admin') renderAdmin(competition);
  else renderCompetition(competition);
}

function competitionLifecycle(competition) {
  const now = new Date();
  const start = competition.startDate ? new Date(`${competition.startDate}T00:00:00`) : null;
  const end = competition.endDate ? new Date(`${competition.endDate}T23:59:59`) : null;
  if (start && now < start) return { label:'次回開催', className:'upcoming' };
  if (end && now > end) return { label:'終了', className:'closed' };
  return { label:'開催中', className:'active' };
}

function renderList() {
  app.innerHTML = `
    <section class="meeting-index season-index">
      <div class="season-index-head">
        <div>
          <div class="season-logo-rule"><i></i><span>MEETINGS</span></div>
          <h2>大会一覧</h2>
          <small>過去大会と次大会をここから切り替えます。</small>
        </div>
        <button class="button primary compact-create-meeting" type="button" data-action="create-meeting">＋ 新大会</button>
      </div>
      ${state.competitions.length ? `<div class="meeting-index-list">${state.competitions
        .slice()
        .sort((a,b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))
        .map(competition => {
          const lifecycle = competitionLifecycle(competition);
          return `<button type="button" class="meeting-index-row" data-open-competition="${esc(competition.id)}">
            <span class="meeting-index-date mono">${esc(shortPeriodDate(competition.startDate))}<i>→</i>${esc(shortPeriodDate(competition.endDate))}</span>
            <span class="meeting-index-copy"><strong>${esc(competition.name)}</strong><small>${competition.participants.length} PLAYERS / ${competition.races.length} RACES</small></span>
            <span class="meeting-index-status ${lifecycle.className}">${lifecycle.label}</span>
            <b>›</b>
          </button>`;
        }).join('')}</div>` : '<div class="empty">まだ大会がありません。右上の新大会ボタンから作成してください。</div>'}
    </section>`;
}
function shortPeriodDate(value) {
  if (!value) return '—';
  const parts = String(value).split('-');
  if (parts.length < 3) return value;
  return `${parts[1]}.${parts[2]}`;
}

function raceSort(a, b) {
  const av = a.raceDateTime || '9999-12-31T23:59';
  const bv = b.raceDateTime || '9999-12-31T23:59';
  return av.localeCompare(bv) || a.name.localeCompare(b.name, 'ja');
}


function romanRank(value) {
  const roman = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ'];
  return roman[Math.max(0, Number(value || 1) - 1)] || String(value || '—');
}

function fullPeriodLabel(competition) {
  const a = shortPeriodDate(competition.startDate);
  const b = shortPeriodDate(competition.endDate);
  return `${a} → ${b}`;
}

function nextRaceFor(competition) {
  const races = [...competition.races].filter(r => r.raceDateTime).sort(raceSort);
  if (!races.length) return null;
  const now = new Date();
  return races.find(r => {
    const d = new Date(r.raceDateTime);
    return !Number.isNaN(d.getTime()) && d >= now;
  }) || races[races.length - 1];
}

function latestCompletedRace(competition) {
  return [...competition.races].sort(raceSort).reverse().find(race =>
    race.entries.some(entry => entry.status === 'join' && entry.payoutAmount != null)
  ) || null;
}

function maxRecordFor(competition, participantId) {
  let best = null;
  competition.races.forEach(race => {
    const entry = race.entries.find(e => e.participantId === participantId);
    if (!entry || entry.status !== 'join' || entry.payoutAmount == null) return;
    const payout = Number(entry.payoutAmount || 0);
    if (!best || payout > best.payout) best = { race, entry, payout };
  });
  return best;
}

function raceDateDisplay(value) {
  if (!value) return '--.--';
  const date = String(value).split('T')[0].split('-');
  return date.length === 3 ? `${date[1]}.${date[2]}` : '--.--';
}

function compactRacecourse(value) {
  if (!value) return '—';
  return String(value)
    .replace(/競馬場/g, '')
    .replace(/\s*\d{3,4}\s*m?$/i, '')
    .trim() || '—';
}

function finishBoardPanel(competition, summary) {
  if (!summary.maxPayoutRanking.length) {
    return `<section class="score-panel clean-board">
      <div class="score-panel-head"><span>MAX PAYOUT BOARD</span><small>最大払戻額</small></div>
      <div class="score-empty">参加者を登録するとランキングが表示されます。</div>
    </section>`;
  }
  const rows = summary.maxPayoutRanking.slice(0, 3);
  return `<section class="score-panel clean-board" id="dashboard-board">
    <div class="score-panel-head">
      <span>MAX PAYOUT BOARD</span>
      <small>${competition.status === 'closed' ? '確定' : '暫定'}</small>
    </div>
    <div class="clean-board-cols"><span>着</span><span>PLAYER / RACE</span><span>払戻額</span></div>
    <div class="clean-board-rows">
      ${rows.map(row => {
        const p = competition.participants.find(x => x.id === row.participantId);
        return `<button class="clean-board-row ${row.rank === 1 ? 'is-leader' : ''}" type="button"
          data-action="view-participant" data-participant-id="${esc(row.participantId)}">
          <span class="clean-place">${romanRank(row.rank)}</span>
          <span class="clean-player">
            ${p ? silkMark(competition, p, 'silk-icon clean-silk') : ''}
            <span><strong>${esc(row.name)}</strong><small>${esc(row.maxPayoutRace || '—')}</small></span>
          </span>
          <b>¥${Number(row.maxPayout || 0).toLocaleString('ja-JP')}</b>
        </button>`;
      }).join('')}
    </div>
    <div class="analysis-links three-links">
      <button type="button" data-action="view-rank-history">順位推移 <b>›</b></button>
      <button type="button" data-action="view-recovery-ranking">回収率 <b>›</b></button>
      <button type="button" data-action="view-jackpot-ticket">一撃王馬券 <b>›</b></button>
    </div>
  </section>`;
}

function raceProgramTable(competition) {
  const races = [...competition.races].sort(raceSort);
  if (!races.length) return '<div class="score-empty">レースがありません。</div>';
  return `<div class="race-board clean-race-board">
    <div class="race-board-head clean-race-head">
      <span>日付</span><span>場</span><span>格</span><span>レース名</span><span></span>
    </div>
    ${races.map(race => `<button class="race-board-row clean-race-row" type="button"
      data-action="view-race" data-race-id="${esc(race.id)}">
      <span class="mono">${esc(raceDateDisplay(race.raceDateTime))}</span>
      <span class="race-place">${esc(compactRacecourse(race.racecourse))}</span>
      <span class="race-class ${race.gradeType === 'G1' ? 'g1' : 'nong1'}">${race.gradeType === 'G1' ? 'G1' : '非G1'}</span>
      <strong>${esc(race.name)}</strong>
      <b>›</b>
    </button>`).join('')}
  </div>`;
}

function playersScorePanel(competition, summary) {
  if (!competition.participants.length) {
    return `<section class="score-panel players-score-panel" id="dashboard-players">
      <div class="score-panel-head"><span>PLAYERS</span><small>参加者</small></div>
      <div class="score-empty compact">参加者未登録</div>
    </section>`;
  }
  return `<section class="score-panel players-score-panel" id="dashboard-players">
    <div class="score-panel-head"><span>PLAYERS</span><small>${competition.participants.length}人</small></div>
    <div class="players-clean-list">
      ${competition.participants.map(p => {
        const row = summary.rows.find(x => x.participantId === p.id);
        const rights = rightsForParticipant(competition, p.id);
        return `<button type="button" data-action="view-participant" data-participant-id="${esc(p.id)}">
          ${silkMark(competition, p, 'silk-icon clean-player-silk')}
          <span class="clean-player-copy">
            <strong>${esc(p.name)}</strong>
            <small>5千×${rights.bonusRemaining} ・ 非G1×${rights.nonG1Remaining}</small>
          </span>
          <span class="clean-player-rate">
            <b>${pct(row?.recoveryRate)}</b><small>回収率</small>
          </span>
          <em>›</em>
        </button>`;
      }).join('')}
    </div>
  </section>`;
}

function renderCompetition(competition) {
  const summary = summaryFor(competition);

  app.innerHTML = `
    <div class="score-dashboard v41-dashboard">
      <header class="meeting-header season-logo-header">
        <div class="season-logo-copy">
          <div class="season-logo-rule"><i></i><span>MEETING</span></div>
          <h1>${esc(competition.name)}</h1>
          <small>${esc(fullPeriodLabel(competition))}</small>
        </div>
        <button class="score-menu" type="button" data-action="open-admin" aria-label="大会管理">☰</button>
      </header>

      ${finishBoardPanel(competition, summary)}

      <section class="score-panel race-table-panel" id="dashboard-races">
        <div class="score-panel-head"><span>RACE LIST</span><small>全${competition.races.length}レース</small></div>
        ${raceProgramTable(competition)}
      </section>

      ${playersScorePanel(competition, summary)}

      ${competition.topContent ? `<section class="score-panel rules-score-panel compact-rules" id="dashboard-rules">
        <div class="score-panel-head"><span>MEETING NOTES</span><small>開催要項・賞品</small></div>
        <div class="rules-score-body">${esc(competition.topContent)}</div>
      </section>` : ''}

      ${bottomNav('top')}
    </div>`;
}

function bottomNav(active = '') {
  return `<nav class="score-bottom-nav" aria-label="画面内ナビゲーション">
    <button class="${active === 'top' ? 'is-active' : ''}" type="button" data-action="back-dashboard"><b>⌂</b><span>TOP</span></button>
    <button class="${active === 'races' ? 'is-active' : ''}" type="button" data-scroll-target="#dashboard-races"><b>≡</b><span>RACES</span></button>
    <button class="${active === 'players' ? 'is-active' : ''}" type="button" data-scroll-target="#dashboard-players"><b>♙</b><span>PLAYERS</span></button>
    <button class="${active === 'rank' ? 'is-active' : ''}" type="button" data-action="view-rank-history"><b>↗</b><span>RANK</span></button>
    <button class="${active === 'admin' ? 'is-active' : ''}" type="button" data-action="open-admin"><b>⚙</b><span>管理</span></button>
  </nav>`;
}

function renderAdmin(competition) {
  const summary = summaryFor(competition);
  const races = [...competition.races].sort(raceSort);
  app.innerHTML = `
    <div class="score-dashboard admin-dashboard">
      <header class="meeting-header season-logo-header admin-meeting-header">
        <div class="season-logo-copy">
          <div class="season-logo-rule"><i></i><span>MEETING ADMIN</span></div>
          <h1>大会管理</h1>
          <small>${esc(competition.name)} / ${esc(fullPeriodLabel(competition))}</small>
        </div>
        <button class="score-menu" type="button" data-action="back-dashboard" aria-label="トップへ戻る">×</button>
      </header>

      <section class="score-panel admin-score-panel">
        <div class="score-panel-head"><span>MEETING</span><small>勝負設定</small></div>
        <div class="admin-setting-row">
          <span><strong>${esc(competition.name)}</strong><small>${esc(fullPeriodLabel(competition))}</small></span>
          <button class="button ghost" type="button" data-action="edit-competition">編集</button>
        </div>
      </section>

      <section class="score-panel admin-score-panel" id="dashboard-players">
        <div class="score-panel-head">
          <span>PLAYERS</span>
          <button class="admin-inline-add" type="button" data-action="add-participant" ${competition.participants.length >= 8 ? 'disabled' : ''}>＋ 参加者</button>
        </div>
        <div class="admin-list clean-admin-list">
          ${competition.participants.map(p => adminParticipantRow(competition, summary, p)).join('') || '<div class="score-empty compact">参加者がいません。</div>'}
        </div>
      </section>

      <section class="score-panel admin-score-panel" id="dashboard-races">
        <div class="score-panel-head">
          <span>RACES</span>
          <button class="admin-inline-add" type="button" data-action="add-race">＋ レース</button>
        </div>
        <div class="admin-race-list">
          ${races.map(race => `<button type="button" data-action="view-race" data-race-id="${esc(race.id)}">
            <span class="mono">${esc(raceDateDisplay(race.raceDateTime))}</span>
            <span class="race-class ${race.gradeType === 'G1' ? 'g1' : 'nong1'}">${race.gradeType === 'G1' ? 'G1' : '非G1'}</span>
            <strong>${esc(race.name)}</strong>
            <small>${esc(compactRacecourse(race.racecourse))}</small>
            <b>›</b>
          </button>`).join('') || '<div class="score-empty compact">レースがありません。</div>'}
        </div>
      </section>

      <section class="score-panel admin-score-panel meeting-lifecycle-panel">
        <div class="score-panel-head"><span>MEETINGS</span><small>大会切替</small></div>
        <div class="meeting-lifecycle-actions">
          <button type="button" class="meeting-admin-link" data-action="back">
            <span><strong>大会一覧を見る</strong><small>過去大会・次大会を切り替えます。</small></span><b>›</b>
          </button>
        </div>
      </section>

      <section class="score-panel admin-score-panel danger-admin">
        <div class="score-panel-head"><span>DANGER ZONE</span><small>削除</small></div>
        <div class="admin-danger-row">
          <span><strong>この勝負を削除</strong><small>参加者・レース・結果もすべて削除されます。</small></span>
          <button class="button danger" type="button" data-action="delete-competition">削除</button>
        </div>
      </section>

      ${bottomNav('admin')}
    </div>`;
}

function adminParticipantRow(competition, summary, participant) {
  const rights = rightsForParticipant(competition, participant.id);
  return `<div class="admin-row clean-admin-row" data-participant-id="${esc(participant.id)}">
    <span class="admin-silk">${silkMark(competition, participant, 'silk-icon')}</span>
    <span><strong>${esc(participant.name)}</strong><small>5千×${rights.bonusRemaining} ・ 非G1×${rights.nonG1Remaining}</small></span>
    <span class="admin-actions">
      <button class="button ghost" type="button" data-action="edit-participant">編集</button>
      <button class="button danger" type="button" data-action="delete-participant" data-participant-id="${esc(participant.id)}">削除</button>
    </span>
  </div>`;
}

function championBoard(competition, champion, topThree) {
  const championParticipant = competition.participants.find(p => p.id === champion.participantId);
  const second = topThree[1];
  const third = topThree[2];
  return `<div class="finish-board">
    <button class="winner-panel" type="button" data-action="view-participant" data-participant-id="${esc(champion.participantId)}">
      <span class="finish-rank">1</span><span class="winner-silk">${championParticipant ? silkMark(competition, championParticipant,'silk-icon large') : ''}</span>
      <span class="winner-copy"><small>LEADER / 一撃王</small><strong>${esc(champion.name)}</strong><em>${esc(champion.maxPayoutRace)}</em></span>
      <b>¥${Number(champion.maxPayout || 0).toLocaleString('ja-JP')}</b>
    </button>
    <div class="placing-list">${second ? podiumCard(competition, second, 2) : podiumEmpty(2)}${third ? podiumCard(competition, third, 3) : podiumEmpty(3)}</div>
  </div>`;
}
function podiumCard(competition, row, rank) {
  const participant = competition.participants.find(p => p.id === row.participantId);
  return `<button class="placing-row" type="button" data-action="view-participant" data-participant-id="${esc(row.participantId)}"><span class="finish-rank">${rank}</span>${participant ? silkMark(competition, participant,'silk-icon') : ''}<span><strong>${esc(row.name)}</strong><small>${esc(row.maxPayoutRace)}</small></span><b>¥${Number(row.maxPayout || 0).toLocaleString('ja-JP')}</b></button>`;
}

function podiumEmpty(rank) {
  return `<div class="placing-row empty-podium"><span class="finish-rank">${rank}</span><span>未登録</span></div>`;
}

function recoveryList(competition, rows) {
  if (!rows.length) return '<div class="empty">参加者がいません。</div>';
  return `<div class="ranking-list">${rows.map((row, index) => { const p=competition.participants.find(x=>x.id===row.participantId); return `<button type="button" class="ranking-row" data-action="view-participant" data-participant-id="${esc(row.participantId)}"><span class="rank-no">${index+1}</span>${p?silkMark(competition,p,'silk-line-mark'):''}<span class="rank-name">${esc(row.name)}<small class="profit ${row.profit > 0 ? 'plus' : row.profit < 0 ? 'minus' : 'neutral'}">${row.profit > 0 ? '+' : ''}${yen(row.profit)}</small></span><strong class="rank-rate">${pct(row.recoveryRate)}</strong></button>`; }).join('')}</div>`;
}

function raceListItem(competition, race) {
  const completed = race.entries.filter(entry => entry.status !== 'undecided').length;
  return `<button class="race-list-item" type="button" data-action="view-race" data-race-id="${esc(race.id)}" aria-label="${esc(race.name)}の詳細を開く">
      <span class="race-date-inline">${esc(formatRaceDateCompact(race.raceDateTime))}</span>
      <span class="badge race-grade ${race.gradeType === 'G1' ? 'is-g1' : 'is-nong1'}">${race.gradeType === 'G1' ? 'G1' : '非G1'}</span>
      <span class="race-name-text">${esc(race.name)}</span>
      ${competition.participants.length ? `<span class="race-input-status">${completed}/${competition.participants.length}</span>` : ''}
      <span class="race-chevron" aria-hidden="true">›</span>
  </button>`;
}

function participantCard(competition, summary, participant) {
  const row = summary.rows.find(item => item.participantId === participant.id);
  const rights = rightsForParticipant(competition, participant.id);
  return `<button class="participant-card" type="button" data-action="view-participant" data-participant-id="${esc(participant.id)}">${silkMark(competition, participant,'silk-edge')}<span class="participant-card-main"><strong>${esc(participant.name)}</strong><small>回収率 ${pct(row?.recoveryRate)}</small></span><span class="mini-rights"><small>5千 ×${rights.bonusRemaining}</small><span>・</span><small>非G1 ×${rights.nonG1Remaining}</small></span><span class="participant-chevron">›</span></button>`;
}

function rankHistoryData(competition) {
  const races = [...competition.races].sort(raceSort).filter(race => race.entries.some(entry => entry.status === 'join' && entry.payoutAmount != null));
  const runningMax = new Map(competition.participants.map(p => [p.id, 0]));
  const points = [];
  let previousLeaders = [];
  const events = [];

  races.forEach(race => {
    race.entries.forEach(entry => {
      if (entry.status !== 'join' || entry.payoutAmount == null) return;
      runningMax.set(entry.participantId, Math.max(runningMax.get(entry.participantId) || 0, Number(entry.payoutAmount || 0)));
    });
    const ordered = competition.participants.map(p => ({ participantId: p.id, name: p.name, value: runningMax.get(p.id) || 0 }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ja'));
    let lastValue = null;
    let rank = 0;
    const ranked = ordered.map((row, index) => {
      if (row.value !== lastValue) rank = index + 1;
      lastValue = row.value;
      return { ...row, rank };
    });
    points.push({ race, ranked });
    const topValue = ranked[0]?.value || 0;
    const leaders = ranked.filter(row => row.rank === 1 && row.value === topValue).map(row => row.participantId).sort();
    const changed = topValue > 0 && leaders.join('|') !== previousLeaders.join('|');
    if (changed) {
      const names = ranked.filter(row => leaders.includes(row.participantId)).map(row => row.name).join('・');
      events.push({ race, names, value: topValue });
    }
    previousLeaders = leaders;
  });
  return { races, points, events };
}

function ticketRaceNumber(race) {
  const explicit = String(race.raceNumber || race.number || '').match(/\d+/)?.[0];
  return explicit ? `${explicit}R` : 'RACE';
}

function fullTicketDate(value) {
  if (!value) return '—';
  const d = String(value).split('T')[0].split('-');
  if (d.length !== 3) return '—';
  return `${d[0]}.${d[1]}.${d[2]}`;
}

function ticketRaceNumber(race) {
  const explicit = String(race.raceNumber || race.number || '').match(/\d+/)?.[0];
  return explicit ? `${explicit}R` : 'RACE';
}

function fullTicketDate(value) {
  if (!value) return '—';
  const d = String(value).split('T')[0].split('-');
  if (d.length !== 3) return '—';
  return `${d[0]}.${d[1]}.${d[2]}`;
}

function ticketRaceNumber(race) {
  const explicit = String(race.raceNumber || race.number || '').match(/\d+/)?.[0];
  return explicit ? `${explicit}R` : 'RACE';
}

function fullTicketDate(value) {
  if (!value) return '—';
  const d = String(value).split('T')[0].split('-');
  if (d.length !== 3) return '—';
  return `${d[0]}.${d[1]}.${d[2]}`;
}

function ticketRaceNumber(race) {
  const explicit = String(race.raceNumber || race.number || '').match(/\d+/)?.[0];
  return explicit ? `${explicit}R` : 'RACE';
}

function fullTicketDate(value) {
  if (!value) return '—';
  const d = String(value).split('T')[0].split('-');
  if (d.length !== 3) return '—';
  return `${d[0]}.${d[1]}.${d[2]}`;
}

function openJackpotTicket() {
  const competition = getCompetition();
  if (!competition) return;

  const summary = summaryFor(competition);
  const champ = summary.maxPayoutRanking[0];

  if (!champ) {
    openModal(`<div class="analysis-modal">
      <div class="analysis-modal-head">
        <div><p class="eyebrow">JACKPOT TICKET</p><h2>一撃王馬券</h2></div>
        <button class="button ghost" type="button" data-close-modal>閉じる</button>
      </div>
      <div class="score-empty">払戻記録がありません。</div>
    </div>`);
    return;
  }

  const participant = competition.participants.find(p => p.id === champ.participantId);
  const record = maxRecordFor(competition, champ.participantId);
  if (!participant || !record) return;

  const race = record.race;
  const entry = record.entry;
  const bet = Number(entry.betAmount || 0);
  const payout = Number(entry.payoutAmount || 0);
  const recovery = bet > 0 ? payout / bet * 100 : null;
  const venue = compactRacecourse(race.racecourse || '') || '競馬場';
  const raceNo = ticketRaceNumber(race);
  const grade = race.gradeType === 'G1' ? 'G1' : '非G1';
  const ticketId = `HBT-${String(race.raceDateTime || '').slice(0,10).replace(/-/g,'')}-${String(race.id || '').slice(-6).toUpperCase()}`;

  openModal(`
    <div class="jackpot-ticket-modal hbb-ticket-v7-modal">
      <div class="analysis-modal-head ticket-modal-head">
        <div>
          <p class="eyebrow">JACKPOT TICKET</p>
          <h2>一撃王馬券</h2>
          <small>現在の最大払戻記録</small>
        </div>
        <button class="button ghost" type="button" data-close-modal>閉じる</button>
      </div>

      <section class="hbb-ticket-v7" aria-label="一撃王馬券">
        <aside class="hbb-ticket-v7-stub">
          <div class="hbb-ticket-v7-brand">HORSE BET BATTLE</div>
          <div class="hbb-ticket-v7-season">${esc(competition.name)}</div>
          <div class="hbb-ticket-v7-rno">${esc(raceNo)}</div>

          <div class="hbb-ticket-v7-stub-grid">
            <div class="hbb-ticket-v7-stub-item">
              <small>DATE / VENUE</small>
              <strong>${esc(fullTicketDate(race.raceDateTime).slice(5))}　${esc(venue)}</strong>
              <span class="hbb-ticket-v7-badge">${esc(grade)}</span>
            </div>
            <div class="hbb-ticket-v7-stub-item">
              <small>RACE / COURSE</small>
              <strong>${esc(race.name)}</strong>
            </div>
          </div>

          <div class="hbb-ticket-v7-stub-foot">MAX PAYOUT RECORD<br>${esc(ticketId)}</div>
        </aside>

        <main class="hbb-ticket-v7-main">
          <div class="hbb-ticket-v7-top">
            <div>
              <small>MEMORIAL DIGITAL BET TICKET</small>
              <h1>一撃王馬券</h1>
            </div>
            <div class="hbb-ticket-v7-issue">SERIES ${esc(competition.name)}<br>ISSUE 001 / HOLDER 01</div>
          </div>

          <div class="hbb-ticket-v7-rule"></div>

          <div class="hbb-ticket-v7-race">
            <div>
              <small>${esc(raceNo)} / ${esc(grade)}</small>
              <h2>${esc(race.name)}</h2>
              <p>${esc(venue)}競馬場${race.distance ? `　${esc(race.distance)}m` : ''}</p>
            </div>
            <div class="hbb-ticket-v7-grade">${esc(grade)}</div>
          </div>

          <div class="hbb-ticket-v7-microline">
            <span>MAX PAYOUT</span>
            <span><b>${esc(grade)}</b>${race.distance ? ` ${esc(race.distance)}M` : ''}</span>
            <span>${esc(fullTicketDate(race.raceDateTime))}</span>
            <span>${esc(competition.name)}</span>
            <span>RECORD No.001</span>
          </div>

          <div class="hbb-ticket-v7-hero">
            <div class="hbb-ticket-v7-player">
              ${silkMark(competition, participant, 'jockey-silk hbb-ticket-v7-silk')}
              <div><small>PLAYER / HOLDER</small><strong>${esc(participant.name)}</strong></div>
            </div>
            <div class="hbb-ticket-v7-pay">
              <small>PAYOUT / MAXIMUM RECORD</small>
              <strong>¥${payout.toLocaleString('ja-JP')}</strong>
              <em>MAX PAYOUT HOLDER / CURRENT RECORD</em>
            </div>
          </div>

          <div class="hbb-ticket-v7-metrics">
            <div class="hbb-ticket-v7-metric"><small>BET</small><strong>¥${bet.toLocaleString('ja-JP')}</strong></div>
            <div class="hbb-ticket-v7-metric"><small>RETURN</small><strong>${pct(recovery)}</strong></div>
            <div class="hbb-ticket-v7-metric"><small>COURSE</small><strong>${race.distance ? `${esc(race.distance)}m` : '—'}</strong></div>
            <div class="hbb-ticket-v7-metric"><small>MEETING</small><strong>${esc(competition.name)}</strong></div>
            <div class="hbb-ticket-v7-metric"><small>STATUS</small><strong>MAX HOLDER</strong></div>
          </div>

          <div class="hbb-ticket-v7-art">
            <img class="left" src="data:image/jpeg;base64,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" alt="">
            <img class="right" src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCACRAz0DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7p8bSAa14RQHONWjOR/wGuyaXGfSuS8cKqav4QJx/yFV/9lro9Qu0sbSe4lYJFEpZ29AK+cjpJnpPZMmuJ4rWB5ppUiijXc8jtgKvqfSuD134pR23iDT9J0m0XU5LtS/2ottt1AGcB+Ax+hrmvGPxNj8Q6NHHpV5NZ2Uoxdh7bc+wkgnr0Irr/h/pek6dpMEMFw10wVXzK4ZxkHIx2GK0tcxcn0Kdx8RtX0h7P+0fCd6IJpCj3FofMVFz97AycV2mka1Za7ZLd2FxHdWxJXzEORkdR+Fef/EXR577VJnsBItwsKsoic8DnnGMe3XtUvw8h1vwr4ebTp9Ejid3M1veeaHR9x6vxkGkkJSaZ6T2pM857V5jL8QtY8O69Zxa2bafTrmYWxktoyjRSE8deor0w/e/+v0quhadxQMjinY+WmZx3pynJxUlDgOBnrTdwFKTg4ppGTmgAJBU4qPGcDtUuAeB3rL0rxBZ61dahBbMxksZjbzBhj5sZ49qALoPJ7ilIBbPal259QPcYp2wYxSQrkZXn3qN4sk8DnvUx/M0mOc4pNBciCIq5xhh3pWC4DkZ9cdaHyD94Ae4pHO5cb/yFCGP34435PqRTlYDqwzVeNGI5JK+4odSP/r02wJnYFefXrSqwIwRmoEJCEEbh35oX13Mv1GancCdgvTFVp7fAwDwfU1N52GAIDA/xCkIEjEscKOMetAEAjMYXa5B7Z5FPebCBiMZpGCofkBx7UioOpK8fw07gOMhMfAyPemrOTgEAAd81YIXbxjFRtGGHGB70gEMqk8vj6VI0yKAWP096bjzMLwMeg603IfGRxRcBXm/dbl9cZ9KjVyz8jecdWpxjIK7MAn1prbY3IBY5646UwHLJjcGJR+xUZFOVFlYHdz3A6Gmh1jHC/meKieWRiCCueuFGKLgXGyWo35OAc/SojPleUJPfBp0cmYwThc9hQA4tlwCp9j3pxyRgEhqVXBHrTJG4bjntRYCVFKqAxyaVsj2qLeURcgkkU7zeMHp65qidRWfaMBRk0jpgcnHqTSuwIUD73XGarTyGQ5PA9M0rjEdhncqlv60B2bcSQSOijtUPmNuIJz3GKQStG5Yjr14qbjLuAOlND7EPHI6VGsg3AkkZFP8syg7unpQBC0jhwSdmfWnvOdmGYMT0A708Q7YyueO2e1Q4bdzwR6elPUAjljXAMYBP8VSByAQCPwqNF+ZsDC9h2qRYVzkce1ADNxXoTnOaBIWIHzEHpT1iJ3BeB3Jp6w8dcgU9QFWFifmG32FSCNEI/rTFiAOQzD8aCjg/eH40gByWJznaO3rTCpx069vQU5WJyWUHHcGlZt65CkCmBFHAckk8U/ysLjpT0dOBtKj1NPIyfX0NFgKxLxkHJC9M05V3MT944/CpzkDpkU4YK8HFJICs0ZA5OCfSpYkCrx0qYKPUUbQOQKqwriA4GKQxq3Pf604qTzio55o7aMySyJDGBnfIwUfmaBi7GHQgigAgdc1ymo/FLw9YzGC3uZdXugcCDTYjKc+hc4Qf99Vx/ij4zTaVAZLq60jwpbk/f1G58+5x7QxgjP1anZkOaR63gkHALAdSK5jWPiV4e0S4NrJqCXV9nH2Ky/fzZ9Nq5Ir5Z8cftN+HpG8pH1vxnc/3Z2Fpak+yKXJH5V57/wu/wCJvim6OleGNNt/DdsULiOyjER2+vmPjJ/CqUGZOt2PsfxB8T9QsrQzPZWXhe0Iz9q8R3AibHqIshq8O8dftI+Eo1aO+8Rat4slP3rbSh9jtPpvUKSPxrwHUfC2vXcxn8QXF2szNzLcMsu7nnB3VIfDXhmFYHhvLuW8icOwvbYeU+c/KcMeOO1aKKRyupNs7Cb9p7XpSln4O0Ww8PrMdkbWduJrlyfWRwxz+Ncnr2heNPEGppN4qn1WEzE5mvWeQD/gJ/wrRE1kZjJDY2UG7GBbBlwcdV44qKO7mtp2H2mSd8k/vpSGQe2RzVehG+7DR/CekaN5sl1ZSa62R5Ur7o0Q9wVGM1ckgtopobqxsINPuEx5Utm+OcHjJNY974mmhlDPDMy5wJ4H37eeMj8Kih1cyQecrxur8By3Xjpt7H3osxadEbF/q1y07ySSXE1yoO55+VAx03f/AF6prqN3cxyLDbLdwhudhd1XnuQcinW+mXF5YXF2lnexQ2yGWR1HyJx1yev5VtaX8ONS1S7RpJ4LWGVfMZ0Ys+DyOOM0WSHdt2OTutRu4xuzd2Ui8bcGWLH4g0h8Q3caO2IGJXBkhO2ReDziuvl+GVrb6+1jNdTyxLGsiybtpIJPY8V0Wq6N4a8OeHpbO0t7Q3syqiMf3jA5zkkCk5K41B7nnnhyGbWDHbwWzaqZSWUBwXX3ZhyBW9q/w1vI7qxh/wBH0w3jsjeUxduMnJ5PpXSeELHVLe8mt9P0G5nhIUwy28flx7sDdlmxwfpXWXHhTW7zULO71K/0fw7FauzASXG9znI6YHqaz5ncpQ7nnVr8HdKh0rVLi+muLyS3cRxTGQoM4B6d+td9FZ6F4Vt4gDZWjqq7pDtLtx155qnqB+Hmk+cuqeJ7/wAQTyOXe20+IhGbGMc8dvWsq6+KvhvRY86F4NjyB8txqsqg/XHNN3ZStHcreGLq7vIZbbTrK8umF1JJ/o8BKsp245AxXaXfw+8YeJbYIdPg0q2WVJWl1BwM7WBHBI9K841f44+MNTs3W0ni0+PkBLGE5X8a429uvE+uR+ZeXGoXatyftMwjXr6MQaLPqHMuh7xrUPhvRIGPiPxzbjBBa00wqTnpwBk1h2HxR+Gvh61km0vw/fa3ebt3magM5OOG+fivF08OXOMGSyt+/wB6SVv0Qj9atJoNrp8R8+5uXdh0iVIk/Mvn9KdkJyfTQ9J1j9pzxE6mLRtNsNEhxgFE8x16fVa8+1H4k+KvEl8FvNeu7nzDzGs/l8eyoR+VLHeeHdLZXljtZnXkrLcNMT+GwD9akl+JOlRY+yWroB0W3gSLH0bcf5U0vIlyb3ZWbwpd308dwF1BrXgzSvaOHUc/NkjJArsdF8R+KPA2ox21prl9DE65hIk+0xSrj7wR9x/AVwtx8QZZA7RaaA2PlluLxnK9ecbR+Waw4fG2pxxiOZo7qBWJWGYfKPZT2FPlb6Ec8Y7H1NoP7ResaepTVbWz1OMfeaI/Z5W6dVJAJ/Cte9+KXw18SiOPxBpS6RcS4Hm3NuY+c8EyoB/OvnCx8fadfQDzxc20mMFAomj7Y6kGodS1K3u7G4mju3NpDgyvFF80fPHykgH86z5Ube0a8z6v8N+D7K2je78F+JHe2lw7wmRbuJjj1OSvX1rlfG+ua7PrdrYXmlwyXGjzx3zy205AnQ4wAuc5ypr53s7i5tYomt5YtLkQAh5CRckYPzHbkdccZr0j4bSa/q+sXbSa79rlktUkH9pQE71DMAoOcgDFQ1ZXbLUr6I+gPg/490fSPDi2Gp36aZfyXMsjQ3jCP7zccnFeyW04niWaMiSNhlZE+YEeoPevmCSTVEiMepeHUuoh1k0+dZM9Odrbf51LZeI7fR7zTzYajqOlXLXcUYtp1ZFcFiCMDI/Ws1ubqVtD6gLbu/B/KmblU8c49KJGAlYAcAkUKqg8cZq7mhyvi5w3ijwVj/oJP/6IkrN+C7f8UvqQ/wCotc4/8drT8Y4HibwTgcnU3/8ARElZPwRz/wAInqOev9r3X/stcX/L46fsHoP3SCOTXx58dy7eJoyOPv8A8xX2AoIJya+QfjyA3iSE5IP7wcfUU6/wip7n0v48y2qeETk5GrL/AOy1mfFq6gMFhp9vPL/aFxL8tujELIoySH9Aas/E7VYNFHhq8uATHHqsedvvtry3xZ4jtPHev2ps4rxrZo2QSQkCWXJwUAz+vtXRG7mznm7RRnzzNpsN7ZSED98hVoHLJHI33Y2OSSBxnB7+1dF4R8N3L6mn9iXrWlhZP/pF4csJ5cH5FB6rjPP0pNL+COqi3XZcw2dqsTpbQ3ILSQlmPX35qPw94Fn07w4+nTzz2ms2Lt5QVhsK44YjPI/+tWq01MOp6/oNg1lc3d1eXj31xP8Addl2rGuPugDt16+prlviFdtpWo6etpeXDwSS5kslzsV/4TuHIGeMZxzXmll471q7AtYGZGiLLOqEDDD+J8kYWt+z0278ZB47Uq1oMrNdjKJKcj7hIycEdcU+Yad9EZ3jSD/hK7lrNLowNC4fzWLKkcmBks2e3GPxrf8ACvxb1KTX5bO8eDUdFtrfMmpRrtbKgZY9jk8cetR6j8Jr3VbKKK61WFniAClEIV8Hjf6/WpPAPw+dri/HiHSYGWGMW0XlgFJUxyw9OlQ3poVZp3PW7G7jvbaG4jz5cqh1yMHB6cVaIwARya4/wcbrT7zUNEYCezsNn2e53gllbPyH3XH5EV16ZFJGqd1cDk9qQMf/AK1PAyDTo1GeRV2C5geN9Qu9K8Jald2Z8u6SLELleAx45rw7wbfal8NvHcc3iHUhb6dq7IXQv5pnmdQAeORya1vjJrd/qfiS4szok8lnZIIiDPhboMc5CD6HmvO9f1++tba0TTYo/t1tcqYlVDJIhXhEwQPQUN2MG9bn1wzd85BwQfXj/wDVTd4IrC8KXmo3mhWT6ysEOrtEGuIIXB2emR2rbQ9sVFzda6ijO7IoIJJpyoDzSN8oLMQiKMszEAAd6YxMZxS9+gFUrTxBpd7LFHBqEEkkoJRA3LAdcVecbTycdOaLCuIUOeKYYirbs0pY7cAnNIx+Tqc0XBDfJU5J5pPKTBA3DPcHpSkOcYBA9SaaRIOMAj60hkb2zFgWG7HfNNMbgbs5A7YqYpISMYx6GnFJOzKPYUgK215F+UkDvQEMePkzUx82MHKhz7Un2jbwynJ/hNSMajmJcuMrn8qm3L5mwjB64PeoJJ94I3YH90ikWYOMMAxHTBqriLQHzZA6cYpGUBSAOvaq7MxUsTt/2c9aRWJHCnd9aAJGc7D0BHtUW7O3Axg9acxBXO7B7r1NRHcCCqkg9f8A9VIZNIjStnO4+3FCQHucD0pFD4yOlSqWZc9MUxEa26KcDKn60bHRSoO/B71YCZOSOAKVNoJYdfSiwECyODgR4H1p5kK/wEn606QL97HNRYDgg5FPYCdmlKYCAHHfmqcrzx/6xAVPtU21VOBkj2NMkTcc7myPQ0XEiuJG+YMmcdGweRTreUNnnaPTFTKxPVmP1NGADngD6VOoxyLHJj5gT9KewyVAZcdDnvTCoK8EEeopioWTBGQepzTAnkUEDIDH27VEf3YJUsv16VIgwMdu1KEJ68+1PcALSkDaOfWolgYElhtPXOc1aDDb71EzyYOWCj6VQCGNimAefUU3Y5IyelPV8gYbI9cUbnyRjA9aVgFHIxj608fKOwqPcwHX8TTSCSDwy+uaAJmByCDgGmuhOPmJx3pA5PBYAelPTOeXwvsKNwGbe5XHvmkBznGcVPkA5zmkLdqewCkgqARxSjAGB0ph5Hc/hmqd9rFlpCeZe3UNrGOczOAfwHU/lSuSaIAC+9NZQozkY9elcBrfxw0DSonNsZL516tlYIh9WkKnH0Brx7xh+2Bp1mGji1mCKXoIdGhNzJ+Mj7AOvYmrUbkOpGJ9NXU8djA89w6wW6DLSy/KgHua5G5+K+ifvBpZuNekThhpkRlRfq4BUfjXxvrHxt8S+NLnfo/h+W9wci91d/tDj3CnCr+ZrjtTHjPxjdLJ4l1S6uLOF/8AjxFz5aEf3VAJA/OrUO7MXX00R9YeMP2nLLSTJA2raVo0i8GGA/brse2FJVT9RXifin9pOK+aT7LpOoeIpRz5+t3LrEPTEMRRfwINeWr4MtYb+W4/s+4S2ZiyW0V0uxRjoWJyfyrftPFGj2Vm2n21lNZqzZkSOQNyOmSaqyWxg5ye+hJrHi34leI9KMq3TaLpsn3LPSo1sw4/4AAxx7k1zVh8O4JhJJrrai16zhkmglEg5zw2QTn6muguL+1YhohcPyeJJgV6+maoPdRTPhRAcnGyNWkb8gKq7ZmbGn2Wj6KsC6dEYr1MN5ybLiXOOpVgQKu6hrt1cYF4/nnkL9rjWAj6FAvFc/a2OsX93LaQ6dc3UkKhmgkcKVXHHHat3Sfh3ea1aXFy8tpptpCSsskrk+W2BgHgfSpZSb6HNa7qUdx5ccRs4FQ52m6eTJJ93PrWOdSZUMv2mJCuB8jMcfmSK7/SvBWgzpbyX+oyTM/nK8EMZO0ruCEYznJArT8IeDZ4E0W6Tw1dXssXn+eHiEe4kpsJLHsA1K5XK3ucDo1lrWolvsNld6lE3dIu+PUCr1j4Y1jWNWubSSFNLNiVExn+d13dODXst/e6lZxYurzQ/D8eBn7ZeB3HA/hRTXE3XibwfoeqXt5c+LrzVLm62ia20axKh9vTDuV9etLmfUfIkRT/AAgFppc15cahdO6MuUEaxo6seeQPet/RdH8G6Pd3kq21u90k7JHCMysVHTAyc1yF38adBDK1t4Rnv9nEcmt3+4H/AIAob+dNl+Oni6/sfL0q2i0reSFTTbM8cf3zij3nuO8Ueu6ta6x4g8M39jp2hXcMF1A0InvF+zRKCMA8getYuy10NYY9W8V6Ho7RIEMdo/2ifg84wxHb0rxHVbTxl4hk+0ardTsM5LajeDb+Wail0WDTZv8AS/EllCvJCWys39OapQsS6nVI9Zv/ABn4At7s3EkGueKrwLtDzSfZo+p4woXise++N09nHjQfC+haIg+7LLD9om/NiRmvPIdY8LaYzeY99q7H+E4iQfrTX8f2MAJs9Eto1P8AE53GnyrsZuo+p0epfEH4h+LIH/4m+oPbfxfZUW3iUfVQMVy95o+o30yrNqkNxM33iZmuX6+mTUdx491XUVjgSK1Qn5UZkz/hisrVdQ8QJeG2uLuUlQMyW7fIM9MEflVKLFzJo62Hwqtuim+vLtRjkb1tYyPxGakhuPCmmys1xNaTOOxkkum/9CK/pXAXHh/VFunSa1mklUBmL8gZ96sW/g3Ubi5iR8WySMAWlIGwdyQPbNPl7sjmfRHe3HxM0yGNY7a2uJY0XCglIV/JACfxrLvviPc32Bb2Vpbpj70qmdv/AB8sKzH+Hd3PcyPZ73tM7YXkwGfHViM8AnpXTWXw3xa7mtpRP8uXkwI1ORlueSPwpNxRS52zlb7X9WuF/eX0kSngLBGkI/DYBWS2h3d+PNCS3JYFt7BnJA6nJ617ZpPh2K0kCoESDAiDLFmW4POSAeQK3YNHggjtrSaN3u7WAkLLHsWNDyBgZLNyOKjnsVyXe54EfAerppsl+LJltEwdxIXdn+6O/StnQvhxd3+mx3jhESSTEXmnasnuM9fwr37+wLXyoxPF9ouJxuitHABxx879lX2pD4cnvZs+ZEnG1p5Ru2jOMIi5wKTqPYv2SPK7L4Y2jRoJrqaVSflaCLhjznBOc1t6V4E8G6VdfaNXgeTTmimja4upCF84IdqrjGWzjiu20zRNOszcXOq3Ek/kMFFjEhFxdNzgYONqdaj1TVnh1fRNRvIo4rSHfbR28UX7m3JXK4zyzc8tip5pGijEXw5Y6De+FNMttDi0Jrr7PtuDcRI0oY45w3IYVQj+DmoaR/abjT47y0vLCWKeNXKnfg7XVc8dq3mNjqELCWDTb6VuNpUox/Eiqbvf+HA5sbvU9Lg2MzrBIJYe+QMN3qUymkzhtA8OfbUhkgRZX271Pllj0IPPrzXf+BNMMXiWyLxSQ401lCytluJHPJ/Gs/4cWsWoxqZZSR5YwkiBhg+gz1rrNKs0sPG8EUY2oLF+AgX+JuwJofVCith2s2YtddnliM0m+7IaNXbkeVIwA59VFTNeXF3oenC8BeWLVLcB3BzjORjPpnHFbeq6aZ9SfaPm+1ow3Dj/AFUg9fUisJ4Xg03T42yHfV4GMechfm24/wDHc/jWZt1PpppA8z9cZ70HIIOaaV/eN9ak2Yxnge/FI3OT8YtnxR4JHpqb/wDpPJWZ8EG3eE9R9f7Xuv5rWr4tTf4m8GH01Js/9+JKy/ghEf8AhFNSPQnV7r+a1y/8vTo+wegNGT0PNfH3x2UjxDBnuZP5ivsFWZZADXyD8eSW8RwADp5n8xVYj4Ap6M94+OrxJpPh3zX8qP8AteEFyAQPmXmub8Bz6d4d/tnV54GWWGYW9tvxlupDAY/ix2ro/wBoBFj0LQGdSyLq0RKg4z8y8V883PiG404vCkNxYRRzNMkUzlhJzg8jPTPrXRG/OzkqO0Ue+p8X3gtSLj7MLlsYb/lnGScYbntWd4g11/Fmi25sZLe61xDl5bR9kcCYyd+Sfl+teG3Ov7rJ7jdIVkO5GkB2sPX09an8AaTceJb6Wwubu70jTr2IhZIgcXLA52g/n+VW/MxU23Yyda14WXiS8mt74TySMFldcCKU8ZyB1Ar2b4e+JL+ZY2vdQhnhYfu4rRVjjiPGAP8ACvLtM8D2N5rN7Yi5mAt2KRRFSBJ2P06V2d2+maRayaXDcLBEifOscu4wkEYbjqc/zqWEbp3NvxN8QNU0/wARSRLMEWLBjiXHzjHOas+I/icuurpbWlxNaRxKTexwMFLEqRtB7df0ryLxJrl7q2tWzXSvDiFY0aTgzDJw/wDn0r0Pwr8PUvdLlSHW4DcTRAAxLuRT1BJ69qaQueTdjp/hfPDa+KLWPRJJ5Z7yRnv0nm81DEAMMD/e+nHtXuZTONoLY9K8BvbPxV4X1aK/0qKC2sEsltp7i0+bBBOX2YB5BFYGseO9asrlFbxBfXM0nMZhf5MZ6kA8fSruolqVj6ZcEA+gPWqWpXk9lp91c29u13NDGzpADgyMBwv4nj8a8Y0z476vaWEMdxawX7RnDzPlXf26daZ4i8U6h8WtLil0XfpEdkrC8M0pCtlTkLjOSAeKT12LU09Djdc8S63quqXeoXdrqNlfnBdETIWPIyi4HGPU5+9UGn202t+KNWvNKuJrTSPNj8meZVMjPgccj1r0ODxf4e8H+G1h0uVr+5hiEggUtvkP8W5mAxXnOs+Jn1DVdRfSrloYrvy3kzuPlkhd5UY4wSfyqdjNpHoHwn1ZvDOsXR16CdJdQZYV1G5lLZYE4T0HXPSvb5SEr5g8G+KtD0aWDU/FL3d0ySrHaqkZkiU84ds9/wD69fRd7qQj0uW+ixOgh89MHAcYyOfek2bQsZ+veO9N8OyvDO0k90kRl+z26F3C/wB4gdBz1rhrHUYfiOYJ9R1fVrN7x9trpVlEI1SMHqxIJYEck5rhNQ8V/wBqa/Pc+ILm40yC7h8qJtOY5QA/dbGM5zW7pel+L7cW+oabJd3Nlb58hbmTZL5eTn5c9MU43IcuZ6G3qfhzTtIt3F9FL9tk4gj05tqyLg87jkqR3wRWFoXxI/4RnxFbR3txEljIVglijuGmyCBiQs7HGCecYHFRNqmpeMddWI3Zi7lCxAiUcE9Otc38YfCup2sMN/pmox3ljEhjkhjIR4gR9444bOex71TVyLtK6Pp2yuIb+3S4tpkuIH5WaNtyv7girB4xivJP2b4WsfC99FNdwSTtMrfZYZi5gXnGQemc13viTxppnhi3aS7mJYDIhiG6RvTipeiNk9Ls22yx/pTJCccZJ9RXmujfHnSL+axgvrO50mS8lMcRm2lMAE5ZgTt6d69JgnWaMMjBlIByp4P0qblp32FjDg8sxHpinMX7DH1qVMAcdaVcnOeadgKpRnXPzA+1RGKVWDYLfjV4jORnAqBgpbgscelKwDElUpknaM8g0yXy2GMA570+SJHULjA61E0KkqCGwPSkBEISv3SWHpUypIMARnp9808QZPLYX0FSIBHkb2APrTAgWJ0yByDyQadsdzgMFHoKlCAn/WZ+opBuhB2lSD2zR5gRrFJg7Tke9KFlx2wOvNOjy7cqB+NSCIMTwOO2etMBPNI52kigurHK8epNK8aqP7p+tVrvUIdPt2nuZEhhQZaRyAAKL2AtM6jCkgMRwpPJ+g71GULMM9R2FeD6/wDG7SR8UrG7it727sdNt3t8wDHmO2SWCkjIGa9n8M+J9O8X6cL3TZmkhB2sHQqyN6EEf402rkKSehecFHIX5gefpTT5nHIx/dFTvbkHPOe4rOn12ystetNJmm8u9uo2lhRhxJjqAfXn9KVmi9C8qncc4x2qRlBGApbPpUgifjAz70mw7vmYn2FNAyJ4gicpgUixqigBio+tTtENuADj3NM+zjI4zSYECDaGO4ufU1KhkIyQCO1OMQJHABoyp6PuYdAelFhXEKyOGK8GonSVSAcZqczHbhm57nFNUqBx+ZpjI9zBsO69OgGKUShjjIOOuKd5iZwcZ9adtJPygAH25oYrkbDcOCMe4pRGSQCeKcobB+U7QadktwAcUgABQQDUgPHtUW3P96nCNRnjn60DH8HpzQV47VGHK8cClByeTVAZnirTtQ1fw7f2elX/APZWoyx7YbwKG8psjnB9sj8a+bfGXwA+LeqEtZeI9IkOOWYEyt7/ALxmA/ACvqcNhuKCMimpW2IlHmPg7Uf2VPHz2s1x4gttQ1+5BAjgtL0NHjPLFMY6Z6Y61m+Jfhtr1hZWlsfAt5pVlanIkjs2dnOBks2OnHSvv5kyeB+VcX4j+KXh3w1cT2st493eRHa9taRs7IeDgtjaOCOp70e0k+hk6MF1PilvEEsSC0meeFEzm3RRAMccHoaTT4pdUmaG2hackb08hC7Ac8HPavefiV8V9H8Tab9lfTYLLZPHOLjUbyJfusDgiNnbkcdO9cndfHvSLdj9m1G1t2X/AJZaPYNM2eeNzhP0qld7nO4xWzPKP+EZ1q4vrewfTJEnkO6JZFKkgjqOxA+lNt/Bxm1m5gu762sTEdsjTbcNjHAHHNb+sfFuPVb1byPRta1W7ThJb6cRKvGOFUtgc1lN8R/FjMx0/S9L0QucmXYhfPrubBqyG4mp/wAIKr+ItLXTIbjX9Jck3gii2hMHgBgOnSu4M9l4YU50/RNCRcfNf3Sbxj24b9a8I8Rar4h1YNLrfjF3Rjjy45Hb8gBj9a5lW8P2Um52vb18/eVAuefUtTtcXOl0PfNS8feHE1+/1lvEzS6hdRCKRNGtN4UAcYZtw7da5i4+K/h2yWSG20S+1p5G3MdVuykbtxyUj2V5zH4ltIwFh0QPnobqQtn8ADU8XjbUrYsLKG3sC3/PvCAfwNPlIdR9Dvo/jF4xuYtuiaHY6RHnAax0/eRz/efdzVHVL/xnqcCvrniZ7cPj93cXoi2jn+BCtcNqUmv6mqTXL3txHM21WcscnPp6VLZ+BNXvjloY7aLjMs0g2L16kcn6YqrC5m+hPqVlodvJvvPEUcz91t4TKx/4E2ao3Os+HQirbRaldlTkNIwjT6EAA4qzpnw6utSu3+0uIbJGw0q8M6jqwHv2BrrrH4XWXlTxsqnc2AXcjYnY/U/1p3Q1zPY5BviF9kj/ANC0GwtlXgs6NIc+5YkZ5FZ7+OPE+uyGOGeYRnJ8m0jWMAf8BFes/wDCCrBokenGFHgjfzJFUYMpJyNzY7DFWtM8MRwLH9nV5GkG1Xt02qeOFBOPfnpxUcyK5ZN6njtzoOvyWclzd29wYkXczTSHDZ9ATVv/AIQe/RYvMEcUjoJPKL4Yqcc+oHNeoajp1vaahJbzJAlynLqZd5Q4+6CARk1v6ZpFu9q0kCzSADLw28MjPKePlJ24/GjnG6Z4xH8PDfRSCG5klveiRxJiIHJ5dznj8a07P4XOVVTK0sijO5MBc46D15xXvfh7wbrF75ctzo2oNE4G23togmwZOAzOV/OtS7+FviC4nJefSdBsl4C3l8NwGOrAZyaXMxqmup4jB4Ft/sC2clivmbS0zbv3v+8ewFbOl+GLODToorWIyxbMhVUHcMjknn25r1K/8K+HrDT2ttX+IelwxkfvBYIWdx6EjrWU2sfC+wthaya9rWtQx4Cw2kDxL14A9qi7L5Ejl7TwgW2tEryIx+ZJhw3vjgnH1q3d+HbPRrQ313dQ3FzJ8tvaF18yViMbiOoUc8VvxfEf4eaTb4sfAl5cqDw+oToB+re9Z8fxvjs9WW40zwv4b0KFk2LK6+a6nHUkLSsF0iXT4Y5Yw1nZ3l3Js2tFa2hO9hz1xgdfTtW9pHgzxNqg3Xfh2YhGYwtdyiIBTkAFcDoK4rXf2iPEMsrr/wAJRFCBn5NNsev0JIrjtS+NN/e7jc6p4guxnBMl2IlJzjoGNVYrmR7s/wAL9dg09oWv9J0CRgFa8H72ZF5yFySB+VQraeG9CMKar8RI7loIkiAhjhMhCjAJO3OeK+dJtYbXdTjuDp0kkiqCkVxM8oPXknHWrEviDWitxJC1tpkcKgukcBUjPA7e9Ll0Fzo9tm1H4X2mrNqbXXiHW7ljllUtsk9jtA4rpIfjlplrFjRvBwiQDCSXsix8fVhn9a+YtU07W572W3udUeSRIhK374BCG6DPrVaTwuLG9tIbu/jaKUKZpImMi24J78c0+VIOd9D1TxZ45bxX4wn1PW3XR4TEIojp3zRqfRmHPrzmq15oX2mOOeFr+6iHzRSQ3AlQccEAg4NcNpOm6VHrhtrvVbiHRlJC3ltDl3P8J2cdea2ZtEt79w2l3epTQZI82/jC7jjoNrN/Sgm9zXutX1XTYS6TXDsvX7ZZKQ3TjIUVVn8XXl1bbrjS4JUCEM1pLLFtz1yCxH6Vq6H4d1PS7aZru8d4ZbXzYoBIx2MWULniu+1/4fX2neGVnv5InBtNzLE5DDIzzxUPQEmzyjwNqWoLe2n2ayluxMmBGkiLuwM54HavQfCV3rEnjzF1oUls0dhkRNOCzKWbkE1hfDbTPIu7GU9EkwM9QCrV6bbxrL48tzxzpeMkkceZJxUORcF5mleeIrJJiLu2u7Ylgx86BsZHoePWqGoarpd/caTBaXkTzSanA3kqQG+8T0zXV29myy58xCD1w+cVS8RW8QXTpQqGZdRtzv6EfNzzSjqbu56n4i8SzaRqFtZWUEc13Pl2ab7iIOv1PTFZK61qVncySSXe0ztkJKm6McDA4xt/E1wfjuFdW8Q391YXzKUn2tKCxCsucBcA56VZ0TxRdJEkN07R3Kdw+fO4HzAHk1p6D5mdjqervf694R+0Wj2sq6k4wfusBBJyp7g1X+CMoPhPUf8AsL3X81rMt9QfUPFPhYy3DXJTUZMMU24HkScVe+CfyeFdQHpq11/Na8/m/e3O1fAj0UnJHX8a+PvjtP5fiaMYzzJ/MV9eZZnB/hFfIHx7IPiaL6yfzFVXbcLBDc9//aJtf7Q0Dw9aHAM+rRp82QOSvXH1r531+xknuZQt3DNHb4RlhVmjDemSTx1r3X9pKRm8P6A4Zl2arG2VGSPu814npWjR6jAUjhmgvUlYBI9u9k6tJweT0yO1dSac3Y4pp2RS8F6Pcajq8Olz3UQ0iaXzZIpgACAedpPOMg8Zr1Px9f21pqPhdo0WO2hnZQiKQANhHAB46jmvEF0Yw3lwEucpC5zKq53EcjGOc+vvmrL+JdX1iS3Ooyi4eCPEK5GANv8A6FWjjd3MVLlR6RrfhW81vX7Ka13aJZTQyRNesc5xkkn8+tcd4JsIWs1Fxf2V183lRtk7gQwPmHnnofzrrdI8fRS6bopupN8UDNHdxsgJ2joSM9MVzKadb2eoLqdqtrp8ETuDdXBAQKxwAiDJY/hTsht9TvNP03Q/G1vc2F2pjgs5gsMkTfvOgyc/3c1saF8N7fQ7iN9L1iSVVGWhbAEnHfGOK8YsNW+0zSbL0G3MxQ+VGY3kTqDggYGSetdNDquq22n3bW0vl3rQr9nmi5AAAJGR3wDUPTQaktz2a11RvDOh3l54huLe3ijZiSW+XYRwvXk84xXiuhy2GvWllbafEL1pndljikKSRruzznvgdK6B/FXh/wAa6Jpdh4htotRuJMgrOo3RvgcsegJ+tcHe+HLXwN4qWPzmit5186Cd8MVTrtPPXHFT0Kk+qPRNa8OafY6A88tprVsq45iiEhDc8k7fpU/ww8JeJbbR7pbzSf8AiXagRJtnmMUxwOOPQ4rF0/Wj4wm+zNdutoIwqFCfU/NsGenv612t9r2s2Om2Gn6ZbyTlY1RtQvPl/h9DzmmgSW4t/Z+HdI1KxGo+GJ7AyzFPtDuzQhuOCe4qlYXNvafEPxFo2laPZzyXCx/v5OIojsUkAZ5B56etbo8FxXli1z4ov5L7ADOHfZAucYAB78frXNQaLa2Op6uyRsVinRiVwWWLAK8jk8Yq2JlGH4M+IIoLhf7Vto4ZWab7Gy7lbg5HJ49sVdvvEk2hfDTRbK7vZIbGUyW80yq26IqT8mfQYxXP3vjLXrm9jhbWJLLTpWCrcJGzFRz95QCcVn2fh6NtLk1DUdZa40Zb1xDF/wAs533EMcepOeMd6yeoXRuaENBtTDq08sesXpBMEUHCL0xlckE/Wuh1j41W0emmTTZfsmoQyjfZ3C/eGecdMVkfbIIrUQ2Nh5kKrjYF8sAccY4zXn3jfRL3WL62ubfT5o5cbCkSfLIATz9aqOgX5diTUtWvdU1y4ntpn06G7OXkQnbHkE4Jz0OKpaXDNbWclxqF6DYxSN5mx2KygDovJ7D3qbRtdS+0a30q6cxx2z43pgGXIxtYfpXQ2ej6TZXV3bNcRxzX0QjNu8YMduduNxPTvmmyUrmj4S+KuhzeMdNXQ9Hm0/yVcTzKTuuFxwjL0znBz14q/NbyzXt5f6wmrWcN5c+duKBgqdAuccDj9aq6R4mtvhfZQ6a+iR2t/L/y9oAEuRkfPurtob+78T2KG3142ryDe0MCjGMn72cZqWWtdDx7x7Z2djqVlFplzBd2lym4wQszlMEH16np+Nez/Be/162cabqMMUdjJB9phUsTJAPu7Dk8fdBwfWvHvGtlqel6e93MLO4USgG7tFCtkZG4+g/+tWh4O8SeILBbe68P6yt7qOoPsNo53SsMAZOeAB/WhbERfLI+qZZRbI8kjCNFUszPwAB1J/AVyehfF/wr4h1OWwtNTQXCHaPOGxZPXae9eJ+JPEeq6fPqmmajq9/bx3xVp0mIYscjIjOcY9hXLXPh/wA9oEF7FPGu3ywIiQUydwJA60/Q1dRn1+LlJlDIyshHBBzmng5AA4FeDfDbx/p+g+JLzTRGLPRrhgIdowqMB97HXBx+or1S++IGl6XbXUrx3kot0D/u7VyJM9NpxSsy1NNXOoK7sZ6CkbGMYrxzTv2iUWXbqemJBGxyBG5DgZ4+VsZP0rsE+MPhGTTo7ttVWLedvkFGLqfQgA02tBqSZ2PAHNBZCvQk/WvOdL+Nug6lrg0y4W402aR9kEtwqtFJ6YdSQM+9bl/8R/D2mJIX1JLiSMEtDbI0j8duB1qbsd0dOV3EbRgdyaQrsblQy+9YHh74keHPEFqkkGpRQu3DQXP7uRDnBBBpuufEXRNHmhiMz3bPy32RDIEHq1O3YLo6hURgMKBQSF4zj2xzXPv460VtLa9ttQivIwOI7c7pCfTb1B+vFeceOfiTr1g6zJMdLtPuLDDtaTdxjec4A9smpuwutz2QKp6jn3/pXH/Fi9h0/wAFXRmt5LnzHRUSNC+CGzkgdsA1k+Avita+IYba01HdZamw2+Y6bY52zj5SO/1rf8f6iF8Oz20NzJHdPJGHWzmVZ40zy2MggcVVr7ibTWh8w6po13rPjW8u7eOGNVtBdlVbyyEC44HrkHivTfgJ4h8Ta5qoF/fW+n2lty1iIAr3Oehz36Vy3iK3eXXmurgRS3aafiOS6YEuBPKBkjOflA611PwCsQvizUkuvKe9gtwgaMKVPI5Q9xzT6nNFWZ7h4l14eHtCutQS1kvJLddywR/ec+gr588TfF46x4n0PW7bSAbjTjIvlSFmBZlPoeMV7B8TJLVNDSKe9l0+4kk/0QwsUkeUdFGOMnI6mvlPxGIpZmM0mp/aC5kdZXKOG5wDzg9ulDk7mk3bY+qPh98WbPxmILKW2kt9ZCk3MSIfLiI6Zb3GK7ZmB6D8PSvmH9n23uD43tWhv5Jbb7C1xebzx94hQxzz0NfQF7438P6Tn7brdlb7Tg5l3Y/LNTrcuErrU3Qpz1P0pVjbnDViWnjnw7eorwa7p8qHnInUfoap3HxP8MW2s2umNrFs13c5KeW25Bj1YcD8TTtYu6OleFs54J9TUbxup4IzWLaeP/D+oX9zZwatbPcW+PNUvgLnoMng/hWzFcRXI3RSJIv95GDfyp3QaCbHP8XPpSXA8uKSVztSNSzHHAAGTzTpLkLazyRKtzJED+6icElvT2NeJ/EH4m+JLG5EcFvLp+YmSW0kVWRwVOSDnnAp2E5WPadPeK9s4riI745V3KSMHFWhxxXjXw5+L1+1xb6TfWD3sckKtavZKvygkg7uR0r1PxHq40bS7m7VVlaIcIWABPoT2pPQlO+po7wDxxS7sivmvXPip4ivNQaWK/mgiRgPKtmwifXkZFevfDvxFqevaXJLfRq6JgR3I483gZ4NRzXHFps7br9aCue9V3vIolJeWNAO7OB/M061v7W8/wBRcwz9v3Uisf0NXcoc0fORgUgznnFScNkdCO1U5dV06CQJJqNojk4Cmdc59OtFgLOB1zikMyjI5NErQRFVlnhQt0DSqC30BNRvhOuKNhrUkjfkEdc1554r/Z88JeNNQvb67S/trm8bfM1ldNGGbGM4HsBXdTXUVsgeWaOFP70rhQPzNV7vxLY6bptzftcRTwW8ZlfyJFfgD2JpxkKSTWp4Rq37DnguZi8OqavDITwXkSQg/ima888Vfsq+G/AAFze/ECbSYXH7tLkRgt16DFd9rP7RGt+Lk2aIw0GxkHyyIhmumBPBIAO0/jXFzeFH1C+kv54dRu7+TG68u40Mh/4FIwOKt3ucz9m9FE8q0XRNKFtL9v1C/wBQmErKiWOBG6AkKxOCeRj86uX3h9ZIcadoCQKes9/O8jAeoGQP0r0OPw1awyYnuZ4oB1W41CKNRx6K5rNvrjwjZSMkl/4fgKH5pJHluH+uNhFCbMrI4Gb4Zz6h5IuNQtnnbBVVUfIMjsoH61IfgXJcRwxQBp5BJuYhCc//AKq9I0/4n/D7Qodi6v8Aa5ycM9ppxAHPbcBUn/DQ2iW5ZYY9YulC4ACxxfLz/t8Cq1JcYJ6nLWHwQJSUxRP5Z/d/aCMs+0cgdh0NTr4A0jw/mE28VxdOvzSSE7Il+meWql/wuLQbJClj4SLRli/+nXrNyepIGajf47aokbvpujaXp0Sfxw2gcrntuIHNK0hpwOiTQ4bldig3JVdojgUszKPugY6HpV7RvhTr2tBWuNKvD02iSIpGg549zXAN+0H4wuZRGms3yqcDbG5jXr0GO9UtQ+IviK8lCX95eSFsKVlnbhieAc00mHPF7Hsy/CnUdLvxPOun2FngCRdSvAC2O+OD+FJqNh4esmiiuvF/h61hiyTHEWlZm45J3c/SvFb3Rb8y3SXDQLPAVSRCQzKWAIPPUDIrFlF6sZS3ECNgsJiuXIyBwMdaLBzW6HvDeL/A1zatozazf6pb5LSpptqsYkOSeXIJI/Gm2fjvwH4djVbTQGl2jC/2nquzA7fKAMV4nD8ONUmZJb65lWSS1e7AxkhRuIBHvj9asJ8Kb+31r7EttJNGIhMsiR8EkdKNAvLoj1HVfjdp1mtzPpeheGLWfquYZLqRjj1L4/SuYk/aL8V3lsTHqw05ujQ6fp0SY+hKmqU3wg1X7L8kSLPsLbnkRVORwOT1rYtfhX5kEZj+xQOlsif60MRJn5jxnNF0ibTZxes/FvxJqO5rrXtcuF9BOsY/8dUVljUNXv7Eag1s72z8K95cSOX+mW5r0aP4Y2U2oPFGr3KpAVSKG0chpT1OSvSptN+Dmp28Nvbf2XqVxDEMKhQKqnHOMkUcyGoyZ5q76n5EzmO2tzEoJXyVJ56Yz9Knk0uQRg3HiARhv4YkUdxwcV7VJ8DLuezdIfDziWVdrSXd4iEfgGNaFj8EILRU+2RaDZ7QAXn1EE9ecjmkncXI1ufNV+sdrqCBLie8tBjc8pOST6CteW00mYXEcSywssX7uSU7g7Y444r3y/8Ah14Ks54pbjxP4ds/JGcQ/vT/AOg81SudQ+GtmjwyeLftPByLWxPHHrinzDVM8Y0TQYTZk3MRuHH3FhBXc3fJHB7VYufBc1whi8u0tLcP5knnZYowPfJr0d/G/wAN9OvGtlk1HUdP+ztlCmzbLngjJ71dtvi14Es7OOO28HtdvtAZ7plOfrzRdgox6s8qsvD+ua2JLmLUZ1QNszDGqIQPQ4quvhS5t5i094ZBLhXErkt06npXti/G7TdKWGGHwhpdkZfnjiK8sPXgU5P2gr5JCLTQdILgcbQc9P8AdpXY7Q7nm9r4FWRtwlF2W6eXC7E9OvzVdj8A381xHb22mTCVxuRDCyAjJ+bmuwvf2nPFSnybbT9MhkOQFAJyfptrl7/9o7xlpWqz3Wo2dnNLPGIsSxkBVHQDjjoKST6D9xdTV0X4R7NTaG+Rbq5hQPMu4rb249JCOWb2BHeuybw/pVhZiaOVrm4SRApxtjHIBCgf1zXnGh/Hi4+wTW2oWN1G80xnlvbIgszEcZUkcDn86kvviDP4ouraysNZu7u7LAxW97ahAGHuCaXvMalG2h217Ck7MvT/AENMEc4w4rtvEOt32p+EHiZ7W5iS0KmRIyx4Tuc9eK+frvxVrS3QkmgtZWhHlZgnMZwCPapLf4hkJOkwu/LkjdHVSJVyc988UnDZhznW+AbqSE22VHk+co245+4/+Fd1p063njaORATGNOwAQf8AnpJXnHw+u7nVoXi06xSae2DTNNM4VFBUgd+vP869B0Dw7c2l7p9x/aemC5+xmO5tGciT7zNwcYz8w71EkXB3Oyn1CPT/AC0EO+aRtkcSg5Zqr+ItOvdQ0uFCUaUXCSNBECcAHkde1ed6144vbHxHHNBaRO9ujRhN6sDzgkEE1u6F4z1jVdVsY00+2kd15MZJMIBOSeKUW0aXTNeyQXcUpT7Tasi/eSM5DdmAOefX61Uv9Ph1DypJ1eeSAkC6t2KyqvGeBxn8PWnO97eG4Fy0GpSCQiO63beACCAD19MVWubg27maZnQgbWeYD5l4HlgA/wCc073Fax1+gxiHxN4TCb9n298M5zu/0eTnPeuo+CCb/B96cf8AMWuv5rXK+GrdpNc8GM5lAGoSBInbiNfs8mF/AV13wTXyvCN8P+orc/zWuOKvVO//AJdo7kqVfj7pr4/+PUW7xNFzjG/+Yr7CJzIM9K+TfjlAreIoiR1Mn81rWsrRJp6s9Z/aIsXvNC0NEDN/xMk+VTgn7vAODivn9bSDQrdGjlmXUMnCmbP2Zcjdk45zX0l8crH+1tB0i180QiXUUUyEcAZWvDbzwAt7rIstIvI5lhUmR8FEjbIzj161pTtzSuc1VNpWOXspReapa2zQOZLh9kf2Y4WSQnjdx1/xrqvFHwj1Twlp0mo3kNjNZx4MqWrsskXUErknJz7VXt/CuqQao8FoqRS6XMJZrkybFMgwy/iQRXY+Ldc1rxTqGlW+o6U0GkRSiW6+zssnmOAdo69AefwrpbVzmSutTwHxHqw0y7hg066F2JQGwUHmIemw+p4/WtD+0Psdqs2o28kd0BujaU79jZHzbOmeP1rqPi2ljb+K/DGpWNjNZ3rTFW22+3fjG3Axya0bv4aa5rNidQttHvjq0/72We9uEQOuc4C7v0IHShtEqD1Ocisr6PT7toJYV/tRV81ZDukJAydh7cEcVj6N41jsLyMNNLaRKwRstu2Y4YYPY12OieDte8RWElrprT6XDG5S7mvFyQ+fm2deMenFcI/wt1KHX7zTLYYlt7z7HvkJWNmwxZ8/QGpVnuDUlsek3+paB4g0m9e+gTRktf3kF7bvjzsjIAUjk8Vxs2pya5KL7VZS8zqAjcfu0HQY9cCuub4daPpumG3vra51q5gUubqByoHAyRmorHwdYzXd1HDpd9lFjktZobtWadHwckFuOtJRKd3uZPhXxbc+DLu7u9O8rz5odkb3Kf6rnkj617Nq3xQ0iHwvZ3VxdIlzc2okWBGDsz7evTjnmvM7vQLLw7qKPqlhdRaXcBUhu3be8L5OVO0n/IrkZvDdoul3LxW1/Lq63Pko6IyptY4XJOOoI/OnsCcomjd+MtY1CGdL3UZLi1uWaMr5gVA/G3Ix1Aq9p815B4rfR9Z1SWOYpEPPicBXO1TGjcdDwM0H4Yas9kBdTqlxsKxWMALSZ4xux0Pv7Vw9n4e8Ta1qmr2dyzR3MLrFdPcEkooAx+mKas9xXktT6G8JyDTBcW19PaTusfmmQurlVGcocj+leTHX1OqpfWdtI+mrevMljuPlfezlR+tL4Z8J2+hBYmjS4uMDPkIWJAzyxIHFdY8TadZW8y/uzJnaFRlUL3I4wDSsug220Raj8QVvFEFiRukUks33w3GVA6Zx7dq5vV/FDXuvQW0ZvlnsEV0uEkAVZOu1hjnnitE+Brnx94i06PTpoLa9G9vtaoVAUYwWwO9HhD4Yajd6zqV7qU6FbW7aDHLCaRT9/p0B/lRZLUSuzlYzqWklNS1SOCV9RmJjRBjaR1bA9KvazqmnWMscMWrrc3kpBNorBuMDq3vXQ+OvA+oTWray+rrO1ttj8hFKgBjj5cD1rE/4Z/sP+E88NWV3eTvb6pA086x5VlYDoD+FTdMrlleyE8S+MtRtvCbaTdR280s8y/ZUlOZIsdSD6HpWx4PuZoYI9QmJuJMBZJBLtUYONgArnfFHwql0DxbqFjoyzXFvbbd0z/KyFu2T9KklsNVsLVPNtN8cPUqQ4HJ5yOpoeuxCunqb/iLX0g0W/tbaUSW04CFZMfuj1P4cVm/C/VLHR9VzF5r6m/yoxI8uEeu7HSsyDS9a8UaSbowrPaRkqF8wRs+Aeg6mqek3N34eDKun30N/L8jM6Ha3HQdqErKwJtu5678U9RmPhW6N+9hqqoyiGWP5Zbc7hgjnkdfzrgvDWp2cTqbqZoLfbtPlNmZm5+6O1YXijWPEF1Db6JDplyhvGMsjsPnnVeQB6AVz8JvtHmB1GzmtZSQVmdTnGTgZAqraDb1PQ9TuLfQtZsLu0mee1kxJGJ2BdSv8DHHqK9vvfilZ6h4NSZLprSe6xCjRgO4YAZAX8f518u3s2vaxLZ2llp1z5cKGWPzm2Fs9WG7Getadv/wmVhJFI5MAU5UieNdp9fvVNnYIytfQ6STwzbeKvE95I2tSJOJfkW4j2tkHGcZxXUyfCtY9PSA34SJGLs7rtGSPXP6V5V4h1fW7O4iudVAeadsrIZVbcQc9j7VTufiBd3OkxWktws0UMvmosrE5z159sUrFKS7Hu3hy20bRNENhZ3cGoX6MWhuL5P3Ub4PKjOSR2yaxda0G30+4iuEvLgTurO8kYAMhJ+8VA4A6c+teQW/i27vJVm89MnhY9/Q4xkV3Ft40urnUG0qOwuNW1AW4wbJlZmB65yQDjFVbQV0zsfh5qMOpape6ZeRwfYZbeRrgMgEqkZO/d6n0FZXim8gtdTM+iXE0FpCo2M0g3OuDliMYIqLTLPSbGWOXUtI8UJNnLAeXtBzyOJOlVfFU2iXau9rZ+JLeURFF81gVBznkbuntUdSulj0L4T+LtLZNeu7z7Fb3Rjj2GMYMoCrlsdifasvxz4jhuYMGCMb5txMbhgUH978xWd8M/iBovgrRIrc6BeXGoEHz7ie1Dl/TGece1Z/jfVtD8Rw3F3YeHbvTdVIzHJawEK5J53Lgfyo0bK+zYyvEdzBo9sl8k80ht5ElFrG/EnzbhyB8vau+T+1rUXnijUbPTolvYFM1lavI0/lkZBDFiMjjoO5ryGa91K9tWgGjXyNIgU7IHIOPXit6X4i2mkfuD4Y1c3USgssbMXUAHLYzwOaZEZW3NybXbLxjqen2ulM1/LLZCH7MFAkB8xyUbjgc9a9S8KeB7Tw7dm+1N4ornyzFFbW0pVYFOMgtnk8V852nivQLTVf7fOj67Zz3luWhFu2MgMysxIbPUHP0NOi8bWetX5t7Lw1qVzdYZwJrrJ2jq33un+NHK76FKS3Z6/8AErRJ008vo+s3N1FA4nSxuXEjI2c7kfGRjj1qkND0XXfC6Xk/iLUZbxlXCtChXzCpyD8ucde9eV6Z8QdSQhNPtJlWU4URQySuBkg4bHH51r/8LcgOly2tta6lHpdsuZJroOMsflwcZ7nvTUZdQck3c6a08PXvgmC0unmivYImIuUhk8vdEQDg/TJ71R8T+K7PxfqsFrEsFhpatzcLGGKLnknv+dcxqfxF0qa0tlvUKL5beWs0ZIC+xxk5NZmieN4F1a8s9JFx5eoQOl1ABlQg+Y7c9DxTs9yL9D1LT/D+iWl7Har4j8/SmU/v4bVBIr5PBJB4qh4s8LWGlKrxa/a39m3LIwQSqdpI+6Bnn0ritI8d6AqIY/7eVVAVgoXBOSOhb2rU07xb4HtpZ0u7LWp7h4CsCSbAIpSvDEbuef507PsN2Nswx2elwPp0H227ulLyTeWWRAOOgIOfxqTSY9Wjiu7iO51DSbm0KZgRzi73OFAQHO3Ocd6qx/FPw7ceWDpt7FIIvLkNpciJWIxnhWGCQabN8VrK3uJzp0c9pKrQm2kubrzCpjdSwfk9dp/OptbcNO57L4G+H114c8/VNR1e5sp7jD/YoZtyRrjguWzub6YFcV8SbW8vr/7TDqD6rDAhid9oVoiVI5GOAcj0rm9X+OqX8xea1Bc4YAT/ACB+ecZ6Yx+VHw5+I0N5rWrS65dFrC7t9sgjQsrt0AwKTZrdbIyoJtQt9b0i2tbiSxvAiCN9+NuWOR05BxXtXxB+369Fp9jJrdnYiTjZKpCzyDsWzxXifiiW2tPElndaTdT3NkJBszGweMAj5enQZNdTB8ULifWL2LUmj8kSYg85MhV3dTx1xU7CWmh0tp4Bi0bw/c6nrYaS6t2/c2lq4eOTGcZOOQf6UzRvHEtlqV3dtq7aQZEGdOEIlgGF6qeormrvxjbQ3qTaNeG2yNktvEjmKQc9sdawtQu20+/W/S3f7OSDJAFYKowCR071TsyU3E9AuPEsF14kvp9RvINRhktw6ywq6qgHqobvxXKeC9fi1bxk2nW9usFvqVyH3pI6PEgwPkG7vj0NTeDNGfxXZ393/a0OmQXUu024b52UH36DpVjVPhg9h4h0tdF1KWAzo4a63bjERnpjOM1CRTbdmdvrniy10HVktLvxBdy6MqHzLNVDOGxwC4wdvX36c1yviTxT4bGq6dd2Nzb3ekXBKT2Uakyb+zKc5FZFt8M9S05pfM1lRC+D5nlsWY85zxzmsSw+Fj38TXzai0N9FO0caxxkIMdCavYTlJ7HXXPxI066kkNzpDTWx3YzO5lT0A545FRxfHzVotNh0q1iSzkUMsV9dv5jsNxwAOORxya4y0spJdSuYJpA7Wr7eMgOc+v51QbSMa+sdu1nBApy1xeyAqjZPAFF03YjmluXtZ8ValrEjpqcqX9wq7mN1dEDp0wm0VzGp6tcWFlOLaS0gaVdpSK9kAde4ALGtXVPDEB2vDf+H3kB3E+VvycdcbayF0C7muv3V3pbFm5MOil8fT93QkiW5M6LQb7RNMtIJLjxFHBlAxtdNVTIv+ySQcmqfiLVxr0TwabaXbKw2rd3l3IW/wC+VwKw/Dvhb4h6XPc2+haXbmMylhPJp6JuyeuWAxWvfn4uaLA0kmr2sUi4As7Uo0rfgucfjWlhX0MLS/hXqGsgrPKEVer4Z9/HbmrB+Bl7HOk0cM84ibcoFsfn9jzWxaal8YzDGz6zqcUcnASKYKw47gNxUV/afFC8vLa2bWtbuo5RmWQXbKEPoTmqul1IUV2IE+Cs8t1LPJpd7iZmZokj2qCc4x9DS6d8A9Rsp0kSGdxGwcLLHwT3BqneeC/GLzzJJr93bbCctdakxJ57BSf1xXO2/gbx5qkj/wCnX5jyQpa7cAj15pXb6lWS6Hd3P7PN7qN3NdSGe3aV2cxRxjaM/wAIya2bP4GyWlnFaOJFtBN9ofzJFBYgYAzj3NebWfwo8QyXOy+uZymPnLTlsD1pdV+FM0ZQW8w+6cpMGO8/lwKd/MNOx6HF8GvD+jTtcT3VuGLbttxfoqqc5zwtR6rY+D7S3dbm/wBELthi016ZDkZwcDHNebWPwzm+zStc25DozKoVOW9MZ7ZxTtP+FGsz3IiuVis4tu8y7hx14GOp6cUvmTdrZHXx6p4TlumefxDpxfGT5Nm7k8Y6mStGHxF4Isp1dr27mZ8hWttNC7voWJrkLP4T3se6S4vEBcFQIyTkdq1n+HYn+yCabaLaMoAud2cg5HrSuiryfQ6K6+I3hC3VmFrr9yxXbuLxRgjpjiM8dqyrj4yaBFKYoPCuqXMwXIW4vwDjHXhBVU+E7U3cdsiuSYfNeVlIjXkkA+pNakPg6Kz1SHVUbzL1V8qXaSN67emOwzj8qLopcxiSfH62Tclv4OsUc9Dc3EsnA7/eHSpLf9ofxH55tLHTdEtH3bFCWZbJPpljU8fgGxkJieCPzxvIduBIHOcH2GaZF4HsdP1SK8s7d1Ta5IQ4UbuM/hmi8Rvn7jNL+NfjzX9fttIi1i3sDPMIGkgtECRnOPSud8TeL/H39qXdk/iW8uHhlaLfAQqufbA/r2rutI8PWWnvm2tFSYjbvKnceT3I6881Nd6ZbIYDs2Kz7U8vIG7bzk/1ocl2I5X1Z4rqM/ip7eOa61u+lWSQxgNcsOfw7VLqnhrW9IQtdzGdQwBbzmdeTw3Xp/jXpmuaVBJNp8D/AGiWM7sm2UtGvOME+/FaFtpRiY2lpZ5lf78Ee6cE57quQMUc6XQXJfQ8Uh8N3OqWF3dgjyrfIzu++3p+tdno/hyPQ9MsZ9MRLlp4w8zSIJA5K8qCMYr1m3+E2v31iZG0mz0+EEMBfusfmdeiDJz9RWp4K+EltPpb3d+2q28aHMlv/qYhj+5g5IP0oc/IqNNnz9rGmRatrF0jxm2aG1DeWrbQGBNaXh7wXYXGjQTGR2mkXMn7wcc+9fRWn/DjQLW4lu20XT7eORMGW9O9yvuT61sad4S8Jm1mOmaLp10wON7QFIwc+pXkUKYexd9z5an0eZdRngSeIyxouy4nkz8veo3tpItQs5LXUY5lt3TlVChumR7ivqeb4XwtOl3DbeGvtBXBT7JuXB7BtlWP+Ec03RYZJLjR9FjxH8uyEKu7b7qKXMNUe58t61pHn69eqJP9FdQ6TRsAQ3fGBWbe+HJ9Qimh843MgUsm5s8g5BHH6V9TWPjM6bo5eTS9GsJY9267kUJER22jGT+VedeMPi/FqjmODdqUwYKsip9nt0O704LD8KOZvYHBJHk+leGrm/0mCG2hmkuC2XSOLJ+ua63wj4HvtD8UaTeXlt5apOuLcy4ck44PHArs7u6t9E0y3uNZ1p7tZWTOnae5jiZTnccL1xXqthD4St/C4u7OHSzpE68gxjdJxjBOM5o5nYIwR5L4v+D99Z6nbW9x5FvLq0xVLeBslEHLNnnjt+Naeo+HDo0cWh2llb2lkECK2wM9x6ncR1pviTxje+G/FyJaGS5t7WPZYm5BJRWK5VSe3Arpj4ktfEemRtqBilgGPMDLh0bPKqOtZtyNEovRnF/DjQ9Y8LW+sQLZRfZblQRNcOCI8ZPBHU9a7TTr+awezhD2CTzZZpJYPNEK9C5YY5OO/tUsl/YeHNJFtpV3aaVcynKvKhlZVwcfKAee341zj+JzLFO0VvJqDxHDysdsM8mBnIB5PQdKE77jSUVY0/iRoDrcWOtPHaalplsoFxHZxGF2DYwScnqau6B4kt7qNNP/ALNg0VJ4g0KRf6yRcnjd1zWV47vbvUbUxXWs2UM8MXnNpUPAUZGAxA6/WuAsvEkltd2sizMJ4SDHIS2RznH0p+Qm+V3PXvF76ZJpJtYJFgvUAa3iRwGVseuOe/51jaZpC3VpFLcs7zAZdmbI3H29gBWFpdk3iOxuLya7tkugxm82WbbIX64Ge3Wt+wne7t4Xt1muHKnKwjgHgHk9qaSQXudpohSDxB4QRX3f8TKQE5GSfIlyeK6f4LyB/Cd+f+orc/zWuF8Pw38Xirws1yiRQDUn8uMEFh+4k6kV2fwRYf8ACI3v/YVuf5rXDF/vT0f+XaPQf4xxXyT8d5xH4ggB65k/mtfWnmHzOemK+RPjwu/xFBn/AKafzWtq2qJp7nvnxwKw6Rorg4Uaih9uMda8wPi63S8hCwDPKtImFXk+nccV6b8Z41v9L0G3kiWRXvwCjkAHgV5kPCjxXsXl6fpwjUncHlyfwx1rSNnKXyOed1YpvrttPZ31vE7+ZcXBaV4+DjAA6/TrTYPE32a4jkjmZoyQpEg5A5HrV+bw3pFu4ElrEkjjOI0kJPP0rMm8EWk5BSG/yef3Vrx37kU7amOpifEXXIrzxL4JmI3x21279ME4213d58TzckmDTJpCT/z0Azzj0ryzxL4Iv7nVtOn0zSdQvdPsyWnE+1Hc9wgJru4/DGlyWyvBYahbyHpDLGCy/iTQ2EbpnQ6f8QI2RVbQr4EdfKwR/KsWTxbpej6kmp32m3Mdp/aTySCZcs25XAIGe2aY2iWunRLKbaQgnYUuJlgBP/fVRNf6DDNHFqdhpacb4/OuTKGOOcdeapJJ3Bu+56bYeKPC3iG1P2ea0dX4McqhGz6EVy+oeD30jxJcapp1sJ9Jmt0i8i1cmSErjG324rl77xxpW5f+JZ4bgiXOFmUlwPcAcZplx8aLLQIQtr/YVmOuIbd228/7lDv0GnHqdIl7FdjyW0y7MasGEUkXAb1we9YXiGfVbi+1dU0S8WGZbc2kiqAC6FCSePY1lP8AtHQhkV/EUb7uiwae3/xFdBYeP5PEmnQXtnqb3cFwrupjtcMVXO44x2x+lS+Yd09ja8I69e2mnBb3w5OLvcd86MCXHGOorifh14wsb74p+Ot9rOFmljKosW8qVAU5/EGrF/4mnv4N63Opi2lDBZIbVgrDjIBxXJaJqegeDtTvLqxudTgu5OLp4GdcnPRj65qlFW1Icj25r/QJ5C0sU0RI2ndbbeDnuDWquh2P/CP3D6PcJc3CRM8NvcgMjtgkLnqATXims/Ej+zY7meK/v5xaFPtEb3bBlDZxgZ56GsK8+NVvcxMjJcsgGWAumBHHsealRa2G5o9D0rxRqt2sWqaXpUKXklu8DKsZT7MxYZyM/P046VVhv/EXhazS1t9HmvAC7Pd78Fy7Hc20/U15vN8UEsPsiw2NxJFcxtIjC4bCYI4696qyfEm7uroQ23h66uJ1AJVC7bM89R9RWuvUhy7HV3uq6jqGmQWkcstza+dHJ9mnQRsCuSwLZPHpW3ceLLy8+JfhC9j0SdYYbeZGjMozkg45x06V5e/iDXJLaQr4IleQEFC8bncfXJFWbAeKbuJjJ4amikC/LJFGBk445PSpa7ApNHuFvfXZ1bWbqbw1NJHezrJGVugDgAjkbf8AaFNSS1tLG4hTwzcDzQ45ulIy3tt7V4lY+G/HtxIUmgubZSCXmkeJUQcYIy1UdT8OeK4pN0F/FNb/AMfnTojnnsFJyKST7j521ses+GbePS/DtnY6h4XmmurdNrTw3gUMcdfu8VDrOlW10ljJZ6JfJPb3sc7eddq4ZR94D5fSvIz4D8RXoiVNWt5Bn944kwPYe/erlt8Odce4lij1CJlTgzF2Af6Cq07kc0n0PTPEviK3h8Q6JdS6XfWyq8kRmdw3DKcDpx2pNZ1PT57aa2ns5XgdNpyQfxH061wrfDK7WZHvtfVYerERSMUPsNtVF+Gt9eyMINZe4iBxGoickj3GKd1bcPe7G4+rWN7qWmXmtSxL9gs/sOVLbXxjDHB64Fb39o+FZ4gI7/TJg3HKSEn6fPXHW/wL8Q3DGOCWZ42Xa0httuRj/aArtNF/Z+vLS1jjYXszIOHCqoXP40rpglLsQPrnhyKdbWR9LlaIfMWtncJjv/rKns/iX4RtG+ztc6IoGORppIPPrvqpN+zdqSalLdRajJbBgylZp0GQ3XjNXdF/ZysrW7t55L/fPAwdAQXCkHPO3IIpXRaUuxsL4k8OX0JQXuixAqRg6ayt07fPUMl/oOmXMN/aX1n9utlIiNraOhIOMgnea7m+8PazNcJNLqVnMwAAB07pxx0Woo9M1JJ8PLaufX+zGI/9AxWXMXynnviPxhpto6NNbG7vbhQ0UMMrgQ5PVjzVPRvjEmn6Y63cUEEkTgc2zyFwc8gkjpj9a9vsdAvtof8AtCwgJGMDTFB/VavNo1+EwNatfQZsE/8AiapO4+R9zw+X436ajYElsDnqLFgPx+amD4828d8sCRpcIBkyxAIB04wVNez3PhvUpUJ/tyzVOhL2ESj9RWfb6W0N60cmt29y8YywhsYyPzAxTSQNS7nDWvxZlmAZWt19Q8WTjP8AeGP5VzOs/G7TrS/a+srGK51NkMEt2bVtrJzlcZ56DmvbvIwTi+jOf71nH/hUc2xYSjLZPz3sk5/IU7pBZ9z54sviLpd9GjNplos1vDJbqWVlTynZmK7fqx710lj8VbDw/ayS2NlYQy2sBSIJblmYEgbdxPYV60pijQjytOVucL9jTBz+FSPcC2t5pZE0d0j5bfaj1HH3aFK5HK11PL9F+Pem/IRf29jHtX5BpHKtnnBDDNWNQ+MnhhrNhc6pbPbEDfGNK2h8cjPzeoBr0yO3eeNJDpmhKrgMP9Hwcf8AfNV7/QI7+HypdL0OSIkZUw8H/wAdpcy7FqLtueSw/Evwb4ggWZZ42jjBSMHS8hBjOPvepNTN8QfB2m4Jv4oGbsNKAb3/AIulem2Xgi3sixi0vTYkk++LcbM/oKmfwVDeTmd9IhaTGFZZVBUfiaXMg5Wjzk/EjwRFEkx17T4MjAVtO5HPfms5/iT8PZZ1ll8R6dLMWDbzY/NnHH8VeiXXgjS13fatFvIkB4CIJR9eM1VT4d+C70BQyQzZyEvdOZRkeuUpcxXKzkbTxv8AD7TdWmt08R6et1cL5khNkNvbByTwas/8Jp4TiuWvI9YsZ7WJyss40tWjQk8ZYMK6K6+Eljp0Usx0bSNSDEs5tkQNg+gIFZkTaBpVtPor6XPo9rfMDLbSQgxuc/jRcVmtzKl+Ifge5lwdZ0decfNpv/2ddd4e8ceBYdANz/bWmrEsmx5YbZUDMR90Ak1zKfBLw9rjM9k1g8owTAYmhlUdspgZps3wOhFlHbLpkdzBG24RwXbR/Pj7xUkc09GLU7vRvih4HudRhjg1Fr+QhnWJbaPGFAznj3q5L4/8P6iFmi8OSzBuVY28fI9eleL3nwrj0m4muP7M1ezmZGiEsUwlQE4ycBj6VyT/AA3dEC23jPV7Z1QJiVJQExj0FW0n1J5muh9Inxfp0UZki8OlR1DeWgA/SqKa5d6yu2SzhihbrHHbA5GOhJNeD+HvDniTRGnFt40hv7eWFohBdTOCM/xcjr/jV3TLbxpoiQQ2c1texRsGO2+HzDHI5NJIbn5H0R9p0RLNIn8Lk7Vx8qY3H61xjXVxc6//AKT4XubLRVDbDZuXlLfyrxm81z4iW9673MVxDG7HaIQrqgz3I9qbcfE7xNbQho28yU3P2dY3TYxwBk/jT5WTzpnq182uvcyJpPh/U4bcAbZbhd5PvgYxVBvD+vTwtHeS6paQMxMiW9kAWJ9CSa8usv2gPFNvbRzS6WfKlkWGMic/M5zx147V0UX7QWvxpKZtLuVjQum+K8H31UFkA3dRkUmmPmijqovDGhQ5R7HW5Ou9pIuW+uDWxp1v4UsgFk0q5B/vT2xI/HmuPtP2gtThQtcWusRKrFGETiXawxkH5j9fwq3ZftNac7IG1LVF3Hb+8h6nvUcrHzR6nZWniHwiJXihtEtyh2hpLP73Hbn2q1qHjTStJsmmiSPJOxEWDbub61iWP7RHhy8t0efVAMnA+027Dn0+7VwfHDwtcoY49ZsxnkhXdcfpVDTTWjKtx4wnuYmM948EePmigiIxz6nOawLrX9P05Fm8ySISOFV/IJYtz/Eea7u1+JWnXkRFtrCzjkgJfAnGeuGbpRJ46tLh1jk1e5jbjaouI2zz1A3UrB8zhL/XRZzBGM4A6v5bEPx2OeKfp2t6hqJmW1W3REGSsspB/DjmvSI/F8JIVtXvW9d9rv8AwyAc1J/a1pO+5pw7ZPL6SzH6fcoHbzPN73XfsFxb29xawvdzk+UIV3Z57selWnvLm2kRLq1AmkAKxBsN36+1d8t7BcXWN1qFVuN2jPxz6+XVy4j0Sc+a1ro9xegf666088Y9ylAWPJp9UgtjI128cC7cmSR8BeOmM81RudSMtit3EgtrGU7YmmXJmPbnPSvVzZ6Bd285n0DwvNdqOXWJVWQ49SoxUVxollqcUCXOg+F7uKHmNJblSqHtgGncVmebRQIW+dIzKSGZUlzj5uBj3PpU0/2eHZFJNb2rs24I75fv+XQ16ZZeD9BbUoZrjwt4chU8GW2uE3DuDjPrUWpeDfCi6hM6+DLa6Yt80xmjQMfbLCiwrM8k1HWLGzlgjkuoojdZEax88f3vYVTv5HfT3uI1RYo32RXDSbSTkfd9c817EfDPhW5OJfBSh4xxgxtt+hBqnqXgnwjcxoD4MlkET+YiqgG1v7wwetFx8p5HBqMl7el5bDyHmC7IgTjamASx+oJq5BqBu03gMzMQ7B+CODnJHTpxXoMGk+Gg3lyeE9TiyeQAxLc+xqWDQvh+L0LPpOqW0yryRb3G08EYOFwaExcnmcZDaNfRwTvGPKdGMIcEfIP4s+uQR+FRXifYpihRVmVfMdAeIwSByO/XpXpV/pPw/wBQgWJ/7QCRx+TGBHcjYvJwPl9TXC+MPC3hKXxLoltpl3f28+oTn7TK7SKqxKpPJbvkCq0E4tHJXusSIqzrGZBC4SNUUncT178sfSuz0H4W+JvFcSXMemnSbOQq6zam2GHHURgD+ddLJ4H8KWMFosclyxt5fOi8vUGUh88n73tW8iWcgwusaqjEdf7Tds8d/mqQUHe7KcHwZ0rR44G1W+utTuZm2rbw4iRj3x1IH412ml6BbaCiRWlvb6WOn7pN8n/fR5zWDD4dj1Jll/tjVvPiGARdFig7Y+asXxNpdxpzRxL4m1pXccDypHx7kgGpa6mqSR0t5eWVzqRtrNv7RvUYCT595jbPc9B+VW7vw3qF1ZpFevcRQjBMNlHjPHqc/wAq8r0PwksOoNLba/q1tcM4d2htWQufU8DNdtPe6hptlvn8Z6nAgGN09vuJ4+matPuTa5vS2uh2duRKgiPVhfNlvrj8DWLrPj3QNGQR4S5fB2RwptQ8+vb8q8J8R/EK+HxDvL631OPUtkSWkd5qFp5YXJJJVSvJHHarXiGa4urW8/te/wBWvYv+PciWIrFPIxyvlRnjaDg5x2pPQXPdHod58RydQl0mHd5yKsjRaXFlocgkBpGyOcelcB4h8Vzi5tmXZp0UtuZ2uLyb7RIwBxgKAoByPSqGl6xYGIwancyWyz2UM4EagmRleVcnHoO1c94r1HTLrUdMubC3lmgSOSBYFtuSQSQQMVS1M5Sdh99ria9EwhWa5LEr9pujnI/2V4Hb3rll07UNUmnttJtBeTqT5s7dhnoAOhqHVdW1a4mLCyvEAyBi1cEDjpxwP8Ku+APEZ0Ce/a+s7xEkkR0H2Z/mII68e1aqyWhgryepS06w1eOzjklt5DGsnkxO6kkPg5UV13hbxE/hO5mg1G0kl09v9fbOSGjJH3lyeDVvQvF8bnSDcwTIsF89xL/o5OFK8Hp1qefXdJbU7+91LTr3XJp3byle2YLtK8ckdqi7bszSyWqZU1XxdDe6jKyl7qwuPlETf61VHQ7u1YVx4ome4kFvbmJMhI03FmAB7njmuq0aw8MWVhFNfadq2oTuczIIWVI1yMKPUf4Vq2p8Ex35nb7ddRmJhFby2D/6zJ2HIXoOKdlcm19TzO51++dnneZ5JGUfORli3p+VafgS/uW1qC0RmeJ2zHG2SfMAHJ/GvULi28I6j4FtNOlspXvPMSWee2smWRGwc87emM1laFD4V8O+LFudMgvJ7OS2Zc3MJLRy5PI7+lJlKLNLUbJNQ0O9aGFftkzfvlCFpjJkbuSfunn9K5zVvCdhHDZNpxnGpzNh4Hbd5ajqW44Oc12N1Ba2dg18+oxW0swwCFG5zkHgDkfjWRHYWZlj+zeIIN90w3SMMMSDyckcdayWho7M2bDQtG0eGCHyI3uHUAXE5JJ49ARgVtWMYs4pIbOQpGTuIh6Lxz1rBufCz3d2JxqSXDlQPmIY4x7Z4rqNL0R3O1kgMkYGX80AN+ANUmNI19MAbW/CI5OdTf5m6n9xLXRfBSPHhO/5/wCYtdfzWsZbP+z9c8I7yhdtVc/uyCv+olrT+Bkpl8J6j/2F7r+a1xL+Kz0Lfu0eiY5r49+Pcvl+JYQc/wAf8xX2GDhh9a+Qvj8qf8JNCT/t/wAxV1vhuKnuex/tKXV3pvhTR7qzbZcJqKBT9dor59i8UXly+oBbydZLFWlmR24f5lHynH+1X1D8adHi8Q6f4e06W5a0jn1JEM6HBTpzk15p/wAKJ8L2juk/i64dWyso+0RguMg/Nhq1irTk/Q5aibSPMiut3mkwX9qJpDc4dZGmwu3JH51Utta1jUrGSPTNZmhkU7LizklAdODyp717MfC3w80lY7ea9a9AXCxtcu68E9ADiq0msfDjwfEtzF4VaUFtvmrbFsnB4yw9q1vdmPI1uzxCeXWltHje7uVbpGPOJMfqenOait5vEE6SkyXUxi6OrMFBBHJ9a95ufi34PgshNa+GHknYY8prVV2nAwCcdK1Zbxg2lW+otANW1Yn7PaQDbbWyAFiSBw5AB65pNj5b9T5/v9K1jWJLRLS2vL4mLEu8kqsmTzUY+G3jKdrSGXSZZhFEUSSRwAmRnNfROrat4b0CQJqfiK9uZsbvIt9yDGT/AAR9PxArDbx/4NV9sGgX99no86Pg8d91HMN013PJ3+EvjC7s1t5bWwRd25neYB26cE4py/BDWJoZVn1HSrQuedjtKevToK9dk8beV5X9m+ENOiWTpJdBDtqe58UeI7q32xapa6SpHI0+1UY57HbVJsjkieVf8KLtpbv7U+tOJdqrss9PJUYB6EvVm2+HNt4aW1VNW1mMwrJHEkNqqnD53DG49cmuxubi+OqhdS8TarfWAQEsLto1ZvQgEcVu6P4o0LRv+PSzjedf+WuzzHB7/MQaTZSikYWjeBtUtdBSxgtPEVxYEErFJIkYGcf7B/nVIfCS6kndm8M3W2Rst9ov1wec8gR16BJ8UYhGWZBGAf8AlrIATWdd/FSQRbra2Ez59cDH1zUtsu0TJsPgmLiR5p9NsrZ5FAdpZmlLAZwD0qa0+BMUF88l9eaYlqB8sVvZlXH1YuR+lTS/E7UymI7e1RyOrSZI/DNZP/CZXDJKupR/2i0hJ3SSlFX2ApK4e6dhF8JNH8vaLncnTCImPw4q5afCnRrfcwnugx6vG6KR+S153F4gs0BaOwEWOflu3G39akXxRIYz9mSZGb7hF7Jj/wBCoHePY3/EnwouLfZcaVrepOgI3W0joTj1Dbf0rOsvC9tZSlr27v8Adk8TfKP061gy+J9djgEtteTsS2Nu9mx1z97iom8Y+ILiMCTVI1Rh0Zo1NGqE7X0Ov1BNAtYj58wCdMMWfPT0PFZ8mo+GyiLHc2eR0zGVxzWP/wAJZfW8CvNcrJkhVWN0JJ4680t/Ne3tuI57FmU8sxtPMB+mFNFweh0cJs1UGJbVs9ACNtbNsqxQgv8AYUPbBXivMv7EgkQuNPQsOkQ0yVd3HqErTm0XQ4rASHSkMzAcCCVcHvniloCkzuZgJlK74GRuoUDmp7GxS3ZXWPYR/dxk15bNpGiXNvI0EM9vInBWOZ0Oc9snFLZPDbKpil1rC4BX7aSM/wDfVOw+ZntQuUiXh3DDoByRn2rPnWR5W864uJt3VN+wAfTH9a84i166jsooEudTQwhj5izAu2fUk84qtP4k11G2x6zdxRg8NMiOT0780uUfP5HqcIhiAVLdeuMuxbPNa0EzqoKqAce1eNTeK9baYSxaxIihQNgjUcjqcEVKfH/iBQVXUZHUDq1jG3P120KI+Y9oivZ5SQ+1Po1IbuaOXG5Cp/iJ5rx20+IXiF4yzFCy5yz2qY/QVMPiH4ldcmfTE7nzIFXH5iixPMj1qe9uYyACh+pzWfe6nevCY40hDn+InoK8lXxr4neaRW1HRNrNkfNGMDNSReJ9fmkA/tbRBk99hosHMd/PYT3hBuXjuGHTexx+QIqSKG4thhYrNl77Mqa4weINbimHma/oBB/gCoCfpxS/2nrM9yWk8R26Q5xss7aMkfjjmjYLrqdY1xePc+SLeJA3/LQuSB9ak/s7UJCSsloB2zGx/rWDawanMhDa/qGG7pboBj6iqL7o5nWTxTrUjg48qKPBYnPAOKE7jex1OoQ3On2bSSGByOAkMJLE+2TVXT7S8vZY5b4bYo/mW2jXjd/tVVj8HXD24mvda1kSkbjGl4w2DtkhsE+1UZ/ARdsr4g12NcZz/aT4A9/m61V7E2e6OtkvvKJJVgP4ix/+tTf7XigwzvsH95jgGvPZvA8OoB9+va9NAjYBbUpcMR34anr8ObO5xLLqmoysOhmvJD2+tZ6FNs9F/wCEt09Apa7t4x3yx/wqK48fafZxsxv7Yk/3ATn9K4UeF7S2IU3WoOhOA6XB5+vPFWpdA0u22xS67qKOoyyx6mwwPweq0Em+p0J+JEO0tC09wpGR5EROT6c1mXXjnV9aia3GlXNnaNw7CHe7D2JAx+tYQk06zlEFvrniCWcjIii1KY+v+1ipRdagU2w6nrhDj/lrq0gIGPd6VkJyZvwajrMzJHY6JfyIvC+dhR2696yPFNp4g1iFbK90KeKwZwZJITulODnAbtXM6np2sT3AA1u/toScsTqksjN/48amXS71oxHBqmpmQ9Hkv5Bj8N1CFc7jQ5rSx0AWOoxXuIiTBNs/fqe2GHXGOhBqbwj4xOpXyaZqomimZittqixbN/HHmoc8/SucsDcQQKHvNUMg4JF/J835twKv6P4dm8T3EVy+palFp1pKsskk147I5U5CqN3OcVT0QI77UI77Tgz3ca3Fuuf9Kszyo9WQ/h3qtbaZp/iFBL5VnqlvnkxEI3Xvg9axr3RYNW1qa5kmvUa4fBgiuXSPaB3AOOaq+C/C+k2Gt7IYXQSM20q7cDJPrWe5sbOrfC3T7yCQ6bINOu8ZAuo1kj78ZGK5SbwHPpsQN9ZQSjvNBkBvyPFdz4j0G0+0qpjc/JkqWbFZWnq+jyM9nNLCrdYmZnRvqpqnoKxw114LsSN4e8tWbnMU2V/UVnf8IX5Th49Zfg7gJ4Ffn17V6sWtLgSyTILCQDO+D5omP+0n/wBaqEXhyDVrb7SbKO7I+9Lpz7XH/ACR/KkriaR5fe+E9Ri04JFJY35LgrG1rgA/3uG6+9Yk3w+uWZ/N0rTrncxdgC6ZYjBbqcGvW5/DbIN2nXBmZT81vcjyZR7c4z+FZF/qNzaSPb3ET2EvRhImCfoTV3M3E4bT/D0Oh6l/aEehTrNtdZEhuRJG27gsVK9fxrAt/Cei6Ubry/7TshcI6AS2qyiIuxJYHI55/QV6pb3dhHG2+JpWAyCMgvUUl3a3duVjhFrHJ1+c5p8zJ5VY8D8QeEN9zCdI1ZpY55lSRbuy8uOFcEb8hjn/AOvW5rvw7stasbGwsNW8OW80L7pLiMOjTYA45Jx0r1eeGDYhLxNz9xckAeuKgHh6xuWGEspQx53qufxp85Ps0eMa38P9T8N2SNLqFtPHLL5MX9nuHcyEgqmMDjrTovBOqambS+upHF1NIyvJOjKINgGEAHqO9ev3PgjSrlhG1sixxN5nmWuUO71BXHNbFnp8thB5dtqesQoowF+1SMo/AnFVzC5DwmXwn4hSe1sbO+5is/trhbpkG5sYQ5HUbv0qN/D/AI2i1ae0TUZ2e2jWRm+2DDF+gBx2xXsl7pOpXs0iy6ha6jHy2NS06KXJx03Fc1QfwylzEz3PhfQb8KeGtWNu5OOMAYFHN5C5DgG/4T3wzqcdpPqd61zLGZVhSUPxnJzx6VLp/wAS/FHmuJdRneOOMyEtCCoI/hNdzZ/2XZa4lxP4f1rT9RCtHG1teGXIOQcDceKq3Gl6FEJbW08R6hoM1ywLpqtkwVsEn7xX3o5l2BRfRnHaZ8YNYtRcw3DQTRzDcktxAflfHKjBGeRj8a1dM+LN7OIo5hpYd8jc1uwCYx1+et/xT8PNU8UaXbwLqmlXwiIki+zSrAWO3qTxVLV/AUkb6ZLd+CtQktLWPZc/2bKkguOnJCMc80e6O0jV0zxg9xqhs9QvtJtAsLTebGrYOASAMt1OKh0f4w6RLYxm9ktEvDKV+zTFgjDnD7s15l47t9DbUbCLS9L1PRVZttwupW8iIgz1BYYNdJ4x8PaFB4DWLRo7fULiJ0k+1ROHkYYO7O0kgfWiyDmkj0hvEGl39yi282gNLJgARag6FyR2yD61eFw63Jgj02R3ByUstWDN25IKV5fH8PLPRPh+/iCTTLG/mNt50d0fmKuRj7vbH0rO+Ffw4XxJDcX11qMtrEH2I1spDyk4JyccYxQ0h80m0j3O0spr5GmtLzWbVYyVkZ9jhCOo461U03VZtRZl0zxh5rIdrRzIA5OPQ15IlhqGmeK59C0bWL8KJlja5ikcKWOCcqvXGcfhUHj261jwPq1jDHejxHDLF5kiapbhgMYyAzDI69RU8lxubW6PcUm8cQ38JSaOeMuMq1qApHuc1p+OPF974T/s5rmysrwX1x9nUyRBNjYJ9+PlPpXn3hEprmk2Vxpt1eeGtQu4y8VlcytJbSkHB2Ak8ZFYun+J28S+I30jWNBudQv7Vn2yaddM2MdWClvT0qUjS+iPWR4kBh8yfRbCVR1McnBOT04rzX4m/GpfCniCKwsNC02S3WJZZzKWL5PYYI9a1dH8IaF4iYyWdxcP5bYeGS/aGVSG6bHYfpVPxl8ELDxLfC+nOuWl3sVBIE89MAcdM0LR3YO7Wh0nwr8Z6V4t8NXGsa1ZWmk5uTDAtvK43DA5JyfWsz4nfEbRPCl7Z20Wi3Gox3qeZHMt+VXbnr909ql8MeH9Q8J+HoNHRNN1S1h37GvYGgk+Y98gCuG8efDDxR4mu7W4i0y0MNvEYVis72N/lyO272rRSTJldR0N7SPFHhrV/Cms69JY61YLpePMgjvg5kznBU7OKraHqmjeJ7Rb/wAjX0h5IVdSiLKB3wY+/Ye9c9Gl54d8GeI9Du9F1S2lvo18tzA7ISBjkjIFedaT4fu7qeEWr2UU+5VkivLoW/zbeD85GcdeKCG2e523gHwXrckss9n4uEi/NI7+U2zIHJ+XiquveHvBD3VvbXHirxJZyHBiWdEbGeMjH1rjdO+JeqaboF9oT/6HHcXYR7yGUuZQB8yBgenTmkvruKYESsw4jEDSb90YRhtO49M4/WnYNDo7f4c+GLW+R7TxpcQMI/JUXtjuwmSccH1NdRB8Jrlre2vdM8Z6Y6wndHK0IGD/AN9VzkXxPltDNdXGrz3VqsYLQSQ5yRnCjI5HWsL4YWlv468WX76nEhgdHuVsACIy/OBjpUId10PTj4H8UTxSPH4g0i7ZepUAfnzxWfD4M8W3G4xtYThXxvVwQxz9Paq+oWNrZzSWNpBb2GmTS5cW6mNXkGBhmGMKAaz9YhstDurNtOvNSjsnm8m+vbSVgoY9owDzg96XLqXcs6b8N/GcetT3F7biSBxtVbdlKoOegI61d1jwjrdrpyxR6ffGWXKysyriJeny4HNVNJ0+w0m8ukuNV1rUrtWBt411CUJtKsckhu2O/rV/w5e61JobarP4xu9N3SSIkEhDqFUkD73WnoiWk0V4DJb6clpdPdxPAPLWM22RKvH3vSsTS4LL+2XbX9RdNNXOyKyTDg5OAc9K6i68XeL7W2e4tNYttYjVflE1sEPOMEHGP1rE0K78RX00skp055pX82R5wvDZ6DcMY+lC1Jsl0BfFOhG6a10rTNXnVhgMWUBvc8H/ACa5HxZfa4NTs54tLntNGtziSAOvmH1JbH9K7cWOo+HpdQ13V7eDULKZAsos7tV8s9sKDgCm6jpSa7o8Mn/CC6tdWEo3xvDccMPXhuarYLXGadp2gXNks8dndqhBYmRwWXp+B5qvYaf4Y1CRo1tGE2fuSPtbGetZs0NlpMStdeFfEOnwDChyZCq8jjg+1bEHh2wtLm21RYtTs5QBseYS/MD0zU3KS6WLdho+lW15NJaxyKqJ5e5gzAn25ra06wsInAW4IfrnBH654qa3d7dGENwpdgSMy4wccnDGrWi/aXnJTZNn+KRA4J9OAaktKxrWtsX1jwp+9MqrqjYOQQP3Ela/wMiEXhG//wCwvdfzWoLt5E13wiJUSJzqjAqilR/qZO1WfgXKH8HX5P8A0GLr+a1zR/is7f8Al2j0Dbl818gftAR7/Elv1/5afzFfYCurNjNfIXx8fb4kgA5/1n8xTxGkApbnuXx3VX0LQ0ZGkU6mg2o20tyOhry+2soIyGm0+5hRe74nVeRycbT/ADr2D4yRxC28P+YCyDU0JAXd3HauNMmnwTb5JzbKTyfLaPjPfAxWq0nL5HPNXijl08P2ms27NpssNxg4M1o+xkOf7jD+tQ6ro12lssdxfztGuCq3VvgAgHkkE13kMWkXsJCPp94W5+bZkc/nVKe2S2XNi1xbjgMsF0WUAg87Gbbj8KtzMnA8/wDLkvEKXOnw6gFHM0MmxiMdgau6prNtc6ZZW1/He2ktgwks9RjUO8BGRhlz8wwcH610C6UlzcS3FxBDqFsv+saCLyLiIY5JCgB/wzXJT6euvR3UtnGI7eZ8wAXYWZkzyVRzk9s4FPcm1h9jdReJdSeefGrXBAV7i2uhDn/gBQ4P410B0CUxp9ihu7bbyXlkSYDj/gNcOnhpkaN47hWmBCrHcxbHTk8EsB/9enajBfW0UDyRiKIfI3kFomJI+8RxxxTsJN9TsrvS75AHkBJbrujxkcdOaxL+21JpEcs42cBCAqgZ6E5qld3WoW1jayPfTuGyYrhbljGGwMK3PysP7pqx/a+o3HlxzLFO+BmF0VnY55Zw39KB6BeaffEIqR25ZlHHng4FLZ6JqcFuzSwNHCoyAgBzx6g086jo180kOoaHpcF0gGyS4tzDFKeejjHH413OiaToaaRbiKD7EzIC/wBjv5NhOO3zYNIElc4uHTJbpEKW7sh+7uXdk8etS3HhS/mT93p8zgHkhgtd4IobBi8WrPgdY5wsv6gE1a067it7XZHeabcqzFhumKEnPuRii9i+VdTzvTPA+qTzGOW0mtxjO95gAP8Ax01rR/Ci9uScXdpHnr5kzN+m0V1t8jAJJJZZRiF821vARk5/2qhMKxyFQ+qwk8Mu4OD9c5qbj5UZdl8I2iVY5dctYw55WOPJP5tXQwfCKwCbW1GfyzyREoH9TVG4k0+OeNJ9UW2fnb9rswB2/i24/Wr9rBLPzZ6lp10n+zOUz+RAoHZF9fhN4fQBZEuLhuvzygfyFWI/AGhWKkQaVb7u+8Ek/rWY1lfr8wtlLg8PDqKgA/i9Rpq2oQzpFKb9S4LhkdJVwOpyM0mNWXQ6q10KzhAZLO1RsdBGKtm28tRwoAHHy9K4yHxY8pxDq+7npKsYq/dX13LFHNdXdv5SDhmYIPxx1pLYd1Y6EMEVtxUY5JwAKgW8tJecxsCf7oOT+Irir3xBZKrD7QSepMAPH/Aj2rEn8XyKSieay9AZLkjI/A0WJuj0syafPLs8uLcOpZAKGXTImCubRWx1wOn0ryh9fuJ5FKwRh8/KXJLfkeTViCxvrhpZZlMKMmOVVSxPpmrTFzLsehalP4dkhRJJ4ojHnDwYBPXrwa5+8bw5ICF1C56/dRVbP6CuY/sATSBHluzxwIkODx6gVqR2EemwHEIG3q1xMDn8zSuO5Yl07TniEkEWq3iE8ssaJ/Ook8O2t84/4l2oW4x/rJpkH6AVSk1CyulXfd2+wH7v2nHPp1pg1bSQwjGoWyseAEkz/I00xaF8+BIFh8tdUmtl67QoY/zp6+GLW0j2Sa7cFQMY8lOnFYr32lwyb0uZZt7KmMMFVj6k1aV7ZhllU98s36ikGhZ/srS0U51G7kJbgCOMd6fCukwKqbrmQ/7RTnr7Vj+dp7XDRwCOdzyY4XDMfy6VWKrG282sUYxndPdKo/EBs0gujpL+fSJlEbWNtdYH3Wh3EceoIrFv9P0Ka3Pn6DaiIjl/mj4475NZdr4lk3Sppz28rheTa226MHHeRxt/WseWDUNXvPtF7O0nOV3PvJ+g6L+FUQ2dRpej+GLiN00fT7qadF6JdlIEbP8AExBP6Vat/hrb3dvHJd61qL3OdxeKRUROvygYzgepNc9bWdwmFWeQDuok6/hWjG0scYEksjKOPmfip1voNNMtX/g77DEPI8W3kQXoJAGArAi0/wARXlq7watDPAW/dfam2Fx/ewOn69aj1O6F9O1ojAQJxOwI5/2M1JKlsvlKZikjcKoIq7klGXT/ABnD1ijuEHaC4AOPptqrMPEEELNNZX8Y6Ex4bPFbLRzMqqk7KBz1G4/jU8M908YDXSNtzk4GTSEYsOlare2YmOnaqFIJZggwfcc0ttYYA3W12FH3jJCcnnuc4ro49Z1HT1V4NQMe3OAHO0/Udqq/8JLczTm3a7mQTnLRrMdrnOcjnpQwKtqLeOQy70UEAFijD8M1LNdQhAfPRd3G5GP+FdDY31ylusaTI0YHCtErYH4ii6u3MOx/szIQchoUGePcU76DOdVkDqoaJuc5Lfz9f0q29y0TKrAPIxwsafM7/QVraQEvrOeKDSNOltIMmS9ngAVCcfdOPmP0rptA0mw0iy/0NmguJVy1yIsyHnscZUfSpvYpK5lW3hhLa3W98RXH2OBgGTT4zmWUdtx7fTFa1vqyaiFhhjNtZwjhVQ+XGv8AU1DLpNuXZhdXMkx5MjQbnz9SKlh0+Z1WP7deSKOivGSP5VEpXNErFmG5iR45ZR5CNnygeSFHc/XNP0J4m1ezUFdwHAI9qU6K3kNI1y5xk48pCT+HXtVvR7eR1M4+27h0cWqDv2ytNBcm1XVLWe9myXbYdpZR0PpWWzW0zuVZmKjJXbkj9as3mmuzs8kV2245LNbxqO/cis+Z7GwuVknvri2lIIXbcIpPHoppgUbnVrOCN2SWTapz80R/WjTNVuxML2wglRI+ZJtmFdc+meeKbqPi/S7SaO3lv9QMs/8Aq423nfyBxVmCa4lRE+z6gFBziRcDGehBHSlawrnT+Kri1kt44VTz5rhDLFgcqvrn8ema5HUbS9uJrWUXKnNsqm3vI8q2M89c5/GnXuoyaa4H2uC1IXaFlvoo8D/voHtVGbVopovOlvtOlcdX/tMHHHQYam7juid9O0t0K6hpUlsDwZ7R9y/l2qv/AMINp94jvpmrllPVWGSPw4qS38Q6fI8cMOoRi5mBCLapJcE9MjuKhtLiz1XWJGtbufUL+yG2WO2sFTHXq23Gaa1J0Mm48FahDOYILmzuZFGdnmYIqi2iavpsu6XTzJH/ABeSwIYf0rc1DRLK5mS4/siYTMcmWTUEt9xx3AYU3VNIhihWY/2dpiqMs82ttz9cSfyp2IdjKtpYHlKoJYpVzmI/KR+fWprnUBaKNuoyxgdUIBP5ZqXw/oP/AAlU0mq2GqaVf2lmWjMhDyInqN7dR75pdSn0S3QRyeLtHtZOgaCBJGB5HGQfShiSKh10LKplia5A5Kou0gUk1/5l801rA8SzDEkRHB+nPFUYbnwhotyZJfGuo39xKfuW1tu35HbavStTwzH4R8WeKX0TzNdS/wDK86Nb5pIFlXvt6UkO9xmovDEiG8Akw2I0jOHBz25rP1WO1g8K+IG1+48xGCrp9vcsrSq/quMZFUPHB8G2tzdWtrpN42pW0oSG9lvXMe4Nzn5vwpiePtAsjDcp4IsJbhMB5dQmMufUpuY9atLuTdFr4S6U2iWk8utS2cdhNECEuZSX3YHIA6A1pax4p8G6O1zJaXt99sIO1LFmKbu3Ucf/AFq7Oz8ceBT4Qg1x9I0+NWG02sdojyB/7pG04Fed+J/jRcSXqjw9pOnWVupO63ks42kkxjjpx17VVgbSW5Y+H/is6lpEzeKZX1QyP8iSWedi+hPFZ3ifwz4XlZ7zQtP1W0vwMEW9tmF+vBUnp9DWndfHO/vhAmkfYtLYIC4vYsOZP4lVcY/OuX1H4heIfEw2pe6ndRsdrQWqfZ8NzkKwALfgaXUd1axoeD/BmmeLLaXTr3S9b0C5CEySxTBrWTv909PpmtWbwvc+BYCuj+KLC5tHlG+2uoSoB/3geO9cnpWq6zCbqzv3u7eTyVRY57yTdubgMFLZJ55FOufEd7dWEyiOBbdp0inyoVWK5wHzzk9ePSn6kXstjo7DwVqOhalqMz6EVnvYybbULW+VkhZlwScqO/P41h+IPDkt41vPrmtWNuIYhApUmSQrg8EDHXFYs8WoMt1IkDXZHAt4pndB83AwDyMVr3XhbXPEviC4u9F8OSwWN2iBRPAI1RRyy/MPUDn2p3Q91sMuvE8VvpEVnpcUsg0dPOt75zhlBGSAv51i/DXVHg8WvqD3QjvIo2kDMuTK7OqnHPoSfwrqP+FPa5/aM1zrWqabo8UpMbySTLkxlQAAvt9Kj+F/gXQ7ewk1fUb6W9VLlrO3ghhO+ZlcH5FxubO3t0qdBJSckeo3/guC58bzWskGYtTso9QtmC4KSYw44PTgH8afJoGpeFPLayvdQgidgnTzFBx3BIwK1ZLfVL7V4r69jns5mtvItra0YA2sOT95v7x/pWDJYXVjfLcx6tqBkXGVub4ukvykAlS2OfQe1RY6NjL1z46X3hV5IpLVPEKQHE0iQCJU4B6knPXtXceDPHGj/EGERzaFNp900IuFSYfK0ZxhlYfUV51r+o2YgltDbfatuQbN4wE3NyxJ79qw7HV/EthotyunarFYaabxNPiZ9oKBm5ELH09KSTJ5tT31vCForb7W5ubXJztDB1/UZrH1r4fR6qoS6tNM1RR/z9W5Vv8AvoGn/C2fWbrwrGNcZnuo5pI0lkADvGMYZsd+tdUUvA+Y1idO2W5qbm1k0eb6h8IfD15ZmC78HKkWdwk025JZSPQEVUv/AAX4cvdOOlHUdUs44wIzG9srsoU8AnI9K9F8YXt7Y+HXa2ik+0u6oDACzID1P6V49pni/VfA3iyW8u7O+Nndt+/icMD14cZ/Ot47GErI5DVfh1oUOsW+jf25CUnGYL0wMqRnP3XGepz19jXV2Xwq1rw1otrb6RaWk13ayNNBqNrd/M5PUMpHIIJ4r0fTvFXhvxg7xwSWd3IyjdDewqrt17MMmpf+EG0m4U504WvH3rZ2QDjjoRiovYFBPU8L8RXPiyK4dtT8PXFvACX8u1j3K7DHzNz068VhJ4gfVFt7SGG6CpLJLcARdGOflQdselfSKeDb7Typ0zXL6FAciGc+cn/j2a4rWvhV4numRrPXooSlzJcq8JMD73JyCVxkZPQ07olxZ5fYSypZJG7PDI0ibnaJg+3DYP05wa6LSmgtdGtI7i5tmxdOyxOrZTLdTntVw+HvH/heTytUvzd28pUreOUlVCM/KScnn+lUIPEup3VybS9lsVmuJWiVp7RP3RPQN8uQOadidh99f3FtqNrG2v21tBI53osW5R7/AErsY55oI0VptH1BTyqsjRk8+xNY1kxk0S5vpNLt57S2JSa409EnAIPePlh+Aq34fmstetRLpk+n3cbHBjUIko5PVHwR+VSXuWtS1uGy0aaK40LT5reQeUwguT0PoNvtUem+JLrSbeCCC21C3skUBEhkDqB6DjgUt5pH2dlM1nPag4wGtxsP6YqeHTmiTZHJclMZ/wBHwy/+O0NjSKuteO9GKxpq02pGMMGCuAQD61uaX480a+ij8u+vJIsYHyBgP0qhJoqXkYjkEkqEY2T2xb0/2a1NE8OQ6dYMsE6RRF/uqPL2n/gdFx63LqeIdK1EkNcPISMYuIcjp7Cq40bSZJzLHEiSH+OBmiJ/A5p1tFLtUi5dh2Czx88exq8bSUqocT7ec5xg/wBKV7lW0IpbIQax4SVHkkA1ViGmYM3+ok7irHwIXyvCOohj/wAxi7/mtNktxZ634UULtB1RzjcD/wAsZKn+CqD/AIRXUv8AsMXR/wDQa5F/FOv7CO/ym8YHOa+QPjr83iZPrJ/MV9dSZRxtA/Gvkn424/4SGM9yZP5irr6wFT0Z9IfE20F/J4YgL+W0mrRrvAzjJWnSeBoJrd4ZrliGyCVTGffmo/iAxbU/B/8A2GI/5rXUgtn0BNbfafyMre6jz2f4PQ3dmbSbVJnhzlS0Q3Dn1BFXIPhi8NjBbR67cxmFwySLEu4Y7HnkV3W3GCeaVV/i6mnYmxgnwoxgCrf+XIeXl8oEscYz14rFtPg5pMFjLYzTvd2kjF/LnQEKxOSUIIK13BOcY4xQWI+7we5q0S1c4HTvgza6cSi6zdTw5+WKZQwA9PpRd/CCxutM+wS3srWuQyo0YLJg54OfUCvQCTj1pg3H5s4psXKjyw/AmwTb5OpXAY587fGGW4U9A4z1HqKbb/AuxgMSJqVz5MbEorIGI5zjOQcGvVNufrSAHuMe1KwWR53a/BS1h81RqtwYHTy/IkiDxpznIGc/rVCy/Z+tdMdWtNeuYQfvRiHMZHsN3FeqldzDHAHNKSKaDlXY4G3+E32GTfBrEkZ9Ps+f/ZqrQfB22hikjk1GW4LsX3SRDIJOeOa9HPI4pCDgUupVkeax/BaCMMI9ZuUB5KqnH860IfhzLboqtq8s+Ohkh5/PNd4EyOlAXByBRYLJHGz+A/OiWNrrIByC0IJH05p8XgEA5+1qp9VhA/rXXkgHgZ9qQZHJ4+lTypAcnceABccPqcwA/hRAB/Oq0vw/l3lk1mdMqU4i6A/jXaHg5yeaRsn3FJpD8jzn/hT8BUA6pM2OP9SB/Wh/g3Bcqqy6xdFF6KF4/LNeigYpenShJC5UedRfBOyhYSLq1yzr0LRgj8s0sfwokicsNckK5zj7MM/zr0TO1ffNJjd161W4JLscRB8NzbgbdWkMnVneEFj+Oam/4QVomDf2q4b/AGox/jXXC2QrtO786eLeMLjaD9eakdkcDf8AwxudTl3y+ILlUxgRxRgKP1qgPgpAGydUlOe7RZ/9mr05Y8dABSgEnnpTsKyPN4PgnbwktHqjpnqBAP8A4qluvgpa3Ai3atMDE29SsABB/OvSCcNx0obBbOfwo0Fyo8zuPg0k8cscmrzyRyEFlaEYOOneqifAiwX/AJilxn/bizj/AMer1ZhnpTQoHUc0h8qPO7L4Pi1GF12cLjoluF/rWXffs92uoXHmv4ivsE8qYx/jXqpYg9sUcFs55pphyI4EfBez2wo2pzGGFdqxrGAvTGTzyahf4LQYAGsTj1IiGT+tejkkduaUElee3pVbi5Uebf8ACmLVVIGq3AJ/iCjj9ajj+C1nCDs1W7LYwCwBA9+telMMnIPHekHBGaTsPlR5KnwEhiHy65c9zzDnr+NW4fgdaCIhtUnMnXf5IyD+den85OelAHI4pByrseap8EIQmDrlw30hA/rUsPwYhgjKf2vMw9fKH+NekAHPWgg546VVg5Tyeb4GRmZpU1uZN3UeTwf/AB6hfgdG7EzazLIw+6RDjA/76r1R1w9SqAFxikJxR5mvwZGzaddugPaIf41B/wAKMhyN2tXMgBztePIP616mEbHNLt4+lFtLhynCy/Da6mtoIP7aaO3gO5IFth5efUjdya3LXw5cW8QEl8Llx3MO0fzNb+OB0peQwJ6UKKK2OY1DwzdXcytHfRwIBjb5G4H8cinQ+DplIJvkLdc/Z/8A7KukbDPml3Yo5EBi/wDCOXAMwfUI2R0AQC2wU45/ioTRZ7a2jghuo1CLjc0fJ/Wt0VGRzjn86GrCSOPn+H73d2Lm41JpWznYYyEPtw1GtfDpdbtFt2nt7ZEO5TDbnP57q7AAihslcZwaNAseY3HwThuwrXOqy3EiDCOYQNoyOnPtTrv4L2VxqENzHeyRIihXVgW3kdz8wr0nI6HkjuKAxJNFri5V1PNpvgrYTSbpZouOn7nk/U7qsz/C21fTzZCSGKBhyY4cHOPXNd+xIzz1pB8xyetA+VdjzI/B2UzxNDrr21vHGY1ijtgcZ4Jzupp+C8y2a20fiSaOFRtCLbAZ5zknfnNeobcdTQTnoaQuWJ4xcfs5280xx4gnMbDDDyPbt89J/wAM36ZaxzPBcfbLrA8r7Yp8tT3JGef0r2gLu4I49KcU5GKLByxPIh8E7290xrO78RNDC/3oLC38qI88jBbJqTV/2eNCv9Otre1/0KaJsm6K72YYxgjj0/WvWSpI/wDr0qrgknvTtYLJ9Dy68+C8UttocVpJaRNpnzeY8JLSkL3weKr+IPgtqer67p2oQala2jW6qrSIh8zhiSBz0INes4wTz1pd3vRZByrseK+LP2fW1rUxc2V/a2EeeSYCzsc8k/MBWbZ/s5Pbo0cmtrNGwJ2G26Me4+b/ADmvewM9cUwxhs8Undj5I9UeDXnwRvtJtlttEgW7LofOuLm78tXO0jAUI2Pzq1oPwDbRvDcjT2NtrGuSsD5Uk5jhhX0U7SSffFe3rCD2z9al5XjNNInlXY8J/wCFY+LtNeRtK0XTLCOTrHFclyD/AHgxQY/Kk0/4R+NLqN5LvVo9OBPzRp+8c9eQdoGa92ZsjHH5VGTg+9N2Hyo8e8I/CzUNE1hZTZW9pGr5kvrmTz7mT6LgBM/U1N4O+EX2TW9V1DVYGmSWctbW8rBuOfmbgc+1etbOnFShBjofzpctx2SPMfE6+KtJaeDw34csZ4FjzFcPJtO7/c284PvVPT/BnjvXbeL+2Neg05WALxWERLjI5yScDrXrflj0o246UKIHkFr8LmtNQuL0aVLfG2Xcj6hNvlunA6KoGFHHXNdB8OPBCaDZHUr6yWDWb1jNNGVGLfdzsTtx3Nd8evU0xsE4FN7CS1MTxRpEes6czNFJJPADJEkLbSzelcPrHhHXV0o3NrpsMEh2gWUTeZKq44IY4+bIH0BNeokDGDTkJU9cd+KSY2kz52/4V54qvJ0ibSrmMO2z52UISeWLMOdvIGQO1U/EXwh1xLe3t4IdQ1C7SQTyJCBHZwktzsySSQCcEgV9NiU+tIXOatk8p418NNI8R+GbuBb2yvm066d12OQRbgAbS2eueea9ZRNmPlHH0NXC2QeP1qJieSc9Kz5UiloMJDqQRkH1FYOteDdI1w5vbMXOOm9jxznit7b3BoRdpOSTSbKaT6HBa38LNIvrVvs9obe5Vf3ckLYYegz+NZXw58O+I9O1C5s9QS9t7ZV3QStgxk46NzzXqo61N5uBjJx6ZqkiGuxy89jfx3DSmBlQjDLE2cHjnGO9Zup3PiKxv2itdPW/tjH5iSHjB6lG967dm4yT0pm4t7D0oaGeV+IrXxfqNjHJcaeGs+C1rbsA+MH5iD6VyGreC77WBZzpo1x5t3EYzdTKBIJ1JCllB4BAAzmvoEg+pz65pRn1PTB560rsORM+c9E8F6vHdNBb2F3oupNuIwN0Dgc8nPOenSup0nQr3WdFv4b/AMLLBqVsSGRwFS4wxPyMPb2r2cOQAMnA96az8frVWJUTwPWPC/iZtKWLRrnUdHiYBZbK6xKjDB4V+orQ8J2HiDVLP+xdQ0BYLnT1x9tt7oxiYHp1U817SJCD3/OnZ39eR70BynkmraJqtn1t7tQM7i8QuF7cBgyn9Ks6PNeWUaRy2l+EuCAJLaMFU9yCePzr1MHHAJ/OnFs/xEk9cnNJoq1jlE8MTRbVF88g7CaEH+RFWm8Mgx8+SzD1hP8A8VW/5ak+/Wl2880KI2cXrsBttb8Gq2z/AJCbcIm0f6mT3qn8FHz4X1Qf9Rm6x/47Wn4xAXxF4OHTOpN0/wCuElZfwVi/4pTUD66vdH/0GuO1qx0L4DvtpDDPTNfH3x1l2eJUXOMGTp9RX2CMBgM96+O/j0m7xRHjPWT+Yp19IhDc+mfH3/IU8H/9hiP+a11h7fWiiuhfEzJ/CvmSUetFFaEDKfRRSBbjV70q9KKKQhw7/SkH3aKKvoPqN7U1ulFFQiwHSpB2oopIh7j160DvRRWoCL940yWiin0GR9qevWiiudlCt0qMdaKKYnuD9B9acO1FFUhsd/EaWiiqWwCjoKVvvH6UUUMh7kR60yiisRx2HpQe9FFV0LRC1IOtFFSDJx2ok6GiitobEMjHakHWiis2UiQ9BQelFFbLYkQ9BSUUVJQh+9Uq9BRRUrcCX+E0w96KK06ExEXpTn6fhRRSWwpbkTU5etFFJFol7Up7fWiihk9RrVC33h9aKKzew4jP4jTx0ooq4A9hr96aOtFFHUqOwPSJ1ooqSepYj6/hTz2ooqkJgelNoop9RRGHrTT1ooqHuWH8JpR0oopIGOHWnUUVpARG/WkH3hRRSe4D1qSiirIe4PTR1oopdRiP96oj96iilISEbpTl7UUVkty2Op3eiitkJdR46U2ToaKKUgZCe1IaKKnsUugL1py9aKKa3B7Ct0oXpRRTZItHeiikX0EbpTfSiimZgnelXrRRQA5fvfhSH79FFHUBy9aU9KKKrqByHjT/AJGfwZ/2EW/9EvVL4Lf8inf/APYVuf5rRRXF/wAvjo+wjtV/1/418h/Hf/kZo/rJ/MUUUsR8AqZ//9k=" alt="">
          </div>

          <div class="hbb-ticket-v7-foot">
            <div class="hbb-ticket-v7-barcode"></div>
            <div class="hbb-ticket-v7-code">${esc(ticketId)}<br>${esc(competition.name)}<br><b>MEMORIAL MAX PAYOUT</b></div>
          </div>
        </main>
      </section>
    </div>`);
}


function openRecoveryRanking() {
  const competition = getCompetition();
  if (!competition) return;
  const summary = summaryFor(competition);
  openModal(`<div class="analysis-modal">
    <div class="analysis-modal-head">
      <div><p class="eyebrow">RETURN RATE</p><h2>総合回収率</h2><small>参考成績</small></div>
      <button class="button ghost" type="button" data-close-modal>閉じる</button>
    </div>
    ${summary.recoveryRanking.length ? `<div class="recovery-modal-list">
      ${summary.recoveryRanking.map((row, index) => {
        const p = competition.participants.find(x => x.id === row.participantId);
        return `<button type="button" data-action="view-participant" data-participant-id="${esc(row.participantId)}">
          <span class="recovery-rank">${String(index + 1).padStart(2, '0')}</span>
          ${p ? silkMark(competition, p, 'silk-icon recovery-silk') : ''}
          <strong>${esc(row.name)}</strong>
          <b>${pct(row.recoveryRate)}</b>
          <small class="${row.profit >= 0 ? 'plus' : 'minus'}">${row.profit >= 0 ? '+' : ''}${yen(row.profit)}</small>
        </button>`;
      }).join('')}
    </div>` : '<div class="score-empty">参加者がいません。</div>'}
  </div>`);
}

function openRankHistory() {
  const competition = getCompetition();
  const history = rankHistoryData(competition);
  if (!history.points.length) {
    openModal(`<div class="detail-head"><div><p class="eyebrow">RANK HISTORY</p><h2>順位推移</h2></div><button class="button ghost" type="button" data-close-modal>閉じる</button></div><div class="empty">払戻額が入力されたレースがまだありません。</div>`);
    return;
  }
  const participants = competition.participants;
  const colors = participants.map(p => participantStyle(competition, p).bodyColor);
  const slot = 76;
  const left = 48, right = 82, top = 18, bottom = 54;
  const width = Math.max(left + right + slot * Math.max(5, history.points.length - 1), 510);
  const height = Math.max(210, 88 + participants.length * 31);
  const yStep = participants.length > 1 ? (height - top - bottom) / (participants.length - 1) : 0;
  const yForRank = rank => top + (rank - 1) * yStep;
  const xForIndex = index => left + index * slot;

  const grid = participants.map((_, i) => {
    const y = yForRank(i + 1);
    return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="chart-grid"/><text x="${left-8}" y="${y+4}" text-anchor="end" class="chart-rank">${i+1}位</text>`;
  }).join('');

  const lines = participants.map((participant, pi) => {
    const coords = history.points.map((point, index) => {
      const row = point.ranked.find(item => item.participantId === participant.id);
      return [xForIndex(index), yForRank(row?.rank || participants.length), row];
    });
    const path = coords.map(([x,y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const dots = coords.map(([x,y,row], idx) => `<circle class="chart-point" tabindex="0" role="button" data-point-index="${idx}" data-participant-id="${esc(participant.id)}" cx="${x}" cy="${y}" r="4.5" fill="${colors[pi]}"/>`).join('');
    return `<path d="${path}" fill="none" stroke="${colors[pi]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
  }).join('');

  const labels = history.points.map((point, i) => `<text x="${xForIndex(i)}" y="${height-29}" text-anchor="middle" class="chart-race-label">${esc(shortRaceLabel(point.race.name))}</text><text x="${xForIndex(i)}" y="${height-13}" text-anchor="middle" class="chart-date-label">${esc(formatRaceDateCompact(point.race.raceDateTime))}</text>`).join('');
  const legend = participants.map((p, i) => `<span class="rank-legend-item">${silkMark(competition, p, 'jockey-silk rank-legend-silk')}<b>${esc(p.name)}</b></span>`).join('');
  const eventHtml = history.events.length ? `<div class="king-events compact-events"><h3>首位交代</h3>${history.events.map(event => `<div><span><strong>${esc(event.names)}</strong><small>${esc(event.race.name)} ・ ${formatRaceDateCompact(event.race.raceDateTime)}</small></span><b>¥${Number(event.value).toLocaleString('ja-JP')}</b></div>`).join('')}</div>` : '';

  openModal(`<div class="analysis-modal rank-analysis"><div class="analysis-modal-head"><div><p class="eyebrow">RANK HISTORY</p><h2>最大払戻額 順位推移</h2><small>直近5レース / 左へスワイプで過去</small></div><button class="button ghost" type="button" data-close-modal>閉じる</button></div>
    <div class="chart-legend">${legend}</div>
    <div class="chart-shell">
      <div class="rank-chart-scroll" data-rank-scroll><svg class="rank-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="最大払戻額ランキングの順位推移">${grid}${lines}${labels}</svg></div>
      <div class="chart-end-labels" data-end-labels></div>
      <div class="chart-tooltip" data-chart-tooltip hidden></div>
    </div>
    <div class="chart-position" data-chart-position></div>
    ${eventHtml}</div>`);

  const scroll = modalBody.querySelector('[data-rank-scroll]');
  const endLabels = modalBody.querySelector('[data-end-labels]');
  const position = modalBody.querySelector('[data-chart-position]');
  const tooltip = modalBody.querySelector('[data-chart-tooltip]');
  const visibleSlots = 5;

  function rightMostIndex() {
    if (history.points.length <= visibleSlots) return history.points.length - 1;
    const approx = Math.round((scroll.scrollLeft + scroll.clientWidth - left - right / 2) / slot);
    return Math.max(0, Math.min(history.points.length - 1, approx));
  }
  function updateEndLabels() {
    const idx = rightMostIndex();
    const point = history.points[idx];
    if (!point) return;
    endLabels.innerHTML = point.ranked.map(row => {
      const pi = participants.findIndex(p => p.id === row.participantId);
      const y = yForRank(row.rank) / height * 100;
      const shortName = row.name.length > 7 ? `${row.name.slice(0, 7)}…` : row.name;
      return `<span style="top:${y}%;--label-color:${colors[pi]}" title="${esc(row.name)}"><i></i><b>${esc(shortName)}</b></span>`;
    }).join('');
    const start = Math.max(0, idx - visibleSlots + 1) + 1;
    position.textContent = `${start}〜${idx + 1} / ${history.points.length}レース`;
  }
  requestAnimationFrame(() => {
    scroll.scrollLeft = scroll.scrollWidth - scroll.clientWidth;
    updateEndLabels();
  });
  scroll.addEventListener('scroll', updateEndLabels, { passive: true });

  function showPointDetail(target) {
    const idx = Number(target.dataset.pointIndex);
    const participantId = target.dataset.participantId;
    const point = history.points[idx];
    const row = point?.ranked.find(item => item.participantId === participantId);
    if (!point || !row) return;
    tooltip.innerHTML = `<strong>${esc(row.name)}・${row.rank}位</strong><span>${esc(point.race.name)} ${esc(formatRaceDateCompact(point.race.raceDateTime))}</span><b>最大払戻 ¥${Number(row.value).toLocaleString('ja-JP')}</b>`;
    tooltip.hidden = false;
  }
  modalBody.querySelectorAll('.chart-point').forEach(point => {
    point.addEventListener('click', () => showPointDetail(point));
    point.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') showPointDetail(point); });
  });
}
function shortRaceLabel(name) {
  const text = String(name || '');
  return text.length > 7 ? `${text.slice(0, 7)}…` : text;
}

function formatRaceDateCompact(value) {
  if (!value) return '--/--';
  const date = String(value).split('T')[0];
  const parts = date.split('-');
  if (parts.length < 3) return '--/--';
  return `${parts[1]}/${parts[2]}`;
}

function openRaceDetail(raceId) {
  const competition = getCompetition();
  const race = competition.races.find(item => item.id === raceId);
  if (!race) return;
  openModal(`<div class="detail-head unified-detail-head"><div><span class="badge">${race.gradeType === 'G1' ? 'G1' : 'G1以外'}</span><h2>${esc(race.name)}</h2><p class="muted">${esc(race.raceDateTime ? race.raceDateTime.replace('T', ' ') : '日時未設定')} ${esc(race.racecourse || '')}</p></div><div class="detail-actions"><button class="button secondary" type="button" data-action="edit-race" data-race-id="${esc(race.id)}">レース編集</button><button class="button ghost" type="button" data-close-modal>閉じる</button></div></div>
    ${race.note ? `<p class="rules">${esc(race.note)}</p>` : ''}
    <div class="detail-entry-list">${race.entries.map(entry => raceEntryRow(competition, race, entry)).join('')}</div>
    <div class="modal-danger-zone"><button class="button danger" type="button" data-action="delete-race" data-race-id="${esc(race.id)}">このレースを削除</button></div>`);
}

function deleteRace(raceId) {
  const competition = getCompetition();
  const race = competition.races.find(item => item.id === raceId);
  if (!race) return;
  if (!confirm(`「${race.name}」を削除しますか？\n意気込み・賭け金・払戻額も削除されます。`)) return;
  competition.races = competition.races.filter(item => item.id !== raceId);
  saveState(); closeModal(); render(); showToast('レースを削除しました');
}

function raceEntryRow(competition, race, entry) {
  const participant = competition.participants.find(item => item.id === entry.participantId);
  if (!participant) return '';
  const statusText = entry.status === 'join' ? '参加' : entry.status === 'skip' ? '不参加' : '未定';
  return `<div class="detail-entry" data-race-id="${esc(race.id)}" data-participant-id="${esc(participant.id)}">
    <div><strong>${esc(participant.name)}</strong><span class="status-dot ${entry.status}">${statusText}</span></div>
    <div class="entry-money"><span>賭け ${entry.status === 'join' ? yen(entry.betAmount) : '—'}</span><span>払戻 ${entry.status === 'join' ? (entry.payoutAmount == null ? '未入力' : yen(entry.payoutAmount)) : '—'}</span></div>
    ${entry.enthusiasm ? `<p>「${esc(entry.enthusiasm)}」</p>` : '<p class="muted">意気込み未入力</p>'}
    <button class="button primary" type="button" data-action="edit-entry">入力・編集</button>
  </div>`;
}

function openParticipantDetail(participantId) {
  const competition = getCompetition();
  const participant = competition.participants.find(item => item.id === participantId);
  if (!participant) return;
  const summary = summaryFor(competition);
  const row = summary.rows.find(item => item.participantId === participantId);
  const rights = rightsForParticipant(competition, participantId);
  const history = [...competition.races].sort((a,b)=>String(b.raceDateTime).localeCompare(String(a.raceDateTime))).map(race => ({ race, entry: race.entries.find(item => item.participantId === participantId) })).filter(item => item.entry && item.entry.status === 'join');
  openModal(`<div class="form-guide-head unified-profile-head">${silkMark(competition,participant,'silk-icon xl')}<div><p class="eyebrow">FORM GUIDE</p><h2>${esc(participant.name)}</h2><small>個人成績 / 馬柱</small></div><button class="button ghost" type="button" data-close-modal>閉じる</button></div>
    <div class="profile-stats form-stats"><div><small>回収率</small><strong>${pct(row.recoveryRate)}</strong></div><div><small>収支</small><strong class="${row.profit >= 0 ? 'plus':'minus'}">${row.profit>=0?'+':''}${yen(row.profit)}</strong></div><div><small>最大払戻</small><strong>${yen(row.maxPayout)}</strong></div><div><small>総払戻</small><strong>${yen(row.totalPayout)}</strong></div></div>
    <div class="profile-rights ticket-rights">${rightCard('5,000円権', rights.bonusRemaining, 'diamond')}${rightCard('G1以外権', rights.nonG1Remaining, 'circle')}</div>
    <h3 class="detail-subtitle">PAST PERFORMANCE</h3>
    ${history.length ? `<div class="form-guide-list">${history.map(({race,entry}) => `<button type="button" class="form-guide-row" data-action="view-ticket" data-race-id="${esc(race.id)}" data-participant-id="${esc(participant.id)}"><span class="fg-date">${esc(formatRaceDateCompact(race.raceDateTime))}</span><span><strong>${esc(race.name)}</strong><small>${race.gradeType==='G1'?'G1':'非G1'} / BET ${yen(entry.betAmount)}</small></span><span class="fg-payout">${entry.payoutAmount==null?'未入力':yen(entry.payoutAmount)}<small>${entry.betAmount ? pct(Number(entry.payoutAmount||0)/Number(entry.betAmount)*100) : '—'}</small></span><b>›</b></button>`).join('')}</div>` : '<div class="empty">参加済みのレースはありません。</div>'}`);
}

function openDigitalTicket(raceId, participantId) {
  const competition=getCompetition();
  const race=competition.races.find(r=>r.id===raceId); const participant=competition.participants.find(p=>p.id===participantId);
  const entry=race?.entries.find(e=>e.participantId===participantId); if(!race||!participant||!entry) return;
  const rate=entry.betAmount?Number(entry.payoutAmount||0)/Number(entry.betAmount)*100:null;
  const style=participantStyle(competition,participant);
  openModal(`<div class="digital-ticket" style="--ticket-silk:${esc(style.color)}"><div class="ticket-top"><span>HORSE BET BATTLE</span><b>${race.gradeType==='G1'?'G1':'SPECIAL'}</b></div><div class="ticket-race"><small>${esc(formatRaceDateCompact(race.raceDateTime))} ${esc(race.racecourse||'')}</small><h2>${esc(race.name)}</h2></div><div class="ticket-player">${silkMark(competition,participant,'silk-icon')}<strong>${esc(participant.name)}</strong></div><div class="ticket-money"><div><small>BET</small><b>¥${Number(entry.betAmount||0).toLocaleString('ja-JP')}</b></div><div><small>PAYOUT</small><b>¥${Number(entry.payoutAmount||0).toLocaleString('ja-JP')}</b></div><div><small>RETURN</small><b>${pct(rate)}</b></div></div><div class="ticket-rights-line"><span>5K BOOST ${entry.use5000?'USED':'—'}</span><span>WILD RACE ${entry.useNonG1?'USED':'—'}</span></div>${entry.enthusiasm?`<p class="ticket-note">${esc(entry.enthusiasm)}</p>`:''}<div class="ticket-code"><span>${esc(race.id.slice(-8).toUpperCase())}-${esc(participant.id.slice(-6).toUpperCase())}</span><i></i></div></div><div class="modal-actions"><button class="button ghost" type="button" data-close-modal>閉じる</button></div>`);
}

function deleteParticipant(participantId) {
  const competition = getCompetition();
  const participant = competition.participants.find(item => item.id === participantId);
  if (!participant) return;
  if (!confirm(`「${participant.name}」を削除しますか？\nこの参加者の全レース入力・意気込み・成績も削除されます。`)) return;
  competition.participants = competition.participants.filter(item => item.id !== participantId);
  competition.races.forEach(race => {
    race.entries = race.entries.filter(entry => entry.participantId !== participantId);
  });
  saveState(); closeModal(); render(); showToast('参加者を削除しました');
}

function rightCard(label, remaining, shape) {
  const used = 3 - remaining;
  const markers = Array.from({ length: 3 }, (_, index) => `<span class="right-marker ${shape} ${index < remaining ? 'available' : 'used'}" aria-hidden="true"></span>`).join('');
  return `<div class="right-card ${remaining === 0 ? 'is-empty' : ''}"><span>${esc(label)}</span><strong class="right-markers">${markers}</strong><small>${remaining === 0 ? '使用済み' : `残り ${remaining} / 3`}</small></div>`;
}

function formatRaceDate(value) {
  if (!value) return '未定';
  const [date] = value.split('T');
  const [,month,day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function formatRaceTime(value) {
  if (!value || !value.includes('T')) return '';
  return value.split('T')[1].slice(0,5);
}

modalBody.addEventListener('click', event => {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'edit-entry') {
    const row = actionEl.closest('[data-race-id][data-participant-id]');
    closeModal();
    openEntryForm(row.dataset.raceId, row.dataset.participantId);
  }
  if (action === 'view-participant') openParticipantDetail(actionEl.closest('[data-participant-id]').dataset.participantId);
  if (action === 'edit-participant') {
    const participantId = actionEl.closest('[data-participant-id]').dataset.participantId;
    closeModal();
    openParticipantEditForm(participantId);
  }
  if (action === 'delete-race') deleteRace(actionEl.dataset.raceId);
  if (action === 'edit-race') { const raceId = actionEl.dataset.raceId; closeModal(); openRaceEditForm(raceId); }
  if (action === 'delete-participant') deleteParticipant(actionEl.dataset.participantId);
  if (action === 'view-ticket') { const raceId = actionEl.dataset.raceId; const participantId = actionEl.dataset.participantId; closeModal(); openDigitalTicket(raceId, participantId); }
});

startApp();
