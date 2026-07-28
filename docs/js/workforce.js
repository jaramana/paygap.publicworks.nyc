/* Workforce, churn and the retirement cliff. */

(function () {
  'use strict';
  var f = PG.fmt;

  Promise.all([
    PG.load('citywide.json'),
    PG.load('retirement.json'),
    PG.load('separations.json'),
    PG.load('headcount.json')
  ]).then(function (res) {
    var d = res[0], retire = res[1], seps = res[2], head = res[3];
    var meta = d.meta;

    // Citywide headcount by year, summed across agencies.
    var byYear = {};
    head.forEach(function (r) {
      if (!byYear[r.fiscal_year]) {
        byYear[r.fiscal_year] = { fiscal_year: r.fiscal_year, n: 0, n_salaried: 0, n_hourly: 0, n_daily: 0 };
      }
      var y = byYear[r.fiscal_year];
      y.n += r.n; y.n_salaried += r.n_salaried;
      y.n_hourly += r.n_hourly; y.n_daily += r.n_daily;
    });
    var years = Object.keys(byYear).map(function (k) { return byYear[k]; })
      .sort(function (a, b) { return a.fiscal_year - b.fiscal_year; });

    var latestYear = years[years.length - 1];
    var firstYear = years[0];
    var cliff = retire.filter(function (r) { return r.pct_over_20 >= 0.5; });
    var medSep = seps.slice().sort(function (a, b) {
      return a.separation_rate - b.separation_rate;
    })[Math.floor(seps.length / 2)];

    var tiles = [
      { label: 'Active employees, FY' + meta.latest_year, value: f.num(latestYear.n),
        note: 'all pay bases' },
      { label: 'Change since FY' + firstYear.fiscal_year,
        value: f.delta(latestYear.n / firstYear.n - 1),
        cls: latestYear.n >= firstYear.n ? 'up' : 'down', note: 'total headcount' },
      { label: 'Titles more than half past 20 years', value: cliff.length,
        note: 'of ' + retire.length + ' large titles' },
      { label: 'Median agency churn', value: f.pct(medSep.separation_rate),
        note: 'records ceased in FY' + meta.latest_year }
    ];
    var dl = document.getElementById('w-stats');
    tiles.forEach(function (t) {
      var w = PG.el('div', { class: 'stat' });
      w.appendChild(PG.el('dt', { text: t.label }));
      var dd = PG.el('dd', { text: t.value });
      if (t.cls) dd.classList.add(t.cls);
      w.appendChild(dd);
      w.appendChild(PG.el('div', { class: 'note', text: t.note }));
      dl.appendChild(w);
    });

    PGCharts.barChart('#cliff-chart', retire, {
      label: 'title', value: 'pct_over_20', limit: 14,
      valueFormat: function (v) { return f.pct(v, 0); },
      color: 'var(--series-3)',
      ariaLabel: 'Titles ranked by share of staff past twenty years of service'
    });

    PGCharts.lineChart('#head-chart', years, {
      series: [
        { key: 'n', label: 'All active' },
        { key: 'n_salaried', label: 'Salaried', color: 'var(--series-1)' },
        { key: 'n_hourly', label: 'Hourly', color: 'var(--series-2)' },
        { key: 'n_daily', label: 'Day rate', color: 'var(--series-4)' }
      ],
      yFormat: function (v) { return Math.round(v / 1000) + 'k'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      yZero: true, height: 340,
      ariaLabel: 'City of New York headcount by pay basis over time'
    });
    document.getElementById('head-cap').innerHTML =
      'Active records by pay basis. Total headcount went from <strong>' +
      f.num(firstYear.n) + '</strong> in FY' + firstYear.fiscal_year + ' to <strong>' +
      f.num(latestYear.n) + '</strong> in FY' + latestYear.fiscal_year +
      '. The hourly line moves with the election calendar as much as with hiring, ' +
      'because poll workers appear on the payroll in years with large elections.';

    PGTable.render('#sep-table', {
      rows: seps, sortKey: 'separation_rate', sortDir: 'desc',
      searchPlaceholder: 'Search an agency…',
      csv: 'downloads/separations_by_agency.csv',
      columns: [
        { key: 'agency', label: 'Agency', name: true },
        { key: 'active', label: 'Active', num: true, render: function (v) { return f.num(v); } },
        { key: 'ceased', label: 'Ceased', num: true, render: function (v) { return f.num(v); } },
        { key: 'separation_rate', label: 'Churn', num: true,
          render: function (v) { return f.pct(v); } }
      ]
    });

    PGTable.render('#ten-table', {
      rows: retire, sortKey: 'median_tenure', sortDir: 'desc',
      searchPlaceholder: 'Search a title…',
      csv: 'downloads/tenure_by_title.csv',
      columns: [
        { key: 'title', label: 'Title', name: true,
          render: function (v, r) {
            return '<a href="titles.html?title=' + encodeURIComponent(r.slug) + '">' + v + '</a>';
          } },
        { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
        { key: 'median_tenure', label: 'Median tenure', num: true,
          render: function (v) { return f.years(v); } },
        { key: 'pct_under_5', label: 'Under 5 yrs', num: true,
          render: function (v) { return f.pct(v, 0); } },
        { key: 'pct_over_20', label: 'Over 20 yrs', num: true,
          render: function (v) { return f.pct(v, 0); } },
        { key: 'pct_over_25', label: 'Over 25 yrs', num: true,
          render: function (v) { return f.pct(v, 0); } }
      ]
    });
  }).catch(function (e) { PG.fail(document.getElementById('w-stats'), e); });
})();
