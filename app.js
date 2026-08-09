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

let state = { competitions: [] };
let currentCompetitionId = parseCompetitionId();
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
  const match = location.hash.match(/^#\/competition\/([^/]+)$/);
  return match ? match[1] : null;
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

newCompetitionBtn.addEventListener('click', () => {
  openModal(`
    <form id="competitionCreateForm">
      <h2>新しい勝負を作成</h2>
      <div class="form-grid">
        <label class="wide">勝負名<input name="name" required maxlength="100" placeholder="例：2026年後期"></label>
        <label>開始日<input name="startDate" type="date"></label>
        <label>終了日<input name="endDate" type="date"></label>
        <label class="wide">ルール・賞品・連絡事項<textarea name="topContent" maxlength="5000" placeholder="自由に記載できます"></textarea></label>
      </div>
      <p id="competitionCreateError" class="error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="button ghost" data-close-modal>キャンセル</button>
        <button type="submit" class="button primary">作成</button>
      </div>
    </form>`);
});

modal.addEventListener('click', event => {
  if (event.target === modal || event.target.closest('[data-close-modal]')) closeModal();
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
  render();
});

app.addEventListener('click', event => {
  const competitionCard = event.target.closest('[data-open-competition]');
  if (competitionCard) location.hash = `#/competition/${competitionCard.dataset.openCompetition}`;

  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'open-connection-settings') openConnectionSettings();
  if (action === 'back') location.hash = '';
  if (action === 'edit-competition') openCompetitionEdit();
  if (action === 'add-participant') openParticipantForm();
  if (action === 'add-race') openRaceForm();
  if (action === 'edit-entry') openEntryForm(event.target.closest('[data-race-id]').dataset.raceId, event.target.closest('[data-participant-id]').dataset.participantId);
  if (action === 'view-race') openRaceDetail(event.target.closest('[data-race-id]').dataset.raceId);
  if (action === 'view-participant') openParticipantDetail(event.target.closest('[data-participant-id]').dataset.participantId);
  if (action === 'view-rank-history') openRankHistory();
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
    <form id="competitionEditForm">
      <h2>勝負の基本情報</h2>
      <div class="form-grid">
        <label class="wide">勝負名<input name="name" required maxlength="100" value="${esc(competition.name)}"></label>
        <label>開始日<input name="startDate" type="date" value="${esc(competition.startDate)}"></label>
        <label>終了日<input name="endDate" type="date" value="${esc(competition.endDate)}"></label>
        <label class="wide">ルール・賞品・連絡事項<textarea name="topContent" maxlength="5000">${esc(competition.topContent)}</textarea></label>
      </div>
      <p id="competitionEditError" class="error" hidden></p>
      <div class="modal-actions">
        <button type="button" class="button danger" data-close-modal data-delete-from-modal>閉じる</button>
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
  const participant = { id: uid('participant'), name };
  competition.participants.push(participant);
  competition.races.forEach(race => race.entries.push(defaultEntry(participant.id)));
  saveState(); closeModal(); render(); showToast('参加者を追加しました');
}

function openParticipantEditForm(participantId) {
  const competition = getCompetition();
  const participant = competition.participants.find(item => item.id === participantId);
  if (!participant) return;
  openModal(`
    <form id="participantEditForm">
      <input type="hidden" name="participantId" value="${esc(participant.id)}">
      <h2>参加者名を変更</h2>
      <label>名前<input name="name" required maxlength="50" value="${esc(participant.name)}"></label>
      <p id="participantEditError" class="error" hidden></p>
      <div class="modal-actions"><button type="button" class="button ghost" data-close-modal>キャンセル</button><button type="submit" class="button primary">保存</button></div>
    </form>`);
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
  saveState(); closeModal(); render(); showToast('参加者名を変更しました');
}

function openRaceForm() {
  const competition = getCompetition();
  if (!competition.participants.length) return alert('先に参加者を登録してください。');
  openModal(`
    <form id="raceForm">
      <h2>レースを追加</h2>
      <div class="form-grid">
        <label class="wide">レース名<input name="name" required maxlength="100" placeholder="例：有馬記念"></label>
        <label>開催日時<input name="raceDateTime" type="datetime-local"></label>
        <label>競馬場<input name="racecourse" maxlength="50" placeholder="例：中山"></label>
        <label>区分<select name="gradeType"><option value="G1">G1</option><option value="NON_G1">G1以外</option></select></label>
        <label class="wide">メモ<textarea name="note" maxlength="1000"></textarea></label>
      </div>
      <p id="raceError" class="error" hidden></p>
      <div class="modal-actions"><button type="button" class="button ghost" data-close-modal>キャンセル</button><button type="submit" class="button primary">追加</button></div>
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
    <form id="raceEditForm">
      <input type="hidden" name="raceId" value="${esc(race.id)}">
      <h2>レース情報を編集</h2>
      <div class="form-grid">
        <label class="wide">レース名<input name="name" required maxlength="100" value="${esc(race.name)}"></label>
        <label>開催日時<input name="raceDateTime" type="datetime-local" value="${esc(race.raceDateTime || '')}"></label>
        <label>競馬場<input name="racecourse" maxlength="50" value="${esc(race.racecourse || '')}"></label>
        <label>区分<select name="gradeType"><option value="G1" ${race.gradeType === 'G1' ? 'selected' : ''}>G1</option><option value="NON_G1" ${race.gradeType === 'NON_G1' ? 'selected' : ''}>G1以外</option></select></label>
        <label class="wide">メモ<textarea name="note" maxlength="1000">${esc(race.note || '')}</textarea></label>
      </div>
      <p id="raceEditError" class="error" hidden></p>
      <div class="modal-actions"><button type="button" class="button ghost" data-close-modal>キャンセル</button><button type="submit" class="button primary">保存</button></div>
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
        <label class="wide">意気込み<textarea name="enthusiasm" maxlength="500" placeholder="このレースへの意気込み">${esc(entry.enthusiasm)}</textarea></label>
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
  if (!currentCompetitionId) return renderList();
  const competition = getCompetition();
  if (!competition) {
    currentCompetitionId = null;
    location.hash = '';
    return;
  }
  renderCompetition(competition);
}

function renderList() {
  app.innerHTML = `
    <div class="section-head"><div><h2>勝負一覧</h2><p class="muted">Supabaseを通じて複数端末で共有されます。</p></div></div>
    ${state.competitions.length ? `<div class="grid cards">${state.competitions.map(competition => `
      <article class="card clickable" role="button" tabindex="0" data-open-competition="${esc(competition.id)}">
        <div class="card-title"><h3>${esc(competition.name)}</h3><span class="badge">開催中</span></div>
        <p class="muted">${esc(competition.startDate || '期間未設定')} 〜 ${esc(competition.endDate || '期間未設定')}</p>
        <div class="row"><span>👥 ${competition.participants.length}人</span><span>🏇 ${competition.races.length}レース</span></div>
      </article>`).join('')}</div>` : '<div class="empty">まだ勝負がありません。「＋ 新しい勝負」から作成してください。</div>'}`;
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

function renderCompetition(competition) {
  const summary = summaryFor(competition);
  const races = [...competition.races].sort(raceSort);
  const champion = summary.maxPayoutRanking[0] || null;
  const topThree = summary.maxPayoutRanking.slice(0, 3);

  app.innerHTML = `
    <div class="top-nav">
      <button class="button ghost nav-button" type="button" data-action="back">← 勝負一覧</button>
      <button class="button secondary nav-button" type="button" data-action="edit-competition">ルール・設定</button>
    </div>

    <section class="battle-strip section">
      <div class="battle-main">
        <p class="eyebrow">CURRENT BATTLE</p>
        <h2>${esc(competition.name)}</h2>
        <p class="muted battle-period">${esc(shortPeriodDate(competition.startDate))} — ${esc(shortPeriodDate(competition.endDate))}</p>
      </div>
      <div class="battle-counts"><span>${competition.participants.length} PLAYERS</span><span>${competition.races.length} RACES</span></div>
    </section>

    <section class="section champion-section">
      <div class="section-head compact"><div><p class="eyebrow gold-text">MAX PAYOUT</p><h2>最大払戻額ランキング</h2></div></div>
      ${champion ? championBoard(champion, topThree) : '<div class="empty">参加者を登録するとランキングが表示されます。</div>'}
      ${competition.races.length && competition.participants.length ? '<button class="text-action rank-history-link" type="button" data-action="view-rank-history">順位推移を見る <span>›</span></button>' : ''}
    </section>

    <section class="section ranking-section">
      <div class="section-head compact"><div><p class="eyebrow">RETURN RATE</p><h2>総合回収率</h2></div></div>
      ${recoveryList(summary.recoveryRanking)}
    </section>

    <section class="section">
      <div class="section-head compact action-head"><div><p class="eyebrow">RACES</p><h2>登録レース</h2></div><button class="round-add" aria-label="レースを追加" type="button" data-action="add-race" ${competition.participants.length ? '' : 'disabled'}>＋</button></div>
      ${races.length ? `<div class="race-list premium-list">${races.map(race => raceListItem(competition, race)).join('')}</div>` : '<div class="empty">参加者を登録後、レースを追加してください。</div>'}
    </section>

    <section class="section">
      <div class="section-head compact action-head"><div><p class="eyebrow">PLAYERS</p><h2>参加者</h2></div><button class="round-add" aria-label="参加者を追加" type="button" data-action="add-participant" ${competition.participants.length >= 8 ? 'disabled' : ''}>＋</button></div>
      ${competition.participants.length ? `<div class="participant-list">${competition.participants.map(participant => participantCard(competition, summary, participant)).join('')}</div>` : '<div class="empty">参加者を登録してください。</div>'}
    </section>

    ${competition.topContent ? `<section class="section rules-section"><div class="section-head compact"><div><p class="eyebrow gold-text">RULES & PRIZE</p><h2>ルール・賞品</h2></div></div><div class="rules rules-bottom">${esc(competition.topContent)}</div></section>` : ''}

    <section class="section destructive-zone"><button class="button danger" type="button" data-action="delete-competition">この勝負を削除</button></section>`;
}

function championBoard(champion, topThree) {
  const second = topThree[1];
  const third = topThree[2];
  return `<div class="champion-board">
    <button class="champion-card" type="button" data-action="view-participant" data-participant-id="${esc(champion.participantId)}">
      <span class="champion-crown">♛</span>
      <span class="champion-label">現在の一撃王</span>
      <strong class="champion-name">${esc(champion.name)}</strong>
      <span class="champion-amount">¥${Number(champion.maxPayout || 0).toLocaleString('ja-JP')}</span>
      <span class="champion-race">${esc(champion.maxPayoutRace)}</span>
    </button>
    <div class="podium-list">
      ${second ? podiumCard(second, 2) : podiumEmpty(2)}
      ${third ? podiumCard(third, 3) : podiumEmpty(3)}
    </div>
  </div>`;
}

function podiumCard(row, rank) {
  return `<button class="podium-card" type="button" data-action="view-participant" data-participant-id="${esc(row.participantId)}">
    <span class="podium-rank">${rank}</span>
    <span class="podium-person"><strong>${esc(row.name)}</strong><small>${esc(row.maxPayoutRace)}</small></span>
    <b>¥${Number(row.maxPayout || 0).toLocaleString('ja-JP')}</b>
  </button>`;
}

function podiumEmpty(rank) {
  return `<div class="podium-card empty-podium"><span class="podium-rank">${rank}</span><span class="podium-person">未登録</span></div>`;
}

function recoveryList(rows) {
  if (!rows.length) return '<div class="empty">参加者がいません。</div>';
  return `<div class="ranking-list">${rows.map((row, index) => `<button type="button" class="ranking-row" data-action="view-participant" data-participant-id="${esc(row.participantId)}">
    <span class="rank-no">${index + 1}</span>
    <span class="rank-name">${esc(row.name)}<small class="profit ${row.profit > 0 ? 'plus' : row.profit < 0 ? 'minus' : 'neutral'}">${row.profit > 0 ? '+' : ''}${yen(row.profit)}</small></span>
    <strong class="rank-rate">${pct(row.recoveryRate)}</strong>
  </button>`).join('')}</div>`;
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
  return `<button class="participant-card" type="button" data-action="view-participant" data-participant-id="${esc(participant.id)}">
    <span class="participant-card-main"><strong>${esc(participant.name)}</strong><small>回収率 ${pct(row?.recoveryRate)}</small></span>
    <span class="mini-rights"><small>5千 ×${rights.bonusRemaining}</small><span>・</span><small>非G1 ×${rights.nonG1Remaining}</small></span>
    <span class="participant-chevron">›</span>
  </button>`;
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

function openRankHistory() {
  const competition = getCompetition();
  const history = rankHistoryData(competition);
  if (!history.points.length) {
    openModal(`<div class="detail-head"><div><p class="eyebrow">RANK HISTORY</p><h2>順位推移</h2></div><button class="button ghost" type="button" data-close-modal>閉じる</button></div><div class="empty">払戻額が入力されたレースがまだありません。</div>`);
    return;
  }
  const participants = competition.participants;
  const palette = ['#2fd18b','#e6bd55','#6da8ff','#f47d73','#b58cff','#57d2d8','#ff9f52','#d8df72'];
  const width = Math.max(620, 150 + history.points.length * 92);
  const height = Math.max(300, 110 + participants.length * 54);
  const left = 74, right = 36, top = 28, bottom = 78;
  const xStep = history.points.length > 1 ? (width - left - right) / (history.points.length - 1) : 0;
  const yStep = participants.length > 1 ? (height - top - bottom) / (participants.length - 1) : 0;
  const yForRank = rank => top + (rank - 1) * yStep;
  const xForIndex = index => left + index * xStep;

  const grid = participants.map((_, i) => {
    const y = yForRank(i + 1);
    return `<line x1="${left}" y1="${y}" x2="${width-right}" y2="${y}" class="chart-grid"/><text x="${left-16}" y="${y+5}" text-anchor="end" class="chart-rank">${i+1}位</text>`;
  }).join('');

  const lines = participants.map((participant, pi) => {
    const coords = history.points.map((point, index) => {
      const row = point.ranked.find(item => item.participantId === participant.id);
      return [xForIndex(index), yForRank(row?.rank || participants.length)];
    });
    const path = coords.map(([x,y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const dots = coords.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${palette[pi % palette.length]}"/>`).join('');
    return `<path d="${path}" fill="none" stroke="${palette[pi % palette.length]}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
  }).join('');

  const labels = history.points.map((point, i) => `<text x="${xForIndex(i)}" y="${height-35}" text-anchor="middle" class="chart-race-label">${esc(shortRaceLabel(point.race.name))}</text><text x="${xForIndex(i)}" y="${height-17}" text-anchor="middle" class="chart-date-label">${esc(formatRaceDateCompact(point.race.raceDateTime))}</text>`).join('');
  const legend = participants.map((p, i) => `<span><i style="--legend-color:${palette[i % palette.length]}"></i>${esc(p.name)}</span>`).join('');
  const eventHtml = history.events.length ? `<div class="king-events"><h3>首位交代</h3>${history.events.map(event => `<div><span><strong>${esc(event.names)}</strong><small>${esc(event.race.name)} ・ ${formatRaceDateCompact(event.race.raceDateTime)}</small></span><b>¥${Number(event.value).toLocaleString('ja-JP')}</b></div>`).join('')}</div>` : '';

  openModal(`<div class="detail-head chart-head"><div><p class="eyebrow gold-text">RANK HISTORY</p><h2>最大払戻額 順位推移</h2><p class="muted">各レース終了時点までの最高払戻額で順位を再計算しています。</p></div><button class="button ghost" type="button" data-close-modal>閉じる</button></div>
    <div class="chart-legend">${legend}</div>
    <div class="rank-chart-scroll"><svg class="rank-chart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="最大払戻額ランキングの順位推移">${grid}${lines}${labels}</svg></div>
    ${eventHtml}`);
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
  openModal(`<div class="detail-head"><div><span class="badge">${race.gradeType === 'G1' ? 'G1' : 'G1以外'}</span><h2>${esc(race.name)}</h2><p class="muted">${esc(race.raceDateTime ? race.raceDateTime.replace('T', ' ') : '日時未設定')} ${esc(race.racecourse || '')}</p></div><div class="detail-actions"><button class="button secondary" type="button" data-action="edit-race" data-race-id="${esc(race.id)}">レース編集</button><button class="button ghost" type="button" data-close-modal>閉じる</button></div></div>
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
  openModal(`<div class="profile-hero"><span class="profile-avatar">${esc(participant.name.slice(0,1))}</span><div class="profile-title"><p class="eyebrow">PLAYER PROFILE</p><h2>${esc(participant.name)}</h2></div><div class="profile-actions"><button class="button secondary" type="button" data-action="edit-participant" data-participant-id="${esc(participant.id)}">名前変更</button><button class="button danger" type="button" data-action="delete-participant" data-participant-id="${esc(participant.id)}">削除</button><button class="button ghost" type="button" data-close-modal>閉じる</button></div></div>
    <div class="profile-stats">
      <div><small>総回収率</small><strong>${pct(row.recoveryRate)}</strong></div>
      <div><small>総収支</small><strong class="${row.profit >= 0 ? 'plus' : 'minus'}">${row.profit >= 0 ? '+' : ''}${yen(row.profit)}</strong></div>
      <div><small>最大払戻</small><strong>${yen(row.maxPayout)}</strong></div>
      <div><small>総払戻</small><strong>${yen(row.totalPayout)}</strong></div>
    </div>
    <div class="profile-rights">${rightCard('5,000円権', rights.bonusRemaining, 'diamond')}${rightCard('G1以外権', rights.nonG1Remaining, 'circle')}</div>
    <h3 class="detail-subtitle">レース履歴</h3>
    ${history.length ? `<div class="history-list">${history.map(({race,entry}) => `<div><span><strong>${esc(race.name)}</strong><small>${formatRaceDate(race.raceDateTime)}</small></span><span>${yen(entry.betAmount)} → <b>${entry.payoutAmount == null ? '未入力' : yen(entry.payoutAmount)}</b></span></div>`).join('')}</div>` : '<div class="empty">参加済みのレースはありません。</div>'}`);
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
});

startApp();
