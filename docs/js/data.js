/* Downloads: the file list and the data dictionary. */

(function () {
  'use strict';

  // Kept in step with export_downloads() in R/04_export.R.
  var FILES = [
    ['salary_by_title.csv', 'Salary distribution by title and year', 'Median, mean and the 10th through 90th percentiles for every title, plus overtime share and median tenure.'],
    ['real_wages_by_title.csv', 'Real wages by title', 'Nominal and inflation-adjusted median pay by title and year, with the CPI and rent index alongside.'],
    ['real_wages_by_agency.csv', 'Real wages by agency', 'The same, grouped by agency.'],
    ['overtime_by_title.csv', 'Overtime by title', 'Overtime as a share of total pay, median hours, and the share of people working any.'],
    ['overtime_by_agency.csv', 'Overtime by agency', 'The same, grouped by agency.'],
    ['salary_compression_by_title.csv', 'Salary compression', 'New hires against staff past ten years, by title and year.'],
    ['gender_gap_by_title.csv', 'Gender gap by title', 'Estimated pay by sex proxy, with the gap in percent and dollars.'],
    ['gender_gap_by_agency.csv', 'Gender gap by agency', 'The same, grouped by agency.'],
    ['gender_gap_decomposition.csv', 'Gender gap decomposition', 'The gap split into within-title and between-title components, by year.'],
    ['name_origin_gap_by_title.csv', 'Name origin gap by title', 'Pay by whether a first name appears in US birth records. Read the caveats first.'],
    ['name_origin_gap_by_agency.csv', 'Name origin gap by agency', 'The same, grouped by agency.'],
    ['hourly_and_daily_by_title.csv', 'Hourly and day-rate workers', 'Rates, hours and gross pay for per-hour and per-day titles.'],
    ['hourly_summary.csv', 'Hourly summary by year', 'Roster size, placeholder counts, rates and the continuously employed subset.'],
    ['headcount_by_agency.csv', 'Headcount by agency', 'Active employees by pay basis, by agency and year.'],
    ['separations_by_agency.csv', 'Separations by agency', 'Records marked ceased, as a churn proxy. Not a resignation rate.'],
    ['tenure_by_title.csv', 'Tenure by title', 'Median tenure and the share past 20 and 25 years, for the retirement read.'],
    ['prices_cpi_rent.csv', 'Prices and deflators', 'NY-area CPI, rent index, Zillow rent and the deflator used, by fiscal year.'],
    ['name_sex_weights.csv', 'Name to sex weights', 'The full SSA lookup behind the gender proxy: every name, counts and weights.'],
    ['data_dictionary.csv', 'Data dictionary', 'What every shared column means.']
  ].map(function (r) {
    return { file: r[0], name: r[1], desc: r[2] };
  });

  // A plain table, no search box. The same three columns carry the two files
  // Schools Finder publishes and the nineteen here, which is the whole point of
  // using a table for this across the suite.
  PGTable.render('#file-table', {
    rows: FILES,
    search: false,
    sortKey: null,
    columns: [
      { key: 'name', label: 'Dataset', name: true,
        render: function (v, r) {
          return '<a href="downloads/' + r.file + '" download>' + v + '</a>';
        } },
      { key: 'desc', label: 'What it contains',
        render: function (v) { return '<span class="muted">' + v + '</span>'; },
        sortable: false },
      { key: 'file', label: 'File',
        render: function (v) { return '<code>' + v + '</code>'; } }
    ]
  });

  // The dictionary is generated in R, so it never drifts from the data.
  fetch('downloads/data_dictionary.csv')
    .then(function (r) { return r.text(); })
    .then(function (text) {
      var rows = parseCsv(text).slice(1)
        .filter(function (r) { return r.length >= 2 && r[0]; })
        .map(function (r) { return { column: r[0], meaning: r[1] }; });
      PGTable.render('#dict-table', {
        rows: rows, search: false, sortKey: null,
        columns: [
          { key: 'column', label: 'Column',
            render: function (v) { return '<code>' + v + '</code>'; } },
          { key: 'meaning', label: 'Meaning', sortable: false,
            render: function (v) { return '<span style="white-space:normal">' + v + '</span>'; } }
        ]
      });
      // The browser jumped to the anchor before these tables existed. Every
      // row they added moved the target, so re-apply the hash now.
      restoreHash();
    })
    .catch(function (e) { PG.fail(document.getElementById('dict-table'), e); });

  function restoreHash() {
    if (!location.hash) return;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target) return;

    // Stop the moment the reader takes over. Re-applying the hash under
    // someone who has already started scrolling is worse than landing in the
    // wrong place.
    var taken = false;
    function yieldToUser() { taken = true; }
    ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, yieldToUser, { once: true, passive: true });
    });

    // setTimeout rather than requestAnimationFrame: rAF is throttled in a
    // background tab, so a link opened in one would never be corrected.
    function land() {
      if (taken) return;
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    setTimeout(land, 0);
    window.addEventListener('load', function () { setTimeout(land, 0); }, { once: true });
  }

  // Small quoted-CSV reader: the dictionary text contains commas inside quotes.
  function parseCsv(text) {
    var rows = [], row = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
})();
