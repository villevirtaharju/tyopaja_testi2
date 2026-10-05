const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL UNIQUE,
      opponent    TEXT NOT NULL,
      date        TEXT NOT NULL,
      venue       TEXT NOT NULL DEFAULT '',
      series      TEXT NOT NULL DEFAULT '',
      attendance  INTEGER,
      notes       TEXT NOT NULL DEFAULT '',
      is_open     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS responses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      answers     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS responses_event ON responses(event_id);

    -- Arvontaan osallistuneet. Taulussa ei ole viittausta vastaukseen, ja se on
    -- WITHOUT ROWID + satunnainen avain + pelkkä päivämäärä, jotta osallistumista ei voi
    -- yhdistää palautteeseen lisäysjärjestyksen tai kellonajan perusteella.
    CREATE TABLE IF NOT EXISTS raffle_entries (
      id          TEXT PRIMARY KEY,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      nonce       TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      email       TEXT,
      phone       TEXT,
      created_on  TEXT NOT NULL,
      winner_rank INTEGER,
      drawn_at    TEXT
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS raffle_event ON raffle_entries(event_id);
    CREATE UNIQUE INDEX IF NOT EXISTS raffle_email ON raffle_entries(event_id, email) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS raffle_phone ON raffle_entries(event_id, phone) WHERE phone IS NOT NULL;

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  migrate(db);
  return wrap(db);
}

// Uudet sarakkeet olemassa oleviin tietokantoihin.
function migrate(db) {
  const cols = new Set(db.prepare('PRAGMA table_info(events)').all().map((c) => c.name));
  const add = {
    raffle_enabled: 'INTEGER NOT NULL DEFAULT 0',
    raffle_prize: "TEXT NOT NULL DEFAULT ''",
    raffle_drawn_at: 'TEXT',
  };
  for (const [name, type] of Object.entries(add)) {
    if (!cols.has(name)) db.exec(`ALTER TABLE events ADD COLUMN ${name} ${type}`);
  }
}

// Lyhyt, helposti kirjoitettava koodi kyselyn osoitteeseen (ei sekoittuvia merkkejä).
function newCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const today = () => new Date().toISOString().slice(0, 10);

function rowToEvent(r) {
  return r && { ...r, is_open: Boolean(r.is_open), raffle_enabled: Boolean(r.raffle_enabled) };
}

