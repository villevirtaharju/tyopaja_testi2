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
  `);
  return wrap(db);
}

// Lyhyt, helposti kirjoitettava koodi kyselyn osoitteeseen (ei sekoittuvia merkkejä).
function newCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function rowToEvent(r) {
  return r && { ...r, is_open: Boolean(r.is_open) };
}

function wrap(db) {
  const q = {
    listEvents: db.prepare(`
      SELECT e.*, COUNT(r.id) AS response_count
      FROM events e LEFT JOIN responses r ON r.event_id = e.id
      GROUP BY e.id ORDER BY e.date DESC, e.id DESC`),
    getEvent: db.prepare('SELECT * FROM events WHERE id = ?'),
    getEventByCode: db.prepare('SELECT * FROM events WHERE code = ?'),
    insertEvent: db.prepare(`
      INSERT INTO events (code, opponent, date, venue, series, attendance, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    deleteEvent: db.prepare('DELETE FROM events WHERE id = ?'),
    insertResponse: db.prepare('INSERT INTO responses (event_id, answers, created_at) VALUES (?, ?, ?)'),
    responsesFor: db.prepare('SELECT id, answers, created_at FROM responses WHERE event_id = ? ORDER BY created_at'),
    allResponses: db.prepare('SELECT event_id, answers, created_at FROM responses ORDER BY created_at'),
  };

  return {
    raw: db,
    listEvents: () => q.listEvents.all().map(rowToEvent),
    getEvent: (id) => rowToEvent(q.getEvent.get(id)),
    getEventByCode: (code) => rowToEvent(q.getEventByCode.get(code)),
    createEvent(e) {
      const code = newCode();
      const res = q.insertEvent.run(code, e.opponent, e.date, e.venue, e.series, e.attendance, e.notes);
      return this.getEvent(Number(res.lastInsertRowid));
    },
    updateEvent(id, fields) {
      const allowed = ['opponent', 'date', 'venue', 'series', 'attendance', 'notes', 'is_open'];
      const keys = Object.keys(fields).filter((k) => allowed.includes(k));
      if (keys.length) {
        const values = keys.map((k) => (k === 'is_open' ? (fields[k] ? 1 : 0) : fields[k]));
        db.prepare(`UPDATE events SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...values, id);
      }
      return this.getEvent(id);
    },
    deleteEvent: (id) => q.deleteEvent.run(id).changes > 0,
    addResponse(eventId, answers, createdAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')) {
      q.insertResponse.run(eventId, JSON.stringify(answers), createdAt);
    },
    responsesFor: (eventId) =>
      q.responsesFor.all(eventId).map((r) => ({ id: r.id, created_at: r.created_at, answers: JSON.parse(r.answers) })),
    allResponses: () =>
      q.allResponses.all().map((r) => ({ event_id: r.event_id, created_at: r.created_at, answers: JSON.parse(r.answers) })),
    close: () => db.close(),
  };
}

module.exports = { openDb };
