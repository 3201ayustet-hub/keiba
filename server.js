const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ competitions: [] }, null, 2));
}

let writeQueue = Promise.resolve();

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  writeQueue = writeQueue.then(() => {
    const temp = `${DB_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(db, null, 2));
    fs.renameSync(temp, DB_FILE);
  });
  return writeQueue;
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data)
  });
  res.end(data);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request too large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getCompetition(db, competitionId) {
  return db.competitions.find(c => c.id === competitionId);
}

function getRace(competition, raceId) {
  return competition.races.find(r => r.id === raceId);
}

function calculateCompetition(competition) {
  const members = competition.participants.map(p => {
    const entries = competition.races
      .map(r => ({ race: r, entry: r.entries.find(e => e.participantId === p.id) }))
      .filter(x => x.entry && x.entry.status === 'join');

    const betTotal = entries.reduce((sum, x) => sum + Number(x.entry.betAmount || 0), 0);
    const payoutTotal = entries.reduce((sum, x) => sum + Number(x.entry.payoutAmount || 0), 0);
    const max = entries.reduce((best, x) => {
      if (!best || Number(x.entry.payoutAmount || 0) > Number(best.entry.payoutAmount || 0)) return x;
      return best;
    }, null);

    return {
      ...p,
      raceCount: entries.length,
      betTotal,
      payoutTotal,
      profit: payoutTotal - betTotal,
      recoveryRate: betTotal > 0 ? payoutTotal / betTotal * 100 : null,
      maxPayout: max ? Number(max.entry.payoutAmount || 0) : 0,
      maxPayoutRace: max ? max.race.name : null
    };
  });

  const maxPayoutRanking = [...members].sort((a, b) => b.maxPayout - a.maxPayout || a.name.localeCompare(b.name, 'ja'));
  let lastValue = null;
  let lastRank = 0;
  maxPayoutRanking.forEach((m, index) => {
    if (m.maxPayout !== lastValue) lastRank = index + 1;
    m.rank = lastRank;
    lastValue = m.maxPayout;
  });

  const recoveryRanking = [...members].sort((a, b) => {
    const ar = a.recoveryRate ?? -1;
    const br = b.recoveryRate ?? -1;
    return br - ar || b.payoutTotal - a.payoutTotal;
  });

  return { members, maxPayoutRanking, recoveryRanking };
}

function validateEntry(participant, race, payload) {
  const status = payload.status || 'undecided';
  const betAmount = Number(payload.betAmount ?? 0);
  const payoutAmount = payload.payoutAmount === '' || payload.payoutAmount == null ? null : Number(payload.payoutAmount);
  const use5000 = Boolean(payload.use5000);
  const useNonG1 = Boolean(payload.useNonG1);

  if (!['undecided', 'join', 'skip'].includes(status)) return '参加状況が不正です。';
  if (status === 'join') {
    if (!Number.isInteger(betAmount) || betAmount < 1) return '賭け金は1円以上の整数で入力してください。';
    if (!use5000 && betAmount > 3000) return '3,000円を超える場合は5,000円権を選択してください。';
    if (use5000 && betAmount > 5000) return '5,000円権を使った場合も上限は5,000円です。';
    if (use5000 && participant.bonusRemaining <= 0) return '5,000円権の残数がありません。';
    if (race.gradeType === 'NON_G1' && !useNonG1) return 'G1以外のレースに参加するにはG1以外権が必要です。';
    if (race.gradeType === 'NON_G1' && useNonG1 && participant.nonG1Remaining <= 0) return 'G1以外権の残数がありません。';
  }
  if (payoutAmount !== null && (!Number.isInteger(payoutAmount) || payoutAmount < 0)) return '払戻額は0円以上の整数で入力してください。';
  if ((payload.enthusiasm || '').length > 500) return '意気込みは500文字以内で入力してください。';
  return null;
}

async function api(req, res, segments) {
  const db = readDb();
  const method = req.method;

  if (method === 'GET' && segments.length === 1 && segments[0] === 'competitions') {
    return sendJson(res, 200, db.competitions.map(c => ({
      id: c.id, name: c.name, startDate: c.startDate, endDate: c.endDate,
      status: c.status, participantCount: c.participants.length, raceCount: c.races.length
    })));
  }

  if (method === 'POST' && segments.length === 1 && segments[0] === 'competitions') {
    const body = await readBody(req);
    if (!String(body.name || '').trim()) return sendError(res, 400, '勝負名を入力してください。');
    const competition = {
      id: id(),
      name: String(body.name).trim(),
      startDate: body.startDate || '',
      endDate: body.endDate || '',
      status: body.status || 'active',
      topContent: body.topContent || '',
      participants: [], races: [], createdAt: now(), updatedAt: now()
    };
    db.competitions.unshift(competition);
    await writeDb(db);
    return sendJson(res, 201, competition);
  }

  if (segments[0] === 'competitions' && segments[1]) {
    const competition = getCompetition(db, segments[1]);
    if (!competition) return sendError(res, 404, '勝負が見つかりません。');

    if (method === 'GET' && segments.length === 2) {
      return sendJson(res, 200, { ...competition, summary: calculateCompetition(competition) });
    }

    if (method === 'PUT' && segments.length === 2) {
      const body = await readBody(req);
      competition.name = String(body.name ?? competition.name).trim();
      competition.startDate = body.startDate ?? competition.startDate;
      competition.endDate = body.endDate ?? competition.endDate;
      competition.status = body.status ?? competition.status;
      competition.topContent = body.topContent ?? competition.topContent;
      competition.updatedAt = now();
      await writeDb(db);
      return sendJson(res, 200, competition);
    }

    if (method === 'POST' && segments[2] === 'participants' && segments.length === 3) {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendError(res, 400, '参加者名を入力してください。');
      if (competition.participants.length >= 8) return sendError(res, 400, '参加者は最大8人です。');
      if (competition.participants.some(p => p.name === name)) return sendError(res, 400, '同じ名前の参加者がいます。');
      const participant = { id: id(), name, bonusRemaining: 3, nonG1Remaining: 3, createdAt: now() };
      competition.participants.push(participant);
      competition.races.forEach(r => r.entries.push({ participantId: participant.id, status: 'undecided', enthusiasm: '', betAmount: 0, payoutAmount: null, use5000: false, useNonG1: false, updatedAt: now() }));
      await writeDb(db);
      return sendJson(res, 201, participant);
    }

    if (method === 'POST' && segments[2] === 'races' && segments.length === 3) {
      const body = await readBody(req);
      if (!String(body.name || '').trim()) return sendError(res, 400, 'レース名を入力してください。');
      const race = {
        id: id(), name: String(body.name).trim(), raceDateTime: body.raceDateTime || '',
        racecourse: body.racecourse || '', gradeType: body.gradeType === 'NON_G1' ? 'NON_G1' : 'G1',
        note: body.note || '', createdAt: now(),
        entries: competition.participants.map(p => ({ participantId: p.id, status: 'undecided', enthusiasm: '', betAmount: 0, payoutAmount: null, use5000: false, useNonG1: false, updatedAt: now() }))
      };
      competition.races.push(race);
      await writeDb(db);
      return sendJson(res, 201, race);
    }

    if (segments[2] === 'races' && segments[3]) {
      const race = getRace(competition, segments[3]);
      if (!race) return sendError(res, 404, 'レースが見つかりません。');

      if (method === 'PUT' && segments[4] === 'entries' && segments[5]) {
        const participant = competition.participants.find(p => p.id === segments[5]);
        if (!participant) return sendError(res, 404, '参加者が見つかりません。');
        const body = await readBody(req);
        const current = race.entries.find(e => e.participantId === participant.id);
        const error = validateEntry(participant, race, body);
        if (error) return sendError(res, 400, error);

        const old5000 = Boolean(current.use5000 && current.status === 'join');
        const new5000 = Boolean(body.use5000 && body.status === 'join');
        const oldNonG1 = Boolean(current.useNonG1 && current.status === 'join' && race.gradeType === 'NON_G1');
        const newNonG1 = Boolean(body.useNonG1 && body.status === 'join' && race.gradeType === 'NON_G1');

        const nextBonus = participant.bonusRemaining + (old5000 ? 1 : 0) - (new5000 ? 1 : 0);
        const nextNonG1 = participant.nonG1Remaining + (oldNonG1 ? 1 : 0) - (newNonG1 ? 1 : 0);
        if (nextBonus < 0) return sendError(res, 400, '5,000円権の残数がありません。');
        if (nextNonG1 < 0) return sendError(res, 400, 'G1以外権の残数がありません。');

        participant.bonusRemaining = nextBonus;
        participant.nonG1Remaining = nextNonG1;
        Object.assign(current, {
          status: body.status,
          enthusiasm: String(body.enthusiasm || ''),
          betAmount: body.status === 'join' ? Number(body.betAmount) : 0,
          payoutAmount: body.status === 'join' && body.payoutAmount !== '' && body.payoutAmount != null ? Number(body.payoutAmount) : null,
          use5000: new5000,
          useNonG1: newNonG1,
          updatedAt: now()
        });
        competition.updatedAt = now();
        await writeDb(db);
        return sendJson(res, 200, { entry: current, participant });
      }
    }
  }

  sendError(res, 404, 'APIが見つかりません。');
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const safePath = path.normalize(urlPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const index = path.join(PUBLIC_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(index).pipe(res);
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const segments = req.url.split('?')[0].split('/').filter(Boolean).slice(1);
      return await api(req, res, segments);
    }
    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendError(res, 500, error.message || 'サーバーエラーが発生しました。');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Horse Bet Battle MVP running at http://${HOST}:${PORT}`);
});
