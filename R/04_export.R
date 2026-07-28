# thepaygap.nyc / export
#
# Writes two things from the same analysis objects:
#
#   docs/data/       compact JSON the website reads
#   docs/downloads/  machine-readable CSV anyone can open in a spreadsheet
#
# Numbers stay numbers in both. The 2020 script ran dollar() and percent()
# before write.csv, which shipped "$67,980" and "1.8%" as the data and made
# the downloads useless for anything except looking at.


# ---- Helpers -----------------------------------------------------------

slugify <- function(x) {
  s <- tolower(x)
  s <- gsub("&", " and ", s, fixed = TRUE)
  s <- gsub("[^a-z0-9]+", "-", s)
  s <- gsub("(^-|-$)", "", s)
  s
}

# JSON payloads are read over a phone connection, so round before writing.
# Salaries to the dollar, shares to four places. This is presentation
# rounding only; the CSVs keep full precision.
round_cols <- function(df) {
  for (nm in names(df)) {
    v <- df[[nm]]
    if (!is.numeric(v)) next
    # A fully suppressed column is all NA, so guard the max: without this,
    # every such column warns and returns -Inf.
    biggest <- suppressWarnings(max(abs(v), na.rm = TRUE))
    dollars <- is.finite(biggest) && biggest > 100 &&
      !grepl("share|rate|ratio|pct|gap$", nm)
    df[[nm]] <- if (dollars) round(v) else round(v, 4)
  }
  df
}

write_json_file <- function(x, path) {
  dir.create(dirname(path), showWarnings = FALSE, recursive = TRUE)
  jsonlite::write_json(x, path, auto_unbox = TRUE, na = "null", digits = 6)
  invisible(path)
}

write_csv_file <- function(df, name) {
  dir.create(PATH_DOWNLOADS, showWarnings = FALSE, recursive = TRUE)
  path <- file.path(PATH_DOWNLOADS, name)
  utils::write.csv(df, path, row.names = FALSE, na = "")
  message(sprintf("  %s (%s rows)", name, format(nrow(df), big.mark = ",")))
  invisible(path)
}


# ---- Per-title payloads ------------------------------------------------

# One file per title, fetched on demand by the Explorer. A single bundled
# file would be several megabytes before anyone had searched for anything.
export_titles <- function(a) {
  profiles <- a$title_profiles
  # Only publish titles that clear the reporting threshold in at least one
  # year. The rest exist in the downloads but have nothing showable.
  keep <- profiles %>%
    filter(!suppressed) %>%
    distinct(title) %>%
    pull(title)

  # Two titles slugifying the same would quietly overwrite each other's page
  # and drop one from the site. Normalization in 02_prepare.R should prevent
  # it; fail loudly if a new variant slips through.
  slugs <- slugify(keep)
  if (anyDuplicated(slugs)) {
    dup <- unique(slugs[duplicated(slugs)])
    stop("Title slug collision: ",
         paste(vapply(dup, function(d) paste(keep[slugs == d], collapse = " / "),
                      character(1)), collapse = "; "),
         "\nAdd a rule to normalize_title() in R/02_prepare.R.", call. = FALSE)
  }

  message(sprintf("Exporting %d titles...", length(keep)))

  idx <- profiles %>%
    filter(title %in% keep) %>%
    group_by(title) %>%
    filter(fiscal_year == max(fiscal_year)) %>%
    ungroup() %>%
    transmute(
      slug = slugify(title), title,
      n, median_salary, real_median, fiscal_year
    ) %>%
    arrange(desc(n))

  write_json_file(round_cols(as.data.frame(idx)),
                  file.path(PATH_SITE_DATA, "titles-index.json"))

  wages   <- a$wages_by_title
  ot      <- a$overtime_by_title
  comp    <- a$compression
  agencies <- a$title_by_agency
  tenure  <- a$tenure_by_title

  dir.create(file.path(PATH_SITE_DATA, "titles"), showWarnings = FALSE, recursive = TRUE)

  for (t in keep) {
    payload <- list(
      title = t,
      slug  = slugify(t),
      profile = round_cols(as.data.frame(
        profiles %>% filter(title == t) %>% select(-title))),
      wages = round_cols(as.data.frame(
        wages %>% filter(title == t) %>%
          select(fiscal_year, n, median_salary, real_median,
                 wage_index, cpi_index, rent_index, zori))),
      overtime = round_cols(as.data.frame(
        ot %>% filter(title == t) %>%
          select(fiscal_year, n, median_base, median_total_comp,
                 ot_share_of_pay, pct_with_ot))),
      compression = round_cols(as.data.frame(
        comp %>% filter(title == t) %>%
          select(fiscal_year, n_new, n_vet, median_new, median_vet,
                 compression_ratio, experience_premium))),
      agencies = round_cols(as.data.frame(
        agencies %>% filter(title == t) %>%
          filter(!suppressed) %>%
          select(agency, n, median_salary) %>%
          arrange(desc(n)))),
      tenure = as.data.frame(
        tenure %>% filter(title == t) %>% select(band, n, share))
    )
    write_json_file(payload,
                    file.path(PATH_SITE_DATA, "titles", paste0(slugify(t), ".json")))
  }

  invisible(length(keep))
}


