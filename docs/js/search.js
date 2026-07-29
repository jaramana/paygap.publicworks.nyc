/* Scoped entity search, shared by the landing page and the lookup view.
   ------------------------------------------------------------------
   PGSearch.mount(host, { onPick, scope, autofocus })

   Searches titles or agencies against their slim index files. Both indexes
   are small enough (71 KB and 12 KB) to hold in memory, so the scope toggle
   is instant after first load. */

(function () {
  'use strict';
  var f = PG.fmt;

  var SOURCES = {
    title:  { file: 'titles-index.json',   key: 'title',  label: 'Title',
              placeholder: 'Search 513 civil service titles…' },
    agency: { file: 'agencies-index.json', key: 'agency', label: 'Agency',
              placeholder: 'Search 87 agencies…' }
  };

  function normalize(rows, scope) {
    var k = SOURCES[scope].key;
    return rows.map(function (r) {
      return { slug: r.slug, name: r[k], n: r.n, median: r.median_salary, scope: scope };
    });
  }

  function mount(host, opts) {
    host = typeof host === 'string' ? document.querySelector(host) : host;
    if (!host) return null;
    var o = opts || {};
    var scope = o.scope || 'title';
    var cache = {};
    var active = -1;

    host.classList.add('search-shell');
    host.innerHTML =
      '<div class="scope-tabs" role="tablist" aria-label="Search scope">' +
        '<button type="button" role="tab" data-scope="title">Title</button>' +
        '<button type="button" role="tab" data-scope="agency">Agency</button>' +
      '</div>' +
      '<div class="search-row">' +
        '<input type="search" autocomplete="off" spellcheck="false" role="combobox" ' +
               'aria-expanded="false" aria-autocomplete="list" aria-label="Search">' +
      '</div>' +
      '<ul class="results" role="listbox"></ul>';

    var input = host.querySelector('input');
    var results = host.querySelector('.results');
    var tabs = host.querySelectorAll('.scope-tabs button');

    function data(s) {
      if (!cache[s]) cache[s] = PG.load(SOURCES[s].file).then(function (rows) {
        return normalize(rows, s);
      });
      return cache[s];
    }

    function setScope(s) {
      scope = s;
      tabs.forEach(function (t) {
        var on = t.dataset.scope === s;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      data(s).then(function (rows) {
        input.placeholder = SOURCES[s].placeholder.replace(
          /\d+/, rows.length.toLocaleString('en-US'));
      });
      render([]);
      if (input.value.trim()) run();
    }

    // Prefix beats word-start beats substring, then bigger groups first. A
    // search for "nurse" should surface NURSE before CERTIFIED NURSE AIDE.
    function score(rows, q) {
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var name = rows[i].name.toLowerCase();
        var pos = name.indexOf(q);
        if (pos === -1) continue;
        out.push({
          r: rows[i],
          rank: pos === 0 ? 0 : /[\s\-\/]/.test(name.charAt(pos - 1)) ? 1 : 2,
          pos: pos
        });
      }
      out.sort(function (a, b) {
        return a.rank - b.rank || a.pos - b.pos || b.r.n - a.r.n;
      });
      return out.slice(0, 10).map(function (x) { return x.r; });
    }

    function render(list) {
      results.innerHTML = '';
      active = -1;
      input.setAttribute('aria-expanded', list.length ? 'true' : 'false');
      list.forEach(function (r, i) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.id = 'sr-' + i;
        var b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<span class="r-name">' + r.name + '</span>' +
          '<span class="meta mono">' + f.num(r.n) + ' · ' + f.dollars(r.median) + '</span>';
        b.addEventListener('click', function () { pick(r); });
        li.appendChild(b);
        results.appendChild(li);
      });
    }

    function pick(r) {
      render([]);
      if (o.onPick) o.onPick(r);
      else location.href = 'lookup.html?' + r.scope + '=' + encodeURIComponent(r.slug);
    }

    function run() {
      var q = input.value.trim().toLowerCase();
      if (q.length < 2) { render([]); return; }
      data(scope).then(function (rows) { render(score(rows, q)); });
    }

    function move(d) {
      var items = results.querySelectorAll('li');
      if (!items.length) return;
      if (active >= 0) items[active].classList.remove('active');
      active = (active + d + items.length) % items.length;
      items[active].classList.add('active');
      input.setAttribute('aria-activedescendant', items[active].id);
      items[active].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      var items = results.querySelectorAll('li');
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && items[active]) items[active].querySelector('button').click();
        else {
          var q = input.value.trim().toLowerCase();
          if (q.length >= 2) data(scope).then(function (rows) {
            var hit = score(rows, q);
            if (hit.length) pick(hit[0]);
          });
        }
      } else if (e.key === 'Escape') { render([]); }
    });

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { setScope(t.dataset.scope); input.focus(); });
    });

    document.addEventListener('click', function (e) {
      if (!host.contains(e.target)) render([]);
    });

    setScope(scope);
    if (o.autofocus) {
      // Only on a pointer-capable screen; stealing focus on a phone opens
      // the keyboard over the page before anyone has decided to search.
      if (window.matchMedia('(hover: hover)').matches) input.focus();
    }

    return {
      focus: function () { input.focus(); },
      setValue: function (v) { input.value = v; },
      scope: function () { return scope; }
    };
  }

  window.PGSearch = { mount: mount, SOURCES: SOURCES };
})();
