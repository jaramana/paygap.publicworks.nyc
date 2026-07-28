# thepaygap.nyc

Tabulating the City of New York payroll.

An open analysis of what the City pays its 288,000 employees, built from
[NYC Open Data](https://data.cityofnewyork.us/d/k397-673e), covering fiscal
years 2014 through 2025. The aim is a site a civil servant can open the week
before a union meeting and find the number they need.

## What the data says

For fiscal year 2025:

| | |
|---|---|
| Median base salary | $91,938 |
| Nominal pay growth since FY2014 | +37.8% |
| NY-area inflation over the same period | +31.5% |
| NY-area rent over the same period | +38.8% |
| Gender pay gap | 3.5% |
| of which, unequal pay inside the same title | 0.7 points |
| of which, women concentrated in lower-paid titles | 2.9 points |

City pay has outrun inflation by a few points since 2014 and has not kept up
with rent. And the gender gap is mostly not about two people in the same job
being paid differently: roughly four fifths of it comes from how men and
women are distributed across titles, which is a different problem needing a
different remedy.

## Running it

Requires R with `data.table`, `dplyr`, `tidyr` and `jsonlite`.

```bash
Rscript run.R
```

The first run downloads about twelve years of payroll data into `data-raw/`
and takes roughly twenty minutes. Historical fiscal years never change, so
later runs fetch only the newest year and finish in under two minutes. Pass
`--refresh` to force a full re-download.

## Layout

```
R/00_config.R   every tunable in the project
R/01_fetch.R    cached downloads
R/02_prepare.R  cleaning, joins, deflators
R/03_analyze.R  one function per theme
R/04_export.R   site JSON and public CSV
run.R           entry point
docs/           the website, served by GitHub Pages
docs/downloads/ machine-readable CSV
```

Thresholds, fiscal years, the base year for inflation and the suppression
floor all live in `R/00_config.R`. Change a number there and re-run; nothing
elsewhere hardcodes a year or a cutoff.

## Sources

- **Payroll**: NYC Citywide Payroll Data (Fiscal Year), dataset `k397-673e`
- **Inflation**: BLS series `CUURS12ASA0`, CPI-U for New York-Newark-Jersey City
- **Rent**: BLS series `CUURS12ASEHA`, rent of primary residence, same area
- **Rent in dollars**: Zillow Observed Rent Index, New York metro
- **Names**: Social Security Administration national baby names, 1880 to 2025

## Method and its limits

**Fiscal years.** NYC fiscal years run July 1 to June 30, so FY2025 covers
July 2024 through June 2025. Inflation adjustment uses the twelve-month
average of the NY-area CPI for each fiscal year, not a single month's
reading, and not the national index. NYC wages deflated by national inflation
understate what New Yorkers actually lost.

**Small groups are suppressed.** Any group with fewer than 30 people has its
statistics withheld rather than published. A three-person agency will happily
produce a 44% "gender gap" that is one person's salary. Suppressed rows stay
in the downloads with a `suppressed` flag so you can tell "too small to
report" from "not in the data".

**Gender is inferred from first names,** matched against SSA birth
registrations. It is a proxy for sex recorded at birth. It does not know
anyone's gender identity, it covers about 89% of employees, and coverage
falls a little every year as the workforce diversifies. Every gender figure
on the site carries this caveat next to it.

**"Uncommon names" measures something specific.** It asks whether an
employee's first name appears in US birth records at least 25 times. That is
a proxy for being born outside the US or to immigrant parents, so it reads on
ethnicity and national origin rather than on any neutral quality of a name.
The FY2025 gap on this measure is 9.1%, larger than the gender gap. It is
published because it is real, and labelled because it is easy to misread.

**Hourly workers need care.** About half the "per Hour" roster is election-day
poll workers carrying a $1.00 placeholder rate rather than a wage, and most
hourly records show zero regular hours. Rates below $5 and above $500 are
excluded as bookkeeping artifacts, and the continuously employed subset is
reported separately from the roster as a whole.

**Tenure is time at the agency,** not time in public service. Someone who
transferred between agencies reads as newer than they are, so the compression
and retirement figures understate real experience.

**CEASED is not a resignation rate.** It counts people who left during the
year without saying why, mixing quits, retirements, layoffs and deaths.

## Corrections to the 2020 figures

This is a rewrite of the original 2020 script, which had errors that changed
published numbers. Anyone who cited the old site should know:

1. **The pay gap formula was wrong.** It used `(male - female) / (male + female)`.
   The conventional measure is `(male - female) / male`. Every gap figure
   previously published was roughly half its true size. The citywide FY2021
   figure of 1.1% should have read about 2.2%.
2. **The summary tables were computed from stale data.** Each table block
   reused a grouped frame left over from the previous loop rather than
   rebuilding it, so the `*_table.csv` outputs did not describe the year they
   claimed to.
3. **The uncommon-names chart computed the gender gap instead,** through a
   copy-paste error, and wrote its result over the gender-gap file. There was
   never any published uncommon-names chart data.
4. **Inflation used the national index pinned to a single November reading**
   for fiscal years ending June 30.
5. **The downloads were not machine-readable,** shipping `"$67,980"` and
   `"1.8%"` as values.
6. **The 200-employee filter was applied inconsistently,** to charts but not
   to the main download, contrary to what the site said.

Two further changes are improvements rather than fixes. Names are now matched
against the SSA national file instead of the New York state file, which
raises coverage from roughly two thirds to 89% in a city where most employees
were not born in New York. And medians are reported alongside means, because
salary distributions are right-skewed and the mean has been flattering the
data.

## License

Code is released under the [BSD 3-Clause license](http://opensource.org/licenses/BSD-3-Clause).
The derived data in `docs/downloads/` is free to reuse with attribution.

Built with R, `data.table` and `dplyr`, and with Claude.