# ---- Citywide payload --------------------------------------------------

export_citywide <- function(a, prep) {
  latest <- max(YEARS)

  gd <- a$gender_decomposition %>% filter(fiscal_year == latest)
  cw <- a$wages_citywide %>% filter(fiscal_year == latest)
  first <- a$wages_citywide %>% filter(fiscal_year == INDEX_YEAR)

  payload <- list(
    meta = list(
      generated    = format(Sys.Date()),
      years        = range(YEARS),
      base_year    = BASE_YEAR,
      index_year   = INDEX_YEAR,
      latest_year  = latest,
      min_group_n  = MIN_GROUP_N,
      source       = sprintf("%s/d/%s", SOCRATA_HOST, SOCRATA_DATASET),
      cpi_series   = CPI_SERIES,
      rent_series  = RENT_SERIES
    ),
    headline = list(
      # The four numbers the front page leads with.
      median_salary   = round(cw$median_salary),
      wage_growth     = round(cw$median_salary / first$median_salary - 1, 4),
      cpi_growth      = round(cw$cpi_index / 100 - 1, 4),
      rent_growth     = round(cw$rent_index / 100 - 1, 4),
      real_wage_change = round(cw$real_median / first$real_median - 1, 4),
      gender_gap      = round(gd$total_gap, 4),
      gender_within   = round(gd$within_gap, 4),
      gender_between  = round(gd$between_gap, 4),
      headcount       = cw$n
    ),
    prices        = round_cols(as.data.frame(prep$prices)),
    wages         = round_cols(as.data.frame(a$wages_citywide %>%
                       select(fiscal_year, n, median_salary, mean_salary,
                              real_median, wage_index, cpi_index, rent_index, zori))),
    gender        = round_cols(as.data.frame(a$gender_citywide %>%
                       select(fiscal_year, n, male_mean, female_mean, gap,
                              gap_dollars, female_share))),
    decomposition = round_cols(as.data.frame(a$gender_decomposition %>%
                       select(fiscal_year, total_gap, within_gap, between_gap,
                              within_share, between_share, n_titles))),
    coverage      = round_cols(as.data.frame(a$gender_coverage)),
    name_origin   = round_cols(as.data.frame(a$name_origin_citywide %>%
                       select(fiscal_year, n_common, n_uncommon, common_mean,
                              uncommon_mean, gap, gap_dollars, uncommon_share))),
    hourly        = round_cols(as.data.frame(a$hourly_summary %>%
                       select(fiscal_year, n_roster, n_placeholder, n_zero_hours,
                              n, median_rate, real_median_rate, p10, p90,
                              n_substantial, median_rate_substantial,
                              real_median_rate_substantial, median_gross,
                              real_median_gross, median_hours, pct_substantial)))
  )

  write_json_file(payload, file.path(PATH_SITE_DATA, "citywide.json"))
}


