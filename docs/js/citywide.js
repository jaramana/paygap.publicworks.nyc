/* Citywide: the whole payroll at once. */

(function () {
  'use strict';
  var f = PG.fmt;

  function tiles(hostId, list) {
    var dl = document.getElementById(hostId);
    dl.innerHTML = '';
    list.forEach(function (t) {
      var w = PG.el('div', { class: 'stat' });
      w.appendChild(PG.el('dt', { text: t.label }));
      var dd = PG.el('dd', { text: String(t.value) });
      if (t.cls) dd.classList.add(t.cls);
      w.appendChild(dd);
      if (t.note) w.appendChild(PG.el('div', { class: 'note', text: t.note }));
      dl.appendChild(w);
    });
  }

  Promise.all([
    PG.load('citywide.json'),
    PG.load('hourly-titles.json'),
    PG.load('headcount.json')
  ]).then(function (r) {
    var d = r[0], hourlyTitles = r[1], headcount = r[2];
    var m = d.meta, wages = d.wages;
    var last = wages[wages.length - 1], first = wages[0];

    // ---- Pay -----------------------------------------------------
    tiles('cw-stats', [
      { label: 'Median salary, FY' + m.latest_year, value: f.dollars(last.median_salary),
        note: f.num(d.headline.headcount) + ' salaried' },
      { label: 'Real change since FY' + m.index_year,
        value: f.delta(last.real_median / first.real_median - 1),
        cls: last.real_median >= first.real_median ? 'up' : 'down',
        note: 'after NY inflation' },
      { label: 'NY prices, same period', value: f.delta(d.headline.cpi_growth),
        note: 'CPI-U, NY area' },
      { label: 'NY rent, same period', value: f.delta(d.headline.rent_growth),
        cls: 'down', note: 'rent of primary residence' }
    ]);

    PGCharts.lineChart('#cw-index', wages, {
      series: [
        { key: 'wage_index', label: 'City median pay' },
        { key: 'rent_index', label: 'NY rent (BLS)', color: 'var(--series-2)' },
        { key: 'cpi_index', label: 'NY prices', dashed: true, color: 'var(--ink-faint)' }
      ],
      xFormat: function (v) { return "'" + String(v).slice(2); },
      height: 340,
      ariaLabel: 'Pay, rent and prices indexed to 100 in FY' + m.index_year
    });
    document.getElementById('cw-index-cap').innerHTML =
      'All three indexed to 100 in FY' + m.index_year + '. By FY' + m.latest_year +
      ' pay stands at <strong>' + last.wage_index.toFixed(1) + '</strong>, rent at <strong>' +
      last.rent_index.toFixed(1) + '</strong> and prices at <strong>' +
      last.cpi_index.toFixed(1) + '</strong>.' +
      '<span class="qual">A median moves with who the City hires, not only with ' +
      'what it pays. Look up a title to follow one job over time.</span>';

    var zori = wages.filter(function (x) { return x.zori != null; })
      .map(function (x) {
        return Object.assign({}, x, { monthly_pay: x.median_salary / 12 });
      });
    if (zori.length) {
      PGCharts.lineChart('#cw-rent', zori, {
        series: [
          { key: 'monthly_pay', label: 'Median monthly pay, gross' },
          { key: 'zori', label: 'Typical NYC asking rent', color: 'var(--series-2)' }
        ],
        yFormat: function (v) { return '$' + f.num(v); },
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 300, ariaLabel: 'Monthly pay against asking rent'
      });
      var z0 = zori[0], z1 = zori[zori.length - 1];
      document.getElementById('cw-rent-cap').innerHTML =
        'Typical asking rent rose ' + f.dollars(z0.zori) + ' → ' + f.dollars(z1.zori) +
        ' between FY' + z0.fiscal_year + ' and FY' + z1.fiscal_year + ', a rise of ' +
        f.delta(z1.zori / z0.zori - 1) + '.' +
        '<span class="qual">Monthly pay is annual base divided by twelve, before ' +
        'tax and before pension and health contributions, so take-home is ' +
        'meaningfully below the blue line.</span>';
    }

    // ---- Gender --------------------------------------------------
    var dec = d.decomposition[d.decomposition.length - 1];
    var g = d.gender[d.gender.length - 1];
    var cov = d.coverage[d.coverage.length - 1];

    tiles('g-stats', [
      { label: 'Overall gap, FY' + m.latest_year, value: f.pct(dec.total_gap),
        note: 'women earn this much less' },
      { label: 'Within the same title', value: f.pct(dec.within_gap),
        note: f.pct(dec.within_share, 0) + ' of the gap' },
      { label: 'Between different titles', value: f.pct(dec.between_gap),
        cls: 'down', note: f.pct(dec.between_share, 0) + ' of the gap' },
      { label: 'In dollars', value: f.dollars(g.gap_dollars), note: 'mean difference' }
    ]);

    PGCharts.barChart('#g-decomp', [
      { label: 'Total gap', value: dec.total_gap },
      { label: 'Between titles', value: dec.between_gap },
      { label: 'Within the same title', value: dec.within_gap }
    ], {
      label: 'label', value: 'value', labelWidth: 200,
      valueFormat: function (v) { return f.pct(v, 2); },
      color: function (x) {
        return x.label === 'Within the same title' ? 'var(--series-1)'
             : x.label === 'Total gap' ? 'var(--ink-faint)' : 'var(--series-2)';
      },
      ariaLabel: 'Gender gap split into between-title and within-title parts'
    });
    document.getElementById('g-decomp-cap').innerHTML =
      'FY' + m.latest_year + ', across ' + f.num(dec.n_titles) + ' titles holding both ' +
      'men and women. Of the ' + f.pct(dec.total_gap) + ' gap, <strong>' +
      f.points(dec.between_gap) + ' points</strong> comes from how men and women are ' +
      'distributed across titles and <strong>' + f.points(dec.within_gap) +
      ' points</strong> from pay differences inside the same title.' +
      '<span class="qual">Gender is inferred from first names, so these are ' +
      'population estimates and say nothing about any individual.</span>';

    PGCharts.lineChart('#g-trend', d.decomposition, {
      series: [
        { key: 'total_gap', label: 'Total gap' },
        { key: 'between_gap', label: 'Between titles', color: 'var(--series-2)' },
        { key: 'within_gap', label: 'Within title', color: 'var(--series-4)' }
      ],
      yFormat: function (v) { return (v * 100).toFixed(0) + '%'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      yZero: true, height: 320, ariaLabel: 'Gender gap components over time'
    });
    var d0 = d.decomposition[0];
    document.getElementById('g-trend-cap').innerHTML =
      'The overall gap went from ' + f.pct(d0.total_gap) + ' in FY' + d0.fiscal_year +
      ' to ' + f.pct(dec.total_gap) + ' in FY' + dec.fiscal_year + ', almost entirely ' +
      'through the between-title component shrinking. The within-title component moved ' +
      'the other way, ' + f.pct(d0.within_gap) + ' → ' + f.pct(dec.within_gap) +
      '.' + '<span class="qual">Name matching covered ' + f.pct(cov.coverage, 0) +
      ' of employees.</span>';

    // ---- Name origin ---------------------------------------------
    PGCharts.lineChart('#n-chart', d.name_origin, {
      series: [
        { key: 'common_mean', label: 'Name in US birth records' },
        { key: 'uncommon_mean', label: 'Name not in US birth records', color: 'var(--series-2)' }
      ],
      yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      height: 300, ariaLabel: 'Mean salary by whether a name appears in US birth records'
    });
    var n1 = d.name_origin[d.name_origin.length - 1];
    document.getElementById('n-cap').innerHTML =
      'FY' + n1.fiscal_year + ': a gap of <strong>' + f.pct(n1.gap) + '</strong>, or ' +
      f.dollars(n1.gap_dollars) + ' a year, affecting ' + f.pct(n1.uncommon_share, 0) +
      ' of employees, and larger than the gender gap on the same payroll.' +
      '<span class="qual">A name counts as present if it appears at least 25 times ' +
      'in SSA records since 1880. This is a proxy for national origin, not a ' +
      'neutral category.</span>';

    // ---- Hourly ---------------------------------------------------
    var h = d.hourly, hl = h[h.length - 1], hf = h[0];
    tiles('h-stats', [
      { label: 'On the hourly roster', value: f.num(hl.n_roster), note: 'FY' + hl.fiscal_year },
      { label: '$1.00 placeholder rate', value: f.pct(hl.n_placeholder / hl.n_roster, 0),
        note: 'mostly election workers' },
      { label: 'Median hourly rate', value: f.rate(hl.median_rate), note: 'excluding placeholders' },
      { label: 'Worked 1,000+ hours', value: f.pct(hl.pct_substantial, 1),
        note: f.num(hl.n_substantial) + ' people' }
    ]);

    PGCharts.lineChart('#h-chart', h, {
      series: [
        { key: 'median_rate', label: 'Median rate, nominal' },
        { key: 'real_median_rate', label: 'In FY' + m.base_year + ' money', color: 'var(--series-2)' },
        { key: 'p90', label: '90th percentile', dashed: true, color: 'var(--ink-faint)' }
      ],
      yFormat: function (v) { return '$' + v.toFixed(0); },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      yZero: true, height: 300, ariaLabel: 'Hourly rates, nominal and inflation adjusted'
    });
    document.getElementById('h-cap').innerHTML =
      'Median rate ' + f.rate(hf.median_rate) + ' → ' + f.rate(hl.median_rate) +
      ' between FY' + hf.fiscal_year + ' and FY' + hl.fiscal_year + '. In FY' +
      m.base_year + ' money that is ' + f.rate(hf.real_median_rate) + ' → ' +
      f.rate(hl.real_median_rate) + ', a real change of <strong>' +
      f.delta(hl.real_median_rate / hf.real_median_rate - 1) + '</strong>.' +
      '<span class="qual">Rising New York State minimum wage explains much of the ' +
      'movement at the bottom of this distribution.</span>';

    PGTable.render('#h-table', {
      rows: hourlyTitles, sortKey: 'n', sortDir: 'desc', limit: 20,
      searchPlaceholder: 'Search hourly titles…',
      csv: 'downloads/hourly_and_daily_by_title.csv',
      columns: [
        { key: 'title', label: 'Title', name: true },
        { key: 'pay_basis', label: 'Basis' },
        { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
        { key: 'median_rate', label: 'Rate', num: true, render: function (v) { return f.rate(v); } },
        { key: 'median_hours', label: 'Hours', num: true, render: function (v) { return f.num(v); } },
        { key: 'median_gross', label: 'Gross', num: true, render: function (v) { return f.dollars(v); } }
      ]
    });

    // ---- Headcount -------------------------------------------------
    var byYear = {};
    headcount.forEach(function (x) {
      var y = byYear[x.fiscal_year] || (byYear[x.fiscal_year] =
        { fiscal_year: x.fiscal_year, n: 0, n_salaried: 0, n_hourly: 0, n_daily: 0 });
      y.n += x.n; y.n_salaried += x.n_salaried;
      y.n_hourly += x.n_hourly; y.n_daily += x.n_daily;
    });
    var years = Object.keys(byYear).map(function (k) { return byYear[k]; })
      .sort(function (a, b) { return a.fiscal_year - b.fiscal_year; });

    PGCharts.lineChart('#w-head', years, {
      series: [
        { key: 'n', label: 'All active' },
        { key: 'n_salaried', label: 'Salaried', color: 'var(--series-1)' },
        { key: 'n_hourly', label: 'Hourly', color: 'var(--series-2)' },
        { key: 'n_daily', label: 'Day rate', color: 'var(--series-4)' }
      ],
      yFormat: function (v) { return Math.round(v / 1000) + 'k'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      yZero: true, height: 320, ariaLabel: 'Headcount by pay basis'
    });
    var y0 = years[0], y1 = years[years.length - 1];
    document.getElementById('w-head-cap').innerHTML =
      'Active records ' + f.num(y0.n) + ' → ' + f.num(y1.n) + ' between FY' +
      y0.fiscal_year + ' and FY' + y1.fiscal_year + '.' +
      '<span class="qual">The hourly line tracks the election calendar as much as ' +
      'hiring, because poll workers appear on the payroll in election years.</span>';
  }).catch(function (e) { PG.fail(document.getElementById('cw-stats'), e); });
})();
