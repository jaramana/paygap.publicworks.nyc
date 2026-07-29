/* Landing page: the search box, plus example queries.

   The examples are the interesting findings, but each is expressed as a link
   into the tool rather than as a claim, so the reader's next move is to run
   their own query rather than to take our word for it. */

(function () {
  'use strict';
  var f = PG.fmt;

  PGSearch.mount('#home-search', { autofocus: true, scope: PG.param('scope') || 'title' });

  // Each example states the number it will show, so it is honest about what
  // is behind the link, and reads as a result rather than a teaser.
  var EXAMPLES = [
    { href: 'lookup.html?title=special-officer',
      q: 'title = SPECIAL OFFICER',
      answer: function (d) { return d.specialOfficer; },
      note: 'real pay change since FY2014' },
    { href: 'compare.html?metric=compression&scope=title',
      q: 'compare compression across titles',
      answer: function (d) { return d.inverted + ' titles'; },
      note: 'where new hires out-earn ten-year veterans' },
    // Slug resolved from the data rather than typed here, so a rename in the
    // source cannot silently turn this into a dead link.
    { href: function (d) { return d.sanitationHref; },
      q: function (d) { return 'agency = ' + d.sanitationName; },
      answer: function (d) { return d.sanitationOt; },
      note: 'of total pay comes from overtime' },
    { href: 'compare.html?metric=overtime&scope=title',
      q: 'compare overtime across titles',
      answer: function (d) { return d.topOt; },
      note: function (d) { return 'of pay is overtime for ' + d.topOtName; } },
    { href: 'citywide.html#gender',
      q: 'citywide gender gap',
      answer: function (d) { return d.betweenShare; },
      note: 'of the gap is which jobs people hold, not unequal pay in one job' },
    { href: 'citywide.html#hourly',
      q: function (d) { return 'hourly rate, ' + d.crossingGuardName; },
      answer: function (d) { return d.crossingGuard; },
      note: 'median, and the City pays about half its roster this way' }
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
    var cw = r[0], comp = r[1], ot = r[2], real = r[3], otAg = r[4], hourly = r[5], metrics = r[6];

    function find(rows, slug) {
      return rows.filter(function (x) { return x.slug === slug; })[0];
    }
    function findName(rows, name) {
      return rows.filter(function (x) { return x.name === name; })[0];
    }
    // The ranking files are not pre-sorted (the Compare view sorts them
    // client-side), so take the extreme explicitly rather than trusting order.
    function maxBy(rows, key) {
      return rows.reduce(function (best, r) {
        var v = r[key];
        if (v === null || v === undefined || isNaN(v)) return best;
        return (!best || v > best[key]) ? r : best;
      }, null);
    }

    var so = find(real, 'special-officer');
    var sanit = otAg.filter(function (x) { return /SANITATION/.test(x.name); })[0];
    var cg = hourly.filter(function (x) { return /CROSSING GUARD/.test(x.title); })[0];
    var dec = cw.decomposition[cw.decomposition.length - 1];

    var topOt = maxBy(ot, 'ot_share_of_pay');
    var vals = {
      specialOfficer: so ? f.delta(so.real_change) : '—',
      inverted: comp.filter(function (x) { return x.compression_ratio >= 1; }).length,
      sanitationOt: sanit ? f.pct(sanit.ot_share_of_pay) : '—',
      sanitationName: sanit ? sanit.name : 'DEPARTMENT OF SANITATION',
      sanitationHref: sanit ? 'lookup.html?agency=' + encodeURIComponent(sanit.slug)
                            : 'compare.html?metric=overtime&scope=agency',
      crossingGuardName: cg ? cg.title.toLowerCase() : 'school crossing guard',
      topOt: topOt ? f.pct(topOt.ot_share_of_pay) : '—',
      topOtName: topOt ? topOt.name.toLowerCase() : 'the top title',
      betweenShare: f.pct(dec.between_share, 0),
      crossingGuard: cg ? f.rate(cg.median_rate) : '—'
    };

    var ul = document.getElementById('examples');
    EXAMPLES.forEach(function (e) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = typeof e.href === 'function' ? e.href(vals) : e.href;
      a.className = 'query-card';
      a.innerHTML =
        '<span class="q mono">' +
          (typeof e.q === 'function' ? e.q(vals) : e.q) + '</span>' +
        '<span class="a">' + e.answer(vals) + '</span>' +
        '<span class="n">' +
          (typeof e.note === 'function' ? e.note(vals) : e.note) + '</span>';
      li.appendChild(a);
      ul.appendChild(li);
    });

    // Metric links come from the same manifest the Compare page uses, so a
    // metric added in R shows up here without touching this file.
    var ml = document.getElementById('metric-links');
    metrics.forEach(function (m) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = 'compare.html?metric=' + m.id + '&scope=' + m.scopes[0];
      a.className = 'query-card small';
      a.innerHTML = '<span class="a">' + m.label + '</span>' +
                    '<span class="n">' + m.blurb + '</span>';
      li.appendChild(a);
      ml.appendChild(li);
    });
  }).catch(function (e) { PG.fail(document.getElementById('examples'), e); });
})();
