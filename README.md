# The Pay Gap

[The Pay Gap](https://paygap.publicworks.nyc) is an independent
[publicworks.nyc](https://publicworks.nyc) site for
exploring what New York City pays its employees. It covers fiscal years 2014–2025,
with views by agency and job title.

## Data sources

| Source | Used for |
| --- | --- |
| [Citywide Payroll Data](https://data.cityofnewyork.us/d/k397-673e), `k397-673e` | Pay, titles, agencies and employment records |
| [BLS New York area CPI-U](https://www.bls.gov/cpi/), `CUURS12ASA0` | Inflation-adjusted pay |
| [BLS New York area rent index](https://www.bls.gov/cpi/), `CUURS12ASEHA` | Rent growth |
| [Zillow Observed Rent Index](https://www.zillow.com/research/data/) | Rent in dollars for the New York metro area |
| [Social Security Administration baby names](https://www.ssa.gov/oact/babynames/limits.html) | First-name comparisons |

## Method and limits

In FY2025, the median base salary was $91,938. Nominal pay rose 37.8% from FY2014,
while New York area inflation rose 31.5% and rent rose 38.8%. The estimated gender
gap was 3.5%: about 0.7 percentage points within titles and 2.9 points from the
distribution of employees across titles. These comparisons use fiscal-year
averages; FY2025 runs from July 2024 through June 2025.

- Groups with fewer than 30 employees have their statistics suppressed. The
  downloads retain those rows with a `suppressed` flag.
- The estimated gender comparison uses the male and female shares of SSA birth
  registrations for each first name. The payroll has no gender field. The method
  cannot establish an employee's sex recorded at birth or gender identity.
  Sufficiently matched names cover about 89% of employees.
- The "uncommon names" comparison separates names with fewer than 25 US birth
  registrations from other names. Its FY2025 pay gap is 9.1%. It does not
  establish anyone's birthplace, ethnicity or national origin.
- Hourly pay excludes rates below $5 and above $500, which include bookkeeping
  artifacts. Agency tenure is not total public-service tenure. `CEASED` records a
  departure, not its cause.

The [Data page](https://paygap.publicworks.nyc/data.html) lists the downloads,
sources and process.

## Corrections to earlier figures

The current analysis replaces a 2020 script whose errors changed published
results:

1. The pay-gap denominator was `male + female` instead of `male`, roughly halving
   reported gaps. The FY2021 citywide figure of 1.1% should have been about 2.2%.
2. Summary tables reused data from the preceding loop, so some year labels did not
   match their contents.
3. The uncommon-names chart calculated the gender gap and overwrote the gender-gap
   file. No valid uncommon-names chart was published.
4. Inflation used a national index and one November reading instead of New York
   area fiscal-year averages.
5. Downloads formatted numbers as currency and percentage strings, making them
   difficult to analyze.
6. A 200-employee filter applied to charts but not to the main download, despite
   the site's description.

The rewrite also moved from New York State to national SSA name records and added
medians alongside means. These are method changes, not corrections to the six
errors above.

## Updates

The R pipeline builds the site data and public CSV files. The site has no
scheduled rebuild, so check the fiscal year on a figure before using it.

```sh
Rscript run.R
```

The first run downloads about 12 years of payroll data and takes about 20
minutes. Later runs download only the most recent fiscal year. `R/00_config.R`
holds each threshold, the inflation base year and the suppression floor; change a
value there and run the pipeline again. The five scripts in `R/` run in order from
`run.R`.

## Tools

Data pipeline: R joins payroll records, adjusts dollar amounts and aggregates
results, using `data.table`, `dplyr`, `tidyr` and `jsonlite`. Website: static
HTML, CSS and JavaScript, served from GitHub Pages. Claude was used in
development.

## License and reuse

Code is [BSD 3-Clause licensed](LICENSE). Compiled data can be reused with
attribution; the City, BLS, Zillow and SSA data retain their own terms. Carry the
fiscal year when republishing a figure.
