/* The gender gap, decomposed. */

(function () {
  'use strict';
  var f = PG.fmt;

  Promise.all([
    PG.load('citywide.json'),
    PG.load('gender-title.json'),
    PG.load('gender-agency.json')
  ]).then(function (res) {
    var d = res[0], byTitle = res[1], byAgency = res[2];
    var meta = d.meta;
    var dec = d.decomposition[d.decomposition.length - 1];
    var g = d.gender[d.gender.length - 1];
    var cov = d.coverage[d.coverage.length - 1];

    var tiles = [
      { label: 'Overall gap, FY' + meta.latest_year, value: f.pct(dec.total_gap),
        note: 'women earn this much less' },
      { label: 'Same title, different pay', value: f.pct(dec.within_gap),
        note: f.pct(dec.within_share, 0) + ' of the gap' },
      { label: 'Different titles', value: f.pct(dec.between_gap),
        note: f.pct(dec.between_share, 0) + ' of the gap', cls: 'down' },
      { label: 'In dollars', value: f.dollars(g.gap_dollars),
        note: 'mean difference per year' }
    ];
    var dl = document.getElementById('g-stats');
    tiles.forEach(function (t) {
      var w = PG.el('div', { class: 'stat' });
      w.appendChild(PG.el('dt', { text: t.label }));
      var dd = PG.el('dd', { text: t.value });
      if (t.cls) dd.classList.add(t.cls);
      w.appendChild(dd);
      w.appendChild(PG.el('div', { class: 'note', text: t.note }));
      dl.appendChild(w);
    });

    // ---- Decomposition, latest year ------------------------------
    PGCharts.barChart('#decomp-chart', [
      { label: 'Total gap', value: dec.total_gap },
      { label: 'Between titles (segregation)', value: dec.between_gap },
      { label: 'Within the same title', value: dec.within_gap }
    ], {
      label: 'label', value: 'value', labelWidth: 230,
      valueFormat: function (v) { return f.pct(v, 2); },
      color: function (d) {
        return d.label === 'Within the same title' ? 'var(--series-1)'
             : d.label === 'Total gap' ? 'var(--ink-faint)' : 'var(--series-2)';
      },
      ariaLabel: 'Gender pay gap split into between-title and within-title parts'
    });
    document.getElementById('decomp-cap').innerHTML =
      'FY' + meta.latest_year + ', across ' + f.num(dec.n_titles) + ' titles holding ' +
      'both men and women. Of the ' + f.pct(dec.total_gap) + ' overall gap, <strong>' +
      f.points(dec.between_gap) + ' points</strong> comes from how men and women are ' +
      'distributed across titles and only <strong>' + f.points(dec.within_gap) +
      ' points</strong> from pay differences inside the same title.';

    // ---- Trend ---------------------------------------------------
    PGCharts.lineChart('#trend-chart', d.decomposition, {
      series: [
        { key: 'total_gap', label: 'Total gap' },
        { key: 'between_gap', label: 'Between titles', color: 'var(--series-2)' },
        { key: 'within_gap', label: 'Within title', color: 'var(--series-4)' }
      ],
      yFormat: function (v) { return (v * 100).toFixed(0) + '%'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      yZero: true, height: 330,
      ariaLabel: 'Gender pay gap components over time'
    });
    var d0 = d.decomposition[0];
    document.getElementById('trend-cap').innerHTML =
      'The overall gap has narrowed from ' + f.pct(d0.total_gap) + ' in FY' +
      d0.fiscal_year + ' to ' + f.pct(dec.total_gap) + ' in FY' + dec.fiscal_year +
      '. Nearly all of that improvement is the between-title component shrinking. ' +
      'The within-title component has moved in the other direction, from ' +
      f.pct(d0.within_gap) + ' to ' + f.pct(dec.within_gap) +
      '. Name matching covered ' + f.pct(cov.coverage, 0) + ' of employees in FY' +
      cov.fiscal_year + '.';

    // ---- Tables --------------------------------------------------
    var cols = function (keyName, label) {
      return [
        { key: keyName, label: label, name: true,
          render: function (v, r) {
            return r.slug
              ? '<a href="titles.html?title=' + encodeURIComponent(r.slug) + '">' + v + '</a>'
              : v;
          } },
        { key: 'n', label: 'People', num: true, render: function (v) { return f.num(v); } },
        { key: 'male_mean', label: 'Men', num: true,
          render: function (v) { return f.dollars(v); } },
        { key: 'female_mean', label: 'Women', num: true,
          render: function (v) { return f.dollars(v); } },
        { key: 'gap', label: 'Gap', num: true,
          render: function (v) { return f.pct(v); },
          cellClass: function (v) { return v > 0 ? 'neg' : 'pos'; } },
        { key: 'female_share', label: 'Share women', num: true,
          render: function (v) { return f.pct(v, 0); } }
      ];
    };

    PGTable.render('#g-title-table', {
      rows: byTitle, sortKey: 'gap', sortDir: 'desc',
      searchPlaceholder: 'Search a title…',
      csv: 'downloads/gender_gap_by_title.csv',
      columns: cols('title', 'Title')
    });

    PGTable.render('#g-agency-table', {
      rows: byAgency, sortKey: 'gap', sortDir: 'desc',
      searchPlaceholder: 'Search an agency…',
      csv: 'downloads/gender_gap_by_agency.csv',
      columns: cols('agency', 'Agency')
    });

    // ---- Name origin ---------------------------------------------
    PGCharts.lineChart('#origin-chart', d.name_origin, {
      series: [
        { key: 'common_mean', label: 'Name in US birth records' },
        { key: 'uncommon_mean', label: 'Name not in US birth records', color: 'var(--series-2)' }
      ],
      yFormat: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
      xFormat: function (v) { return "'" + String(v).slice(2); },
      height: 320,
      ariaLabel: 'Mean salary by whether a first name appears in US birth records'
    });
    var n1 = d.name_origin[d.name_origin.length - 1];
    document.getElementById('origin-cap').innerHTML =
      'In FY' + n1.fiscal_year + ' the gap on this measure was <strong>' +
      f.pct(n1.gap) + '</strong>, or ' + f.dollars(n1.gap_dollars) + ' a year, ' +
      'affecting ' + f.pct(n1.uncommon_share, 0) + ' of employees. That is larger ' +
      'than the gender gap on the same payroll. A name counts as present if it ' +
      'appears at least 25 times in SSA records since 1880.';
  }).catch(function (e) { PG.fail(document.getElementById('g-stats'), e); });
})();
