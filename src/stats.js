const { QUESTIONS } = require('./questions');

const round = (n, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (part, whole) => (whole ? round((part / whole) * 100, 0) : null);

function npsOf(values) {
  const n = values.length;
  const promoters = values.filter((v) => v >= 9).length;
  const detractors = values.filter((v) => v <= 6).length;
  const passives = n - promoters - detractors;
  return {
    n,
    score: n ? Math.round(((promoters - detractors) / n) * 100) : null,
    promoters,
    passives,
    detractors,
    dist: Array.from({ length: 11 }, (_, i) => values.filter((v) => v === i).length),
  };
}

// Laskee kaikki dashboardin luvut joukosta vastauksia.
function computeStats(responses, { attendance = null } = {}) {
  const answers = responses.map((r) => r.answers);
  const count = answers.length;
  const values = (id) => answers.map((a) => a[id]).filter((v) => v !== undefined);

  const overallVals = values('overall');
  const overall = {
    n: overallVals.length,
    avg: round(avg(overallVals), 2),
    dist: [1, 2, 3, 4, 5].map((s) => overallVals.filter((v) => v === s).length),
  };

  const nps = npsOf(values('nps'));

  const aspects = QUESTIONS.filter((q) => q.group === 'aspects').map((q) => {
    const vs = values(q.id);
    return { id: q.id, label: q.label, n: vs.length, avg: round(avg(vs), 2) };
  });

  const choices = {};
  for (const q of QUESTIONS.filter((q) => q.type === 'single' || q.type === 'multi')) {
    const vs = values(q.id);
    const flat = q.type === 'multi' ? vs.flat() : vs;
    choices[q.id] = {
      label: q.label,
      type: q.type,
      n: vs.length,
      options: q.options.map((o) => {
        const c = flat.filter((v) => v === o.id).length;
        return { id: o.id, label: o.label, count: c, pct: pct(c, vs.length) };
      }),
    };
  }

  const comments = responses
    .filter((r) => r.answers.best || r.answers.improve)
    .map((r) => ({
      created_at: r.created_at,
      overall: r.answers.overall ?? null,
      best: r.answers.best || '',
      improve: r.answers.improve || '',
    }))
    .reverse();

  return {
    count,
    attendance,
    responseRate: attendance ? pct(count, attendance) : null,
    overall,
    nps,
    aspects,
    choices,
    comments,
  };
}

// Automaattiset havainnot päätöksenteon tueksi. `baseline` = muiden otteluiden tilastot.
function insights(stats, baseline = null) {
  const out = [];
  if (stats.count === 0) return out;
  if (stats.count < 10) {
    out.push({ tone: 'neutral', text: `Vastauksia on vasta ${stats.count}, joten luvut ovat suuntaa antavia.` });
  }

  const rated = stats.aspects.filter((a) => a.n >= 3 && a.avg != null).sort((a, b) => b.avg - a.avg);
  if (rated.length >= 2) {
    const best = rated[0];
    const worst = rated[rated.length - 1];
    out.push({ tone: 'good', text: `Vahvin osa-alue: ${best.label} (${fmt(best.avg)} / 5).` });
    if (worst.avg < best.avg) {
      out.push({
        tone: worst.avg < 3.5 ? 'bad' : 'neutral',
        text: `Eniten parannettavaa: ${worst.label} (${fmt(worst.avg)} / 5).`,
      });
    }
  }

  if (baseline && baseline.overall.avg != null && stats.overall.avg != null) {
    const diff = round(stats.overall.avg - baseline.overall.avg, 2);
    if (Math.abs(diff) >= 0.2) {
      out.push({
        tone: diff > 0 ? 'good' : 'bad',
        text: `Kokonaisarvio on ${fmt(Math.abs(diff))} ${diff > 0 ? 'parempi' : 'heikompi'} kuin muiden otteluiden keskiarvo (${fmt(baseline.overall.avg)}).`,
      });
    }
  }

  const visits = stats.choices.visits;
  if (visits && visits.n >= 3) {
    const first = visits.options.find((o) => o.id === 'first');
    out.push({ tone: 'neutral', text: `${first.pct} % vastaajista oli ensimmäistä kertaa Kipinän ottelussa.` });
  }

  const ret = stats.choices.return;
  if (ret && ret.n >= 3) {
    const yes = ret.options.filter((o) => o.id === 'yes' || o.id === 'likely').reduce((s, o) => s + o.count, 0);
    const share = pct(yes, ret.n);
    out.push({ tone: share >= 70 ? 'good' : share < 50 ? 'bad' : 'neutral', text: `${share} % aikoo tulla uudelleen.` });
  }

  const source = stats.choices.source;
  if (source && source.n >= 3) {
    const top = [...source.options].sort((a, b) => b.count - a.count)[0];
    if (top.count > 0) {
      out.push({ tone: 'neutral', text: `Tärkein tiedotuskanava: ${top.label} (${top.pct} % vastaajista).` });
    }
  }

  if (stats.responseRate != null) {
    out.push({ tone: 'neutral', text: `Vastausprosentti ${stats.responseRate} % (${stats.count} / ${stats.attendance} katsojaa).` });
  }
  return out;
}

const fmt = (n) => String(n).replace('.', ',');

module.exports = { computeStats, insights, npsOf };