function wrap(db) {
  const q = {
    listEvents: db.prepare(`
      SELECT e.*, COUNT(r.id) AS response_count,
        (SELECT COUNT(*) FROM raffle_entries re WHERE re.event_id = e.id) AS raffle_count
      FROM events e LEFT JOIN responses r ON r.event_id = e.id
      GROUP BY e.id ORDER BY e.date DESC, e.id DESC`),
    getEvent: db.prepare('SELECT * FROM events WHERE id = ?'),
    getEventByCode: db.prepare('SELECT * FROM events WHERE code = ?'),
    insertEvent: db.prepare(`
      INSERT INTO events (code, opponent, date, venue, series, attendance, notes, raffle_enabled, raffle_prize)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    deleteEvent: db.prepare('DELETE FROM events WHERE id = ?'),
    insertResponse: db.prepare('INSERT INTO responses (event_id, answers, created_at) VALUES (?, ?, ?)'),
    responsesFor: db.prepare('SELECT id, answers, created_at FROM responses WHERE event_id = ? ORDER BY created_at'),
    allResponses: db.prepare('SELECT event_id, answers, created_at FROM responses ORDER BY created_at'),

    getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
    insertMeta: db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)'),

    insertEntry: db.prepare(`
      INSERT INTO raffle_entries (id, event_id, nonce, name, email, phone, created_on)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    entryCount: db.prepare('SELECT COUNT(*) AS n FROM raffle_entries WHERE event_id = ?'),
    entries: db.prepare(`
      SELECT name, email, phone, created_on, winner_rank FROM raffle_entries
      WHERE event_id = ? ORDER BY name COLLATE NOCASE`),
    winners: db.prepare(`
      SELECT name, email, phone, winner_rank AS rank, drawn_at FROM raffle_entries
      WHERE event_id = ? AND winner_rank IS NOT NULL ORDER BY winner_rank`),
    eligible: db.prepare('SELECT id FROM raffle_entries WHERE event_id = ? AND winner_rank IS NULL ORDER BY id'),
    nextRank: db.prepare('SELECT COALESCE(MAX(winner_rank), 0) + 1 AS rank FROM raffle_entries WHERE event_id = ?'),
    setWinner: db.prepare('UPDATE raffle_entries SET winner_rank = ?, drawn_at = ? WHERE id = ?'),
    markDrawn: db.prepare('UPDATE events SET raffle_drawn_at = COALESCE(raffle_drawn_at, ?) WHERE id = ?'),
    deleteEntries: db.prepare('DELETE FROM raffle_entries WHERE event_id = ?'),
    purgeEntries: db.prepare("DELETE FROM raffle_entries WHERE created_on < date('now', ?)"),
  };

  return {
    raw: db,
    listEvents: () => q.listEvents.all().map(rowToEvent),
    getEvent: (id) => rowToEvent(q.getEvent.get(id)),
    getEventByCode: (code) => rowToEvent(q.getEventByCode.get(code)),
    createEvent(e) {
      const code = newCode();
      const res = q.insertEvent.run(
        code, e.opponent, e.date, e.venue, e.series, e.attendance, e.notes, e.raffle_enabled ? 1 : 0, e.raffle_prize,
      );
      return this.getEvent(Number(res.lastInsertRowid));
    },
    updateEvent(id, fields) {
      const allowed = ['opponent', 'date', 'venue', 'series', 'attendance', 'notes', 'is_open', 'raffle_enabled', 'raffle_prize'];
      const booleans = ['is_open', 'raffle_enabled'];
      const keys = Object.keys(fields).filter((k) => allowed.includes(k));
      if (keys.length) {
        const values = keys.map((k) => (booleans.includes(k) ? (fields[k] ? 1 : 0) : fields[k]));
        db.prepare(`UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...values, id);
      }
      return this.getEvent(id);
    },
    deleteEvent: (id) => q.deleteEvent.run(id).changes > 0,
    addResponse(eventId, answers, createdAt = nowIso()) {
      q.insertResponse.run(eventId, JSON.stringify(answers), createdAt);
    },
    responsesFor: (eventId) =>
      q.responsesFor.all(eventId).map((r) => ({ id: r.id, created_at: r.created_at, answers: JSON.parse(r.answers) })),
    allResponses: () =>
      q.allResponses.all().map((r) => ({ event_id: r.event_id, created_at: r.created_at, answers: JSON.parse(r.answers) })),

    // Pysyvä satunnainen avain (esim. evästeiden ja arvontatunnisteiden allekirjoitukseen).
    secret(name) {
      const key = `secret:${name}`;
      q.insertMeta.run(key, crypto.randomBytes(32).toString('hex'));
      return q.getMeta.get(key).value;
    },

    // --- Arvonta -------------------------------------------------------------
    // Palauttaa { ok } tai { duplicate: 'token' | 'contact' }.
    addRaffleEntry(eventId, { nonce, name, email, phone }, createdOn = today()) {
      try {
        q.insertEntry.run(crypto.randomBytes(12).toString('hex'), eventId, nonce, name, email, phone, createdOn);
        return { ok: true };
      } catch (err) {
        if (!/UNIQUE constraint failed/.test(err.message)) throw err;
        return { duplicate: /\.nonce/.test(err.message) ? 'token' : 'contact' };
      }
    },
    raffleEntryCount: (eventId) => q.entryCount.get(eventId).n,
    raffleEntries: (eventId) => q.entries.all(eventId),
    raffleWinners: (eventId) => q.winners.all(eventId),
    // Arpoo seuraavan voittajan niistä, joita ei ole vielä arvottu. Palauttaa voittajan tai null.
    drawWinner(eventId) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const pool = q.eligible.all(eventId);
        if (!pool.length) {
          db.exec('ROLLBACK');
          return null;
        }
        const pick = pool[crypto.randomInt(pool.length)];
        const { rank } = q.nextRank.get(eventId);
        const at = nowIso();
        q.setWinner.run(rank, at, pick.id);
        q.markDrawn.run(at, eventId);
        db.exec('COMMIT');
        return q.winners.all(eventId).find((w) => w.rank === rank);
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    deleteRaffleEntries: (eventId) => Number(q.deleteEntries.run(eventId).changes),
    // Poistaa yhteystiedot, jotka ovat vanhempia kuin säilytysaika.
    purgeRaffleEntries: (days) => Number(q.purgeEntries.run(`-${Number(days)} days`).changes),
    close: () => db.close(),
  };
}

module.exports = { openDb };
