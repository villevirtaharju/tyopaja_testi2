const path = require('node:path');
const { openDb } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'palaute.db');

let adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  adminPassword = 'kipina';
  console.warn('VAROITUS: ADMIN_PASSWORD puuttuu, käytetään oletussalasanaa "kipina". Aseta oma salasana tuotannossa.');
}

const db = openDb(DB_FILE);
const app = createApp({
  db,
  adminPassword,
  sessionSecret: process.env.SESSION_SECRET,
  publicUrl: process.env.PUBLIC_URL,
  ...(process.env.TRUST_PROXY !== undefined && { trustProxy: parseTrustProxy(process.env.TRUST_PROXY) }),
});

function parseTrustProxy(v) {
  if (v === 'true' || v === 'false') return v === 'true';
  return /^\d+$/.test(v) ? Number(v) : v;
}

app.listen(PORT, () => {
  console.log(`Kipinän palautekysely käynnissä: http://localhost:${PORT}/admin/`);
});
