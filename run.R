#!/usr/bin/env Rscript
#
# The Pay Gap (paygap.publicworks.nyc)
#
# Runs the whole pipeline: download, prepare, analyze, export.
# From the project root:
#
#   Rscript run.R
#
# The first run downloads about twelve years of City payroll data and takes
# a while. After that only the newest fiscal year is fetched, so re-runs are
# quick. Pass --refresh to force everything to download again.
#
# Every tunable lives in R/00_config.R.

args <- commandArgs(trailingOnly = TRUE)
refresh <- "--refresh" %in% args

for (f in list.files("R", pattern = "^\\d.*\\.R$", full.names = TRUE)) source(f)

started <- Sys.time()

fetch_all(overwrite = refresh)

prep <- prepare_all()
payroll <- prep$payroll
prices  <- prep$prices

message("Analyzing...")

analysis <- list(
  wages_citywide      = real_wage_series(payroll, prices),
  wages_by_title      = real_wage_series(payroll, prices, "title"),
  wages_by_agency     = real_wage_series(payroll, prices, "agency"),

  title_profiles      = group_profiles(payroll, "title"),
  agency_profiles     = group_profiles(payroll, "agency"),
  # Title x agency pairs. Filtered by title it answers "who employs this
  # job"; filtered by agency, "what jobs does this agency have".
  title_by_agency     = title_by_agency(payroll),

  overtime_by_title   = overtime_dependence(payroll, "title"),
  overtime_by_agency  = overtime_dependence(payroll, "agency"),

  compression         = salary_compression(payroll, "title"),
  compression_agency  = salary_compression(payroll, "agency"),
  tenure_by_title     = tenure_distribution(payroll, group_col = "title"),
  tenure_by_agency    = tenure_distribution(payroll, group_col = "agency"),

  hourly_by_title     = hourly_workers(payroll, prices),
  hourly_summary      = hourly_summary(payroll, prices),

  gender_citywide     = gender_gap(payroll),
  gender_by_title     = gender_gap(payroll, "title"),
  gender_by_agency    = gender_gap(payroll, "agency"),
  gender_decomposition = gender_decomposition(payroll),
  gender_coverage     = gender_coverage(payroll),

  name_origin_citywide  = name_origin_gap(payroll),
  name_origin_by_title  = name_origin_gap(payroll, "title"),
  name_origin_by_agency = name_origin_gap(payroll, "agency"),

  headcount_agency    = headcount(payroll, "agency"),
  headcount_title     = headcount(payroll, "title"),
  separations         = separations(payroll, "agency"),
  retirement          = retirement_exposure(payroll, group_col = "title"),
  retirement_agency   = retirement_exposure(payroll, group_col = "agency")
)

export_all(analysis, prep)

message(sprintf("\nDone in %.1f minutes.",
                as.numeric(difftime(Sys.time(), started, units = "mins"))))
