/* thepaygap.nyc / charts
   ------------------------------------------------------------------
   Four chart types, hand-rolled as inline SVG:

     lineChart   indexed or absolute series over fiscal years
     barChart    ranked horizontal bars
     dumbbell    two values per row, connected (new hire vs veteran)
     stackChart  100% stacked horizontal bar (tenure bands)

   Written by hand rather than pulled from a library because there are
   only four shapes here, and this way every colour is a CSS variable,
   so dark mode and printing come for free and nothing is fighting a
   library's defaults. */

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  // Round axis maxima to something a person would choose, so gridlines
  // land on readable numbers instead of 3.7143.
  function niceStep(range, target) {
    var raw = range / (target || 5);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1;
    return step * mag;
  }

  function extent(rows, keys) {
    var lo = Infinity, hi = -Infinity;
    rows.forEach(function (r) {
      keys.forEach(function (k) {
        var v = r[k];
        if (v === null || v === undefined || isNaN(v)) return;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      });
    });
    return [lo, hi];
  }

  function mount(target) {
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return null;
    host.innerHTML = '';
    host.classList.add('chart');
    return host;
  }

  function legend(host, items) {
    if (!items || !items.length) return;
    var l = document.createElement('div');
    l.className = 'legend';
    items.forEach(function (it) {
      var s = document.createElement('span');
      var i = document.createElement('i');
      i.style.background = it.color;
      if (it.dashed) i.style.background =
        'repeating-linear-gradient(90deg,' + it.color + ' 0 4px, transparent 4px 7px)';
      s.appendChild(i);
      s.appendChild(document.createTextNode(it.label));
      l.appendChild(s);
    });
    host.appendChild(l);
  }

  /* ---- Line chart -------------------------------------------------
     opts: { x, series:[{key,label,dashed}], yFormat, yZero, height,
             annotate } */
  function lineChart(target, rows, opts) {
    var host = mount(target);
    if (!host) return;
    var o = opts || {};
    var xKey = o.x || 'fiscal_year';
    var series = o.series || [];
    var keys = series.map(function (s) { return s.key; });

    var W = 760, H = o.height || 340;
    var m = { t: 16, r: 16, b: 34, l: 58 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;

    var xs = rows.map(function (r) { return r[xKey]; });
    var xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    var e = extent(rows, keys);
    if (!isFinite(e[0])) { host.innerHTML = '<p class="muted">No data to chart.</p>'; return; }

    var lo = o.yZero ? 0 : e[0], hi = e[1];
    if (lo === hi) { lo = lo - 1; hi = hi + 1; }
    var step = niceStep(hi - lo, 5);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;

    var x = function (v) { return m.l + (xMax === xMin ? iw / 2 : (v - xMin) / (xMax - xMin) * iw); };
    var y = function (v) { return m.t + ih - (v - lo) / (hi - lo) * ih; };

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': o.ariaLabel || 'Line chart'
    });

    // Gridlines and y labels
    var grid = svgEl('g', { class: 'grid' });
    var axis = svgEl('g', { class: 'axis' });
    for (var v = lo; v <= hi + 1e-9; v += step) {
      grid.appendChild(svgEl('line', { x1: m.l, x2: m.l + iw, y1: y(v), y2: y(v) }));
      var t = svgEl('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' });
      t.textContent = o.yFormat ? o.yFormat(v) : v;
      axis.appendChild(t);
    }
    svg.appendChild(grid);

    // X labels, thinned on narrow charts so they never collide.
    var every = xs.length > 8 ? 2 : 1;
    rows.forEach(function (r, i) {
      if (i % every !== 0 && i !== rows.length - 1) return;
      var t = svgEl('text', { x: x(r[xKey]), y: m.t + ih + 20, 'text-anchor': 'middle' });
      t.textContent = o.xFormat ? o.xFormat(r[xKey]) : r[xKey];
      axis.appendChild(t);
    });
    axis.appendChild(svgEl('line', {
      class: 'axis-line', x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih
    }));
    svg.appendChild(axis);

    // Series
    series.forEach(function (s, si) {
      var color = s.color || SERIES[si % SERIES.length];
      var pts = rows.filter(function (r) {
        var v = r[s.key];
        return v !== null && v !== undefined && !isNaN(v);
      });
      // A series with no plottable points almost always means the key was
      // renamed or left out of the export, not that the data is genuinely
      // empty. Say so rather than drawing nothing and looking fine.
      if (!pts.length) {
        if (window.console && !(rows.length && s.key in rows[0])) {
          console.warn('Chart series "' + s.key + '" is not present in the data.');
        }
        return;
      }

      var d = pts.map(function (r, i) {
        return (i ? 'L' : 'M') + x(r[xKey]).toFixed(1) + ' ' + y(r[s.key]).toFixed(1);
      }).join(' ');

      var path = svgEl('path', { class: 'series-line', d: d, stroke: color });
      if (s.dashed) path.setAttribute('stroke-dasharray', '5 4');
      svg.appendChild(path);

      // End-of-line label beats a legend for a small number of series.
      var last = pts[pts.length - 1];
      var dot = svgEl('circle', { class: 'dot', cx: x(last[xKey]), cy: y(last[s.key]), r: 3.5, fill: color });
      var title = svgEl('title');
      title.textContent = s.label + ': ' + (o.yFormat ? o.yFormat(last[s.key]) : last[s.key]);
      dot.appendChild(title);
      svg.appendChild(dot);

      // Hover targets for every point.
      pts.forEach(function (r) {
        var hit = svgEl('circle', { cx: x(r[xKey]), cy: y(r[s.key]), r: 9, fill: 'transparent' });
        var tt = svgEl('title');
        tt.textContent = 'FY' + r[xKey] + ' · ' + s.label + ': ' +
          (o.yFormat ? o.yFormat(r[s.key]) : r[s.key]);
        hit.appendChild(tt);
        svg.appendChild(hit);
      });
    });

    host.appendChild(svg);
    legend(host, series.map(function (s, si) {
      return { label: s.label, color: s.color || SERIES[si % SERIES.length], dashed: s.dashed };
    }));
  }

  /* ---- Bar chart --------------------------------------------------
     opts: { label, value, valueFormat, limit, color, height } */
  function barChart(target, rows, opts) {
    var host = mount(target);
    if (!host) return;
    var o = opts || {};
    var data = rows.slice(0, o.limit || 15);
    if (!data.length) { host.innerHTML = '<p class="muted">No data to chart.</p>'; return; }

    var rowH = 26, gap = 6;
    var W = 760, m = { t: 6, r: 64, b: 6, l: o.labelWidth || 250 };
    var H = m.t + m.b + data.length * (rowH + gap);
    var iw = W - m.l - m.r;

    var vals = data.map(function (d) { return Math.abs(d[o.value]) || 0; });
    var max = Math.max.apply(null, vals) || 1;

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': o.ariaLabel || 'Bar chart'
    });

    data.forEach(function (d, i) {
      var yTop = m.t + i * (rowH + gap);
      var v = d[o.value] || 0;
      var w = Math.abs(v) / max * iw;
      var color = o.color ? (typeof o.color === 'function' ? o.color(d) : o.color) : SERIES[0];

      var lab = svgEl('text', {
        class: 'label', x: m.l - 10, y: yTop + rowH / 2 + 4, 'text-anchor': 'end'
      });
      var name = d[o.label];
      lab.textContent = name.length > 38 ? name.slice(0, 37) + '…' : name;
      var lt = svgEl('title'); lt.textContent = name; lab.appendChild(lt);
      svg.appendChild(lab);

      var bar = svgEl('rect', {
        class: 'bar', x: m.l, y: yTop, width: Math.max(w, 1), height: rowH,
        rx: 3, fill: color
      });
      var bt = svgEl('title');
      bt.textContent = name + ': ' + (o.valueFormat ? o.valueFormat(v, d) : v);
      bar.appendChild(bt);
      svg.appendChild(bar);

      var val = svgEl('text', {
        class: 'value-label', x: m.l + Math.max(w, 1) + 8, y: yTop + rowH / 2 + 4
      });
      val.textContent = o.valueFormat ? o.valueFormat(v, d) : v;
      svg.appendChild(val);
    });

    host.appendChild(svg);
  }

  /* ---- Dumbbell ---------------------------------------------------
     Two values per row joined by a rule. Reads the gap between them
     far better than two bars side by side.
     opts: { label, a, b, aLabel, bLabel, valueFormat, limit } */
  function dumbbell(target, rows, opts) {
    var host = mount(target);
    if (!host) return;
    var o = opts || {};
    var data = rows.slice(0, o.limit || 15);
    if (!data.length) { host.innerHTML = '<p class="muted">No data to chart.</p>'; return; }

    var rowH = 28;
    var W = 760, m = { t: 8, r: 80, b: 8, l: o.labelWidth || 250 };
    var H = m.t + m.b + data.length * rowH;
    var iw = W - m.l - m.r;

    var e = extent(data, [o.a, o.b]);
    var pad = (e[1] - e[0]) * 0.08 || 1;
    var lo = e[0] - pad, hi = e[1] + pad;
    var x = function (v) { return m.l + (v - lo) / (hi - lo) * iw; };

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': o.ariaLabel || 'Comparison chart'
    });

    data.forEach(function (d, i) {
      var cy = m.t + i * rowH + rowH / 2;
      var av = d[o.a], bv = d[o.b];
      if (av === null || bv === null || isNaN(av) || isNaN(bv)) return;

      var lab = svgEl('text', { class: 'label', x: m.l - 10, y: cy + 4, 'text-anchor': 'end' });
      var name = d[o.label];
      lab.textContent = name.length > 38 ? name.slice(0, 37) + '…' : name;
      var lt = svgEl('title'); lt.textContent = name; lab.appendChild(lt);
      svg.appendChild(lab);

      svg.appendChild(svgEl('line', {
        x1: x(av), x2: x(bv), y1: cy, y2: cy,
        stroke: 'var(--rule-strong)', 'stroke-width': 2
      }));

      [[av, SERIES[0], o.aLabel], [bv, SERIES[1], o.bLabel]].forEach(function (p) {
        var c = svgEl('circle', { class: 'dot', cx: x(p[0]), cy: cy, r: 5.5, fill: p[1] });
        var t = svgEl('title');
        t.textContent = name + ' · ' + p[2] + ': ' + (o.valueFormat ? o.valueFormat(p[0]) : p[0]);
        c.appendChild(t);
        svg.appendChild(c);
      });

      var val = svgEl('text', {
        class: 'value-label', x: m.l + iw + 10, y: cy + 4
      });
      val.textContent = o.rowFormat ? o.rowFormat(d) : '';
      svg.appendChild(val);
    });

    host.appendChild(svg);
    legend(host, [
      { label: o.aLabel, color: SERIES[0] },
      { label: o.bLabel, color: SERIES[1] }
    ]);
  }

  /* ---- Stacked bar ------------------------------------------------
     One 100% bar, for tenure bands.
     rows: [{label, share}] */
  function stackChart(target, rows, opts) {
    var host = mount(target);
    if (!host) return;
    var o = opts || {};
    var data = rows.filter(function (r) { return r.share > 0; });
    if (!data.length) { host.innerHTML = '<p class="muted">No data to chart.</p>'; return; }

    var W = 760, H = 78, m = { l: 0, r: 0, t: 8 };
    var barH = 34, iw = W;
    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': o.ariaLabel || 'Distribution'
    });

    var palette = ['#cfd9f5', '#9db4ec', '#6b8ce0', '#4169d4', '#2549a8', '#16307a'];
    var acc = 0;
    data.forEach(function (d, i) {
      var w = d.share * iw;
      var color = palette[i % palette.length];
      var rect = svgEl('rect', {
        x: acc, y: m.t, width: Math.max(w, 1), height: barH, fill: color
      });
      var t = svgEl('title');
      t.textContent = d.label + ' years: ' + (d.share * 100).toFixed(1) + '% (' + d.n + ' people)';
      rect.appendChild(t);
      svg.appendChild(rect);

      // Only label a segment wide enough to hold text.
      if (w > 46) {
        var lab = svgEl('text', {
          x: acc + w / 2, y: m.t + barH / 2 + 4, 'text-anchor': 'middle',
          fill: i < 3 ? '#16181d' : '#ffffff', 'font-size': 12, 'font-weight': 600
        });
        lab.textContent = (d.share * 100).toFixed(0) + '%';
        svg.appendChild(lab);
      }
      if (w > 30) {
        var yr = svgEl('text', {
          x: acc + w / 2, y: m.t + barH + 16, 'text-anchor': 'middle',
          fill: 'var(--ink-faint)', 'font-size': 11
        });
        yr.textContent = d.label;
        svg.appendChild(yr);
      }
      acc += w;
    });

    host.appendChild(svg);
  }

  window.PGCharts = {
    lineChart: lineChart,
    barChart: barChart,
    dumbbell: dumbbell,
    stackChart: stackChart,
    SERIES: SERIES
  };
})();
