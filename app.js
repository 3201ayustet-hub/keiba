const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const modalBody = document.querySelector('#modalBody');
const newCompetitionBtn = document.querySelector('#newCompetitionBtn');
const yen = n => `${Number(n || 0).toLocaleString('ja-JP')}円`;
const pct = n => n == null ? '—' : `${n.toFixed(1)}%`;
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let currentCompetitionId = location.hash.replace('#/competition/','') || null;

async function api(url, options={}) {
  const res = await fetch(url, { headers:{'Content-Type':'application/json'}, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}
function toast(message) { const t=document.querySelector('#toast'); t.textContent=message; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function openModal(html) { modalBody.innerHTML=`<div class="modal-content">${html}</div>`; modal.showModal(); }
function closeModal(){ modal.close(); }

newCompetitionBtn.onclick = () => openModal(`
  <h2>新しい勝負を作成</h2>
  <label>勝負名<input id="cName" placeholder="例：2026年後期" required></label><br>
  <div class="row"><label>開始日<input id="cStart" type="date"></label><label>終了日<input id="cEnd" type="date"></label></div><br>
  <label>ルール・賞品・連絡事項<textarea id="cTop" placeholder="自由に記載できます"></textarea></label>
  <div class="modal-actions"><button class="ghost" value="cancel">キャンセル</button><button id="createCompetition" type="button" class="primary">作成</button></div>
`);
setTimeout(()=>{ const b=document.querySelector('#createCompetition'); if(b)b.onclick=createCompetition; });

async function createCompetition(){
  try {
    const c = await api('/api/competitions',{method:'POST',body:JSON.stringify({name:cName.value,startDate:cStart.value,endDate:cEnd.value,topContent:cTop.value})});
    closeModal(); location.hash=`#/competition/${c.id}`;
  } catch(e){ alert(e.message); }
}

window.addEventListener('hashchange',()=>{ currentCompetitionId=location.hash.replace('#/competition/','')||null; render(); });

async function render(){
  newCompetitionBtn.style.display = currentCompetitionId ? 'none' : '';
  app.innerHTML='<div class="empty">読み込み中...</div>';
  try { currentCompetitionId ? await renderCompetition(currentCompetitionId) : await renderList(); }
  catch(e){ app.innerHTML=`<div class="empty">${esc(e.message)}</div>`; }
}

async function renderList(){
  const items=await api('/api/competitions');
  app.innerHTML=`
    <div class="section-head"><div><h2>勝負一覧</h2><p class="muted">半年ごとに新しい勝負を作成して管理します。</p></div></div>
    ${items.length?`<div class="grid cards">${items.map(c=>`<article class="card clickable" onclick="location.hash='#/competition/${c.id}'">
      <div class="card-title"><h3>${esc(c.name)}</h3><span class="badge">${c.status==='closed'?'終了':'開催中'}</span></div>
      <p class="muted">${esc(c.startDate||'未設定')} 〜 ${esc(c.endDate||'未設定')}</p>
      <div class="row"><span>👥 ${c.participantCount}人</span><span>🏇 ${c.raceCount}レース</span></div>
    </article>`).join('')}</div>`:'<div class="empty">まだ勝負がありません。「新しい勝負」から作成してください。</div>'}`;
}

async function renderCompetition(id){
  const c=await api(`/api/competitions/${id}`);
  app.innerHTML=`
    <button class="ghost back" onclick="location.hash=''">← 勝負一覧</button>
    <section class="hero"><div class="card-title"><div><p class="eyebrow">CURRENT BATTLE</p><h2>${esc(c.name)}</h2><p class="muted">${esc(c.startDate||'期間未設定')} 〜 ${esc(c.endDate||'期間未設定')}</p></div><button class="secondary" onclick="editCompetition()">トップ編集</button></div></section>
    <section class="section split"><div class="card"><div class="section-head"><h3>ルール・賞品・お知らせ</h3></div><div class="rules">${esc(c.topContent||'まだ記載がありません。')}</div></div>
    <div class="card"><h3>現在の状況</h3><div class="stat-grid"><div class="stat">参加者<strong>${c.participants.length}/8</strong></div><div class="stat">レース<strong>${c.races.length}</strong></div><div class="stat">入力件数<strong>${c.races.reduce((n,r)=>n+r.entries.filter(e=>e.status==='join').length,0)}</strong></div><div class="stat">開催状況<strong>${c.status==='closed'?'終了':'開催中'}</strong></div></div></div></section>
    <section class="section"><div class="section-head"><div><h2>参加者</h2><p class="muted">URLを共有すれば、どの端末からでも同じ画面を操作できます。</p></div><button class="primary" onclick="addParticipant()">＋ 参加者</button></div>
      ${c.participants.length?`<div class="grid cards">${c.participants.map(p=>`<div class="card"><div class="card-title"><h3>${esc(p.name)}</h3><div class="rights"><span class="right-pill">5,000円権 ${p.bonusRemaining}</span><span class="right-pill">G1以外権 ${p.nonG1Remaining}</span></div></div></div>`).join('')}</div>`:'<div class="empty">参加者を登録してください。</div>'}
    </section>
    <section class="section"><div class="section-head"><div><h2>レース</h2><p class="muted">各参加者が意気込み・賭け金・払戻額を入力します。</p></div><button class="primary" onclick="addRace()" ${c.participants.length?'':'disabled'}>＋ レース</button></div>
      ${c.races.length?c.races.sort((a,b)=>String(a.raceDateTime).localeCompare(String(b.raceDateTime))).map(r=>raceHtml(c,r)).join(''):'<div class="empty">参加者を登録後、レースを追加してください。</div>'}
    </section>
    <section class="section split"><div class="card"><h2>最大払戻額ランキング</h2>${rankingTable(c.summary.maxPayoutRanking,'max')}</div><div class="card"><h2>総合回収率</h2>${rankingTable(c.summary.recoveryRanking,'rate')}</div></section>
  `;
  window._competition=c;
}

function raceHtml(c,r){
  return `<article class="card race-card"><div class="card-title"><div><span class="badge">${r.gradeType==='G1'?'G1':'G1以外'}</span><h3 style="margin-top:8px">${esc(r.name)}</h3><p class="muted">${esc(r.raceDateTime||'日時未設定')} ${esc(r.racecourse||'')}</p></div></div>
  ${r.entries.map(e=>{ const p=c.participants.find(x=>x.id===e.participantId); if(!p)return''; return `<div class="entry"><div class="card-title"><strong>${esc(p.name)}</strong><div class="rights"><span class="right-pill">5,000円権 ${p.bonusRemaining}</span><span class="right-pill">G1以外権 ${p.nonG1Remaining}</span></div></div>
  <div class="entry-grid" style="margin-top:10px">
    <label>参加状況<select id="status-${r.id}-${p.id}"><option value="undecided" ${e.status==='undecided'?'selected':''}>未定</option><option value="join" ${e.status==='join'?'selected':''}>参加</option><option value="skip" ${e.status==='skip'?'selected':''}>不参加</option></select></label>
    <label>賭け金<input inputmode="numeric" id="bet-${r.id}-${p.id}" type="number" min="0" max="5000" value="${e.betAmount||''}" placeholder="上限3,000"></label>
    <label>払戻額<input inputmode="numeric" id="payout-${r.id}-${p.id}" type="number" min="0" value="${e.payoutAmount??''}" placeholder="未確定"></label>
    <label>特殊権利<div class="row"><span><input style="width:auto" id="b5-${r.id}-${p.id}" type="checkbox" ${e.use5000?'checked':''}> 5,000円</span>${r.gradeType==='NON_G1'?`<span><input style="width:auto" id="ng-${r.id}-${p.id}" type="checkbox" ${e.useNonG1?'checked':''}> G1以外</span>`:''}</div></label>
    <button class="primary" onclick="saveEntry('${r.id}','${p.id}')">保存</button>
    <label class="wide">意気込み<textarea id="enth-${r.id}-${p.id}" maxlength="500" placeholder="このレースへの意気込み">${esc(e.enthusiasm)}</textarea></label>
  </div></div>`; }).join('')}</article>`;
}

function rankingTable(rows,type){
  if(!rows.length)return'<div class="empty">データがありません。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>順位</th><th>参加者</th><th>${type==='max'?'最大払戻':'回収率'}</th><th>${type==='max'?'対象レース':'収支'}</th></tr></thead><tbody>${rows.map((x,i)=>`<tr><td>${type==='max'?x.rank:i+1}</td><td>${esc(x.name)}</td><td><strong>${type==='max'?yen(x.maxPayout):pct(x.recoveryRate)}</strong></td><td>${type==='max'?esc(x.maxPayoutRace||'—'):yen(x.profit)}</td></tr>`).join('')}</tbody></table></div>`;
}

function editCompetition(){ const c=window._competition; openModal(`<h2>トップ内容を編集</h2><label>勝負名<input id="eName" value="${esc(c.name)}"></label><br><div class="row"><label>開始日<input id="eStart" type="date" value="${esc(c.startDate)}"></label><label>終了日<input id="eEnd" type="date" value="${esc(c.endDate)}"></label></div><br><label>ルール・賞品・お知らせ<textarea id="eTop">${esc(c.topContent)}</textarea></label><div class="modal-actions"><button class="ghost" value="cancel">キャンセル</button><button type="button" class="primary" onclick="saveCompetition()">保存</button></div>`); }
async function saveCompetition(){ try{await api(`/api/competitions/${currentCompetitionId}`,{method:'PUT',body:JSON.stringify({name:eName.value,startDate:eStart.value,endDate:eEnd.value,topContent:eTop.value})});closeModal();toast('保存しました');render();}catch(e){alert(e.message)} }
function addParticipant(){ openModal(`<h2>参加者を追加</h2><label>名前<input id="pName" placeholder="表示名"></label><div class="modal-actions"><button class="ghost" value="cancel">キャンセル</button><button type="button" class="primary" onclick="saveParticipant()">追加</button></div>`); }
async function saveParticipant(){ try{await api(`/api/competitions/${currentCompetitionId}/participants`,{method:'POST',body:JSON.stringify({name:pName.value})});closeModal();toast('参加者を追加しました');render();}catch(e){alert(e.message)} }
function addRace(){ openModal(`<h2>レースを追加</h2><label>レース名<input id="rName" placeholder="例：有馬記念"></label><br><div class="row"><label>日時<input id="rDate" type="datetime-local"></label><label>競馬場<input id="rPlace" placeholder="中山"></label><label>区分<select id="rGrade"><option value="G1">G1</option><option value="NON_G1">G1以外</option></select></label></div><br><label>メモ<textarea id="rNote"></textarea></label><div class="modal-actions"><button class="ghost" value="cancel">キャンセル</button><button type="button" class="primary" onclick="saveRace()">追加</button></div>`); }
async function saveRace(){ try{await api(`/api/competitions/${currentCompetitionId}/races`,{method:'POST',body:JSON.stringify({name:rName.value,raceDateTime:rDate.value,racecourse:rPlace.value,gradeType:rGrade.value,note:rNote.value})});closeModal();toast('レースを追加しました');render();}catch(e){alert(e.message)} }
async function saveEntry(rid,pid){
  const status=document.querySelector(`#status-${rid}-${pid}`).value;
  const body={status,betAmount:document.querySelector(`#bet-${rid}-${pid}`).value,payoutAmount:document.querySelector(`#payout-${rid}-${pid}`).value,use5000:document.querySelector(`#b5-${rid}-${pid}`).checked,useNonG1:document.querySelector(`#ng-${rid}-${pid}`)?.checked||false,enthusiasm:document.querySelector(`#enth-${rid}-${pid}`).value};
  try{await api(`/api/competitions/${currentCompetitionId}/races/${rid}/entries/${pid}`,{method:'PUT',body:JSON.stringify(body)});toast('入力を保存しました');render();}catch(e){alert(e.message)}
}

render();
