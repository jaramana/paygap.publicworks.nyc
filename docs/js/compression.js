/* Salary compression. */

(function () {
  'use strict';
  var f = PG.fmt;

  Promise.all([PG.load('compression.json'), PG.load('citywide.json')])
    .then(function (res) {
      var rows = res[0], meta = res[1].meta;

      var inverted = rows.filter(function (r) { return r.compression_ratio >= 1; });
      var flat = rows.filter(function (r) {
        return r.compression_ratio >= 0.98 && r.compression_ratio < 1;
      });
      var median = rows.slice().sort(function (a, b) {
        return a.experience_premium - b.experience_premium;
      })[Math.floor(rows.length / 2)];

      var tiles = [
        { label: 'Titles where new hires out-earn veterans', value: inverted.length,
          note: 'of ' + rows.length + ' comparable titles' },
        { label: 'Titles within 2% of flat', value: inverted.length + flat.length,
          note: 'ten years worth almost nothing' },
        { label: 'Typical value of ten years', value: f.dollars(median.experience_premium),
          note: 'median across titles' },
        { label: 'Fiscal year', value: 'FY' + meta.latest_year,
          note: 'hired under 2 yrs vs over 10' }
      ];
      var dl = document.getElementById('comp-stats');
      tiles.forEach(function (t) {
        var w = PG.el('div', { class: 'stat' });
        w.appendChild(PG.el('dt', { text: t.label }));
        var dd = PG.el('dd', { text: String(t.value) });
        if (t.label.indexOf('out-earn') > -1 && inverted.length > 0) dd.classList.add('down');
        w.appendChild(dd);
        w.appendChild(PG.el('div', { class: 'note', text: t.note }));
        dl.appendChild(w);
      });

      PGCharts.dumbbell('#comp-chart', rows.slice(0, 14), {
        label: 'title', a: 'median_new', b: 'median_vet',
        aLabel: 'Hired under 2 years', bLabel: 'Over 10 years',
        valueFormat: function (v) { return f.dollars(v); },
        rowFormat: function (d) {
          var p = d.experience_premium;
          return (p >= 0 ? '+' : '') + f.dollars(p);
        },
        ariaLabel: 'New hire against veteran median salary by title'
      });

      var worst = rows[0];
      document.getElementById('comp-cap').innerHTML =
        'The number on the right is what ten years is worth in that title. For ' +
        worst.title.toLowerCase() + ', new hires earn a median <strong>' +
        f.dollars(worst.median_new) + '</strong> against <strong>' +
        f.dollars(worst.median_vet) + '</strong> for staff past ten years, so ' +
        'the veterans earn <strong>' + f.dollars(Math.abs(worst.experience_premium)) +
        ' less</strong>.';

      PGTable.render('#comp-table', {
        rows: rows,
        sortKey: 'compression_ratio', sortDir: 'desc',
        searchPlaceholder: 'Search a title…',
        csv: 'downloads/salary_compression_by_title.csv',
        columns: [
          { key: 'title', label: 'Title', name: true,
            render: function (v, r) {
              return '<a href="titles.html?title=' + encodeURIComponent(r.slug) + '">' + v + '</a>';
            } },
          { key: 'n_new', label: 'New hires', num: true, render: function (v) { return f.num(v); } },
          { key: 'median_new', label: 'They earn', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'n_vet', label: '10yr+', num: true, render: function (v) { return f.num(v); } },
          { key: 'median_vet', label: 'They earn', num: true,
            render: function (v) { return f.dollars(v); } },
          { key: 'experience_premium', label: 'Worth of 10 yrs', num: true,
            render: function (v) { return (v >= 0 ? '+' : '') + f.dollars(v); },
            cellClass: function (v) { return v <= 0 ? 'neg' : ''; } },
          { key: 'compression_ratio', label: 'Ratio', num: true,
            render: function (v) { return v.toFixed(3); },
            cellClass: function (v) { return v >= 1 ? 'neg' : ''; } }
        ]
      });
    })
    .catch(function (e) { PG.fail(document.getElementById('comp-stats'), e); });
})();
