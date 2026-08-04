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
const pct = value => value == null ? '—' : `${value.toFixed(1)}%`;
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
  if (form.id === 'raceForm') createRace(form);
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

function renderCompetition(competition) {
  const summary = summaryFor(competition);
  const races = [...competition.races].sort((a, b) => String(a.raceDateTime).localeCompare(String(b.raceDateTime)));
  const champion = summary.maxPayoutRanking[0] || null;
  const topThree = summary.maxPayoutRanking.slice(0, 3);

  app.innerHTML = `
    <div class="top-nav">
      <button class="button ghost" type="button" data-action="back">← 勝負一覧</button>
      <button class="button secondary" type="button" data-action="edit-competition">ルール・設定</button>
    </div>

    <section class="battle-strip section">
      <div>
        <p class="eyebrow">CURRENT BATTLE</p>
        <h2>${esc(competition.name)}</h2>
        <p class="muted">${esc(competition.startDate || '期間未設定')} 〜 ${esc(competition.endDate || '期間未設定')}</p>
      </div>
      <div class="battle-counts"><span>👥 ${competition.participants.length}人</span><span>🏇 ${competition.races.length}レース</span></div>
    </section>

    <section class="section champion-section">
      <div class="section-head compact"><div><p class="eyebrow gold-text">MAX PAYOUT</p><h2>最大払戻額ランキング</h2></div></div>
      ${champion ? championBoard(champion, topThree) : '<div class="empty">参加者を登録するとランキングが表示されます。</div>'}
    </section>

    <section class="section card compact-card">
      <div class="section-head compact"><h2>総合回収率</h2></div>
      ${recoveryList(summary.recoveryRanking)}
    </section>

    <section class="section">
      <div class="section-head compact"><div><h2>登録レース</h2><p class="muted">詳細画面から意気込み・賭け金・払戻額を入力します。</p></div><button class="button primary" type="button" data-action="add-race" ${competition.participants.length ? '' : 'disabled'}>＋ レース</button></div>
      ${races.length ? `<div class="race-list">${races.map(race => raceListItem(competition, race)).join('')}</div>` : '<div class="empty">参加者を登録後、レースを追加してください。</div>'}
    </section>

    <section class="section">
      <div class="section-head compact"><div><h2>参加者</h2><p class="muted">カードを選ぶと個人成績を確認できます。</p></div><button class="button primary" type="button" data-action="add-participant" ${competition.participants.length >= 8 ? 'disabled' : ''}>＋ 参加者</button></div>
      ${competition.participants.length ? `<div class="participant-grid">${competition.participants.map((participant, index) => participantCard(competition, summary, participant, index)).join('')}</div>` : '<div class="empty">参加者を登録してください。</div>'}
    </section>

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
      <span class="champion-amount">${yen(champion.maxPayout)}</span>
      <span class="champion-race">${esc(champion.maxPayoutRace)}</span>
    </button>
    <div class="podium-row">
      ${second ? podiumCard(second, 2) : podiumEmpty(2)}
      ${third ? podiumCard(third, 3) : podiumEmpty(3)}
    </div>
  </div>`;
}

function podiumCard(row, rank) {
  return `<button class="podium-card" type="button" data-action="view-participant" data-participant-id="${esc(row.participantId)}">
    <span class="podium-rank">${rank}</span><span><strong>${esc(row.name)}</strong><small>${esc(row.maxPayoutRace)}</small></span><b>${yen(row.maxPayout)}</b>
  </button>`;
}

function podiumEmpty(rank) {
  return `<div class="podium-card empty-podium"><span class="podium-rank">${rank}</span><span>未登録</span></div>`;
}

function recoveryList(rows) {
  if (!rows.length) return '<div class="empty">参加者がいません。</div>';
  return `<div class="ranking-list">${rows.map((row, index) => `<button type="button" class="ranking-row" data-action="view-participant" data-participant-id="${esc(row.participantId)}">
    <span class="rank-no">${index + 1}</span><span class="rank-name">${esc(row.name)}</span><strong>${pct(row.recoveryRate)}</strong><span class="profit ${row.profit >= 0 ? 'plus' : 'minus'}">${row.profit >= 0 ? '+' : ''}${yen(row.profit)}</span>
  </button>`).join('')}</div>`;
}

