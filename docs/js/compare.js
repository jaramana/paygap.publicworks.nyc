/* Compare: manifest-driven rankings.
   ------------------------------------------------------------------
   Everything on this page comes from data/metrics.json, so adding a measure
   in R/04_export.R makes it appear here with no change to this file.

   The minimum-group-size control is deliberately visible. Every ranking of
   this kind needs one, and hiding it inside the pipeline would mean the page
   quietly decides which groups are allowed to be interesting. */

(function () {
  'use strict';
  var f = PG.fmt;

  var metrics = [];
  var state = { metric: null, scope: null, minN: 100, dir: null };

  var elMetric = document.getElementById('c-metric');
  var elScope  = document.getElementById('c-scope');
  var elMinN   = document.getElementById('c-minn');
  var elDir    = document.getElementById('c-dir');

  function meta() {
    return metrics.filter(function (m) { return m.id === state.metric; })[0];
  }

  // Not every ranking file carries an `n`. Churn has active/ceased instead,
  // so fall back rather than filtering everything out.
  function groupSize(row) {
    if (typeof row.n === 'number') return row.n;
    if (typeof row.active === 'number') return row.active + (row.ceased || 0);
    if (typeof row.n_new === 'number') return row.n_new + (row.n_vet || 0);
    return Infinity;
  }

  // Not every measure supports every scope: churn is agency-only. Fix the
  // state before anything reads it, so the URL never records a scope the
  // page is not actually showing.
  function normalizeState() {
    var m = meta();
    if (!m) { state.metric = metrics[0].id; m = meta(); }
    if (m.scopes.indexOf(state.scope) === -1) state.scope = m.scopes[0];
  }

  function syncControls() {
    var m = meta();
    elScope.innerHTML = '';
    m.scopes.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s;
      o.textContent = s === 'agency' ? 'Agency' : 'Title';
      elScope.appendChild(o);
    });
    elScope.value = state.scope;
    elMetric.value = state.metric;
    elMinN.value = String(state.minN);
    elDir.value = state.dir;
    document.getElementById('c-blurb').textContent = m.blurb;
  }

  function pushState(replace) {
    var u = new URL(location);
    u.searchParams.set('metric', state.metric);
    u.searchParams.set('scope', state.scope);
    u.searchParams.set('min', state.minN);
    u.searchParams.set('dir', state.dir);
    history[replace ? 'replaceState' : 'pushState']({}, '', u);
  }

  function draw() {
    normalizeState();
    var m = meta();
    syncControls();
    document.title = m.label + ' — The Pay Gap';

    PG.load('rank/' + state.metric + '-' + state.scope + '.json').then(function (all) {
      var rows = all.filter(function (r) {
        var v = r[m.sort];
        return v !== null && v !== undefined && !isNaN(v) && groupSize(r) >= state.minN;
      });

      var dir = state.dir;
      rows.sort(function (a, b) {
        return dir === 'asc' ? a[m.sort] - b[m.sort] : b[m.sort] - a[m.sort];
      });

      var sortCol = m.columns.filter(function (c) { return c.key === m.sort; })[0]
                 || { key: m.sort, label: m.label, fmt: 'num' };
      var fmtFn = PG.formatter(sortCol.fmt);

      // ---- Chart, top 12 ------------------------------------------
      if (!rows.length) {
        document.getElementById('c-chart').innerHTML =
          '<p class="muted">No ' + state.scope + 's have ' + f.num(state.minN) +
          ' or more people with a reportable figure for this measure. ' +
          'Lower the minimum.</p>';
        document.getElementById('c-cap').textContent = '';
      } else {
        PGCharts.barChart('#c-chart', rows, {
          label: 'name', value: m.sort, limit: 12,
          labelWidth: 260,
          valueFormat: function (v) { return fmtFn(v); },
          color: function (d) {
            // Signed measures read better when the sign is visible.
            if (sortCol.fmt === 'delta' || sortCol.fmt === 'dollars_signed') {
              return d[m.sort] < 0 ? 'var(--series-2)' : 'var(--series-4)';
            }
            return 'var(--series-1)';
          },
          ariaLabel: m.label + ' by ' + state.scope
        });
        var top = rows[0];
        document.getElementById('c-cap').innerHTML =
          top.name + ' leads at <strong>' + fmtFn(top[m.sort]) + '</strong>.' +
          '<span class="qual">Top 12 of ' + f.num(rows.length) + ' ' + state.scope +
          's with at least ' + f.num(state.minN) + ' people.</span>';
      }

      // ---- Table ---------------------------------------------------
      var cols = [{
        key: 'name', label: state.scope === 'agency' ? 'Agency' : 'Title', name: true,
        render: function (v, r) {
          return '<a href="lookup.html?' + state.scope + '=' +
            encodeURIComponent(r.slug) + '">' + v + '</a>';
        }
      }].concat(m.columns.map(function (c) {
        var fn = PG.formatter(c.fmt);
        return {
          key: c.key, label: c.label, num: true,
          render: function (v) { return fn(v); },
          cellClass: function (v) {
            if (c.fmt === 'delta' || c.fmt === 'dollars_signed') {
              return v < 0 ? 'neg' : v > 0 ? 'pos' : '';
            }
            if (c.key === 'compression_ratio') return v >= 1 ? 'neg' : '';
            return '';
          }
        };
      }));

      PGTable.render('#c-table', {
        rows: rows,
        sortKey: m.sort, sortDir: dir,
        limit: 25,
        searchPlaceholder: 'Search ' + state.scope + 's…',
        csv: null,
        columns: cols
      });

      // ---- Caveat, where one is warranted --------------------------
      var NOTES = {
        gender: 'Gender is inferred from first names matched against Social ' +
          'Security birth registrations. It estimates sex recorded at birth, ' +
          'cannot see non-binary people, and misses about one employee in ten. ' +
          'It says nothing about any individual.',
        'name-origin': 'Whether a first name appears in US birth records is ' +
          'largely a function of where someone or their parents were born. ' +
          'This is a proxy for national origin, not a neutral category.',
        compression: 'Tenure is time at the current agency, not total public ' +
          'service, so anyone who transferred in counts as a new hire. That ' +
          'makes these figures conservative where transfers are common.',
        tenure: 'Years at the current agency. Time at a previous agency does ' +
          'not count, so this understates real public service.',
        churn: 'Ceased records mix quits, retirements, layoffs, seasonal ' +
          'endings and deaths. Agencies running seasonal programs sit high ' +
          'every year for ordinary reasons. Read it as churn, not dissatisfaction.',
        overtime: 'The payroll records hours and dollars, not whether a shift ' +
          'was volunteered or mandated.',
        'real-change': 'Each group is indexed against its own first reportable ' +
          'year, shown in the From column, so groups that appeared later are ' +
          'not compared against a baseline they never had.'
      };
      var note = document.getElementById('c-note');
      if (NOTES[state.metric]) {
        note.hidden = false;
        note.innerHTML = '<p>' + NOTES[state.metric] +
          ' <a href="method.html">Method</a>.</p>';
      } else {
        note.hidden = true;
      }
    }).catch(function (e) { PG.fail(document.getElementById('c-table'), e); });
  }

  // ---- Boot -----------------------------------------------------------

  PG.load('metrics.json').then(function (m) {
    metrics = m;

    m.forEach(function (x) {
      var o = document.createElement('option');
      o.value = x.id;
      o.textContent = x.label;
      elMetric.appendChild(o);
    });

    var wantMetric = PG.param('metric');
    state.metric = m.some(function (x) { return x.id === wantMetric; })
      ? wantMetric : m[0].id;
    state.scope = PG.param('scope') || meta().scopes[0];
    if (meta().scopes.indexOf(state.scope) === -1) state.scope = meta().scopes[0];
    state.minN = parseInt(PG.param('min'), 10) || 100;
    state.dir  = PG.param('dir') || meta().sort_dir || 'desc';

    if (!elMinN.querySelector('option[value="' + state.minN + '"]')) {
      var o = document.createElement('option');
      o.value = state.minN; o.textContent = state.minN;
      elMinN.appendChild(o);
    }

    // Normalize, then write the URL, then render, so the three never disagree.
    function commit() { normalizeState(); pushState(); draw(); }

    elMetric.addEventListener('change', function () {
      state.metric = elMetric.value;
      // A new measure has its own natural direction; adopt it.
      normalizeState();
      state.dir = meta().sort_dir || 'desc';
      commit();
    });
    elScope.addEventListener('change', function () { state.scope = elScope.value; commit(); });
    elMinN.addEventListener('change', function () {
      state.minN = parseInt(elMinN.value, 10); commit();
    });
    elDir.addEventListener('change', function () { state.dir = elDir.value; commit(); });

    window.addEventListener('popstate', function () {
      state.metric = PG.param('metric') || state.metric;
      state.scope  = PG.param('scope')  || state.scope;
      state.minN   = parseInt(PG.param('min'), 10) || state.minN;
      state.dir    = PG.param('dir')    || state.dir;
      draw();
    });

    normalizeState();
    pushState(true);
    draw();
  }).catch(function (e) { PG.fail(document.getElementById('c-table'), e); });
})();
