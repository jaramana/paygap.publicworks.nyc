/* thepaygap.nyc / shared behaviour
   ------------------------------------------------------------------
   Formatting, data loading, the theme toggle and URL parameters.
   Every page loads this first. No dependencies. */

(function () {
  'use strict';

  // ---- Formatting -------------------------------------------------

  var fmt = {
    // Salaries read better without cents, and with a thousands separator
    // the eye can land on.
    dollars: function (n, opts) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      var o = opts || {};
      return '$' + Math.round(n).toLocaleString('en-US', {
        minimumFractionDigits: o.cents ? 2 : 0,
        maximumFractionDigits: o.cents ? 2 : 0
      });
    },
    rate: function (n) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return '$' + n.toFixed(2);
    },
    pct: function (n, places) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return (n * 100).toFixed(places === undefined ? 1 : places) + '%';
    },
    // Percentage points, bare. A gap of 2.9% that makes up part of a larger
    // gap is "2.9 points", never "2.9% points".
    points: function (n, places) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return (n * 100).toFixed(places === undefined ? 1 : places);
    },
    // Signed, for changes where the direction is the point.
    delta: function (n, places) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      var v = (n * 100).toFixed(places === undefined ? 1 : places);
      return (n > 0 ? '+' : '') + v + '%';
    },
    num: function (n) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return Math.round(n).toLocaleString('en-US');
    },
    years: function (n) {
      if (n === null || n === undefined || isNaN(n)) return '—';
      return n.toFixed(1) + ' yr';
    },
    // FY2025 covers July 2024 to June 2025; say so on hover.
    fyTitle: function (y) {
      return 'Fiscal year ' + y + ': July ' + (y - 1) + ' to June ' + y;
    }
  };

  // Named formatters, so metrics.json can say fmt:"dollars" and the browser
  // resolves it here. Adding a metric in R needs no change in the browser as
  // long as it reuses one of these names.
  var FORMATTERS = {
    num:            function (v) { return fmt.num(v); },
    year:           function (v) { return v === null || v === undefined ? '—' : 'FY' + v; },
    dollars:        function (v) { return fmt.dollars(v); },
    dollars_signed: function (v) {
      if (v === null || v === undefined || isNaN(v)) return '—';
      return (v >= 0 ? '+' : '−') + fmt.dollars(Math.abs(v));
    },
    rate:           function (v) { return fmt.rate(v); },
    pct:            function (v) { return fmt.pct(v); },
    pct0:           function (v) { return fmt.pct(v, 0); },
    delta:          function (v) { return fmt.delta(v); },
    ratio:          function (v) {
      return v === null || v === undefined || isNaN(v) ? '—' : v.toFixed(3);
    },
    years:          function (v) { return fmt.years(v); }
  };

  function formatter(name) { return FORMATTERS[name] || function (v) { return v; }; }

  // ---- Data -------------------------------------------------------

  var cache = {};

  function load(path) {
    if (cache[path]) return cache[path];
    // Relative so the site works at a subpath (jaramana.github.io/thepaygap.nyc)
    // as readily as at a bare domain.
    cache[path] = fetch('data/' + path).then(function (r) {
      if (!r.ok) throw new Error('Could not load ' + path + ' (' + r.status + ')');
      return r.json();
    });
    return cache[path];
  }

  function fail(el, err) {
    if (!el) return;
    el.innerHTML = '<div class="note-box caution"><p><strong>Could not load the data.</strong> ' +
      String(err && err.message ? err.message : err) + '</p></div>';
    if (window.console) console.error(err);
  }

  // ---- URL parameters ---------------------------------------------

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  // Push state so a chosen title or agency is shareable and the back
  // button behaves.
  function setParam(name, value, replace) {
    var u = new URL(window.location);
    if (value === null || value === undefined || value === '') u.searchParams.delete(name);
    else u.searchParams.set(name, value);
    history[replace ? 'replaceState' : 'pushState']({}, '', u);
  }

  // ---- Theme ------------------------------------------------------

  var THEME_KEY = 'paygap-theme';

  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  function currentTheme() {
    return localStorage.getItem(THEME_KEY) || 'auto';
  }

  function initTheme() {
    applyTheme(currentTheme());
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    var label = { auto: 'Auto', light: 'Light', dark: 'Dark' };
    function render() {
      var t = currentTheme();
      btn.textContent = label[t];
      btn.setAttribute('aria-label', 'Colour theme: ' + label[t] + '. Click to change.');
    }
    render();
    btn.addEventListener('click', function () {
      var order = ['auto', 'light', 'dark'];
      var next = order[(order.indexOf(currentTheme()) + 1) % order.length];
      if (next === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
      render();
    });
  }

  // ---- Chrome -----------------------------------------------------
  // Masthead and footer are built here rather than pasted into ten HTML
  // files, so a nav change is one edit. The page content is rendered from
  // JSON anyway, so nothing is lost by building the chrome the same way.

  var PAGES = [
    { href: 'lookup.html',   nav: 'Look up' },
    { href: 'compare.html',  nav: 'Compare' },
    { href: 'citywide.html', nav: 'Citywide' },
    { href: 'data.html',     nav: 'Data' }
  ];

  function buildChrome() {
    var here = location.pathname.split('/').pop() || 'index.html';

    var head = document.querySelector('[data-chrome="masthead"]');
    if (head) {
      var links = PAGES.map(function (p) {
        return '<a href="' + p.href + '"' +
          (p.href === here ? ' aria-current="page"' : '') + '>' + p.nav + '</a>';
      }).join('');
      head.className = 'masthead';
      head.innerHTML =
        '<div class="wrap masthead-inner">' +
          '<a class="wordmark" href="index.html">thepaygap<span>.nyc</span></a>' +
          '<nav class="nav" aria-label="Sections">' + links +
            '<button class="theme-toggle" type="button">Auto</button>' +
          '</nav>' +
        '</div>';
    }

    var foot = document.querySelector('[data-chrome="footer"]');
    if (foot) {
      foot.className = 'footer';
      foot.innerHTML =
        '<div class="wrap"><div class="footer-grid">' +
          '<div><h4>Views</h4><ul>' +
            '<li><a href="lookup.html">Look up a title</a></li>' +
            '<li><a href="lookup.html?scope=agency">Look up an agency</a></li>' +
            '<li><a href="compare.html">Compare</a></li>' +
            '<li><a href="citywide.html">Citywide</a></li>' +
          '</ul></div>' +
          '<div><h4>Reference</h4><ul>' +
            '<li><a href="data.html">Download the data</a></li>' +
            '<li><a href="method.html">Method and limits</a></li>' +
            '<li><a href="data.html#dictionary">Data dictionary</a></li>' +
          '</ul></div>' +
          '<div><h4>Sources</h4><ul>' +
            '<li><a href="https://data.cityofnewyork.us/d/k397-673e">NYC Citywide Payroll</a></li>' +
            '<li><a href="https://www.bls.gov/regions/new-york-new-jersey/">BLS New York region</a></li>' +
            '<li><a href="https://www.zillow.com/research/data/">Zillow rent index</a></li>' +
            '<li><a href="https://www.ssa.gov/oact/babynames/">SSA baby names</a></li>' +
          '</ul></div>' +
          '<div><h4>Project</h4><ul>' +
            '<li><a href="https://github.com/jaramana/thepaygap.nyc">Source on GitHub</a></li>' +
            '<li><a href="https://github.com/jaramana/thepaygap.nyc/issues">Report an error</a></li>' +
          '</ul></div>' +
        '</div>' +
        '<p class="colophon">Public data, public method. Built with R, ' +
          'no tracking, no accounts, ' +
          '<span class="wink" title="Fiscal years run July to June, which is the single most common way to get these numbers wrong.">' +
          'and strong opinions about fiscal years</span>. ' +
          'Not affiliated with the City of New York.</p>' +
        '</div>';
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }

  // Theme is applied before paint so a dark-mode reader never sees a
  // flash of the light palette.
  applyTheme(currentTheme());

  document.addEventListener('DOMContentLoaded', function () {
    buildChrome();
    initTheme();
  });

  // A status line, so the instrument reports what it is showing. Any element
  // with data-status gets it.
  function stampStatus() {
    var nodes = document.querySelectorAll('[data-status]');
    if (!nodes.length) return;
    load('citywide.json').then(function (d) {
      var m = d.meta;
      var txt = 'FY' + m.years[0] + '–' + m.years[1] + ' · ' +
        fmt.num(d.headline.headcount) + ' salaried · ' +
        m.n_titles.toLocaleString('en-US') + ' titles · ' +
        'FY' + m.base_year + ' dollars · built ' + m.generated;
      nodes.forEach(function (n) { n.textContent = txt; });
    }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', stampStatus);

  window.PG = {
    fmt: fmt, load: load, fail: fail, formatter: formatter,
    param: param, setParam: setParam, el: el
  };
})();
