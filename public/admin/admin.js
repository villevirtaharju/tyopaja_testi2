// Hallintasivujen yhteiset apufunktiot ja kaaviot (ei ulkoisia kirjastoja).
const K = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 1) => (n == null ? '–' : Number(n).toLocaleString('fi-FI', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const signed = (n) => (n == null ? '–' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n));

  function fmtDate(d, withTime = true) {
    if (!d) return '';
    const dt = new Date(d.length === 10 ? d + 'T12:00' : d);
    const opts = { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' };
    if (withTime && d.length > 10) Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
    return dt.toLocaleString('fi-FI', opts);
  }
  const shortDate = (d) => new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' });

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      ...opts,
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 401 && !path.startsWith('/api/login')) {
      location.href = `/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new Error('Kirjaudu sisään.');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Virhe ${r.status}`);
    return data;
  }

  function topbar(active) {
    const el = document.createElement('header');
    el.className = 'topbar';
    el.innerHTML = `<div class="inner">
      <a href="/admin/" class="brandmark" style="color:inherit;text-decoration:none"><span class="spark" aria-hidden="true">✦</span> Kipinä · Ottelupalaute</a>
      <nav>
        <a class="btn sm" href="/admin/" ${active === 'home' ? 'aria-current="page"' : ''}>Kaikki ottelut</a>
        <button class="btn sm" id="logout">Kirjaudu ulos</button>
      </nav></div>`;
    document.body.prepend(el);
    el.querySelector('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/admin/login'; };
  }

  // --- Tooltip: mikä tahansa elementti jolla on data-tip -----------------
  const tip = document.createElement('div');
  tip.id = 'tooltip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  document.addEventListener('DOMContentLoaded', () => document.body.append(tip));
  function place(x, y) {
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  const tipTarget = (e) => e.target.closest?.('[data-tip]');
  document.addEventListener('pointerover', (e) => { const t = tipTarget(e); if (!t) return; tip.innerHTML = t.dataset.tip; tip.hidden = false; place(e.clientX, e.clientY); });
  document.addEventListener('pointermove', (e) => { if (!tip.hidden && tipTarget(e)) place(e.clientX, e.clientY); });
  document.addEventListener('pointerout', (e) => { if (tipTarget(e) && !tipTarget({ target: e.relatedTarget || document.body })) tip.hidden = true; });
  document.addEventListener('focusin', (e) => { const t = tipTarget(e); if (!t) return; tip.innerHTML = t.dataset.tip; tip.hidden = false; const r = t.getBoundingClientRect(); place(r.right, r.top); });
  document.addEventListener('focusout', () => { tip.hidden = true; });

  // --- Kaaviot ------------------------------------------------------------

  // Vaakapalkit: [{ label, value, max, display, tip }]
  function hbars(items) {
    if (!items.length) return '<p class="muted small">Ei vastauksia.</p>';
    return `<div class="hbars">${items.map((it) => {
      const w = it.max ? Math.max(0, Math.min(100, (it.value / it.max) * 100)) : 0;
      return `<div class="hbar hit" tabindex="0" data-tip="${esc(it.tip || '')}">
        <div class="name">${esc(it.label)}</div>
        <div class="track"><div class="fill" style="width:${w}%"></div></div>
        <div class="val">${esc(it.display)}</div></div>`;
    }).join('')}</div>`;
  }

  // Pystypalkit jakaumalle: values[i] kpl, labels[i]
  function columns(values, labels, unit = 'vastausta') {
    const max = Math.max(1, ...values);
    const total = values.reduce((a, b) => a + b, 0);
    const tmpl = `grid-template-columns:repeat(${values.length},1fr)`;
    const cols = values.map((v, i) => {
      const share = total ? Math.round((v / total) * 100) : 0;
      return `<div class="col" tabindex="0" data-tip="<b>${esc(labels[i])}</b><br>${v} ${unit} (${share} %)">
        <div class="top">${v || ''}</div><div class="bar" style="height:${(v / max) * 82}%"></div></div>`;
    }).join('');
    return `<div class="cols" style="${tmpl}">${cols}</div><div class="cols-x" style="${tmpl}">${labels.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
  }

  // Viivakaavio: points [{ x, y, tip, href }], yksi y-asteikko. Palauttaa paikanpitäjän;
  // mountCharts() piirtää sen säiliön todellisella leveydellä ja uudelleen koon muuttuessa,
  // jotta tekstit pysyvät luettavan kokoisina myös puhelimella.
  const charts = new Map();
  let chartSeq = 0;
  function lineChart(cfg) {
    if (!cfg.points.some((p) => p.y != null)) return '<p class="muted small">Ei vielä dataa.</p>';
    const id = String(++chartSeq);
    charts.set(id, cfg);
    return `<div class="linechart" data-chart="${id}"></div>`;
  }

  const resizer = new ResizeObserver((entries) => entries.forEach((en) => drawLine(en.target)));
  function mountCharts(root = document) {
    root.querySelectorAll('.linechart[data-chart]').forEach((el) => resizer.observe(el));
  }

  function drawLine(el) {
    const cfg = charts.get(el.dataset.chart);
    if (!el.isConnected || !cfg) {
      resizer.unobserve(el);
      charts.delete(el.dataset.chart);
      return;
    }
    const W = Math.max(240, Math.floor(el.clientWidth));
    if (el._w === W) return;
    el._w = W;
    el.innerHTML = lineSvg(cfg, W);
  }

  function lineSvg({ points, min, max, ticks, format = (v) => v, ref = null, refLabel = '' }, W) {
    const H = 220, L = 44, R = 14, T = 12, B = 28;
    const xs = (i) => (points.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (points.length - 1));
    const ys = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
    let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Viivakaavio">`;
    svg += '<g class="axis">';
    for (const t of ticks) svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${ys(t)}" y2="${ys(t)}"/><text x="${L - 8}" y="${ys(t) + 4}" text-anchor="end">${esc(format(t))}</text>`;
    const maxLabels = Math.max(2, Math.floor((W - L - R) / 52));
    const step = Math.ceil(points.length / maxLabels);
    points.forEach((p, i) => {
      if (i % step === 0) svg += `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle">${esc(p.x)}</text>`;
    });
    svg += '</g>';
    if (ref != null) svg += `<line class="ref" x1="${L}" x2="${W - R}" y1="${ys(ref)}" y2="${ys(ref)}"><title>${esc(refLabel)}</title></line>`;
    // katkaise viiva otteluiden kohdalla, joista ei ole vastauksia
    let d = '', pen = false;
    points.forEach((p, i) => {
      if (p.y == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${xs(i)},${ys(p.y)}`;
      pen = true;
    });
    svg += `<path class="line" d="${d}"/>`;
    points.forEach((p, i) => { if (p.y != null) svg += `<circle class="dot" cx="${xs(i)}" cy="${ys(p.y)}" r="4.5"/>`; });
    const hw = points.length > 1 ? (W - L - R) / (points.length - 1) / 2 : 40;
    points.forEach((p, i) => {
      if (p.y == null) return;
      const rect = `<rect class="hit" x="${xs(i) - hw}" y="${T}" width="${hw * 2}" height="${H - T - B}"/>`;
      const tip = `data-tip="${esc(p.tip)}"`;
      svg += p.href ? `<a href="${esc(p.href)}" ${tip} aria-label="${esc(p.x)}">${rect}</a>` : `<g ${tip} tabindex="0">${rect}</g>`;
    });
    return svg + '</svg>';
  }

  // Peräkkäinen sininen asteikko arvoille 1–5 (heatmap-solut).
  function heat(v) {
    if (v == null) return '<span class="heat muted">–</span>';
    const steps = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6'];
    const idx = Math.max(0, Math.min(5, Math.round(((v - 2) / 3) * 5)));
    const fg = idx >= 4 ? '#fff' : '#0b0b0b'; // valkoinen vasta kun kontrasti ≥ 4.5:1
    return `<span class="heat" style="background:var(${steps[idx]});color:${fg}">${num(v)}</span>`;
  }

  function insightsList(items) {
    if (!items.length) return '<p class="muted small">Havaintoja näytetään, kun vastauksia kertyy.</p>';
    const icon = { good: '↑', bad: '!', neutral: 'i' };
    const label = { good: 'Hyvä', bad: 'Huomio', neutral: 'Tieto' };
    return `<ul class="insights">${items.map((i) => `<li class="${i.tone}"><span class="ic" role="img" aria-label="${label[i.tone]}">${icon[i.tone]}</span><span>${esc(i.text)}</span></li>`).join('')}</ul>`;
  }

  function npsTone(score) {
    if (score == null) return '';
    return score >= 30 ? 'var(--good-text)' : score < 0 ? 'var(--bad-text)' : 'inherit';
  }

  return { esc, num, signed, fmtDate, shortDate, api, topbar, hbars, columns, lineChart, mountCharts, heat, insightsList, npsTone };
})();
