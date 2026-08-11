/* The Pay Gap (paygap.publicworks.nyc) / tables
   ------------------------------------------------------------------
   Sortable, filterable tables with CSV export. Replaces the jQuery and
   DataTables pair the old site shipped, which was about 15,000 lines to
   do roughly this.

   PGTable.render(target, { columns, rows, search, caption, csv }) */

(function () {
  'use strict';

  function render(target, cfg) {
    var host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) return;

    var columns = cfg.columns;
    var rows = cfg.rows.slice();
    var sortKey = cfg.sortKey || null;
    var sortDir = cfg.sortDir || 'desc';
    var filter = '';

    host.innerHTML = '';

    // ---- Tools row -------------------------------------------------
    var tools = document.createElement('div');
    tools.className = 'table-tools';

    var input = null;
    if (cfg.search !== false) {
      input = document.createElement('input');
      input.type = 'search';
      input.placeholder = cfg.searchPlaceholder || 'Filter…';
      input.setAttribute('aria-label', cfg.searchPlaceholder || 'Filter table');
      input.addEventListener('input', function () {
        filter = input.value.trim().toLowerCase();
        draw();
      });
      tools.appendChild(input);
    }

    var count = document.createElement('span');
    count.className = 'count';
    tools.appendChild(count);

    // Long tables are truncated by default so a page stays scannable, with
    // the rest one click away rather than behind pagination.
    var expanded = false;
    var more = null;
    if (cfg.limit) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'pill';
      more.addEventListener('click', function () {
        expanded = !expanded;
        draw();
      });
      tools.appendChild(more);
    }

    if (cfg.csv) {
      var dl = document.createElement('a');
      dl.className = 'pill';
      dl.href = cfg.csv;
      dl.textContent = 'Download CSV';
      dl.setAttribute('download', '');
      tools.appendChild(dl);
    }
    host.appendChild(tools);

    // ---- Table -----------------------------------------------------
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var table = document.createElement('table');
    if (cfg.caption) {
      var cap = document.createElement('caption');
      cap.textContent = cfg.caption;
      cap.style.cssText = 'text-align:left;padding:.6rem .8rem;font-size:.85rem;color:var(--ink-faint)';
      table.appendChild(cap);
    }

    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    columns.forEach(function (c) {
      var th = document.createElement('th');
      th.textContent = c.label;
      if (c.num) th.className = 'num';
      if (c.sortable !== false) {
        th.classList.add('sortable');
        th.tabIndex = 0;
        var activate = function () {
          if (sortKey === c.key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          else { sortKey = c.key; sortDir = c.num ? 'desc' : 'asc'; }
          draw();
        };
        th.addEventListener('click', activate);
        th.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
      }
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);

    // ---- Draw ------------------------------------------------------
    function visible() {
      var out = rows;
      if (filter) {
        out = out.filter(function (r) {
          return columns.some(function (c) {
            var v = r[c.key];
            return v !== null && v !== undefined &&
              String(v).toLowerCase().indexOf(filter) !== -1;
          });
        });
      }
      if (sortKey) {
        out = out.slice().sort(function (a, b) {
          var av = a[sortKey], bv = b[sortKey];
          // Missing values sort last in both directions: a suppressed
          // group is not "the lowest", it is unknown.
          var an = av === null || av === undefined || (typeof av === 'number' && isNaN(av));
          var bn = bv === null || bv === undefined || (typeof bv === 'number' && isNaN(bv));
          if (an && bn) return 0;
          if (an) return 1;
          if (bn) return -1;
          if (typeof av === 'number' && typeof bv === 'number') {
            return sortDir === 'asc' ? av - bv : bv - av;
          }
          return sortDir === 'asc'
            ? String(av).localeCompare(String(bv))
            : String(bv).localeCompare(String(av));
        });
      }
      return out;
    }

    function draw() {
      var data = visible();

      columns.forEach(function (c, i) {
        var th = htr.children[i];
        if (c.key === sortKey) th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
      });

      tbody.innerHTML = '';
      // A filter that narrows the set below the cap makes truncation moot.
      var limit = (!cfg.limit || expanded) ? data.length : cfg.limit;
      data.slice(0, limit).forEach(function (r) {
        var tr = document.createElement('tr');
        columns.forEach(function (c) {
          var td = document.createElement('td');
          var v = r[c.key];
          if (c.render) {
            var out = c.render(v, r);
            if (out instanceof Node) td.appendChild(out);
            else td.innerHTML = out;
          } else {
            td.textContent = v === null || v === undefined ? '—' : v;
          }
          if (c.num) td.classList.add('num');
          if (c.name) td.classList.add('name');
          if (c.cellClass) {
            var extra = typeof c.cellClass === 'function' ? c.cellClass(v, r) : c.cellClass;
            if (extra) td.classList.add(extra);
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      var shown = Math.min(limit, data.length);
      count.textContent = shown === data.length
        ? data.length.toLocaleString('en-US') + ' rows'
        : shown.toLocaleString('en-US') + ' of ' + data.length.toLocaleString('en-US');

      if (more) {
        var hidden = data.length - shown;
        if (hidden > 0 || expanded) {
          more.hidden = false;
          more.textContent = expanded
            ? 'Show first ' + cfg.limit
            : 'Show all ' + data.length.toLocaleString('en-US');
        } else {
          more.hidden = true;
        }
      }
    }

    draw();
    return { redraw: draw, setRows: function (r) { rows = r.slice(); draw(); } };
  }

  window.PGTable = { render: render };
})();
