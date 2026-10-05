const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const QRCode = require('qrcode');
const { QUESTIONS, byId, validateAnswers } = require('./questions');
const { computeStats, insights, incentiveInsight } = require('./stats');
const raffle = require('./raffle');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SESSION_COOKIE = 'kp_admin';
const SESSION_HOURS = 12;
const LOGO_FILES = ['logo.svg', 'logo.png', 'logo.webp', 'logo.jpg', 'placeholder-logo.svg'];

function createApp({
  db,
  adminPassword,
  sessionSecret,
  publicUrl,
  trustProxy = 'loopback, linklocal, uniquelocal',
  raffle: raffleConfig = {},
}) {
  const app = express();
  // Luotetaan oletuksena vain yksityisverkon välityspalvelimiin (esim. pilvipalvelun kuormantasaaja),
  // jotta X-Forwarded-For-otsaketta ei voi väärentää internetistä.
  app.set('trust proxy', trustProxy);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // Ilman SESSION_SECRETia avain luodaan kerran ja tallennetaan tietokantaan,
  // jotta kirjautuminen säilyy palvelimen uudelleenkäynnistyksen yli.
  const secret = sessionSecret || db.secret('session');
  const raffleSecret = db.secret('raffle');
  const raffleOpts = {
    organizer: raffleConfig.organizer || 'Kipinä Basket ry',
    contact: raffleConfig.contact || '',
    policyUrl: raffleConfig.policyUrl || '',
    retentionDays: Number(raffleConfig.retentionDays) || 60,
  };
  // Arvontaan voi osallistua, kun se on päällä eikä voittajaa ole vielä arvottu.
  const raffleOpen = (event) => event.raffle_enabled && !event.raffle_drawn_at;
  const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');
  const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

  const baseUrl = (req) => (publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const surveyUrl = (req, event) => `${baseUrl(req)}/k/${event.code}`;

  // --- Kirjautuminen ------------------------------------------------------

  function isAdmin(req) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return false;
    const [exp, sig] = token.split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function requireAdmin(req, res, next) {
    if (isAdmin(req)) return next();
    res.status(401).json({ error: 'Kirjaudu sisään.' });
  }

  const loginLimiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

  app.post('/api/login', loginLimiter, (req, res) => {
    const ok = crypto.timingSafeEqual(sha(req.body?.password ?? ''), sha(adminPassword));
    if (!ok) return res.status(401).json({ error: 'Väärä salasana.' });
    const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
    res.cookie(SESSION_COOKIE, `${exp}.${sign(exp)}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: SESSION_HOURS * 3600 * 1000,
    });
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  // --- Julkinen kysely ----------------------------------------------------

  app.get('/api/public/events/:code', (req, res) => {
    const event = db.getEventByCode(req.params.code);
    if (!event) return res.status(404).json({ error: 'Kyselyä ei löytynyt.' });
    res.json({
      event: publicEvent(event),
      questions: QUESTIONS,
      raffle: raffleOpen(event) ? { prize: event.raffle_prize, ...raffle.rules(event, raffleOpts) } : null,
      alreadyAnswered: Boolean(parseCookies(req)[answeredCookie(event)]),
    });
  });

  // Väljä raja: hallin wifissä tai mobiiliverkossa moni katsoja voi jakaa saman IP-osoitteen.
  const limiter = rateLimiter({ windowMs: 10 * 60 * 1000, max: 300 });

  app.post('/api/public/events/:code/responses', limiter, (req, res) => {
    const event = db.getEventByCode(req.params.code);
    if (!event) return res.status(404).json({ error: 'Kyselyä ei löytynyt.' });
    if (!event.is_open) return res.status(403).json({ error: 'Tämä kysely on suljettu.' });
    if (parseCookies(req)[answeredCookie(event)]) {
      return res.status(409).json({ error: 'Olet jo vastannut tähän kyselyyn. Kiitos!' });
    }
    const { answers, error } = validateAnswers(req.body?.answers);
    if (error) return res.status(400).json({ error });
    db.addResponse(event.id, answers);
    res.cookie(answeredCookie(event), '1', { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    // Kertakäyttöinen tunniste arvontaan. Sitä ei tallenneta vastauksen yhteyteen.
    const raffleToken = raffleOpen(event) ? raffle.createToken(raffleSecret, event.code) : undefined;
    res.status(201).json({ ok: true, raffleToken });
  });

  app.post('/api/public/events/:code/raffle', limiter, (req, res) => {
    const event = db.getEventByCode(req.params.code);
    if (!event) return res.status(404).json({ error: 'Kyselyä ei löytynyt.' });
    if (!event.raffle_enabled) return res.status(403).json({ error: 'Tässä ottelussa ei ole arvontaa.' });
    if (event.raffle_drawn_at) return res.status(403).json({ error: 'Arvonta on jo suoritettu. Kiitos osallistumisesta!' });
    const token = raffle.verifyToken(raffleSecret, event.code, req.body?.token);
    if (!token) return res.status(400).json({ error: 'Arvontaan osallistutaan vastaamalla ensin kyselyyn.' });
    if (token.expired) return res.status(410).json({ error: 'Osallistumisaika on päättynyt.' });
    const { entry, error } = raffle.validateEntry(req.body);
    if (error) return res.status(400).json({ error });
    const result = db.addRaffleEntry(event.id, { ...entry, nonce: token.nonce });
    if (result.duplicate) {
      return res.status(409).json({
        error: result.duplicate === 'token' ? 'Olet jo mukana arvonnassa.' : 'Näillä yhteystiedoilla on jo osallistuttu tähän arvontaan.',
      });
    }
    res.status(201).json({ ok: true });
  });

  // --- Hallinta: ottelut --------------------------------------------------

  app.use('/api/events', requireAdmin);

  app.get('/api/events', (req, res) => {
    const events = db.listEvents();
    const all = db.allResponses();
    const byEvent = groupBy(all, (r) => r.event_id);
    const rows = events.map((e) => {
      const s = computeStats(byEvent.get(e.id) || [], { attendance: e.attendance });
      return {
        ...e,
        url: surveyUrl(req, e),
        stats: {
          count: s.count,
          responseRate: s.responseRate,
          overall: s.overall.avg,
          nps: s.nps.score,
          aspects: Object.fromEntries(s.aspects.map((a) => [a.id, a.avg])),
        },
      };
    });
    const total = computeStats(all);
    const { comments, ...summary } = total; // kommentit näytetään vain ottelukohtaisesti
    const incentive = incentiveInsight(rows);
    res.json({
      events: rows,
      total: summary,
      insights: [...(incentive ? [incentive] : []), ...insights(total)],
      questions: QUESTIONS,
    });
  });

  app.post('/api/events', (req, res) => {
    const { fields, error } = validateEvent(req.body, true);
    if (error) return res.status(400).json({ error });
    if (fields.raffle_enabled && !fields.raffle_prize) return res.status(400).json({ error: 'Kerro arvonnan palkinto.' });
    const event = db.createEvent(fields);
    res.status(201).json({ event: { ...event, url: surveyUrl(req, event) } });
  });

  app.param('id', (req, res, next, id) => {
    const event = db.getEvent(Number(id));
    if (!event) return res.status(404).json({ error: 'Ottelua ei löytynyt.' });
    req.event = event;
    next();
  });

  app.get('/api/events/:id', (req, res) => {
    const event = req.event;
    const stats = computeStats(db.responsesFor(event.id), { attendance: event.attendance });
    // Vertailukohta: kaikki muut ottelut.
    const baseline = computeStats(db.allResponses().filter((r) => r.event_id !== event.id));
    res.json({
      event: { ...event, url: surveyUrl(req, event) },
      stats,
      baseline: { overall: baseline.overall.avg, nps: baseline.nps.score, count: baseline.count },
      insights: insights(stats, baseline),
      raffle: {
        enabled: event.raffle_enabled,
        prize: event.raffle_prize,
        drawnAt: event.raffle_drawn_at,
        entryCount: db.raffleEntryCount(event.id),
        winners: db.raffleWinners(event.id),
        retentionDays: raffleOpts.retentionDays,
        contactMissing: !raffleOpts.contact,
      },
    });
  });

  app.patch('/api/events/:id', (req, res) => {
    const { fields, error } = validateEvent(req.body, false);
    if (error) return res.status(400).json({ error });
    const merged = { ...req.event, ...fields };
    if (merged.raffle_enabled && !merged.raffle_prize) return res.status(400).json({ error: 'Kerro arvonnan palkinto.' });
    const event = db.updateEvent(req.event.id, fields);
    res.json({ event: { ...event, url: surveyUrl(req, event) } });
  });

  app.delete('/api/events/:id', (req, res) => {
    db.deleteEvent(req.event.id);
    res.json({ ok: true });
  });

  // --- Hallinta: arvonta ---------------------------------------------------

  app.get('/api/events/:id/raffle/entries', (req, res) => {
    res.json({ entries: db.raffleEntries(req.event.id) });
  });

  app.post('/api/events/:id/raffle/draw', (req, res) => {
    const event = req.event;
    if (!event.raffle_enabled) return res.status(400).json({ error: 'Arvonta ei ole käytössä tässä ottelussa.' });
    if (event.is_open) {
      return res.status(409).json({ error: 'Sulje kysely ennen arvontaa, jotta kaikki osallistujat ovat mukana.' });
    }
    const winner = db.drawWinner(event.id);
    if (!winner) return res.status(409).json({ error: 'Arvottavia osallistujia ei ole.' });
    res.json({ winner });
  });

  app.delete('/api/events/:id/raffle/entries', (req, res) => {
    res.json({ deleted: db.deleteRaffleEntries(req.event.id) });
  });

  // --- Hallinta: QR ja vienti ----------------------------------------------

  app.get('/api/events/:id/qr.:format(png|svg)', async (req, res, next) => {
    try {
      const url = surveyUrl(req, req.event);
      const opts = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#111111', light: '#ffffff' } };
      const filename = `kipina-palaute-${slug(req.event.opponent)}-${req.event.date.slice(0, 10)}`;
      if (req.query.download) res.attachment(`${filename}.${req.params.format}`);
      if (req.params.format === 'svg') {
        res.type('image/svg+xml').send(await QRCode.toString(url, { ...opts, type: 'svg' }));
      } else {
        res.type('png').send(await QRCode.toBuffer(url, { ...opts, width: Number(req.query.size) || 800 }));
      }
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/events/:id/export.csv', (req, res) => {
    const event = req.event;
    const rows = db.responsesFor(event.id);
    const header = ['Aika', ...QUESTIONS.map((q) => q.label)];
    const lines = [header, ...rows.map((r) => [r.created_at, ...QUESTIONS.map((q) => csvValue(q, r.answers[q.id]))])];
    const csv = '\ufeff' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n') + '\r\n';
    res.attachment(`kipina-palaute-${slug(event.opponent)}-${event.date.slice(0, 10)}.csv`);
    res.type('text/csv; charset=utf-8').send(csv);
  });

  // --- Sivut --------------------------------------------------------------

  app.get('/', (req, res) => res.redirect('/admin/'));
  // Seuran logo: ensimmäinen löytyvä tiedosto public/brand-kansiosta, muuten väliaikainen kuvake.
  app.get('/brand/logo', (req, res) => {
    const file = LOGO_FILES.map((f) => path.join(PUBLIC_DIR, 'brand', f)).find((f) => fs.existsSync(f));
    res.set('Cache-Control', 'public, max-age=300').sendFile(file);
  });
  app.get('/k/:code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'survey.html')));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Ei löytynyt.' }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Virheellinen pyyntö.' });
    console.error(err);
    res.status(500).json({ error: 'Palvelinvirhe.' });
  });

  return app;
}

// --- Apufunktiot ------------------------------------------------------------

function publicEvent(e) {
  return { opponent: e.opponent, date: e.date, venue: e.venue, series: e.series, is_open: e.is_open };
}

function answeredCookie(event) {
  return `kp_v_${event.code}`;
}

function validateEvent(body, creating) {
  if (!body || typeof body !== 'object') return { error: 'Tiedot puuttuvat.' };
  const fields = {};
  const str = (k, max) => {
    if (body[k] === undefined) return;
    fields[k] = String(body[k] ?? '').trim().slice(0, max);
  };
  str('opponent', 100);
  str('date', 16);
  str('venue', 100);
  str('series', 60);
  str('notes', 2000);
  if (body.attendance !== undefined) {
    if (body.attendance === null || body.attendance === '') fields.attendance = null;
    else {
      const n = Number(body.attendance);
      if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: 'Katsojamäärän pitää olla kokonaisluku.' };
      fields.attendance = n;
    }
  }
  if (body.is_open !== undefined) fields.is_open = Boolean(body.is_open);
  if (body.raffle_enabled !== undefined) fields.raffle_enabled = Boolean(body.raffle_enabled);
  str('raffle_prize', 120);

  if (creating || 'opponent' in fields) {
    if (!fields.opponent) return { error: 'Anna vastustajan nimi.' };
  }
  if (creating || 'date' in fields) {
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(fields.date || '')) return { error: 'Anna ottelun päivämäärä.' };
  }
  if (creating) {
    fields.venue ??= '';
    fields.series ??= '';
    fields.notes ??= '';
    fields.attendance ??= null;
    fields.raffle_enabled ??= false;
    fields.raffle_prize ??= '';
  }
  return { fields };
}

function csvValue(q, v) {
  if (v === undefined) return '';
  if (q.type === 'single') return byId[q.id].options.find((o) => o.id === v)?.label ?? v;
  if (q.type === 'multi') return v.map((x) => byId[q.id].options.find((o) => o.id === x)?.label ?? x).join(', ');
  return v;
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // estää kaavojen suorittamisen taulukko-ohjelmassa
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'ottelu';
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const raw = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(raw);
    } catch {
      out[part.slice(0, i).trim()] = raw; // rikkinäinen eväste ei saa kaataa pyyntöä
    }
  }
  return out;
}

function groupBy(xs, key) {
  const m = new Map();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: 'Liian monta vastausta. Yritä hetken päästä uudelleen.' });
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10000) hits.clear();
    next();
  };
}

module.exports = { createApp };
