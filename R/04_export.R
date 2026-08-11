# The Pay Gap (paygap.publicworks.nyc) / export
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
      kind  = "title",
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


# ---- Per-agency payloads -----------------------------------------------
# Same shape as the title payloads, so one lookup view in the browser can
# render either without knowing which it was handed. The only structural
# difference is the breakdown: a title lists the agencies employing it, an
# agency lists the titles it employs.

export_agencies <- function(a) {
  profiles <- a$agency_profiles
  keep <- profiles %>% filter(!suppressed) %>% distinct(agency) %>% pull(agency)

  # An agency lists every title it employs down to five people, but only
  # titles clearing the reporting threshold get a page of their own. Flag
  # which is which so the browser links the ones that exist and leaves the
  # rest as plain text instead of offering a link to a 404.
  titles_with_pages <- a$title_profiles %>%
    filter(!suppressed) %>% distinct(title) %>% pull(title)

  slugs <- slugify(keep)
  if (anyDuplicated(slugs)) {
    dup <- unique(slugs[duplicated(slugs)])
    stop("Agency slug collision: ",
         paste(vapply(dup, function(d) paste(keep[slugs == d], collapse = " / "),
                      character(1)), collapse = "; "),
         "\nAdd a rule to normalize_agency() in R/02_prepare.R.", call. = FALSE)
  }

  message(sprintf("Exporting %d agencies...", length(keep)))

  idx <- profiles %>%
    filter(agency %in% keep) %>%
    group_by(agency) %>%
    filter(fiscal_year == max(fiscal_year)) %>%
    ungroup() %>%
    transmute(slug = slugify(agency), agency,
              n, median_salary, real_median, fiscal_year) %>%
    arrange(desc(n))

  write_json_file(round_cols(as.data.frame(idx)),
                  file.path(PATH_SITE_DATA, "agencies-index.json"))

  wages  <- a$wages_by_agency
  ot     <- a$overtime_by_agency
  comp   <- a$compression_agency
  titles <- a$title_by_agency
  tenure <- a$tenure_by_agency
  heads  <- a$headcount_agency
  seps   <- a$separations

  dir.create(file.path(PATH_SITE_DATA, "agencies"), showWarnings = FALSE, recursive = TRUE)

  for (g in keep) {
    payload <- list(
      title = g,                 # generic key so the browser can stay agnostic
      slug  = slugify(g),
      kind  = "agency",
      profile = round_cols(as.data.frame(
        profiles %>% filter(agency == g) %>% select(-agency))),
      wages = round_cols(as.data.frame(
        wages %>% filter(agency == g) %>%
          select(fiscal_year, n, median_salary, real_median,
                 wage_index, cpi_index, rent_index, zori))),
      overtime = round_cols(as.data.frame(
        ot %>% filter(agency == g) %>%
          select(fiscal_year, n, median_base, median_total_comp,
                 ot_share_of_pay, pct_with_ot))),
      compression = round_cols(as.data.frame(
        comp %>% filter(agency == g) %>%
          select(fiscal_year, n_new, n_vet, median_new, median_vet,
                 compression_ratio, experience_premium))),
      # The counterpart breakdown: which titles this agency employs.
      titles = round_cols(as.data.frame(
        titles %>% filter(agency == g, !suppressed) %>%
          transmute(slug = slugify(title), title, n, median_salary,
                    has_page = title %in% titles_with_pages) %>%
          arrange(desc(n)))),
      tenure = as.data.frame(
        tenure %>% filter(agency == g) %>% select(band, n, share)),
      headcount = round_cols(as.data.frame(
        heads %>% filter(agency == g) %>%
          select(fiscal_year, n, n_salaried, n_hourly, n_daily))),
      separations = round_cols(as.data.frame(
        seps %>% filter(agency == g) %>%
          select(fiscal_year, active, ceased, separation_rate)))
    )
    write_json_file(payload,
                    file.path(PATH_SITE_DATA, "agencies", paste0(slugify(g), ".json")))
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
      # Distinct titles and agencies on the payroll in the latest year, for
      # the status line. Counted before the reporting threshold, so this is
      # the size of the source rather than the size of what is publishable.
      n_titles     = n_distinct(a$title_profiles$title[a$title_profiles$fiscal_year == latest]),
      n_agencies   = n_distinct(a$agency_profiles$agency[a$agency_profiles$fiscal_year == latest]),
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
# Rankings are emitted as one file per metric per scope, all in the same
# shape: slug, name, n, then the metric columns. Alongside them goes
# metrics.json, a manifest describing what exists and how to format it, so
# the comparison view in the browser is driven by this file rather than by a
# hardcoded list that would drift every time a metric is added here.

rank_file <- function(df, entity_col, cols) {
  if (is.null(df) || !nrow(df)) return(NULL)
  # Not every frame carries every requested column (agency-level overtime has
  # no median_ot_hours, for one), so take the intersection rather than error.
  have <- intersect(cols, names(df))
  df %>%
    transmute(slug = slugify(.data[[entity_col]]),
              name = .data[[entity_col]],
              across(all_of(have))) %>%
    as.data.frame() %>%
    round_cols()
}

export_rankings <- function(a) {
  latest <- max(YEARS)

  # Real-terms change needs deriving from the wage series; everything else is
  # a straight filter of an existing analysis frame.
  wage_change <- function(df, entity_col) {
    df %>%
      filter(!suppressed) %>%
      group_by(across(all_of(entity_col))) %>%
      filter(n() >= 2) %>%
      summarise(
        first_year = min(fiscal_year), last_year = max(fiscal_year),
        n = dplyr::last(n),
        first_real = dplyr::first(real_median), last_real = dplyr::last(real_median),
        first_nominal = dplyr::first(median_salary),
        last_nominal = dplyr::last(median_salary),
        .groups = "drop"
      ) %>%
      filter(last_year == latest, n >= CHART_MIN_N) %>%
      mutate(real_change    = last_real / first_real - 1,
             nominal_change = last_nominal / first_nominal - 1)
  }

  latest_ok <- function(df) filter(df, fiscal_year == latest, !suppressed, n >= CHART_MIN_N)

  sets <- list(
    list(id = "pay", scope = "title", data = latest_ok(a$title_profiles), col = "title",
         cols = c("n", "median_salary", "mean_salary", "p10", "p90", "real_median")),
    list(id = "pay", scope = "agency", data = latest_ok(a$agency_profiles), col = "agency",
         cols = c("n", "median_salary", "mean_salary", "p10", "p90", "real_median")),

    list(id = "real-change", scope = "title", data = wage_change(a$wages_by_title, "title"),
         col = "title",
         cols = c("n", "first_year", "first_nominal", "last_nominal",
                  "nominal_change", "real_change")),
    list(id = "real-change", scope = "agency", data = wage_change(a$wages_by_agency, "agency"),
         col = "agency",
         cols = c("n", "first_year", "first_nominal", "last_nominal",
                  "nominal_change", "real_change")),

    list(id = "overtime", scope = "title", data = latest_ok(a$overtime_by_title), col = "title",
         cols = c("n", "median_base", "median_total_comp", "ot_share_of_pay",
                  "pct_with_ot", "median_ot_hours")),
    list(id = "overtime", scope = "agency", data = latest_ok(a$overtime_by_agency), col = "agency",
         cols = c("n", "median_base", "median_total_comp", "ot_share_of_pay",
                  "pct_with_ot", "median_ot_hours")),

    list(id = "compression", scope = "title",
         data = filter(a$compression, fiscal_year == latest, !suppressed), col = "title",
         cols = c("n", "n_new", "n_vet", "median_new", "median_vet",
                  "experience_premium", "compression_ratio")),
    list(id = "compression", scope = "agency",
         data = filter(a$compression_agency, fiscal_year == latest, !suppressed), col = "agency",
         cols = c("n", "n_new", "n_vet", "median_new", "median_vet",
                  "experience_premium", "compression_ratio")),

    list(id = "gender", scope = "title", data = latest_ok(a$gender_by_title), col = "title",
         cols = c("n", "male_mean", "female_mean", "gap", "gap_dollars", "female_share")),
    list(id = "gender", scope = "agency", data = latest_ok(a$gender_by_agency), col = "agency",
         cols = c("n", "male_mean", "female_mean", "gap", "gap_dollars", "female_share")),

    list(id = "name-origin", scope = "title",
         data = filter(a$name_origin_by_title, fiscal_year == latest, !suppressed,
                       n_common + n_uncommon >= CHART_MIN_N),
         col = "title",
         cols = c("common_mean", "uncommon_mean", "gap", "gap_dollars", "uncommon_share")),
    list(id = "name-origin", scope = "agency",
         data = filter(a$name_origin_by_agency, fiscal_year == latest, !suppressed,
                       n_common + n_uncommon >= CHART_MIN_N),
         col = "agency",
         cols = c("common_mean", "uncommon_mean", "gap", "gap_dollars", "uncommon_share")),

    list(id = "tenure", scope = "title",
         data = filter(a$retirement, !suppressed, n >= CHART_MIN_N), col = "title",
         cols = c("n", "median_tenure", "pct_under_5", "pct_over_20", "pct_over_25")),
    list(id = "tenure", scope = "agency",
         data = filter(a$retirement_agency, !suppressed, n >= CHART_MIN_N), col = "agency",
         cols = c("n", "median_tenure", "pct_under_5", "pct_over_20", "pct_over_25")),

    list(id = "churn", scope = "agency",
         data = filter(a$separations, fiscal_year == latest, !suppressed), col = "agency",
         cols = c("active", "ceased", "separation_rate"))
  )

  dir.create(file.path(PATH_SITE_DATA, "rank"), showWarnings = FALSE, recursive = TRUE)
  for (s in sets) {
    out <- rank_file(s$data, s$col, s$cols)
    if (is.null(out)) next
    write_json_file(out, file.path(PATH_SITE_DATA, "rank",
                                   paste0(s$id, "-", s$scope, ".json")))
  }

  # Column formatting hints. `fmt` maps to a formatter in the browser and
  # `dir` says which end of the sort is the interesting one.
  col_meta <- function(key, label, fmt, dir = "desc") {
    list(key = key, label = label, fmt = fmt, dir = dir)
  }
  manifest <- list(
    list(id = "pay", label = "Pay level",
         blurb = "Median and mean base salary, with the tenth and ninetieth percentiles.",
         sort = "median_salary",
         columns = list(col_meta("n", "People", "num"),
                        col_meta("median_salary", "Median", "dollars"),
                        col_meta("mean_salary", "Mean", "dollars"),
                        col_meta("p10", "10th pct", "dollars"),
                        col_meta("p90", "90th pct", "dollars"))),
    list(id = "real-change", label = "Real pay change",
         blurb = "Change in median pay since the first reportable year, after New York inflation.",
         sort = "real_change", sort_dir = "asc",
         columns = list(col_meta("n", "People", "num"),
                        col_meta("first_year", "From", "year"),
                        col_meta("first_nominal", "Then", "dollars"),
                        col_meta("last_nominal", "Now", "dollars"),
                        col_meta("nominal_change", "Nominal", "delta"),
                        col_meta("real_change", "Real", "delta"))),
    list(id = "overtime", label = "Overtime",
         blurb = "Share of total pay that came from overtime.",
         sort = "ot_share_of_pay",
         columns = list(col_meta("n", "People", "num"),
                        col_meta("median_base", "Base", "dollars"),
                        col_meta("median_total_comp", "Total pay", "dollars"),
                        col_meta("ot_share_of_pay", "OT share", "pct"),
                        col_meta("pct_with_ot", "Worked OT", "pct0"))),
    list(id = "compression", label = "Salary compression",
         blurb = "New hires against staff past ten years. A ratio at or above 1.0 means new hires earn more.",
         sort = "compression_ratio",
         columns = list(col_meta("n_new", "New hires", "num"),
                        col_meta("median_new", "They earn", "dollars"),
                        col_meta("n_vet", "10yr+", "num"),
                        col_meta("median_vet", "They earn", "dollars"),
                        col_meta("experience_premium", "Worth of 10 yrs", "dollars_signed"),
                        col_meta("compression_ratio", "Ratio", "ratio"))),
    list(id = "gender", label = "Gender gap",
         blurb = "Estimated from first names. Read the method before citing it.",
         sort = "gap",
         columns = list(col_meta("n", "People", "num"),
                        col_meta("male_mean", "Men", "dollars"),
                        col_meta("female_mean", "Women", "dollars"),
                        col_meta("gap", "Gap", "pct"),
                        col_meta("female_share", "Share women", "pct0"))),
    list(id = "name-origin", label = "Name origin gap",
         blurb = "Pay by whether a first name appears in US birth records. A proxy for national origin, not a neutral category.",
         sort = "gap",
         columns = list(col_meta("common_mean", "Name in records", "dollars"),
                        col_meta("uncommon_mean", "Name not in records", "dollars"),
                        col_meta("gap", "Gap", "pct"),
                        col_meta("uncommon_share", "Share affected", "pct0"))),
    list(id = "tenure", label = "Tenure",
         blurb = "Years at the current agency. Time at a previous agency does not count.",
         sort = "pct_over_20",
         columns = list(col_meta("n", "People", "num"),
                        col_meta("median_tenure", "Median tenure", "years"),
                        col_meta("pct_under_5", "Under 5 yrs", "pct0"),
                        col_meta("pct_over_20", "Over 20 yrs", "pct0"),
                        col_meta("pct_over_25", "Over 25 yrs", "pct0"))),
    list(id = "churn", label = "Churn",
         blurb = "Records marked ceased during the year. Mixes quits, retirements, layoffs and seasonal endings.",
         sort = "separation_rate",
         columns = list(col_meta("active", "Active", "num"),
                        col_meta("ceased", "Ceased", "num"),
                        col_meta("separation_rate", "Churn", "pct")))
  )
  # Record which scopes actually produced a file, so the browser never offers
  # a toggle that leads to a 404.
  for (i in seq_along(manifest)) {
    id <- manifest[[i]]$id
    # I() keeps a single scope as a one-element array rather than letting
    # jsonlite unbox it to a bare string the browser would iterate as chars.
    manifest[[i]]$scopes <- I(unlist(lapply(
      Filter(function(s) s$id == id && !is.null(rank_file(s$data, s$col, s$cols)), sets),
      function(s) s$scope)))
  }
  write_json_file(manifest, file.path(PATH_SITE_DATA, "metrics.json"))

  # Kept flat because they are not per-entity rankings.
  write_json_file(round_cols(as.data.frame(
    a$hourly_by_title %>% filter(fiscal_year == latest, !suppressed) %>%
      arrange(desc(n)) %>%
      transmute(pay_basis, title, n, median_rate, real_median_rate,
                median_hours, median_gross, pct_substantial))),
    file.path(PATH_SITE_DATA, "hourly-titles.json"))
  write_json_file(round_cols(as.data.frame(
    a$headcount_agency %>%
      transmute(agency, fiscal_year, n, n_salaried, n_hourly, n_daily))),
    file.path(PATH_SITE_DATA, "headcount.json"))
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
  export_agencies(a)
  export_downloads(a, prep)
  message("Export complete.")
}
