/* Title Explorer.
   ------------------------------------------------------------------
   Search runs against a slim index (513 titles, ~74 KB). The full
   profile for one title is fetched only when it is chosen, which keeps
   the page fast on a phone. */

(function () {
  'use strict';
  var f = PG.fmt;

  var index = [];
  var input = document.getElementById('title-search');
  var results = document.getElementById('title-results');
  var detail = document.getElementById('title-detail');
  var active = -1;
  var current = null;

  // A few titles worth a click for someone with no particular search in mind.
  var SUGGESTED = [
    'emergency-preparedness-specialist', 'city-planner', 'sanitation-worker',
    'police-officer', 'staff-nurse', 'accountant', 'social-worker'
  ];

  // ---- Search -------------------------------------------------------

  // Prefix matches first, then whole-word, then anything containing the
  // query. Someone typing "nurse" wants NURSE before CERTIFIED NURSE AIDE.
  function search(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return [];
    var scored = [];
    for (var i = 0; i < index.length; i++) {
      var t = index[i], name = t.title.toLowerCase();
      var pos = name.indexOf(q);
      if (pos === -1) continue;
      var score = pos === 0 ? 0 : /\s/.test(name.charAt(pos - 1)) ? 1 : 2;
      scored.push({ t: t, score: score, pos: pos });
    }
    scored.sort(function (a, b) {
      return a.score - b.score || a.pos - b.pos || b.t.n - a.t.n;
    });
    return scored.slice(0, 12).map(function (s) { return s.t; });
  }

  function renderResults(list) {
    results.innerHTML = '';
    active = -1;
    input.setAttribute('aria-expanded', list.length ? 'true' : 'false');
    list.forEach(function (t, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = 'opt-' + i;
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span>' + t.title + '</span><span class="meta">' +
        f.num(t.n) + ' · ' + f.dollars(t.median_salary) + '</span>';
      b.addEventListener('click', function () { choose(t.slug); });
      li.appendChild(b);
      results.appendChild(li);
    });
  }

  function setActive(i) {
    var items = results.querySelectorAll('li');
    if (!items.length) return;
    if (active >= 0) items[active].classList.remove('active');
    active = (i + items.length) % items.length;
    items[active].classList.add('active');
    input.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', function () { renderResults(search(input.value)); });

  input.addEventListener('keydown', function (e) {
    var items = results.querySelectorAll('li');
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) items[active].querySelector('button').click();
      else { var hit = search(input.value); if (hit.length) choose(hit[0].slug); }
    } else if (e.key === 'Escape') { results.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-shell')) {
      results.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
    }
  });

  // ---- Detail -------------------------------------------------------

  function choose(slug, replace) {
    if (slug === current) return;
    results.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    PG.setParam('title', slug, replace);
    current = slug;

    PG.load('titles/' + slug + '.json').then(render).catch(function (e) {
      detail.hidden = false;
      PG.fail(detail, e);
    });
  }

  function tile(dl, label, value, note, cls) {
    var w = PG.el('div', { class: 'stat' });
    w.appendChild(PG.el('dt', { text: label }));
    var dd = PG.el('dd', { text: value });
    if (cls) dd.classList.add(cls);
    w.appendChild(dd);
    if (note) w.appendChild(PG.el('div', { class: 'note', text: note }));
    dl.appendChild(w);
  }

  function render(t) {
    detail.hidden = false;
    document.getElementById('browse-block').hidden = true;
    document.title = t.title + ' — thepaygap.nyc';

    var prof = t.profile.filter(function (r) { return !r.suppressed; });
    var latest = prof[prof.length - 1];
    var earliest = prof[0];

    document.getElementById('t-name').textContent = t.title;
    document.getElementById('t-sub').textContent =
      latest ? 'Fiscal year ' + latest.fiscal_year + ' · ' + f.num(latest.n) +
               ' people · ' + latest.n_agencies + ' agenc' +
               (latest.n_agencies === 1 ? 'y' : 'ies')
             : 'Not enough people in any year to report.';

    var dl = document.getElementById('t-stats');
    dl.innerHTML = '';
    if (!latest) {
      document.getElementById('t-range').innerHTML =
        '<p class="muted">This title has fewer than 30 people in every year, ' +
        'so its figures are withheld.</p>';
      return;
    }

    tile(dl, 'Median base salary', f.dollars(latest.median_salary),
         'half earn more, half less');
    tile(dl, 'Typical range', f.dollars(latest.p25) + ' – ' + f.dollars(latest.p75),
         'middle half of jobholders');
    tile(dl, 'People in the title', f.num(latest.n),
         'FY' + latest.fiscal_year);
    tile(dl, 'Median time at agency', f.years(latest.median_tenure),
         'not total public service');

    // ---- Salary range over time ---------------------------------
    PGCharts.lineChart('#t-range', prof, {
      series: [
        { key: 'p90', label: '90th percentile', color: 'var(--ink-faint)', dashed: true },
        { key: 'p75', label: '75th', color: 'var(--series-3)' },
        { key: 'median_salary', label: 'Median', color: 'var(--series-1)' },
        { key: 'p25', label: '25th', color: 'var(--series-2)' },
        { key: 'p10', label: '10th percentile', color: 'var(--ink-faint)', dashed: true }
      ],
      yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      height: 330,
      ariaLabel: 'Salary distribution for ' + t.title + ' over time'
    });
    document.getElementById('t-range-cap').innerHTML =
      'In FY' + latest.fiscal_year + ' the lowest-paid tenth earned under <strong>' +
      f.dollars(latest.p10) + '</strong> and the highest-paid tenth over <strong>' +
      f.dollars(latest.p90) + '</strong>. A wide band usually means the title spans ' +
      'several pay levels or agencies rather than that people doing identical work ' +
      'are paid very differently.';

    // ---- Real terms ---------------------------------------------
    var w = t.wages.filter(function (r) { return r.wage_index !== null && r.wage_index !== undefined; });
    if (w.length > 1) {
      PGCharts.lineChart('#t-index', w, {
        series: [
          { key: 'wage_index', label: 'This title' },
          { key: 'rent_index', label: 'NY rent', color: 'var(--series-2)' },
          { key: 'cpi_index', label: 'NY prices', dashed: true, color: 'var(--ink-faint)' }
        ],
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 330,
        ariaLabel: 'Pay for ' + t.title + ' against rent and prices'
      });
      var w0 = w[0], w1 = w[w.length - 1];
      // Compare the title's own growth to inflation over the same window,
      // not to a fixed 2014 base the title may not have.
      var realPct = (w1.wage_index / w1.cpi_index) * (w0.cpi_index / w0.wage_index) - 1;
      var verdict = realPct >= 0.005
        ? 'gained <strong class="pos">' + f.delta(realPct) + '</strong> in real terms'
        : realPct <= -0.005
          ? 'lost <strong class="neg">' + f.delta(realPct) + '</strong> in real terms'
          : 'held roughly flat in real terms';
      document.getElementById('t-index-cap').innerHTML =
        'Indexed to 100 in FY' + w0.fiscal_year + ', the first year this title had ' +
        'enough people to report. Between FY' + w0.fiscal_year + ' and FY' +
        w1.fiscal_year + ' the median went from ' + f.dollars(w0.median_salary) +
        ' to ' + f.dollars(w1.median_salary) + ', which after New York inflation ' +
        verdict + '.';
    } else {
      document.getElementById('t-index').innerHTML =
        '<p class="muted">Not enough reportable years to show a trend.</p>';
      document.getElementById('t-index-cap').textContent = '';
    }

    // ---- Overtime ------------------------------------------------
    var ot = t.overtime.filter(function (r) {
      return r.ot_share_of_pay !== null && r.ot_share_of_pay !== undefined;
    });
    var otBlock = document.getElementById('t-ot-block');
    var otLatest = ot[ot.length - 1];
    // Only worth a section when overtime is actually a factor.
    if (ot.length > 1 && otLatest && otLatest.ot_share_of_pay >= 0.02) {
      otBlock.hidden = false;
      PGCharts.lineChart('#t-ot', ot, {
        series: [
          { key: 'median_base', label: 'Median base salary' },
          { key: 'median_total_comp', label: 'Median total pay', color: 'var(--series-2)' }
        ],
        yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 300,
        ariaLabel: 'Base salary against total pay for ' + t.title
      });
      document.getElementById('t-ot-cap').innerHTML =
        'In FY' + otLatest.fiscal_year + ', <strong>' + f.pct(otLatest.ot_share_of_pay) +
        '</strong> of what this title was paid came from overtime, and ' +
        f.pct(otLatest.pct_with_ot, 0) + ' of jobholders worked some. Total pay is ' +
        'regular gross plus overtime plus other pay, so the gap between the two ' +
        'lines is roughly what the extra hours are worth.';
    } else {
      otBlock.hidden = true;
    }

    // ---- Tenure --------------------------------------------------
    var tenureBlock = document.getElementById('t-tenure-block');
    if (t.tenure && t.tenure.length) {
      tenureBlock.hidden = false;
      PGCharts.stackChart('#t-tenure', t.tenure.map(function (r) {
        return { label: r.band, share: r.share, n: r.n };
      }), { ariaLabel: 'Tenure distribution for ' + t.title });
      var over20 = t.tenure.filter(function (r) {
        return r.band === '20-30' || r.band === '30+';
      }).reduce(function (s, r) { return s + r.share; }, 0);
      var under2 = (t.tenure.filter(function (r) { return r.band === '0-2'; })[0] || {}).share || 0;
      document.getElementById('t-tenure-cap').innerHTML =
        'Years at the current agency, FY' + latest.fiscal_year + '. <strong>' +
        f.pct(under2, 0) + '</strong> joined within the last two years and <strong>' +
        f.pct(over20, 0) + '</strong> are past twenty, which is roughly when City ' +
        'pensions become worth retiring on. Time at a previous agency does not count ' +
        'here, so this understates real public service.';
    } else {
      tenureBlock.hidden = true;
    }

    // ---- Agencies ------------------------------------------------
    var agBlock = document.getElementById('t-agency-block');
    if (t.agencies && t.agencies.length) {
      agBlock.hidden = false;
      PGTable.render('#t-agencies', {
        rows: t.agencies,
        sortKey: 'n', sortDir: 'desc',
        search: t.agencies.length > 12,
        searchPlaceholder: 'Filter agencies…',
        columns: [
          { key: 'agency', label: 'Agency', name: true },
          { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
          { key: 'median_salary', label: 'Median salary', num: true,
            render: function (v) { return f.dollars(v); } }
        ]
      });
    } else {
      agBlock.hidden = true;
    }

    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Boot ---------------------------------------------------------

  PG.load('titles-index.json').then(function (idx) {
    index = idx;

    var sugg = document.getElementById('suggestions');
    SUGGESTED.forEach(function (slug) {
      var hit = index.filter(function (t) { return t.slug === slug; })[0];
      if (!hit) return;
      var b = PG.el('button', { class: 'pill', type: 'button', text: hit.title });
      b.addEventListener('click', function () { input.value = hit.title; choose(hit.slug); });
      sugg.appendChild(b);
    });

    PGTable.render('#all-titles', {
      rows: index,
      sortKey: 'n', sortDir: 'desc',
      searchPlaceholder: 'Search all ' + index.length + ' titles…',
      csv: 'downloads/salary_by_title.csv',
      columns: [
        { key: 'title', label: 'Title', name: true,
          render: function (v, r) {
            return '<a href="titles.html?title=' + encodeURIComponent(r.slug) + '">' + v + '</a>';
          } },
        { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
        { key: 'median_salary', label: 'Median salary', num: true,
          render: function (v) { return f.dollars(v); } },
        { key: 'fiscal_year', label: 'Latest year', num: true }
      ]
    });

    var want = PG.param('title');
    if (want) {
      var hit = index.filter(function (t) { return t.slug === want; })[0];
      if (hit) input.value = hit.title;
      choose(want, true);
    }
  }).catch(function (e) { PG.fail(document.getElementById('all-titles'), e); });

  // Back and forward should move between titles, not out of the page.
  window.addEventListener('popstate', function () {
    var want = PG.param('title');
    if (!want) {
      detail.hidden = true;
      document.getElementById('browse-block').hidden = false;
      current = null;
    } else if (want !== current) {
      current = null;
      choose(want, true);
    }
  });
})();
