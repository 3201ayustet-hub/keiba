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
    <div class="jackpot-ticket-modal premium-ticket-modal">
      <div class="analysis-modal-head ticket-modal-head">
        <div>
          <p class="eyebrow">JACKPOT TICKET</p>
          <h2>一撃王馬券</h2>
          <small>現在の最大払戻記録</small>
        </div>
        <button class="button ghost" type="button" data-close-modal>閉じる</button>
      </div>

      <section class="premium-bet-ticket" aria-label="一撃王馬券">
        <div class="premium-ticket-stub">
          <span class="premium-stub-kicker">MAX PAYOUT</span>
          <strong>${esc(raceNo)}</strong>
          <b>${esc(grade)}</b>
          <small>${esc(fullTicketDate(race.raceDateTime))}</small>
        </div>

        <div class="premium-ticket-body">
          <div class="premium-ticket-topline">
            <span>HORSE BET BATTLE</span>
            <b>${esc(competition.name)}</b>
          </div>

          <div class="premium-race-block">
            <div>
              <small>${esc(venue)} / ${esc(grade)}</small>
              <strong>${esc(race.name)}</strong>
            </div>
            <span>${esc(raceNo)}</span>
          </div>

          <div class="premium-player-block">
            ${silkMark(competition, participant, 'jockey-silk premium-ticket-silk')}
            <div>
              <small>PLAYER</small>
              <strong>${esc(participant.name)}</strong>
            </div>
          </div>

          <div class="premium-money-block">
            <small>PAYOUT</small>
            <strong>¥${payout.toLocaleString('ja-JP')}</strong>
          </div>

          <div class="premium-secondary-grid">
            <div>
              <small>BET</small>
              <strong>¥${bet.toLocaleString('ja-JP')}</strong>
            </div>
            <div>
              <small>RETURN</small>
              <strong>${pct(recovery)}</strong>
            </div>
          </div>

          <div class="premium-track-line" aria-hidden="true">
            <svg viewBox="0 0 760 120">
              <g fill="none" stroke="currentColor">
                <path d="M36 92 C155 58 282 58 395 92 C505 122 620 118 724 82" stroke-width="2"/>
                <path d="M40 104 C165 72 288 72 398 104 C510 134 628 129 732 94" stroke-width="1"/>
                <path d="M580 50 V90 M580 50 H604 M604 50 V78" stroke-width="2"/>
                <path d="M558 78 H625 M558 86 H625" stroke-width="1"/>
                <path d="M155 84 q18-26 36 0 q18-26 36 0 q18-26 36 0" stroke-width="1.4"/>
              </g>
            </svg>
          </div>

          <div class="premium-barcode"></div>

          <div class="premium-ticket-foot">
            <span>${esc(ticketId)}</span>
            <b>MEMORIAL DIGITAL BET TICKET</b>
          </div>
        </div>

        <div class="premium-ticket-edge"><span>MEMORIAL</span></div>
      </section>

      <div class="premium-ticket-note">
        <span>一撃王馬券は現在の最大払戻記録を表示しています。</span>
      </div>
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
