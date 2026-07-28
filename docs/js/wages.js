/* Pay against rent. */

(function () {
  'use strict';
  var f = PG.fmt;

  Promise.all([PG.load('citywide.json'), PG.load('wage-change.json')])
    .then(function (res) {
      var d = res[0], changes = res[1];
      var wages = d.wages, meta = d.meta;
      var last = wages[wages.length - 1];
      var first = wages[0];

      // ---- Stat tiles ---------------------------------------------
      var realChange = last.real_median / first.real_median - 1;
      var tiles = [
        { label: 'Median salary, FY' + meta.latest_year, value: f.dollars(last.median_salary),
          note: 'nominal' },
        { label: 'Same salary in FY' + meta.index_year + ' money',
          value: f.dollars(last.median_salary / (last.cpi_index / 100)),
          note: 'deflated by NY-area CPI' },
        { label: 'Real change since FY' + meta.index_year, value: f.delta(realChange),
          cls: realChange >= 0 ? 'up' : 'down', note: 'after inflation' },
        { label: 'Against rent', value: f.delta(last.wage_index / last.rent_index - 1),
          cls: last.wage_index >= last.rent_index ? 'up' : 'down',
          note: 'pay growth minus rent growth' }
      ];
      var dl = document.getElementById('wage-stats');
      tiles.forEach(function (t) {
        var w = PG.el('div', { class: 'stat' });
        w.appendChild(PG.el('dt', { text: t.label }));
        var dd = PG.el('dd', { text: t.value });
        if (t.cls) dd.classList.add(t.cls);
        w.appendChild(dd);
        w.appendChild(PG.el('div', { class: 'note', text: t.note }));
        dl.appendChild(w);
      });

      // ---- Index chart --------------------------------------------
      PGCharts.lineChart('#index-chart', wages, {
        series: [
          { key: 'wage_index', label: 'City median pay' },
          { key: 'rent_index', label: 'NY rent (BLS)' },
          { key: 'cpi_index',  label: 'NY prices', dashed: true, color: 'var(--ink-faint)' }
        ],
        xFormat: function (v) { return "'" + String(v).slice(2); },
        height: 360,
        ariaLabel: 'Pay, rent and prices indexed to 100 in fiscal year ' + meta.index_year
      });
      document.getElementById('index-caption').innerHTML =
        'Indexed to 100 in FY' + meta.index_year + '. Pay ends at <strong>' +
        last.wage_index.toFixed(1) + '</strong>, rent at <strong>' +
        last.rent_index.toFixed(1) + '</strong>, prices at <strong>' +
        last.cpi_index.toFixed(1) + '</strong>.';

      // ---- Rent in dollars ----------------------------------------
      // ZORI starts later than the payroll data, so only chart the years
      // where both exist rather than drawing a line that begins at zero.
      var zoriRows = wages
        .filter(function (r) { return r.zori !== null && r.zori !== undefined; })
        .map(function (r) {
          // Gross monthly pay, purely so the two lines share an axis. This is
          // before tax, pension and health contributions, which the caption says.
          return Object.assign({}, r, { monthly_pay: r.median_salary / 12 });
        });
      if (zoriRows.length) {
        PGCharts.lineChart('#rent-chart', zoriRows, {
          series: [
            { key: 'monthly_pay', label: 'City median pay, monthly before tax' },
            { key: 'zori', label: 'Typical NYC asking rent', color: 'var(--series-2)' }
          ],
          yFormat: function (v) { return '$' + f.num(v); },
          xFormat: function (v) { return "'" + String(v).slice(2); },
          height: 320,
          ariaLabel: 'Monthly City pay against typical asking rent in dollars'
        });
        var z0 = zoriRows[0], z1 = zoriRows[zoriRows.length - 1];
        document.getElementById('rent-caption').innerHTML =
          'Typical asking rent for the New York metro rose from <strong>' +
          f.dollars(z0.zori) + '</strong> in FY' + z0.fiscal_year + ' to <strong>' +
          f.dollars(z1.zori) + '</strong> in FY' + z1.fiscal_year + ', a rise of ' +
          f.delta(z1.zori / z0.zori - 1) + '. Monthly pay is the median annual base ' +
          'salary divided by twelve, before tax and before pension and health ' +
          'contributions, so real take-home is meaningfully lower than the blue line.';
      }

      // ---- Losers -------------------------------------------------
      var losers = changes.slice().sort(function (a, b) { return a.real_change - b.real_change; });
      PGCharts.barChart('#losers-chart', losers, {
        label: 'title', value: 'real_change', limit: 12,
        valueFormat: function (v) { return f.delta(v); },
        color: function (d) { return d.real_change < 0 ? 'var(--series-2)' : 'var(--series-4)'; },
        ariaLabel: 'Titles with the largest real-terms pay declines'
      });

      // ---- Table --------------------------------------------------
      PGTable.render('#wage-table', {
        rows: changes,
        sortKey: 'real_change', sortDir: 'asc',
        searchPlaceholder: 'Search a title…',
        csv: 'downloads/real_wages_by_title.csv',
        columns: [
          { key: 'title', label: 'Title', name: true,
            render: function (v, r) {
              return '<a href="titles.html?title=' + encodeURIComponent(r.slug) + '">' + v + '</a>';
            } },
          { key: 'first_year', label: 'From', num: true },
          { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
          { key: 'first_nominal', label: 'Then', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'last_nominal', label: 'Now', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'nominal_change', label: 'Nominal', num: true,
            render: function (v) { return f.delta(v); } },
          { key: 'real_change', label: 'Real', num: true,
            render: function (v) { return f.delta(v); },
            cellClass: function (v) { return v < 0 ? 'neg' : 'pos'; } }
        ]
      });
    })
    .catch(function (e) { PG.fail(document.getElementById('wage-stats'), e); });
})();
