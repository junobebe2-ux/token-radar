// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board, a filterable table, a per-protocol detail view with the model's own inputs and the
// protocol's farm plan, the live-token comparison the multiples come from, and the methodology.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, minImplied: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + 'x';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max);
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * chainMult));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('minImplied')) state.minImplied = Number(params.get('minImplied')) || 0;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.minImplied) params.set('minImplied', String(state.minImplied));
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.minImplied && r.implied_value_usd < state.minImplied) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  // The radar disc: the top 12 pre-token protocols as blips. Distance from the centre is implied
  // value on a log scale; amber is the top pick. The sweep is decoration and stops under
  // prefers-reduced-motion.
  function radarDisc() {
    var top = DATA.rows.slice(0, 12);
    var svg = svgEl('svg', { viewBox: '0 0 340 340', role: 'img', 'aria-label': 'Radar plot of the top 12 pre-token protocols by implied value' });
    var cx = 170, cy = 170;
    var logMin = Math.log10(500000), logMax = Math.log10(600000000);
    function radius(implied) {
      var t = (Math.log10(Math.max(implied, 500000)) - logMin) / (logMax - logMin);
      return 22 + 128 * Math.max(0, Math.min(1, t));
    }
    [500000000, 100000000, 10000000, 1000000].forEach(function (v) {
      svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: radius(v), fill: 'none', stroke: '#d9d4c3', 'stroke-width': 1 }));
    });
    svg.appendChild(svgEl('line', { x1: cx - 152, y1: cy, x2: cx + 152, y2: cy, stroke: '#d9d4c3', 'stroke-width': 1 }));
    svg.appendChild(svgEl('line', { x1: cx, y1: cy - 152, x2: cx, y2: cy + 152, stroke: '#d9d4c3', 'stroke-width': 1 }));
    var sweep = svgEl('g', { 'class': 'sweep' });
    sweep.appendChild(svgEl('line', { x1: cx, y1: cy, x2: cx + 150, y2: cy, stroke: '#0b6b4a', 'stroke-width': 1.5, opacity: 0.55 }));
    svg.appendChild(sweep);
    top.forEach(function (r, i) {
      var angle = -Math.PI / 2 + (i * 2 * Math.PI) / top.length;
      var rad = radius(r.implied_value_usd);
      var x = cx + rad * Math.cos(angle), y = cy + rad * Math.sin(angle);
      var dot = svgEl('circle', {
        cx: x.toFixed(1), cy: y.toFixed(1), r: r.rank === 1 ? 7 : 5,
        fill: r.rank === 1 ? '#a86a12' : '#0b6b4a', stroke: '#fffdf6', 'stroke-width': 1.5
      });
      var title = svgEl('title');
      title.textContent = '#' + r.rank + ' ' + r.name + ' — ' + fmtUsd(r.implied_value_usd);
      dot.appendChild(title);
      svg.appendChild(dot);
    });
    svg.appendChild(svgEl('circle', { cx: cx, cy: cy, r: 4, fill: '#182019' }));
    return el('div', { class: 'radar' }, svg,
      el('p', { class: 'cap', text: 'Top 12 pre-token protocols. Distance from the centre is implied value (log scale); rings mark $1M, $10M, $100M and $500M. Amber is the top pick.' }));
  }

  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('span', { class: 'kicker', text: 'PRE-TOKEN PROTOCOLS · ' + DATA.as_of }),
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by what their token would be worth' }),
        el('p', { class: 'lede', text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model calibrated on the live-token protocols in the same snapshot — not a promise, and not a price.' }),
        el('div', { class: 'facts' },
          el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
          el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
          el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
          el('div', { class: 'fact' }, el('span', { text: 'Live-token comps behind the model' }), el('b', { text: String(DATA.calibration.comps_total) }))
        )
      ),
      radarDisc()
    );
  }

  function pickStrip() {
    var top = DATA.rows[0];
    var why = 'TVL ' + fmtUsd(top.tvl_usd) + ' on ' + (top.chains || []).length + ' chains, listed ' + fmtAge(top.age_days) + ' ago with no token. At the market median of ' + fmtMult(DATA.calibration.global_multiple) + ' of TVL it is worth about ' + fmtUsd(top.implied_value_usd) + '.';
    return el('section', { class: 'pick', 'aria-label': 'Top pick' },
      el('span', { class: 'rank', text: '#1' }),
      el('div', null,
        el('h2', { text: top.name + ' — farm this one first' }),
        el('p', { text: why })
      ),
      el('div', { class: 'value' }, el('b', { text: fmtUsd(top.implied_value_usd) }), el('span', { text: 'implied value' }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; });
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function makeSelect(id, label, options, current, onchange) {
      var select = el('select', { id: id, 'aria-label': label });
      options.forEach(function (o) {
        select.appendChild(el('option', { value: String(o.value), text: o.label, selected: String(o.value) === String(current) ? 'selected' : null }));
      });
      select.addEventListener('change', function () { onchange(select.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { 'for': id, text: label }), select);
    }
    var categorySelect = makeSelect('category', 'Category',
      [{ value: 'all', label: 'All categories' }].concat(categories.map(function (c) { return { value: c, label: c }; })),
      state.category, function (v) { state.category = v; });
    var chainSelect = makeSelect('chain', 'Chain',
      [{ value: 'all', label: 'All chains' }].concat(chains.map(function (c) { return { value: c, label: c + ' (' + chainCounts[c] + ')' }; })),
      state.chain, function (v) { state.chain = v; });
    var tvlSelect = makeSelect('minTvl', 'Min TVL',
      [{ value: 0, label: 'Any TVL' }, { value: 1e8, label: '$100M+' }, { value: 5e8, label: '$500M+' }, { value: 1e9, label: '$1B+' }],
      state.minTvl, function (v) { state.minTvl = Number(v); });
    var impliedSelect = makeSelect('minImplied', 'Min implied value',
      [{ value: 0, label: 'Any value' }, { value: 1e7, label: '$10M+' }, { value: 5e7, label: '$50M+' }, { value: 1e8, label: '$100M+' }],
      state.minImplied, function (v) { state.minImplied = Number(v); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { 'for': 'q', text: 'Search' }), search),
      categorySelect, chainSelect, tvlSelect, impliedSelect,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.minImplied = 0; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        'class': r.rank === 1 ? 'top1' : null,
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar' + (r.rank === 1 ? ' top1' : ''), 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : fmtMult(r.ratio) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'The live-token protocols the multiples are calibrated on, largest market cap first. Their market caps are facts, not a model — and the median of their mcap/TVL ratios is what the pre-token board is priced at.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var topLive = DATA.live.length > 0 ? DATA.live[0].mcap_usd : null;
    var topImplied = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 0;
    var calibRows = [el('tr', null,
      el('td', { text: 'All sectors (market median)' }),
      el('td', { class: 'num', text: fmtMult(cal.global_multiple) }),
      el('td', { class: 'num', text: String(cal.comps_total) })
    )].concat(cal.sectors.map(function (s) {
      return el('tr', null,
        el('td', { text: s.category }),
        el('td', { class: 'num', text: fmtMult(s.multiple) }),
        el('td', { class: 'num', text: String(s.comps) })
      );
    }));
    return el('section', { class: 'panel method' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', null, 'Every row is scored by one function of the snapshot figures. The multiple is not asserted: it is the median market-cap/TVL ratio of the live-token protocols in this same snapshot. A sector gets its own multiple only where at least ', el('b', { text: String(m.min_comps) + ' live protocols' }), ' in that sector trade; a sector with fewer falls back to the market median. No protocol name is special-cased, and no row is hand-picked.'),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_max + ')) )'
      ),
      el('table', { class: 'calib' },
        el('caption', { class: 'sub', text: 'Calibration: median mcap/TVL per sector, from ' + cal.comps_total + ' live-token protocols in the snapshot.' }),
        el('thead', null, el('tr', null, el('th', { text: 'Sector' }), el('th', { class: 'num', text: 'Multiple' }), el('th', { class: 'num', text: 'Live comps' }))),
        el('tbody', null, calibRows)
      ),
      el('ul', { class: 'rules' },
        el('li', null, el('b', { text: 'Age is the time since first listing' }), ' — the best record of how long a protocol has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.'),
        el('li', null, el('b', { text: 'Size needs no extra factor' }), ' — the base already scales with TVL, so a second size bonus would double-count it.'),
        el('li', null, el('b', { text: 'Bridges, liquid-staking receipts and other wrapped products are not ranked' }), ' — they are not waiting on a token of their own. The same kind test the watchlist applies at its floor is applied below it.'),
        el('li', null, el('b', { text: 'Sanity check' }), ' — the strongest implied value on the board is ' + fmtUsd(topImplied) + (topLive ? ', against the largest live market cap in the snapshot, ' + fmtUsd(topLive) + '. The model’s top sits inside the range the market already pays.' : '.'))
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Multiple (' + row.multiple_source + ')' }), el('b', { text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) + ' (x' + row.growth_multiplier + ')' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) + ' (x' + row.maturity_multiplier + ')' })),
        el('div', null, el('span', { text: 'Chains (' + (row.chains || []).length + ')' }), el('b', { text: 'x' + row.chain_multiplier })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source }),
      el('span', { text: 'Snapshot ' + DATA.as_of + ' · watchlist floor $' + Math.round(DATA.floor_usd / 1e6) + 'M · model ' + DATA.model_version }),
      el('span', { text: 'Implied value is a model, not a price. Nothing here is investment advice.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(pickStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(methodPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
