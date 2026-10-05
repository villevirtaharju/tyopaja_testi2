// Luo esimerkkiotteluita ja satunnaisia vastauksia dashboardin kokeilua varten.
// Käyttö: npm run seed
const path = require('node:path');
const { openDb } = require('../src/db');
const { QUESTIONS } = require('../src/questions');

const db = openDb(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'palaute.db'));

const matches = [
  { opponent: 'Honka', date: '2026-09-12T18:00', attendance: 420, base: 3.6 },
  { opponent: 'Tapiolan Honka', date: '2026-09-19T17:00', attendance: 380, base: 3.9 },
  { opponent: 'Kouvot', date: '2026-09-26T18:30', attendance: 510, base: 4.2 },
  { opponent: 'Karhu Basket', date: '2026-10-03T18:00', attendance: 640, base: 4.4 },
];
const best = ['Tunnelma oli huikea!', 'Jännittävä loppukiri', 'Lapset tykkäsivät väliajan kisasta', 'Hyvä juontaja', 'Halpa lippu ja hyvä peli'];
const improve = ['Kioskin jono oli liian pitkä', 'Lipunmyynti hidasta ovella', 'Musiikki liian kovalla', 'Enemmän istumapaikkoja päätyyn', 'Korttimaksu kioskiin', 'Parkkipaikat loppuivat'];

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));
const noise = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;

for (const m of matches) {
  const event = db.createEvent({ opponent: m.opponent, date: m.date, venue: 'Kipinä-areena', series: 'I divisioona', attendance: m.attendance, notes: '' });
  const n = Math.round(m.attendance * (0.06 + Math.random() * 0.06));
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
  console.log(`${m.opponent}: ${n} vastausta, kysely /k/${event.code}`);
}
