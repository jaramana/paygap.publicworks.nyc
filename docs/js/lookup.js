/* Lookup view.
   ------------------------------------------------------------------
   Renders one entity, title or agency, from a payload the R export gives
   the same shape to either way. The only branch is the breakdown panel:
   a title lists the agencies employing it, an agency lists its titles. */

(function () {
  'use strict';
  var f = PG.fmt;

  var entity  = document.getElementById('entity');
  var browse  = document.getElementById('browse');
  var current = null;
  var search;

  function scopeOf() {
    return PG.param('agency') ? 'agency' : 'title';
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

  function show(scope, slug, replace) {
    if (current === scope + '/' + slug) return;
    current = scope + '/' + slug;
    // Only one of the two params should ever be set.
    PG.setParam(scope === 'agency' ? 'title' : 'agency', null, true);
    PG.setParam(scope, slug, replace);
    PG.load((scope === 'agency' ? 'agencies/' : 'titles/') + slug + '.json')
      .then(render)
      .catch(function (e) { entity.hidden = false; PG.fail(entity, e); });
  }

  function render(d) {
    var isAgency = d.kind === 'agency';
    entity.hidden = false;
    browse.hidden = true;
    document.title = d.title + ' — The Pay Gap';

    var prof   = d.profile.filter(function (r) { return !r.suppressed; });
    var latest = prof[prof.length - 1];

    document.getElementById('e-kind').textContent = isAgency ? 'agency' : 'civil service title';
    document.getElementById('e-name').textContent = d.title;

    var dl = document.getElementById('e-stats');
    dl.innerHTML = '';

    if (!latest) {
      document.getElementById('e-sub').textContent =
        'Fewer than 30 people in every year, so figures are withheld.';
      ['e-range', 'e-index', 'e-ot-block', 'e-comp-block', 'e-tenure-block',
       'e-head-block', 'e-breakdown'].forEach(function (id) {
        var n = document.getElementById(id); if (n) n.hidden = true;
      });
      return;
    }

    var spans = isAgency ? latest.n_titles : latest.n_agencies;
    document.getElementById('e-sub').textContent =
      'FY' + latest.fiscal_year + ' · ' + f.num(latest.n) + ' salaried · ' +
      f.num(spans) + (isAgency ? ' distinct titles' : ' agenc' + (spans === 1 ? 'y' : 'ies'));

    tile(dl, 'Median base salary', f.dollars(latest.median_salary), 'half earn more, half less');
    tile(dl, 'Middle half', f.dollars(latest.p25) + '–' + f.dollars(latest.p75), '25th to 75th percentile');
    tile(dl, 'People', f.num(latest.n), 'FY' + latest.fiscal_year);
    tile(dl, 'Median tenure', f.years(latest.median_tenure), 'at this agency');

    // ---- Pay range ----------------------------------------------
    PGCharts.lineChart('#e-range', prof, {
      series: [
        { key: 'p90', label: '90th percentile', color: 'var(--ink-faint)', dashed: true },
        { key: 'p75', label: '75th', color: 'var(--series-3)' },
        { key: 'median_salary', label: 'Median', color: 'var(--series-1)' },
        { key: 'p25', label: '25th', color: 'var(--series-2)' },
        { key: 'p10', label: '10th percentile', color: 'var(--ink-faint)', dashed: true }
      ],
      yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      height: 320, ariaLabel: 'Salary distribution for ' + d.title
    });
    document.getElementById('e-range-cap').innerHTML =
      'FY' + latest.fiscal_year + ': lowest-paid tenth under <strong>' +
      f.dollars(latest.p10) + '</strong>, highest-paid tenth over <strong>' +
      f.dollars(latest.p90) + '</strong>.' +
      '<span class="qual">A wide band usually means the ' +
      (isAgency ? 'agency spans many different titles'
                : 'title spans several pay levels or agencies') +
      ', not that identical work is paid very differently.</span>';

    // ---- Real terms ----------------------------------------------
    var w = d.wages.filter(function (r) {
      return r.wage_index !== null && r.wage_index !== undefined;
    });
    if (w.length > 1) {
      document.getElementById('e-index').parentElement.hidden = false;
      PGCharts.lineChart('#e-index', w, {
        series: [
          { key: 'wage_index', label: 'This ' + (isAgency ? 'agency' : 'title') },
          { key: 'rent_index', label: 'NY rent', color: 'var(--series-2)' },
          { key: 'cpi_index', label: 'NY prices', dashed: true, color: 'var(--ink-faint)' }
        ],
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 320, ariaLabel: 'Pay against rent and prices for ' + d.title
      });
      var a = w[0], b = w[w.length - 1];
      var real = (b.wage_index / b.cpi_index) * (a.cpi_index / a.wage_index) - 1;
      var verdict = real >= 0.005
        ? 'gained <strong class="pos">' + f.delta(real) + '</strong> against prices'
        : real <= -0.005
          ? 'lost <strong class="neg">' + f.delta(real) + '</strong> against prices'
          : 'held flat against prices';
      document.getElementById('e-index-cap').innerHTML =
        'Indexed to 100 in FY' + a.fiscal_year + ', the first reportable year. ' +
        'Median pay went ' + f.dollars(a.median_salary) + ' → ' +
        f.dollars(b.median_salary) + ', which after New York inflation ' + verdict + '.';
    } else {
      document.getElementById('e-index').parentElement.hidden = true;
    }

    // ---- Overtime -------------------------------------------------
    var ot = d.overtime.filter(function (r) {
      return r.ot_share_of_pay !== null && r.ot_share_of_pay !== undefined;
    });
    var otLast = ot[ot.length - 1];
    var otBlock = document.getElementById('e-ot-block');
    if (ot.length > 1 && otLast && otLast.ot_share_of_pay >= 0.01) {
      otBlock.hidden = false;
      PGCharts.lineChart('#e-ot', ot, {
        series: [
          { key: 'median_base', label: 'Median base salary' },
          { key: 'median_total_comp', label: 'Median total pay', color: 'var(--series-2)' }
        ],
        yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 280, ariaLabel: 'Base against total pay for ' + d.title
      });
      document.getElementById('e-ot-cap').innerHTML =
        'FY' + otLast.fiscal_year + ': <strong>' + f.pct(otLast.ot_share_of_pay) +
        '</strong> of pay came from overtime, and ' + f.pct(otLast.pct_with_ot, 0) +
        ' worked some.' +
        '<span class="qual">The data records hours and dollars, not whether a ' +
        'shift was volunteered or mandated.</span>';
    } else {
      otBlock.hidden = true;
    }

    // ---- Compression ----------------------------------------------
    var comp = d.compression.filter(function (r) {
      return r.compression_ratio !== null && r.compression_ratio !== undefined;
    });
    var cLast = comp[comp.length - 1];
    var cBlock = document.getElementById('e-comp-block');
    if (comp.length > 1 && cLast) {
      cBlock.hidden = false;
      PGCharts.lineChart('#e-comp', comp, {
        series: [
          { key: 'median_new', label: 'Hired under 2 years' },
          { key: 'median_vet', label: 'Over 10 years', color: 'var(--series-4)' }
        ],
        yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 280, ariaLabel: 'New hire against veteran pay for ' + d.title
      });
      var prem = cLast.experience_premium;
      document.getElementById('e-comp-cap').innerHTML =
        'FY' + cLast.fiscal_year + ': ten or more years is worth <strong class="' +
        (prem > 0 ? 'pos' : 'neg') + '">' + (prem >= 0 ? '+' : '−') +
        f.dollars(Math.abs(prem)) + '</strong> against a recent hire.' +
        '<span class="qual">Tenure is time at the current agency, so anyone who ' +
        'transferred in reads as newer than they are. This is a conservative figure.</span>';
    } else {
      cBlock.hidden = true;
    }

    // ---- Tenure ---------------------------------------------------
    var tBlock = document.getElementById('e-tenure-block');
    if (d.tenure && d.tenure.length) {
      tBlock.hidden = false;
      PGCharts.stackChart('#e-tenure', d.tenure.map(function (r) {
        return { label: r.band, share: r.share, n: r.n };
      }), { ariaLabel: 'Tenure distribution for ' + d.title });
      var over20 = d.tenure.filter(function (r) {
        return r.band === '20-30' || r.band === '30+';
      }).reduce(function (s, r) { return s + r.share; }, 0);
      var under2 = (d.tenure.filter(function (r) { return r.band === '0-2'; })[0] || {}).share || 0;
      document.getElementById('e-tenure-cap').innerHTML =
        'Years at this agency, FY' + latest.fiscal_year + '. <strong>' +
        f.pct(under2, 0) + '</strong> arrived within two years, <strong>' +
        f.pct(over20, 0) + '</strong> are past twenty.';
    } else {
      tBlock.hidden = true;
    }

    // ---- Headcount, agencies only ---------------------------------
    var hBlock = document.getElementById('e-head-block');
    if (isAgency && d.headcount && d.headcount.length > 1) {
      hBlock.hidden = false;
      PGCharts.lineChart('#e-head', d.headcount, {
        series: [
          { key: 'n', label: 'All active' },
          { key: 'n_salaried', label: 'Salaried', color: 'var(--series-1)' },
          { key: 'n_hourly', label: 'Hourly', color: 'var(--series-2)' }
        ],
        yFormat: function (v) { return v >= 1000 ? Math.round(v / 1000) + 'k' : v; },
        xFormat: function (v) { return "'" + String(v).slice(2); },
        yZero: true, height: 280, ariaLabel: 'Headcount for ' + d.title
      });
      var h0 = d.headcount[0], h1 = d.headcount[d.headcount.length - 1];
      var sep = (d.separations || [])[d.separations.length - 1];
      document.getElementById('e-head-cap').innerHTML =
        'Active records went ' + f.num(h0.n) + ' → ' + f.num(h1.n) + ' between FY' +
        h0.fiscal_year + ' and FY' + h1.fiscal_year + '.' +
        (sep && sep.separation_rate != null
          ? '<span class="qual">In FY' + sep.fiscal_year + ', ' +
            f.pct(sep.separation_rate) + ' of records were marked ceased, which ' +
            'mixes quits, retirements, layoffs and seasonal endings.</span>'
          : '');
    } else {
      hBlock.hidden = true;
    }

    // ---- Breakdown -------------------------------------------------
    var rows = isAgency ? d.titles : d.agencies;
    document.getElementById('e-break-label').textContent =
      isAgency ? 'Titles in this agency' : 'Agencies employing this title';
    if (rows && rows.length) {
      PGTable.render('#e-breakdown', {
        rows: rows,
        sortKey: 'n', sortDir: 'desc',
        limit: 15,
        search: rows.length > 12,
        searchPlaceholder: isAgency ? 'Filter titles…' : 'Filter agencies…',
        columns: [
          { key: isAgency ? 'title' : 'agency',
            label: isAgency ? 'Title' : 'Agency', name: true,
            render: function (v, r) {
              // Only titles with a page of their own become links; the rest
              // are below the reporting threshold and have nothing to show.
              return (isAgency && r.has_page)
                ? '<a href="lookup.html?title=' + encodeURIComponent(r.slug) + '">' + v + '</a>'
                : v;
            } },
          { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
          { key: 'median_salary', label: 'Median salary', num: true,
            render: function (v) { return f.dollars(v); } }
        ]
      });
    } else {
      document.getElementById('e-breakdown').innerHTML =
        '<p class="muted">Nothing above the reporting threshold.</p>';
    }
    // Deliberately no scrolling here. The result renders immediately below
    // the search box, so moving the page would only push the box the reader
    // just used off screen and cost them their bearings.
  }

  // ---- Browse all --------------------------------------------------

  function renderBrowse(scope) {
    var src = PGSearch.SOURCES[scope];
    document.querySelector('#browse .section-label').textContent =
      scope === 'agency' ? 'All agencies' : 'All titles';
    PG.load(src.file).then(function (rows) {
      PGTable.render('#browse-table', {
        rows: rows,
        sortKey: 'n', sortDir: 'desc',
        limit: 25,
        searchPlaceholder: 'Search ' + rows.length + ' ' + scope + 's…',
        csv: scope === 'agency' ? 'downloads/real_wages_by_agency.csv'
                                : 'downloads/salary_by_title.csv',
        columns: [
          { key: src.key, label: scope === 'agency' ? 'Agency' : 'Title', name: true,
            render: function (v, r) {
              return '<a href="lookup.html?' + scope + '=' +
                encodeURIComponent(r.slug) + '">' + v + '</a>';
            } },
          { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
          { key: 'median_salary', label: 'Median salary', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'fiscal_year', label: 'Year', num: true,
            render: function (v) { return 'FY' + v; } }
        ]
      });
    }).catch(function (e) { PG.fail(document.getElementById('browse-table'), e); });
  }

  // ---- Boot ---------------------------------------------------------

  var startScope = PG.param('agency') ? 'agency'
                 : PG.param('scope') === 'agency' ? 'agency' : 'title';

  search = PGSearch.mount('#lookup-search', {
    scope: startScope,
    autofocus: !PG.param('title') && !PG.param('agency'),
    onPick: function (r) {
      search.setValue(r.name);
      show(r.scope, r.slug);
    }
  });

  renderBrowse(startScope);

  var want = PG.param('title') || PG.param('agency');
  if (want) {
    var scope = scopeOf();
    PG.load(PGSearch.SOURCES[scope].file).then(function (rows) {
      var hit = rows.filter(function (x) { return x.slug === want; })[0];
      if (hit) search.setValue(hit[PGSearch.SOURCES[scope].key]);
    });
    show(scope, want, true);
  }

  window.addEventListener('popstate', function () {
    var slug = PG.param('title') || PG.param('agency');
    if (!slug) {
      entity.hidden = true;
      browse.hidden = false;
      current = null;
    } else {
      var s = scopeOf();
      if (current !== s + '/' + slug) { current = null; show(s, slug, true); }
    }
  });
})();
