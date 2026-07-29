/* Landing page: the search box, plus a few results worth opening.

   The cards are findings, but each one links into the view that produced it,
   so the site shows its working rather than asking to be believed. Values,
   names and slugs are all resolved from the data at runtime; nothing here is
   typed in, so a rename upstream cannot leave a stale claim on the page. */

(function () {
  'use strict';
  var f = PG.fmt;

  PGSearch.mount('#home-search', { autofocus: true, scope: PG.param('scope') || 'title' });

  var EXAMPLES = [
    { tag: 'title', entity: function (d) { return d.specialOfficerName; },
      value: function (d) { return d.specialOfficer; },
      note: 'change in real pay since 2014, after New York inflation',
      href: function (d) { return d.specialOfficerHref; } },

    { tag: 'agency', entity: function (d) { return d.sanitationName; },
      value: function (d) { return d.sanitationOt; },
      note: 'of everything the agency was paid came from overtime',
      href: function (d) { return d.sanitationHref; } },

    { tag: 'title', entity: function (d) { return d.topOtName; },
      value: function (d) { return d.topOt; },
      note: 'of pay from overtime, the highest share of any title',
      href: function (d) { return d.topOtHref; } },

    { tag: 'across titles', entity: 'Salary compression',
      value: function (d) { return d.inverted; },
      note: 'titles where a new hire out-earns a ten-year colleague',
      href: 'compare.html?metric=compression&scope=title&min=30' },

    { tag: 'citywide', entity: 'The gender gap',
      value: function (d) { return d.betweenShare; },
      note: 'of it is which jobs people hold, not unequal pay within a job',
      href: 'citywide.html#gender' },

    { tag: 'citywide', entity: 'Hourly workers',
      value: function (d) { return d.crossingGuard; },
      note: function (d) { return 'an hour for a ' + d.crossingGuardName +
        ', a group left out of most payroll summaries'; },
      href: 'citywide.html#hourly' }
  ];

  Promise.all([
    PG.load('citywide.json'),
    PG.load('rank/compression-title.json'),
    PG.load('rank/overtime-title.json'),
    PG.load('rank/real-change-title.json'),
    PG.load('rank/overtime-agency.json'),
    PG.load('hourly-titles.json'),
    PG.load('metrics.json')
  ]).then(function (r) {
    var cw = r[0], comp = r[1], ot = r[2], real = r[3], otAg = r[4],
        hourly = r[5], metrics = r[6];

    function find(rows, slug) {
      return rows.filter(function (x) { return x.slug === slug; })[0];
    }
    // Ranking files are not pre-sorted, so take extremes explicitly.
    function maxBy(rows, key) {
      return rows.reduce(function (best, x) {
        var v = x[key];
        if (v === null || v === undefined || isNaN(v)) return best;
        return (!best || v > best[key]) ? x : best;
      }, null);
    }
    function href(scope, row, fallback) {
      return row ? 'lookup.html?' + scope + '=' + encodeURIComponent(row.slug) : fallback;
    }

    var so    = find(real, 'special-officer');
    var sanit = otAg.filter(function (x) { return /SANITATION/.test(x.name); })[0];
    var topOt = maxBy(ot, 'ot_share_of_pay');
    var cg    = hourly.filter(function (x) { return /CROSSING GUARD/.test(x.title); })[0];
    var dec   = cw.decomposition[cw.decomposition.length - 1];

    var vals = {
      specialOfficer: so ? f.delta(so.real_change) : '—',
      specialOfficerName: so ? so.name : 'SPECIAL OFFICER',
      specialOfficerHref: href('title', so, 'compare.html?metric=real-change&scope=title'),

      sanitationOt: sanit ? f.pct(sanit.ot_share_of_pay) : '—',
      sanitationName: sanit ? sanit.name : 'DEPARTMENT OF SANITATION',
      sanitationHref: href('agency', sanit, 'compare.html?metric=overtime&scope=agency'),

      topOt: topOt ? f.pct(topOt.ot_share_of_pay) : '—',
      topOtName: topOt ? topOt.name : '—',
      topOtHref: href('title', topOt, 'compare.html?metric=overtime&scope=title'),

      inverted: comp.filter(function (x) { return x.compression_ratio >= 1; }).length,
      betweenShare: f.pct(dec.between_share, 0),

      crossingGuard: cg ? f.rate(cg.median_rate) : '—',
      crossingGuardName: cg ? cg.title.toLowerCase() : 'school crossing guard'
    };

    var resolve = function (v) { return typeof v === 'function' ? v(vals) : v; };

    var ul = document.getElementById('examples');
    EXAMPLES.forEach(function (e) {
      var a = document.createElement('a');
      a.href = resolve(e.href);
      a.className = 'result-card';
      a.innerHTML =
        '<span class="tag">' + resolve(e.tag) + '</span>' +
        '<span class="entity">' + resolve(e.entity) + '</span>' +
        '<span class="value">' + resolve(e.value) + '</span>' +
        '<span class="meaning">' + resolve(e.note) + '</span>';
      var li = document.createElement('li');
      li.appendChild(a);
      ul.appendChild(li);
    });

    // Driven by the same manifest the Compare page uses, so a measure added
    // in R appears here without touching this file.
    var ml = document.getElementById('metric-links');
    metrics.forEach(function (m) {
      var a = document.createElement('a');
      a.href = 'compare.html?metric=' + m.id + '&scope=' + m.scopes[0];
      a.className = 'result-card small';
      a.innerHTML = '<span class="entity">' + m.label + '</span>' +
                    '<span class="meaning">' + m.blurb + '</span>';
      var li = document.createElement('li');
      li.appendChild(a);
      ml.appendChild(li);
    });
  }).catch(function (e) { PG.fail(document.getElementById('examples'), e); });
})();
