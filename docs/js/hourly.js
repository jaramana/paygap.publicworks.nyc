/* Hourly and day-rate workers. */

(function () {
  'use strict';
  var f = PG.fmt;

  Promise.all([PG.load('citywide.json'), PG.load('hourly-titles.json')])
    .then(function (res) {
      var d = res[0], titles = res[1];
      var h = d.hourly, meta = d.meta;
      var last = h[h.length - 1];
      var first = h[0];

      var tiles = [
        { label: 'On the hourly roster, FY' + meta.latest_year, value: f.num(last.n_roster),
          note: 'active, paid per hour' },
        { label: 'Carrying a $1.00 placeholder', value: f.pct(last.n_placeholder / last.n_roster, 0),
          note: 'mostly election workers' },
        { label: 'Median real hourly rate', value: f.rate(last.median_rate),
          note: 'excluding placeholders' },
        { label: 'Worked 1,000+ hours', value: f.pct(last.pct_substantial, 1),
          note: f.num(last.n_substantial) + ' people' }
      ];
      var dl = document.getElementById('h-stats');
      tiles.forEach(function (t) {
        var w = PG.el('div', { class: 'stat' });
        w.appendChild(PG.el('dt', { text: t.label }));
        w.appendChild(PG.el('dd', { text: t.value }));
        w.appendChild(PG.el('div', { class: 'note', text: t.note }));
        dl.appendChild(w);
      });

      // Nominal against real shows whether the floor actually rose.
      PGCharts.lineChart('#rate-chart', h, {
        series: [
          { key: 'median_rate', label: 'Median rate, nominal' },
          { key: 'real_median_rate', label: 'Median rate in FY' + meta.base_year + ' money',
            color: 'var(--series-2)' },
          { key: 'p90', label: '90th percentile', dashed: true, color: 'var(--ink-faint)' }
        ],
        yFormat: function (v) { return '$' + v.toFixed(0); },
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 330, yZero: true,
        ariaLabel: 'Median hourly rate, nominal and inflation adjusted'
      });
      document.getElementById('rate-cap').innerHTML =
        'The median hourly rate rose from <strong>' + f.rate(first.median_rate) +
        '</strong> in FY' + first.fiscal_year + ' to <strong>' + f.rate(last.median_rate) +
        '</strong> in FY' + last.fiscal_year + '. In FY' + meta.base_year +
        ' money the FY' + first.fiscal_year + ' rate was ' + f.rate(first.real_median_rate) +
        ', so the real change was <strong>' +
        f.delta(last.real_median_rate / first.real_median_rate - 1) +
        '</strong>. New York State minimum wage rose over the same period, which ' +
        'explains much of the movement at the bottom of this distribution.';

      PGCharts.lineChart('#gross-chart', h, {
        series: [
          { key: 'median_gross', label: 'Median gross pay, nominal' },
          { key: 'real_median_gross', label: 'In FY' + meta.base_year + ' money',
            color: 'var(--series-2)' }
        ],
        yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 300, yZero: true,
        ariaLabel: 'Median annual gross pay for hourly workers with 1,000 or more hours'
      });
      document.getElementById('gross-cap').innerHTML =
        'Among hourly staff with at least 1,000 regular hours, median gross pay in FY' +
        last.fiscal_year + ' was <strong>' + f.dollars(last.median_gross) +
        '</strong> on a median of ' + f.num(last.median_hours) + ' hours. For ' +
        'comparison, the median salaried City employee earned ' +
        f.dollars(d.headline.median_salary) + '.';

      PGTable.render('#h-table', {
        rows: titles,
        sortKey: 'n', sortDir: 'desc',
        searchPlaceholder: 'Search a title…',
        csv: 'downloads/hourly_and_daily_by_title.csv',
        columns: [
          { key: 'title', label: 'Title', name: true },
          { key: 'pay_basis', label: 'Basis' },
          { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
          { key: 'median_rate', label: 'Median rate', num: true,
            render: function (v) { return f.rate(v); } },
          { key: 'median_hours', label: 'Median hours', num: true,
            render: function (v) { return f.num(v); } },
          { key: 'median_gross', label: 'Median gross', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'pct_substantial', label: '1,000+ hrs', num: true,
            render: function (v) { return f.pct(v, 0); } }
        ]
      });
    })
    .catch(function (e) { PG.fail(document.getElementById('h-stats'), e); });
})();
