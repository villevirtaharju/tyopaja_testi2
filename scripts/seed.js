// Luo esimerkkiotteluita ja satunnaisia vastauksia dashboardin kokeilua ja esittelyä varten.
// Kahdessa ottelussa on pelipaidan arvonta, jotta kannustimen vaikutus näkyy yleisnäkymässä.
// Käyttö: npm run seed
const path = require('node:path');
const { openDb } = require('../src/db');
const { QUESTIONS } = require('../src/questions');

const db = openDb(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'palaute.db'));

const VENUE = 'Äänekoski Areena Pankkari';
const matches = [
  { opponent: 'Korihait', date: '2026-09-12T18:30', attendance: 520, base: 3.6, raffle: false, open: false },
  { opponent: 'Tapiolan Honka', date: '2026-09-19T17:00', attendance: 610, base: 3.9, raffle: false, open: false },
  { opponent: 'Salon Vilpas', date: '2026-09-26T18:30', attendance: 580, base: 4.2, raffle: true, open: false, draw: true },
  { opponent: 'Karhu Basket', date: '2026-10-03T17:00', attendance: 720, base: 4.4, raffle: true, open: true },
];
const best = ['Tunnelma oli huikea!', 'Jännittävä loppukiri', 'Lapset tykkäsivät väliajan kisasta', 'Hyvä juontaja', 'Mahtavaa korisliigaa Äänekoskella'];
const improve = ['Kioskin jono oli liian pitkä', 'Lipunmyynti hidasta ovella', 'Musiikki liian kovalla', 'Enemmän istumapaikkoja päätyyn', 'Korttimaksu kioskiin', 'Parkkipaikat loppuivat'];
const firstNames = ['Aino', 'Eetu', 'Emma', 'Juho', 'Laura', 'Mikko', 'Niina', 'Onni', 'Sanna', 'Teemu', 'Veera', 'Ville', 'Iida', 'Joonas', 'Kaisa', 'Lauri'];
const lastNames = ['Virtanen', 'Korhonen', 'Mäkinen', 'Nieminen', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen', 'Järvinen', 'Lehtonen', 'Salminen', 'Tuominen'];

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));
const noise = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
const ascii = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');

for (const m of matches) {
  const event = db.createEvent({
    opponent: m.opponent, date: m.date, venue: VENUE, series: 'Korisliiga', attendance: m.attendance, notes: '',
    raffle_enabled: m.raffle, raffle_prize: m.raffle ? 'Pelaajan pelipaita' : '',
  });
  // Arvonta nostaa vastausprosenttia: ilman noin 5–8 %, arvonnan kanssa noin 13–17 %.
  const rate = m.raffle ? 0.13 + Math.random() * 0.04 : 0.05 + Math.random() * 0.03;
  const n = Math.round(m.attendance * rate);
  for (let i = 0; i < n; i++) {
    const a = {};
    const mood = m.base + noise() * 0.6;
    a.overall = clamp(mood, 1, 5);
    a.nps = clamp(mood * 2 + noise(), 0, 10);
    const offsets = { tunnelma: 0.3, ottelu: 0.2, juonto: 0, kioski: -0.9, sisaanpaasy: -0.5, olosuhteet: -0.2 };
    for (const [k, off] of Object.entries(offsets)) if (Math.random() < 0.85) a[`aspect_${k}`] = clamp(mood + off + noise() * 0.5, 1, 5);
    for (const q of QUESTIONS) {
      if (q.type === 'single' && Math.random() < 0.9) a[q.id] = rnd(q.options).id;
      if (q.type === 'multi' && Math.random() < 0.9) a[q.id] = [...new Set([rnd(q.options.slice(0, 5)).id, rnd(q.options).id])];
    }
    if (Math.random() < 0.3) a.best = rnd(best);
    if (Math.random() < 0.3) a.improve = rnd(improve);
    const t = new Date(new Date(m.date + ':00Z').getTime() + (90 + Math.random() * 120) * 60000);
    db.addResponse(event.id, a, t.toISOString().replace(/\.\d+Z$/, 'Z'));
  }

  // Noin kolme neljästä vastaajasta osallistuu arvontaan (kuvitteelliset nimet, example.com-osoitteet).
  let entries = 0;
  if (m.raffle) {
    for (let i = 0; i < n; i++) {
      if (Math.random() > 0.75) continue;
      const first = rnd(firstNames);
      const last = rnd(lastNames);
      const res = db.addRaffleEntry(event.id, {
        nonce: `demo-${event.id}-${i}`,
        name: `${first} ${last}`,
        email: `${ascii(first)}.${ascii(last)}${i}@example.com`,
        phone: null,
      }, m.date.slice(0, 10));
      if (res.ok) entries++;
    }
  }
  if (!m.open) db.updateEvent(event.id, { is_open: false });
  if (m.draw) db.drawWinner(event.id);
  console.log(`${m.opponent}: ${n} vastausta${m.raffle ? `, ${entries} arvonnassa` : ''}, kysely /k/${event.code}`);
}
