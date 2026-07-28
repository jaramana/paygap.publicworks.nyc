/* Overtime dependence. */

(function () {
  'use strict';
  var f = PG.fmt;

  Promise.all([PG.load('overtime.json'), PG.load('citywide.json')])
    .then(function (res) {
      var rows = res[0], meta = res[1].meta;

      var withOt = rows.filter(function (r) { return r.ot_share_of_pay > 0; });
      var top = rows[0];
      var totalPremium = rows.reduce(function (s, r) {
        return s + (r.median_total_comp - r.median_base);
      }, 0) / rows.length;

      var tiles = [
        { label: 'Titles where overtime is 20%+ of pay',
          value: rows.filter(function (r) { return r.ot_share_of_pay >= 0.2; }).length,
          note: 'of ' + rows.length + ' large titles' },
        { label: 'Most dependent title', value: f.pct(top.ot_share_of_pay),
          note: top.title.toLowerCase() },
        { label: 'Typical gap, base to take-home', value: f.dollars(totalPremium),
          note: 'median across large titles' },
        { label: 'Fiscal year', value: 'FY' + meta.latest_year,
          note: 'July ' + (meta.latest_year - 1) + ' to June ' + meta.latest_year }
      ];
      var dl = document.getElementById('ot-stats');
      tiles.forEach(function (t) {
        var w = PG.el('div', { class: 'stat' });
        w.appendChild(PG.el('dt', { text: t.label }));
        w.appendChild(PG.el('dd', { text: String(t.value) }));
        w.appendChild(PG.el('div', { class: 'note', text: t.note }));
        dl.appendChild(w);
      });

      PGCharts.barChart('#ot-chart', rows, {
        label: 'title', value: 'ot_share_of_pay', limit: 14,
        valueFormat: function (v) { return f.pct(v); },
        color: 'var(--series-2)',
        ariaLabel: 'Titles ranked by overtime as a share of total pay'
      });

      PGCharts.dumbbell('#ot-gap-chart', rows.slice(0, 12), {
        label: 'title', a: 'median_base', b: 'median_total_comp',
        aLabel: 'Base salary', bLabel: 'Total pay',
        valueFormat: function (v) { return f.dollars(v); },
        rowFormat: function (d) {
          return '+' + f.dollars(d.median_total_comp - d.median_base);
        },
        ariaLabel: 'Base salary against total pay for the most overtime-dependent titles'
      });

      var t0 = rows[0];
      document.getElementById('ot-gap-cap').innerHTML =
        'For ' + t0.title.toLowerCase() + ', a median base of <strong>' +
        f.dollars(t0.median_base) + '</strong> becomes <strong>' +
        f.dollars(t0.median_total_comp) + '</strong> once overtime and other pay ' +
        'are counted, and ' + f.pct(t0.pct_with_ot, 0) + ' of jobholders worked ' +
        'some overtime that year.';

      PGTable.render('#ot-table', {
        rows: rows,
        sortKey: 'ot_share_of_pay', sortDir: 'desc',
        searchPlaceholder: 'Search a title…',
        csv: 'downloads/overtime_by_title.csv',
        columns: [
          { key: 'title', label: 'Title', name: true,
            render: function (v, r) {
              return '<a href="titles.html?title=' + encodeURIComponent(r.slug) + '">' + v + '</a>';
            } },
          { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
          { key: 'median_base', label: 'Base', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'median_total_comp', label: 'Total pay', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'ot_share_of_pay', label: 'OT share', num: true,
            render: function (v) { return f.pct(v); } },
          { key: 'pct_with_ot', label: 'Worked OT', num: true,
            render: function (v) { return f.pct(v, 0); } },
          { key: 'median_ot_hours', label: 'Median OT hrs', num: true,
            render: function (v) { return f.num(v); } }
        ]
      });
    })
    .catch(function (e) { PG.fail(document.getElementById('ot-stats'), e); });
})();