function raceListItem(competition, race) {
  const completed = race.entries.filter(entry => entry.status !== 'undecided').length;
  const joined = race.entries.filter(entry => entry.status === 'join').length;
  return `<article class="race-list-item" data-race-id="${esc(race.id)}">
    <div class="race-date"><strong>${formatRaceDate(race.raceDateTime)}</strong><small>${formatRaceTime(race.raceDateTime)}</small></div>
    <div class="race-main"><div class="row"><span class="badge">${race.gradeType === 'G1' ? 'G1' : 'G1以外'}</span>${race.racecourse ? `<span class="muted">${esc(race.racecourse)}</span>` : ''}</div><h3>${esc(race.name)}</h3><p class="muted">入力 ${completed}/${competition.participants.length}人 ・ 参加 ${joined}人</p></div>
    <button class="button secondary race-open" type="button" data-action="view-race">詳細</button>
  </article>`;
}

function participantCard(competition, summary, participant, index) {
  const row = summary.rows.find(item => item.participantId === participant.id);
  const rights = rightsForParticipant(competition, participant.id);
  return `<button class="participant-card" type="button" data-action="view-participant" data-participant-id="${esc(participant.id)}">
    <span class="avatar">${esc(participant.name.slice(0, 1))}</span>
    <span class="participant-card-main"><strong>${esc(participant.name)}</strong><small>回収率 ${pct(row?.recoveryRate)}</small></span>
    <span class="mini-rights"><small>5千 ${rights.bonusRemaining}</small><small>非G1 ${rights.nonG1Remaining}</small></span>
  </button>`;
}

function openRaceDetail(raceId) {
  const competition = getCompetition();
  const race = competition.races.find(item => item.id === raceId);
  if (!race) return;
  openModal(`<div class="detail-head"><div><span class="badge">${race.gradeType === 'G1' ? 'G1' : 'G1以外'}</span><h2>${esc(race.name)}</h2><p class="muted">${esc(race.raceDateTime ? race.raceDateTime.replace('T', ' ') : '日時未設定')} ${esc(race.racecourse || '')}</p></div><button class="button ghost" type="button" data-close-modal>閉じる</button></div>
    ${race.note ? `<p class="rules">${esc(race.note)}</p>` : ''}
    <div class="detail-entry-list">${race.entries.map(entry => raceEntryRow(competition, race, entry)).join('')}</div>`);
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
  openModal(`<div class="profile-hero"><span class="profile-avatar">${esc(participant.name.slice(0,1))}</span><div><p class="eyebrow">PLAYER PROFILE</p><h2>${esc(participant.name)}</h2></div><button class="button ghost" type="button" data-close-modal>閉じる</button></div>
    <div class="profile-stats">
      <div><small>総回収率</small><strong>${pct(row.recoveryRate)}</strong></div>
      <div><small>総収支</small><strong class="${row.profit >= 0 ? 'plus' : 'minus'}">${row.profit >= 0 ? '+' : ''}${yen(row.profit)}</strong></div>
      <div><small>最大払戻</small><strong>${yen(row.maxPayout)}</strong></div>
      <div><small>総払戻</small><strong>${yen(row.totalPayout)}</strong></div>
    </div>
    <div class="profile-rights"><div><span>5,000円権</span><strong>${rightsDots(rights.bonusRemaining, '◆')}</strong><small>残り${rights.bonusRemaining}回</small></div><div><span>G1以外権</span><strong>${rightsDots(rights.nonG1Remaining, '●')}</strong><small>残り${rights.nonG1Remaining}回</small></div></div>
    <h3 class="detail-subtitle">レース履歴</h3>
    ${history.length ? `<div class="history-list">${history.map(({race,entry}) => `<div><span><strong>${esc(race.name)}</strong><small>${formatRaceDate(race.raceDateTime)}</small></span><span>${yen(entry.betAmount)} → <b>${entry.payoutAmount == null ? '未入力' : yen(entry.payoutAmount)}</b></span></div>`).join('')}</div>` : '<div class="empty">参加済みのレースはありません。</div>'}`);
}

function rightsDots(remaining, symbol) {
  return Array.from({length:3}, (_,i) => `<span class="${i < remaining ? 'active' : ''}">${symbol}</span>`).join('');
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
});

startApp();