# ---- Ranked leaderboards ----------------------------------------------

# Each site chapter opens with a ranked table. These are pre-cut to the
# latest year and the CHART_MIN_N floor so the page does not ship 1,500 rows
# to render 25.
export_rankings <- function(a) {
  latest <- max(YEARS)

  overtime <- a$overtime_by_title %>%
    filter(fiscal_year == latest, !suppressed, n >= CHART_MIN_N) %>%
    arrange(desc(ot_share_of_pay)) %>%
    transmute(slug = slugify(title), title, n, median_base, median_total_comp,
              ot_share_of_pay, pct_with_ot, median_ot_hours)

  compression <- a$compression %>%
    filter(fiscal_year == latest, !suppressed) %>%
    arrange(desc(compression_ratio)) %>%
    transmute(slug = slugify(title), title, n_new, n_vet, median_new,
              median_vet, compression_ratio, experience_premium)

  gender_title <- a$gender_by_title %>%
    filter(fiscal_year == latest, !suppressed, n >= CHART_MIN_N) %>%
    arrange(desc(gap)) %>%
    transmute(slug = slugify(title), title, n, male_mean, female_mean,
              gap, gap_dollars, female_share)

  gender_agency <- a$gender_by_agency %>%
    filter(fiscal_year == latest, !suppressed, n >= CHART_MIN_N) %>%
    arrange(desc(gap)) %>%
    transmute(agency, n, male_mean, female_mean, gap, gap_dollars, female_share)

  # Real-terms winners and losers: whose pay outran inflation and whose did not.
  wage_change <- a$wages_by_title %>%
    filter(!suppressed) %>%
    group_by(title) %>%
    filter(n() >= 2) %>%
    summarise(
      first_year = min(fiscal_year), last_year = max(fiscal_year),
      n = last(n),
      first_real = first(real_median), last_real = last(real_median),
      first_nominal = first(median_salary), last_nominal = last(median_salary),
      .groups = "drop"
    ) %>%
    filter(last_year == latest, n >= CHART_MIN_N) %>%
    mutate(
      real_change    = last_real / first_real - 1,
      nominal_change = last_nominal / first_nominal - 1,
      slug = slugify(title)
    ) %>%
    arrange(real_change)

  retirement <- a$retirement %>%
    filter(!suppressed, n >= CHART_MIN_N) %>%
    arrange(desc(pct_over_20)) %>%
    transmute(slug = slugify(title), title, n, median_tenure,
              pct_over_20, pct_over_25, pct_under_5)

  separations <- a$separations %>%
    filter(fiscal_year == latest, !suppressed) %>%
    arrange(desc(separation_rate)) %>%
    select(agency, active, ceased, separation_rate)

  hourly_titles <- a$hourly_by_title %>%
    filter(fiscal_year == latest, !suppressed) %>%
    arrange(desc(n)) %>%
    transmute(pay_basis, title, n, median_rate, real_median_rate,
              median_hours, median_gross, pct_substantial)

  headcount <- a$headcount_agency %>%
    transmute(agency, fiscal_year, n, n_salaried, n_hourly, n_daily)

  for (nm in c("overtime", "compression", "gender_title", "gender_agency",
               "wage_change", "retirement", "separations", "hourly_titles",
               "headcount")) {
    write_json_file(round_cols(as.data.frame(get(nm))),
                    file.path(PATH_SITE_DATA, paste0(gsub("_", "-", nm), ".json")))
  }
}


# ---- Downloads ---------------------------------------------------------

