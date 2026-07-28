/* About: stamp the build so a reader knows how fresh the numbers are. */

(function () {
  'use strict';
  PG.load('citywide.json').then(function (d) {
    var m = d.meta;
    document.getElementById('build-note').textContent =
      'Data covers fiscal years ' + m.years[0] + ' to ' + m.years[1] +
      ', expressed in FY' + m.base_year + ' dollars. Built ' + m.generated + '.';
  }).catch(function () { /* the page is readable without this */ });
})();
