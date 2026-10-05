const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { computeStats, insights } = require('../src/stats');
const { validateAnswers } = require('../src/questions');

let server, base, db, cookie;

before(async () => {
  db = openDb(':memory:');
  const app = createApp({ db, adminPassword: 'salainen', publicUrl: 'https://palaute.example.fi' });
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