export_downloads <- function(a, prep) {
  message("Writing downloads...")

  write_csv_file(prep$prices, "prices_cpi_rent.csv")
  write_csv_file(a$title_profiles, "salary_by_title.csv")
  write_csv_file(a$wages_by_title %>%
                   select(title, fiscal_year, n, median_salary, mean_salary,
                          real_median, wage_index, cpi_index, rent_index, suppressed),
                 "real_wages_by_title.csv")
  write_csv_file(a$wages_by_agency %>%
                   select(agency, fiscal_year, n, median_salary, mean_salary,
                          real_median, wage_index, cpi_index, rent_index, suppressed),
                 "real_wages_by_agency.csv")
  write_csv_file(a$gender_by_agency, "gender_gap_by_agency.csv")
  write_csv_file(a$gender_by_title, "gender_gap_by_title.csv")
  write_csv_file(a$gender_decomposition, "gender_gap_decomposition.csv")
  write_csv_file(a$overtime_by_agency, "overtime_by_agency.csv")
  write_csv_file(a$overtime_by_title, "overtime_by_title.csv")
  write_csv_file(a$compression, "salary_compression_by_title.csv")
  write_csv_file(a$name_origin_by_agency, "name_origin_gap_by_agency.csv")
  write_csv_file(a$name_origin_by_title, "name_origin_gap_by_title.csv")
  write_csv_file(a$hourly_by_title, "hourly_and_daily_by_title.csv")
  write_csv_file(a$hourly_summary, "hourly_summary.csv")
  write_csv_file(a$headcount_agency, "headcount_by_agency.csv")
  write_csv_file(a$separations, "separations_by_agency.csv")
  write_csv_file(a$retirement, "tenure_by_title.csv")
  write_csv_file(prep$names_ref, "name_sex_weights.csv")

  write_csv_file(data.frame(
    column = c("fiscal_year", "n", "suppressed", "median_salary", "mean_salary",
               "real_median", "wage_index", "cpi_index", "rent_index",
               "gap", "gap_dollars", "within_gap", "between_gap",
               "compression_ratio", "experience_premium", "ot_share_of_pay",
               "pct_with_ot", "separation_rate", "deflator"),
    meaning = c(
      "NYC fiscal year, July 1 to June 30. FY2025 = July 2024 to June 2025.",
      "Number of employee records in the group.",
      sprintf("TRUE where the group has fewer than %d people and statistics are withheld.", MIN_GROUP_N),
      "Median base salary, nominal dollars of that fiscal year.",
      "Mean base salary, nominal dollars of that fiscal year.",
      sprintf("Median base salary in FY%d dollars, deflated by NY-area CPI.", BASE_YEAR),
      sprintf("Median base salary indexed to 100 in the group's first reportable year (usually FY%d).", INDEX_YEAR),
      sprintf("NY-area CPI-U (%s) indexed to 100 in FY%d.", CPI_SERIES, INDEX_YEAR),
      sprintf("NY-area rent of primary residence (%s) indexed to 100 in FY%d.", RENT_SERIES, INDEX_YEAR),
      "Pay gap as (higher - lower) / higher. The conventional measure.",
      "Pay gap in dollars of that fiscal year.",
      "Portion of the gender gap from unequal pay inside the same title.",
      "Portion of the gender gap from women being concentrated in lower-paid titles.",
      sprintf("Median pay of hires within %d years divided by median pay of staff past %d years. Above 1.0, new hires out-earn veterans.", NEW_HIRE_YEARS, VETERAN_YEARS),
      "Median veteran pay minus median new-hire pay, in dollars.",
      "Overtime paid divided by total compensation for the group.",
      "Share of the group that was paid any overtime.",
      "CEASED records divided by all records. Mixes quits, retirements, layoffs and deaths.",
      sprintf("Multiply a nominal figure from that fiscal year by this to get FY%d dollars.", BASE_YEAR)
    ),
    stringsAsFactors = FALSE
  ), "data_dictionary.csv")
}


# ---- Orchestration -----------------------------------------------------

export_all <- function(a, prep) {
  dir.create(PATH_SITE_DATA, showWarnings = FALSE, recursive = TRUE)
  message("Writing site JSON...")
  export_citywide(a, prep)
  export_rankings(a)
  export_titles(a)
  export_downloads(a, prep)
  message("Export complete.")
}
