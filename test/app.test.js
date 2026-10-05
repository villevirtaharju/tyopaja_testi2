const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { computeStats, insights, incentiveInsight } = require('../src/stats');
const { validateAnswers } = require('../src/questions');
const raffle = require('../src/raffle');

let server, base, db, cookie;

before(async () => {
  db = openDb(':memory:');
  const app = createApp({
    db,
    adminPassword: 'salainen',
    publicUrl: 'https://palaute.example.fi',
    raffle: { organizer: 'Kipinä Basket ry', contact: 'toimisto@example.fi' },
  });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const req = (path, { method = 'GET', body, headers = {} } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });

test('hallinta vaatii kirjautumisen', async () => {
  assert.equal((await req('/api/events')).status, 401);
  assert.equal((await req('/api/events/1')).status, 401);
  assert.equal((await req('/api/login', { method: 'POST', body: { password: 'väärä' } })).status, 401);
  const r = await req('/api/login', { method: 'POST', body: { password: 'salainen' } });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/events', { headers: { cookie } })).status, 200);
  // väärennetty tai rikkinäinen eväste ei päästä sisään eikä kaada palvelinta
  assert.equal((await req('/api/events', { headers: { cookie: 'kp_admin=99999999999999.%E0%A4%A' } })).status, 401);
  assert.equal((await req('/api/events', { headers: { cookie: `kp_admin=99999999999999.${'ä'.repeat(43)}` } })).status, 401);
});

test('ottelun luonti, kysely, vastaukset ja dashboard', async () => {
  let r = await req('/api/events', { method: 'POST', headers: { cookie }, body: { opponent: '', date: '2026-10-10' } });
  assert.equal(r.status, 400);

  r = await req('/api/events', { method: 'POST', headers: { cookie }, body: { opponent: 'Karhu', date: '2026-10-10T18:00', attendance: '200' } });
  assert.equal(r.status, 201);
  const { event } = await r.json();
  assert.match(event.url, /^https:\/\/palaute\.example\.fi\/k\/[a-z0-9]{8}$/);
  assert.equal(event.attendance, 200);

  // julkinen kysely
  r = await req(`/api/public/events/${event.code}`);
  const pub = await r.json();
  assert.equal(pub.event.opponent, 'Karhu');
  assert.ok(pub.questions.length > 5);
  assert.equal(pub.event.code, undefined);
  assert.equal((await req('/api/public/events/eiolemassa')).status, 404);

  // pakollinen puuttuu
  r = await req(`/api/public/events/${event.code}/responses`, { method: 'POST', body: { answers: { overall: 4 } } });
  assert.equal(r.status, 400);

  r = await req(`/api/public/events/${event.code}/responses`, {
    method: 'POST',
    body: { answers: { overall: 5, nps: 10, aspect_kioski: 2, visits: 'first', source: ['instagram', 'friends'], improve: 'Kioskijono' } },
  });
  assert.equal(r.status, 201);
  const voted = r.headers.get('set-cookie').split(';')[0];

  // sama selain ei voi vastata kahdesti
  r = await req(`/api/public/events/${event.code}/responses`, { method: 'POST', headers: { cookie: voted }, body: { answers: { overall: 1, nps: 0 } } });
  assert.equal(r.status, 409);

  await req(`/api/public/events/${event.code}/responses`, { method: 'POST', body: { answers: { overall: 3, nps: 5, visits: 'season' } } });

  r = await req(`/api/events/${event.id}`, { headers: { cookie } });
  const dash = await r.json();
  assert.equal(dash.stats.count, 2);
  assert.equal(dash.stats.overall.avg, 4);
  assert.equal(dash.stats.nps.score, 0); // 1 suosittelija, 1 arvostelija
  assert.equal(dash.stats.responseRate, 1);
  assert.equal(dash.stats.choices.source.options.find((o) => o.id === 'instagram').count, 1);
  assert.equal(dash.stats.comments[0].improve, 'Kioskijono');

  // vertailukohta lasketaan muista otteluista, ei ottelusta itsestään
  assert.equal(dash.baseline.count, 0);
  assert.equal(dash.baseline.overall, null);

  // suljettu kysely ei ota vastauksia
  await req(`/api/events/${event.id}`, { method: 'PATCH', headers: { cookie }, body: { is_open: false } });
  r = await req(`/api/public/events/${event.code}/responses`, { method: 'POST', body: { answers: { overall: 3, nps: 5 } } });
  assert.equal(r.status, 403);

  // QR ja CSV
  r = await req(`/api/events/${event.id}/qr.png`, { headers: { cookie } });
  assert.equal(r.headers.get('content-type'), 'image/png');
  r = await req(`/api/events/${event.id}/qr.svg`, { headers: { cookie } });
  assert.match(await r.text(), /<svg/);
  r = await req(`/api/events/${event.id}/export.csv`, { headers: { cookie } });
  const csv = await r.text();
  assert.match(csv, /Ensimmäinen/);
  assert.match(csv, /Instagram, Kaverit tai perhe/);

  // yleisnäkymä
  r = await req('/api/events', { headers: { cookie } });
  const list = await r.json();
  assert.equal(list.events[0].stats.count, 2);
  assert.equal(list.total.count, 2);

  // poisto poistaa myös vastaukset
  await req(`/api/events/${event.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(db.allResponses().length, 0);
});

test('vastausten validointi', () => {
  assert.ok(validateAnswers({ overall: 6, nps: 5 }).error);
  assert.ok(validateAnswers({ overall: 3, nps: 11 }).error);
  assert.ok(validateAnswers({ overall: 3, nps: 5, visits: 'jotain' }).error);
  assert.ok(validateAnswers({ overall: 3, nps: 5, source: ['instagram', 'xx'] }).error);
  const ok = validateAnswers({ overall: '4', nps: 9, best: '  hyvä  ', extra: 'ohitetaan' });
  assert.deepEqual(ok.answers, { overall: 4, nps: 9, best: 'hyvä' });
});

test('CSV estää kaavainjektion', async () => {
  const { event } = await (await req('/api/events', { method: 'POST', headers: { cookie }, body: { opponent: 'X', date: '2026-10-11' } })).json();
  await req(`/api/public/events/${event.code}/responses`, { method: 'POST', body: { answers: { overall: 3, nps: 5, best: '=HYPERLINK("x")' } } });
  const csv = await (await req(`/api/events/${event.id}/export.csv`, { headers: { cookie } })).text();
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
});

test('havainnot nostavat heikoimman osa-alueen', () => {
  const responses = Array.from({ length: 12 }, () => ({
    created_at: '2026-10-10T20:00:00Z',
    answers: { overall: 4, nps: 9, aspect_tunnelma: 5, aspect_kioski: 2, visits: 'first', return: 'yes' },
  }));
  const s = computeStats(responses);
  const texts = insights(s).map((i) => i.text).join('\n');
  assert.match(texts, /Vahvin osa-alue: Tunnelma/);
  assert.match(texts, /Eniten parannettavaa: Kioski/);
  assert.match(texts, /100 % aikoo tulla uudelleen/);
  assert.equal(s.nps.score, 100);
});

// --- Arvonta ------------------------------------------------------------------

const answer = async (code) => {
  const r = await req(`/api/public/events/${code}/responses`, { method: 'POST', body: { answers: { overall: 4, nps: 8 } } });
  assert.equal(r.status, 201);
  return (await r.json()).raffleToken;
};
const enter = (code, body) => req(`/api/public/events/${code}/raffle`, { method: 'POST', body: { consent: true, ...body } });

test('arvonta: vain vastanneille, kerran per henkilö, ja voittaja vasta suljetusta kyselystä', async () => {
  const admin = { headers: { cookie } };
  let r = await req('/api/events', { method: 'POST', ...admin, body: { opponent: 'Arpa', date: '2026-10-12', raffle_enabled: true } });
  assert.equal(r.status, 400, 'palkinto on pakollinen');
  r = await req('/api/events', { method: 'POST', ...admin, body: { opponent: 'Arpa', date: '2026-10-12', raffle_enabled: true, raffle_prize: 'Pelaajan pelipaita' } });
  const { event } = await r.json();
  const { event: other } = await (await req('/api/events', { method: 'POST', ...admin, body: { opponent: 'Muu', date: '2026-10-13' } })).json();

  // kysely kertoo palkinnon ja säännöt
  const pub = await (await req(`/api/public/events/${event.code}`)).json();
  assert.equal(pub.raffle.prize, 'Pelaajan pelipaita');
  assert.match(pub.raffle.rules.join(' '), /Pelaajan pelipaita/);
  assert.match(pub.raffle.privacy, /toimisto@example\.fi/);
  assert.equal((await (await req(`/api/public/events/${other.code}`)).json()).raffle, null);
  assert.equal(await answer(other.code), undefined, 'ilman arvontaa ei tunnistetta');

  // ilman vastausta ei pääse arvontaan, eikä toisen ottelun tai muokatulla tunnisteella
  assert.equal((await enter(event.code, { name: 'Teppo Testi', email: 'teppo@example.fi' })).status, 400);
  const t1 = await answer(event.code);
  assert.ok(t1);
  assert.equal((await enter(event.code, { token: t1.replace(/.$/, 'x'), name: 'Teppo Testi', email: 'teppo@example.fi' })).status, 400);
  const otherEvt = db.getEvent(other.id);
  db.updateEvent(other.id, { raffle_enabled: true, raffle_prize: 'Pipo' });
  assert.equal((await enter(otherEvt.code, { token: t1, name: 'Teppo Testi', email: 'teppo@example.fi' })).status, 400);

  // tietojen tarkistus
  assert.equal((await enter(event.code, { token: t1, name: 'Teppo Testi', email: 'teppo@example.fi', consent: false })).status, 400);
  assert.equal((await enter(event.code, { token: t1, name: 'Teppo Testi' })).status, 400);
  assert.equal((await enter(event.code, { token: t1, name: 'Teppo Testi', email: 'ei-osoite' })).status, 400);

  // osallistuminen onnistuu kerran
  assert.equal((await enter(event.code, { token: t1, name: 'Teppo Testi', email: 'Teppo@Example.fi' })).status, 201);
  assert.equal((await enter(event.code, { token: t1, name: 'Teppo Testi', email: 'toinen@example.fi' })).status, 409);
  // uusi vastaus samoilla yhteystiedoilla ei tuo toista arpaa
  assert.equal((await enter(event.code, { token: await answer(event.code), name: 'Teppo', email: 'teppo@example.fi' })).status, 409);
  assert.equal((await enter(event.code, { token: await answer(event.code), name: 'Liisa Lahtinen', phone: '040 123 4567' })).status, 201);
  assert.equal((await enter(event.code, { token: await answer(event.code), name: 'Liisa L', phone: '+358401234567' })).status, 409);
  assert.equal((await enter(event.code, { token: await answer(event.code), name: 'Kalle Koski', email: 'kalle@example.fi' })).status, 201);

  // vanhentunut tunniste
  const expired = raffle.signToken(db.secret('raffle'), event.code, 'vanha', Date.now() - 1000);
  assert.equal((await enter(event.code, { token: expired, name: 'Myöhäinen', email: 'm@example.fi' })).status, 410);

  // yhteystietoja ei voi yhdistää vastauksiin: ei viittausta vastaukseen eikä kellonaikaa
  const cols = db.raw.prepare('PRAGMA table_info(raffle_entries)').all().map((c) => c.name);
  assert.ok(!cols.some((c) => /response/.test(c)));
  const stored = db.raw.prepare('SELECT * FROM raffle_entries').all();
  assert.ok(stored.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.created_on)));
  assert.ok(stored.some((e) => e.email === 'teppo@example.fi' && e.phone === null));
  assert.ok(stored.some((e) => e.phone === '+358401234567'));

  let dash = await (await req(`/api/events/${event.id}`, admin)).json();
  assert.equal(dash.raffle.entryCount, 3);
  assert.equal(dash.raffle.winners.length, 0);

  // arvonta vasta kun kysely on suljettu
  assert.equal((await req(`/api/events/${event.id}/raffle/draw`, { method: 'POST', ...admin })).status, 409);
  await req(`/api/events/${event.id}`, { method: 'PATCH', ...admin, body: { is_open: false } });
  const late = await answer(event.code).catch(() => null);
  assert.equal(late, null, 'suljettuun kyselyyn ei voi vastata');

  const names = new Set();
  for (let i = 1; i <= 3; i++) {
    r = await req(`/api/events/${event.id}/raffle/draw`, { method: 'POST', ...admin });
    const { winner } = await r.json();
    assert.equal(winner.rank, i);
    names.add(winner.name);
  }
  assert.equal(names.size, 3, 'sama henkilö ei voita kahdesti');
  assert.equal((await req(`/api/events/${event.id}/raffle/draw`, { method: 'POST', ...admin })).status, 409);

  // arvonnan jälkeen ei voi enää osallistua
  dash = await (await req(`/api/events/${event.id}`, admin)).json();
  assert.ok(dash.raffle.drawnAt);
  assert.equal((await (await req(`/api/public/events/${event.code}`)).json()).raffle, null);
  const valid = raffle.signToken(db.secret('raffle'), event.code, 'uusi', Date.now() + 60000);
  assert.equal((await enter(event.code, { token: valid, name: 'Liian Myöhään', email: 'lm@example.fi' })).status, 403);

  // osallistujalista ja tietojen poisto
  const { entries } = await (await req(`/api/events/${event.id}/raffle/entries`, admin)).json();
  assert.equal(entries.length, 3);
  r = await req(`/api/events/${event.id}/raffle/entries`, { method: 'DELETE', ...admin });
  assert.equal((await r.json()).deleted, 3);
  dash = await (await req(`/api/events/${event.id}`, admin)).json();
  assert.equal(dash.raffle.entryCount, 0);
  assert.ok(dash.raffle.drawnAt, 'tieto suoritetusta arvonnasta säilyy');

  // arvonnan hallinta vaatii kirjautumisen
  assert.equal((await req(`/api/events/${event.id}/raffle/entries`)).status, 401);
  assert.equal((await req(`/api/events/${event.id}/raffle/draw`, { method: 'POST' })).status, 401);
});

test('arvonnan yhteystiedot poistuvat säilytysajan jälkeen', () => {
  const e = db.createEvent({ opponent: 'Vanha', date: '2026-01-01', venue: '', series: '', attendance: null, notes: '', raffle_enabled: true, raffle_prize: 'Paita' });
  db.addRaffleEntry(e.id, { nonce: 'a', name: 'Vanha Osallistuja', email: 'vanha@example.fi', phone: null }, '2026-01-01');
  db.addRaffleEntry(e.id, { nonce: 'b', name: 'Uusi Osallistuja', email: 'uusi@example.fi', phone: null });
  assert.equal(db.purgeRaffleEntries(60), 1);
  assert.deepEqual(db.raffleEntries(e.id).map((x) => x.name), ['Uusi Osallistuja']);
});

test('puhelinnumerot ja kannustimen vaikutus', () => {
  assert.equal(raffle.normalizePhone('040-123 4567'), '+358401234567');
  assert.equal(raffle.normalizePhone('00358 40 1234567'), '+358401234567');
  assert.equal(raffle.normalizePhone('358401234567'), '+358401234567');
  assert.equal(raffle.normalizePhone('abc'), false);
  assert.equal(raffle.normalizePhone(''), null);

  const row = (raffle_enabled, count, responseRate) => ({ raffle_enabled, stats: { count, responseRate } });
  const i = incentiveInsight([row(true, 60, 12), row(true, 50, 10), row(false, 30, 6), row(false, 0, null)]);
  assert.equal(i.tone, 'good');
  assert.match(i.text, /Arvonnan kanssa vastauksia tuli keskimäärin 55 \/ ottelu \(vastaus-% 11\), ilman arvontaa 30 \/ ottelu \(vastaus-% 6\)/);
  assert.equal(incentiveInsight([row(true, 10, null)]), null);
});
