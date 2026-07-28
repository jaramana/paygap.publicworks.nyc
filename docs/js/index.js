/* Front page: the headline stats and the pay-against-rent chart. */

(function () {
  'use strict';
  var f = PG.fmt;

  PG.load('citywide.json').then(function (d) {
    var h = d.headline;

    // Four numbers, in the order the argument runs: what people earn, how
    // pay moved, what it was up against, and what it means net.
    var tiles = [
      {
        label: 'Median City salary, FY' + d.meta.latest_year,
        value: f.dollars(h.median_salary),
        note: f.num(h.headcount) + ' salaried employees'
      },
      {
        label: 'Pay since FY' + d.meta.index_year,
        value: f.delta(h.wage_growth),
        cls: 'up',
        note: 'median base salary'
      },
      {
        label: 'NY inflation, same period',
        value: f.delta(h.cpi_growth),
        note: 'CPI-U, New York area'
      },
      {
        label: 'NY rent, same period',
        value: f.delta(h.rent_growth),
        cls: 'down',
        note: 'rent of primary residence'
      }
    ];

    var dl = document.getElementById('headline-stats');
    tiles.forEach(function (t) {
      var wrap = PG.el('div', { class: 'stat' });
      wrap.appendChild(PG.el('dt', { text: t.label }));
      var dd = PG.el('dd', { text: t.value });
      if (t.cls) dd.classList.add(t.cls);
      wrap.appendChild(dd);
      if (t.note) wrap.appendChild(PG.el('div', { class: 'note', text: t.note }));
      dl.appendChild(wrap);
    });

    PGCharts.lineChart('#hero-chart', d.wages, {
      x: 'fiscal_year',
      series: [
        { key: 'wage_index', label: 'City median pay' },
        { key: 'rent_index', label: 'NY rent' },
        { key: 'cpi_index',  label: 'NY prices', dashed: true, color: 'var(--ink-faint)' }
      ],
      yFormat: function (v) { return v; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      height: 360,
      ariaLabel: 'City median pay, New York rent and New York consumer prices, ' +
                 'indexed to 100 in fiscal year ' + d.meta.index_year
    });

    // State the actual gap in the caption rather than leaving the reader to
    // measure two lines by eye.
    var last = d.wages[d.wages.length - 1];
    var behind = (last.rent_index - last.wage_index).toFixed(1);
    document.getElementById('hero-caption').innerHTML =
      'Median base salary for salaried City employees, against New York-area ' +
      'consumer prices and rent, all indexed to 100 in FY' + d.meta.index_year +
      '. By FY' + d.meta.latest_year + ' pay stands at ' + last.wage_index.toFixed(1) +
      ' and rent at ' + last.rent_index.toFixed(1) + ', leaving pay <strong>' +
      behind + ' points behind rent</strong> over eleven years.';
  }).catch(function (e) {
    PG.fail(document.getElementById('headline-stats'), e);
  });
})();
