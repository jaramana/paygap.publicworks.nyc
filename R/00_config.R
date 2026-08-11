# The Pay Gap (paygap.publicworks.nyc) / configuration
#
# Every tunable in the project lives here. Change a number, re-run run.R,
# and the whole site updates. Nothing below this file should hardcode a
# year, a threshold, or a path.

suppressPackageStartupMessages({
  library(data.table)   # fread/fwrite only: fast gzip CSV I/O
  library(dplyr)
  library(tidyr)
  library(jsonlite)
})


# ---- Paths -------------------------------------------------------------
# All relative to the project root. run.R is the only entry point, so the
# working directory is wherever the user launched it from.

PATH_RAW       <- "data-raw"    # download cache, gitignored
PATH_SITE_DATA <- "docs/data"   # JSON consumed by the website
PATH_DOWNLOADS <- "docs/downloads"  # machine-readable CSVs for the public


# ---- Study period ------------------------------------------------------

YEARS     <- 2014:2025  # fiscal years available in the Citywide Payroll table
BASE_YEAR <- 2025       # every dollar figure is expressed in this year's money
INDEX_YEAR <- 2014      # index charts are set to 100 in this year


# ---- Publication thresholds -------------------------------------------
# Small groups produce meaningless statistics. A three-person agency will
# show a 44% "gender gap" that is one person's salary, not a pattern.

MIN_GROUP_N <- 30   # below this, a figure is suppressed rather than published
# Floor for the ranking files the site loads. Set to the suppression floor so
# every reportable group is exported and nothing is invisible just because it
# is small. Which groups a ranking actually *shows* is a display choice made
# in the browser, where the minimum is a control the reader can move.
CHART_MIN_N <- MIN_GROUP_N


# ---- Gender proxy ------------------------------------------------------
# Names are matched against SSA birth registrations to estimate the share
# of people with that name registered male vs female. This is a proxy for
# sex at birth, not for gender identity. See docs/about.html.

GENDER_NAMES_SCOPE    <- "national"  # "national" or "state"; national gives
                                     # far better coverage in a city where
                                     # most employees were not born in NY
GENDER_MIN_NAME_COUNT <- 25  # a name needs at least this many registrations
                             # before we trust its sex ratio. Below the
                             # threshold the name is treated as "uncommon".


# ---- Tenure and compression -------------------------------------------
# Derived from agency_start_date, which is populated on all but one row.

NEW_HIRE_YEARS <- 2   # hired within this many years = "new hire"
VETERAN_YEARS  <- 10  # employed longer than this = "veteran"

# Tenure bands used in the workforce and retirement-wave charts.
TENURE_BREAKS <- c(0, 2, 5, 10, 20, 30, Inf)
TENURE_LABELS <- c("0-2", "2-5", "5-10", "10-20", "20-30", "30+")


# ---- Employment filters ------------------------------------------------

PAY_BASIS_SALARIED <- "per Annum"
PAY_BASIS_HOURLY   <- "per Hour"
PAY_BASIS_DAILY    <- "per Day"
ACTIVE_STATUS      <- "ACTIVE"

# An hourly worker below this many regular hours in a fiscal year is too
# intermittent to annualize honestly (a crossing guard working 40 hours all
# year is not a $X/year job). Reported as an hourly rate instead.
HOURLY_MIN_HOURS <- 1000

# Roughly 40% of "per Hour" rows carry a base_salary of exactly $1.00. Almost
# all of them are ELECTION WORKER: poll workers are paid a flat stipend per
# election day, and the payroll system stores a placeholder rate rather than
# a real wage. Averaging those in produces a median hourly wage for the City
# that is mostly an artifact of how election day is bookkept.
MIN_CREDIBLE_HOURLY_RATE <- 5     # below this, treat the rate as a placeholder
MAX_CREDIBLE_HOURLY_RATE <- 500   # above this, an annual salary was miscoded

FULL_TIME_HOURS <- 1820  # the modal regular_hours value for salaried staff


# ---- Data sources ------------------------------------------------------

# NYC Citywide Payroll Data (Fiscal Year), NYC Open Data
SOCRATA_DATASET <- "k397-673e"
SOCRATA_HOST    <- "https://data.cityofnewyork.us"

# The 11 columns actually used. Dropping last_name and mid_init cuts roughly
# a third of the payload and removes personally identifying detail we have
# no use for.
PAYROLL_COLUMNS <- c(
  "fiscal_year", "agency_name", "first_name", "agency_start_date",
  "work_location_borough", "title_description", "leave_status_as_of_june_30",
  "base_salary", "pay_basis", "regular_hours", "regular_gross_paid",
  "ot_hours", "total_ot_paid", "total_other_pay"
)

# BLS series. Both are New York-Newark-Jersey City, not the US city average
# the 2020 script used. NYC wages deflated by national inflation understate
# what New Yorkers actually lost.
BLS_API     <- "https://api.bls.gov/publicAPI/v2/timeseries/data/"
CPI_SERIES  <- "CUURS12ASA0"   # NY area, all items, CPI-U, not seasonally adj.
RENT_SERIES <- "CUURS12ASEHA"  # NY area, rent of primary residence

# Zillow Observed Rent Index, New York metro. Real dollars, 2015 onward.
ZORI_URL       <- "https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_sfrcondomfr_sm_month.csv"
ZORI_REGION_ID <- "394913"  # New York, NY metro

# SSA baby names by state and nationally. SSA blocks scripted downloads, so
# these are fetched by hand; 01_fetch.R prints instructions when missing.
SSA_NATIONAL_URL <- "https://www.ssa.gov/oact/babynames/names.zip"
SSA_STATE_URL    <- "https://www.ssa.gov/oact/babynames/state/namesbystate.zip"

# NYC fiscal years run July 1 to June 30. FY2025 = July 2024 through June 2025.
FISCAL_YEAR_START_MONTH <- 7
