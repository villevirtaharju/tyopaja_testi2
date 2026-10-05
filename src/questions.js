// Kyselyn kysymykset. Sama määrittely ohjaa sekä lomakkeen piirtämistä,
// vastausten validointia että dashboardin tilastoja.
//
// Tyypit:
//   rating  – asteikko 1–5 (tähdet)
//   nps     – suositteluasteikko 0–10
//   single  – yksi vaihtoehto
//   multi   – useita vaihtoehtoja
//   text    – vapaa teksti

const ASPECTS = [
  { id: 'tunnelma', label: 'Tunnelma ja fanikulttuuri', short: 'Tunnelma' },
  { id: 'ottelu', label: 'Ottelun viihdyttävyys', short: 'Peli' },
  { id: 'juonto', label: 'Juonto, musiikki ja väliajan ohjelma', short: 'Juonto' },
  { id: 'kioski', label: 'Kioski ja tarjoilut', short: 'Kioski' },
  { id: 'sisaanpaasy', label: 'Lipunmyynti ja sisäänpääsy', short: 'Sisäänpääsy' },
  { id: 'olosuhteet', label: 'Halli, istumapaikat ja näkyvyys', short: 'Halli' },
];

const QUESTIONS = [
  {
    id: 'overall',
    type: 'rating',
    required: true,
    label: 'Millainen kokemus ottelutapahtuma oli kokonaisuutena?',
    low: 'Huono',
    high: 'Erinomainen',
  },
  {
    id: 'nps',
    type: 'nps',
    required: true,
    label: 'Kuinka todennäköisesti suosittelisit Kipinä Basketin kotiottelua ystävällesi?',
    low: 'En lainkaan',
    high: 'Erittäin todennäköisesti',
  },
  ...ASPECTS.map((a) => ({
    id: `aspect_${a.id}`,
    type: 'rating',
    group: 'aspects',
    required: false,
    label: a.label,
    short: a.short,
  })),
  {
    id: 'visits',
    type: 'single',
    required: false,
    label: 'Monesko Kipinän ottelusi tämä oli?',
    options: [
      { id: 'first', label: 'Ensimmäinen' },
      { id: '2_5', label: '2.–5.' },
      { id: 'over5', label: 'Useampi kuin 5' },
      { id: 'season', label: 'Minulla on kausikortti' },
    ],
  },
  {
    id: 'source',
    type: 'multi',
    required: false,
    label: 'Mistä kuulit tästä ottelusta?',
    hint: 'Voit valita useamman.',
    options: [
      { id: 'instagram', label: 'Instagram' },
      { id: 'facebook', label: 'Facebook' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'website', label: 'Seuran nettisivut' },
      { id: 'friends', label: 'Kaverit tai perhe' },
      { id: 'player', label: 'Tunnen pelaajan tai seuran väkeä' },
      { id: 'school', label: 'Koulu, työpaikka tai harrastus' },
      { id: 'poster', label: 'Juliste tai mainos' },
      { id: 'media', label: 'Lehti, radio tai muu media' },
      { id: 'other', label: 'Muualta' },
    ],
  },
  {
    id: 'company',
    type: 'single',
    required: false,
    label: 'Kenen kanssa tulit otteluun?',
    options: [
      { id: 'alone', label: 'Yksin' },
      { id: 'family', label: 'Perheen kanssa' },
      { id: 'friends', label: 'Kavereiden kanssa' },
      { id: 'team', label: 'Oman joukkueen tai juniorien kanssa' },
      { id: 'work', label: 'Työporukalla' },
    ],
  },
  {
    id: 'age',
    type: 'single',
    required: false,
    label: 'Ikäsi',
    options: [
      { id: 'u18', label: 'Alle 18' },
      { id: '18_29', label: '18–29' },
      { id: '30_44', label: '30–44' },
      { id: '45_64', label: '45–64' },
      { id: '65', label: '65 tai yli' },
    ],
  },
  {
    id: 'return',
    type: 'single',
    required: false,
    label: 'Aiotko tulla uudelleen Kipinän otteluun?',
    options: [
      { id: 'yes', label: 'Kyllä, varmasti' },
      { id: 'likely', label: 'Todennäköisesti' },
      { id: 'unsure', label: 'En osaa sanoa' },
      { id: 'no', label: 'Tuskin' },
    ],
  },
  {
    id: 'best',
    type: 'text',
    required: false,
    label: 'Mikä oli parasta tänään?',
    maxLength: 1000,
  },
  {
    id: 'improve',
    type: 'text',
    required: false,
    label: 'Mitä meidän pitäisi parantaa?',
    maxLength: 1000,
  },
];

const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// Tarkistaa ja siivoaa lähetetyn vastauksen. Palauttaa { answers } tai { error }.
function validateAnswers(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Vastaus puuttuu.' };
  }
  const answers = {};
  for (const q of QUESTIONS) {
    let v = input[q.id];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty) {
      if (q.required) return { error: `Vastaa kysymykseen: ${q.label}` };
      continue;
    }
    switch (q.type) {
      case 'rating':
      case 'nps': {
        const n = Number(v);
        const [min, max] = q.type === 'rating' ? [1, 5] : [0, 10];
        if (!Number.isInteger(n) || n < min || n > max) {
          return { error: `Virheellinen arvo kysymyksessä: ${q.label}` };
        }
        answers[q.id] = n;
        break;
      }
      case 'single': {
        if (!q.options.some((o) => o.id === v)) {
          return { error: `Virheellinen valinta kysymyksessä: ${q.label}` };
        }
        answers[q.id] = v;
        break;
      }
      case 'multi': {
        if (!Array.isArray(v)) v = [v];
        const valid = [...new Set(v)].filter((x) => q.options.some((o) => o.id === x));
        if (valid.length !== new Set(v).size) {
          return { error: `Virheellinen valinta kysymyksessä: ${q.label}` };
        }
        answers[q.id] = valid;
        break;
      }
      case 'text': {
        const s = String(v).trim().slice(0, q.maxLength);
        if (s) answers[q.id] = s;
        break;
      }
    }
  }
  return { answers };
}

module.exports = { QUESTIONS, ASPECTS, byId, validateAnswers };
