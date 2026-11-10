// Esittelytila: kyselyn kokeilu omalla puhelimella samassa wifi-verkossa.
//
// Käynnistää sovelluksen puhtaalla esimerkkidatalla (data/demo.db), luo tyhjän Testiottelun
// pelipaidan arvonnalla ja tulostaa kyselyn osoitteen sekä QR-koodin, jonka voi skannata
// näytöltä puhelimen kameralla. QR-koodit ja julisteet osoittavat koneen wifi-osoitteeseen.
//
// Käyttö: npm run demo
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const QRCode = require('qrcode');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seed } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || 'kipina';
const DB_FILE = path.join(__dirname, '..', 'data', 'demo.db');

// Koneen osoite lähiverkossa (esim. 192.168.1.23). Yksityiset osoitteet ensin.
function lanAddress() {
  const candidates = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
  const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return candidates.find(isPrivate) || candidates[0] || 'localhost';
}

// Esittelytila alkaa aina puhtaalta pöydältä, jotta Testiottelussa näkyvät vain omat vastaukset.
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(DB_FILE + suffix, { force: true });
const db = openDb(DB_FILE);
seed(db, () => {});
const today = new Date().toISOString().slice(0, 10);
const testMatch = db.createEvent({
  opponent: 'Testiottelu', date: `${today}T18:00`, venue: 'Äänekoski Areena Pankkari', series: 'Korisliiga',
  attendance: null, notes: 'Esittelytilan testiottelu', raffle_enabled: true, raffle_prize: 'Pelaajan pelipaita',
});

const base = `http://${lanAddress()}:${PORT}`;
const surveyUrl = `${base}/k/${testMatch.code}`;
const app = createApp({ db, adminPassword: PASSWORD, publicUrl: base });

app
  .listen(PORT, async () => {
    const qr = await QRCode.toString(surveyUrl, { type: 'terminal', small: true });
    console.log(`
Kipinä Basket – esittelytila on käynnissä.

1. Yhdistä puhelin samaan wifi-verkkoon kuin tämä kone.
2. Skannaa QR-koodi puhelimen kameralla tai avaa osoite puhelimen selaimessa:

   ${surveyUrl}
${qr}
3. Seuraa vastauksia koneen selaimessa: ${base}/admin/  (salasana: ${PASSWORD})
   Valitse "Testiottelu". Siellä voit myös sulkea kyselyn ja arpoa voittajan.

Muut ottelut ovat keksittyä esimerkkidataa. Data nollautuu, kun esittelytila käynnistetään uudelleen.
Jos puhelin ei saa yhteyttä: salli Node.js palomuurissa ja tarkista, ettei wifi ole vierasverkko,
joka estää laitteiden väliset yhteydet. Lopeta painamalla Ctrl+C.
`);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Portti ${PORT} on jo käytössä. Sulje toinen palvelin tai käynnistä esim. PORT=3001 npm run demo.`);
      process.exit(1);
    }
    throw err;
  });
