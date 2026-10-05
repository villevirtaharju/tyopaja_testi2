const path = require('node:path');
const { openDb } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'palaute.db');
const RETENTION_DAYS = Number(process.env.RAFFLE_RETENTION_DAYS) || 60;

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
  raffle: {
    organizer: process.env.RAFFLE_ORGANIZER,
    contact: process.env.PRIVACY_CONTACT,
    policyUrl: process.env.PRIVACY_POLICY_URL,
    retentionDays: RETENTION_DAYS,
  },
});

function parseTrustProxy(v) {
  if (v === 'true' || v === 'false') return v === 'true';
  return /^\d+$/.test(v) ? Number(v) : v;
}

// Arvonnan yhteystiedot poistetaan automaattisesti säilytysajan jälkeen.
function purgeRaffle() {
  const n = db.purgeRaffleEntries(RETENTION_DAYS);
  if (n) console.log(`Poistettiin ${n} vanhentunutta arvonnan osallistujatietoa (yli ${RETENTION_DAYS} pv).`);
}
purgeRaffle();
setInterval(purgeRaffle, 6 * 3600 * 1000).unref();

app.listen(PORT, () => {
  console.log(`Kipinä Basketin palautekysely käynnissä: http://localhost:${PORT}/admin/`);
});
