'use strict';

const STORAGE_KEY = 'horseBetBattle.v1';
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modalBody');
const toastEl = document.querySelector('#toast');
const newCompetitionBtn = document.querySelector('#newCompetitionBtn');

const yen = value => `${Number(value || 0).toLocaleString('ja-JP')}円`;
const pct = value => value == null ? '—' : `${value.toFixed(1)}%`;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let state = loadState();
let currentCompetitionId = parseCompetitionId();

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && Array.isArray(parsed.competitions) ? parsed : { competitions: [] };
  } catch {
    return { competitions: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  if (action === 'back') location.hash = '';
  if (action === 'edit-competition') openCompetitionEdit();
  if (action === 'add-participant') openParticipantForm();
  if (action === 'add-race') openRaceForm();
  if (action === 'edit-entry') openEntryForm(event.target.closest('[data-race-id]').dataset.raceId, event.target.closest('[data-participant-id]').dataset.participantId);
  if (action === 'delete-competition') deleteCompetition();
});

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
    <div class="section-head"><div><h2>勝負一覧</h2><p class="muted">この端末のブラウザ内に保存されます。</p></div></div>
    ${state.competitions.length ? `<div class="grid cards">${state.competitions.map(competition => `
      <article class="card clickable" role="button" tabindex="0" data-open-competition="${esc(competition.id)}">
        <div class="card-title"><h3>${esc(competition.name)}</h3><span class="badge">開催中</span></div>
        <p class="muted">${esc(competition.startDate || '期間未設定')} 〜 ${esc(competition.endDate || '期間未設定')}</p>
        <div class="row"><span>👥 ${competition.participants.length}人</span><span>🏇 ${competition.races.length}レース</span></div>
      </article>`).join('')}</div>` : '<div class="empty">まだ勝負がありません。「＋ 新しい勝負」から作成してください。</div>'}`;
}

function renderCompetition(competition) {
  const summary = summaryFor(competition);
  const joinedCount = competition.races.reduce((total, race) => total + race.entries.filter(entry => entry.status === 'join').length, 0);
  const races = [...competition.races].sort((a, b) => String(a.raceDateTime).localeCompare(String(b.raceDateTime)));
  app.innerHTML = `
    <button class="button ghost" type="button" data-action="back">← 勝負一覧</button>
    <section class="hero section">
      <div class="card-title"><div><p class="eyebrow">CURRENT BATTLE</p><h2>${esc(competition.name)}</h2><p class="muted">${esc(competition.startDate || '期間未設定')} 〜 ${esc(competition.endDate || '期間未設定')}</p></div><button class="button secondary" type="button" data-action="edit-competition">トップ編集</button></div>
    </section>
    <section class="section split">
      <div class="card"><h3>ルール・賞品・お知らせ</h3><div class="rules">${esc(competition.topContent || 'まだ記載がありません。')}</div></div>
      <div class="card"><h3>現在の状況</h3><div class="stat-grid"><div class="stat">参加者<strong>${competition.participants.length}/8</strong></div><div class="stat">レース<strong>${competition.races.length}</strong></div><div class="stat">参加入力<strong>${joinedCount}</strong></div><div class="stat">保存先<strong>この端末</strong></div></div></div>
    </section>
    <section class="section">
      <div class="section-head"><div><h2>参加者</h2><p class="muted">参加者ごとに特殊権利が各3回あります。</p></div><button class="button primary" type="button" data-action="add-participant" ${competition.participants.length >= 8 ? 'disabled' : ''}>＋ 参加者</button></div>
      ${competition.participants.length ? `<div class="grid cards">${competition.participants.map(participant => { const rights = rightsForParticipant(competition, participant.id); return `<div class="card"><div class="card-title"><h3>${esc(participant.name)}</h3><div class="rights"><span class="right-pill">5,000円権 ${rights.bonusRemaining}</span><span class="right-pill">G1以外権 ${rights.nonG1Remaining}</span></div></div></div>`; }).join('')}</div>` : '<div class="empty">参加者を登録してください。</div>'}
    </section>
    <section class="section">
      <div class="section-head"><div><h2>レース</h2><p class="muted">各参加者の「入力・編集」から意気込み、賭け金、払戻額を登録します。</p></div><button class="button primary" type="button" data-action="add-race" ${competition.participants.length ? '' : 'disabled'}>＋ レース</button></div>
      ${races.length ? races.map(race => raceHtml(competition, race)).join('') : '<div class="empty">参加者を登録後、レースを追加してください。</div>'}
    </section>
    <section class="section split"><div class="card"><h2>最大払戻額ランキング</h2>${rankingTable(summary.maxPayoutRanking, 'max')}</div><div class="card"><h2>総合回収率</h2>${rankingTable(summary.recoveryRanking, 'rate')}</div></section>
    <section class="section"><button class="button danger" type="button" data-action="delete-competition">この勝負を削除</button></section>`;
}

function raceHtml(competition, race) {
  return `<article class="card race-card">
    <div class="card-title"><div><div class="row"><span class="badge">${race.gradeType === 'G1' ? 'G1' : 'G1以外'}</span></div><h3>${esc(race.name)}</h3><div class="race-meta"><span>${esc(race.raceDateTime ? race.raceDateTime.replace('T', ' ') : '日時未設定')}</span><span>${esc(race.racecourse || '')}</span></div>${race.note ? `<p class="muted">${esc(race.note)}</p>` : ''}</div></div>
    <div class="entry-list">${race.entries.map(entry => {
      const participant = competition.participants.find(item => item.id === entry.participantId);
      if (!participant) return '';
      const rights = rightsForParticipant(competition, participant.id);
      const statusText = entry.status === 'join' ? '参加' : entry.status === 'skip' ? '不参加' : '未定';
      return `<div class="entry-row" data-race-id="${esc(race.id)}" data-participant-id="${esc(participant.id)}">
        <div><strong>${esc(participant.name)}</strong><div class="rights"><span class="right-pill">5千 ${rights.bonusRemaining}</span><span class="right-pill">非G1 ${rights.nonG1Remaining}</span></div></div>
        <div><span class="value-label">参加状況</span><span class="value">${statusText}</span></div>
        <div><span class="value-label">賭け金 / 払戻額</span><span class="value">${entry.status === 'join' ? `${yen(entry.betAmount)} / ${entry.payoutAmount == null ? '未入力' : yen(entry.payoutAmount)}` : '—'}</span></div>
        <div class="entry-action"><button class="button secondary" type="button" data-action="edit-entry">入力・編集</button></div>
        ${entry.enthusiasm ? `<p class="entry-comment">「${esc(entry.enthusiasm)}」</p>` : ''}
      </div>`;
    }).join('')}</div>
  </article>`;
}

function rankingTable(rows, type) {
  if (!rows.length) return '<div class="empty">参加者がいません。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>順位</th><th>参加者</th><th>${type === 'max' ? '最大払戻額' : '回収率'}</th><th>${type === 'max' ? '対象レース' : '収支'}</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${type === 'max' ? row.rank : index + 1}</td><td>${esc(row.name)}</td><td><strong>${type === 'max' ? yen(row.maxPayout) : pct(row.recoveryRate)}</strong></td><td>${type === 'max' ? esc(row.maxPayoutRace) : yen(row.profit)}</td></tr>`).join('')}</tbody></table></div>`;
}

render();
