// Arvonta kyselyyn vastanneiden kesken.
//
// Kun katsoja lähettää palautteen, hän saa allekirjoitetun kertakäyttöisen tunnisteen.
// Arvontaan osallistutaan tunnisteella erillisellä pyynnöllä, joten palaute ja yhteystiedot
// eivät koskaan päädy samaan tietueeseen.
const crypto = require('node:crypto');

const TOKEN_HOURS = 6;

const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

function signToken(secret, eventCode, nonce, exp) {
  return `${nonce}.${exp}.${hmac(secret, `${eventCode}.${nonce}.${exp}`)}`;
}

function createToken(secret, eventCode) {
  return signToken(secret, eventCode, crypto.randomBytes(16).toString('base64url'), Date.now() + TOKEN_HOURS * 3600 * 1000);
}

// Palauttaa { nonce }, { expired: true } tai null, jos tunniste ei kelpaa tähän otteluun.
function verifyToken(secret, eventCode, token) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [nonce, exp, sig] = token.split('.');
  if (!nonce || !exp || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(hmac(secret, `${eventCode}.${nonce}.${exp}`));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!(Number(exp) > Date.now())) return { expired: true };
  return { nonce };
}

// Suomalaiset numerot samaan muotoon, jotta "040 123 4567" ja "+358401234567" tunnistetaan samaksi.
function normalizePhone(value) {
  let p = String(value ?? '').trim().replace(/[\s\-().]/g, '');
  if (!p) return null;
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  else if (p.startsWith('0')) p = `+358${p.slice(1)}`;
  else if (p.startsWith('358')) p = `+${p}`;
  return /^\+?\d{6,15}$/.test(p) ? p : false;
}

// Tarkistaa osallistujan tiedot. Palauttaa { entry } tai { error }.
function validateEntry(body) {
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100) return { error: 'Kirjoita nimesi.' };
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: 'Tarkista sähköpostiosoite.' };
  }
  const phone = normalizePhone(body?.phone);
  if (phone === false) return { error: 'Tarkista puhelinnumero.' };
  if (!email && !phone) return { error: 'Anna sähköposti tai puhelinnumero, jotta voimme ilmoittaa voitosta.' };
  if (body?.consent !== true) return { error: 'Hyväksy arvonnan säännöt osallistuaksesi.' };
  return { entry: { name, email: email || null, phone } };
}

// Arvonnan säännöt ja tietosuojateksti. Muokkaa tarvittaessa seuran omiin sääntöihin.
function rules(event, { organizer, contact, policyUrl, retentionDays }) {
  const [y, m, d] = event.date.slice(0, 10).split('-');
  const match = `Kipinä – ${event.opponent} ${Number(d)}.${Number(m)}.${y}`;
  return {
    rules: [
      `Arvonnan järjestää ${organizer}.`,
      `Arvontaan voi osallistua vastaamalla ottelun ${match} palautekyselyyn ja jättämällä yhteystietonsa. Osallistuminen on maksutonta. Kukin voi osallistua kerran.`,
      `Palkinto: ${event.raffle_prize}. Palkintoa ei voi vaihtaa rahaksi.`,
      'Osallistumisaika päättyy, kun palautekysely suljetaan. Voittaja arvotaan sen jälkeen satunnaisesti kaikkien osallistujien kesken.',
      'Voittajalle ilmoitetaan henkilökohtaisesti sähköpostilla tai puhelimitse. Jos voittajaa ei tavoiteta 14 päivän kuluessa, palkinto arvotaan uudelleen.',
      'Voittajan nimeä ei julkaista ilman hänen lupaansa. Alaikäiset osallistuvat huoltajan luvalla.',
    ],
    privacy:
      'Nimeäsi ja yhteystietojasi käytetään vain arvonnan toteuttamiseen ja voittajalle ilmoittamiseen. ' +
      'Ne tallennetaan erillään palautteesta, eikä niitä yhdistetä vastauksiisi. ' +
      `Tiedot poistetaan viimeistään ${retentionDays} päivän kuluttua osallistumisesta. ` +
      `Rekisterinpitäjä on ${organizer}${contact ? ` (${contact})` : ''}. ` +
      'Voit pyytää tietojesi tarkastamista tai poistamista ottamalla yhteyttä järjestäjään.',
    policyUrl: policyUrl || null,
  };
}

module.exports = { createToken, signToken, verifyToken, validateEntry, normalizePhone, rules, TOKEN_HOURS };
