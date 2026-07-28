# thepaygap.nyc / prepare
#
# Turns the raw cache into three tidy objects the analysis layer consumes:
#
#   payroll   one row per employee-year, typed, with gender weights,
#             tenure, real dollars and overtime share attached
#   prices    one row per fiscal year: CPI, rent index, ZORI, deflator
#   names_ref one row per first name: sex ratio and whether it is common
#
# Everything here is deterministic. If a number on the site looks wrong,
# it was either decided in 00_config.R or computed in 03_analyze.R.


# ---- Prices ------------------------------------------------------------

# NYC fiscal years run July 1 to June 30, so FY2025 is July 2024 through
# June 2025. The 2020 script pinned to a single November reading of the
# national index, which is wrong on both counts: wrong geography, and a
# point-in-time value standing in for a twelve-month average.
calendar_to_fiscal <- function(year, month) {
  as.integer(year + (month >= FISCAL_YEAR_START_MONTH))
}

prepare_prices <- function() {
  bls <- utils::read.csv(file.path(PATH_RAW, "bls_series.csv"), stringsAsFactors = FALSE)
  bls$fiscal_year <- calendar_to_fiscal(bls$year, bls$month)

  fy <- bls %>%
    filter(fiscal_year %in% YEARS) %>%
    group_by(series_id, fiscal_year) %>%
    summarise(value = mean(value), months = n(), .groups = "drop")

  # A fiscal year missing months would produce an average that is not
  # comparable to a full year. Warn rather than silently publish it.
  short <- fy %>% filter(months < 12, fiscal_year < max(YEARS))
  if (nrow(short) > 0) {
    warning("Incomplete fiscal years in BLS data: ",
            paste(unique(short$fiscal_year), collapse = ", "), call. = FALSE)
  }

  prices <- fy %>%
    select(-months) %>%
    mutate(series = ifelse(series_id == CPI_SERIES, "cpi", "rent")) %>%
    select(-series_id) %>%
    pivot_wider(names_from = series, values_from = value)

  # Zillow publishes a wide monthly frame; reshape to fiscal years.
  zori <- data.table::fread(file.path(PATH_RAW, "zori_metro.csv"),
                            showProgress = FALSE) %>%
    as.data.frame()
  zori <- zori[zori$RegionID == ZORI_REGION_ID, ]

  date_cols <- grep("^\\d{4}-\\d{2}-\\d{2}$", names(zori), value = TRUE)
  zori_long <- data.frame(
    date  = as.Date(date_cols),
    value = as.numeric(zori[1, date_cols]),
    stringsAsFactors = FALSE
  )
  zori_long <- zori_long[!is.na(zori_long$value), ]
  zori_long$fiscal_year <- calendar_to_fiscal(
    as.integer(format(zori_long$date, "%Y")),
    as.integer(format(zori_long$date, "%m"))
  )

  zori_fy <- zori_long %>%
    filter(fiscal_year %in% YEARS) %>%
    group_by(fiscal_year) %>%
    summarise(zori = mean(value), months = n(), .groups = "drop") %>%
    filter(months == 12 | fiscal_year == max(YEARS)) %>%
    select(-months)

  base_cpi <- prices$cpi[prices$fiscal_year == BASE_YEAR]
  if (length(base_cpi) != 1) stop("No CPI for BASE_YEAR ", BASE_YEAR)

  prices %>%
    left_join(zori_fy, by = "fiscal_year") %>%
    # Multiply any nominal figure from fiscal year k by its deflator to get
    # BASE_YEAR dollars.
    mutate(deflator = base_cpi / cpi) %>%
    arrange(fiscal_year)
}


# ---- Names -------------------------------------------------------------

# SSA ships one file per birth year, each "Name,Sex,Count". The national
# set and the per-state set share that shape, so one reader handles both.
read_ssa_names <- function() {
  dir   <- ssa_names_path()
  files <- list.files(dir, pattern = "\\.(txt|TXT)$", full.names = TRUE)
  if (length(files) == 0) stop("No SSA name files in ", dir)

  raw <- data.table::rbindlist(lapply(files, function(f) {
    d <- data.table::fread(f, header = FALSE, showProgress = FALSE)
    # State files carry two extra leading columns (state, then year).
    if (ncol(d) == 5L) data.table::setnames(d, c("state", "sex", "year", "name", "count"))
    else               data.table::setnames(d, c("name", "sex", "count"))
    d[, .(name, sex, count)]
  }))

  as.data.frame(raw)
}

prepare_names <- function() {
  raw <- read_ssa_names()

  raw %>%
    mutate(name = toupper(trimws(name))) %>%
    group_by(name, sex) %>%
    summarise(count = sum(count), .groups = "drop") %>%
    pivot_wider(names_from = sex, values_from = count, values_fill = 0) %>%
    rename(female = F, male = M) %>%
    mutate(
      total = male + female,
      # A name has to clear the threshold before we trust its sex ratio.
      # Below it, one or two birth records would swing the weight to 1.0.
      common      = total >= GENDER_MIN_NAME_COUNT,
      male_weight = ifelse(common, male / total, NA_real_),
      female_weight = ifelse(common, female / total, NA_real_)
    ) %>%
    arrange(desc(total))
}


# ---- Payroll -----------------------------------------------------------

# The same job is entered several ways across agencies and years: a leading
# asterisk ("*COOK"), a trailing hyphen ("SERGEANT-"), or a hyphen where
# another record used a space ("SERGEANT-D/A" against "SERGEANT D/A").
# Left alone these split one title's headcount across two entries and, once
# slugified, silently overwrite each other's page.
normalize_title <- function(x) {
  x <- toupper(trimws(x))
  x <- sub("^[*]+\\s*", "", x)        # leading asterisk
  x <- gsub("\\s*-\\s*", " ", x)      # hyphen used as a word separator
  x <- gsub("[^A-Z0-9/&. ]+", " ", x) # stray punctuation
  x <- gsub("\\s+", " ", x)
  trimws(x)
}

normalize_agency <- function(x) {
  x <- toupper(trimws(x))
  x <- gsub("\\s+", " ", x)
  trimws(x)
}

prepare_payroll <- function(prices, names_ref) {
  files <- file.path(PATH_RAW, sprintf("payroll_FY%d.csv.gz", YEARS))
  missing <- files[!file.exists(files)]
  if (length(missing) > 0) stop("Missing payroll cache: ", paste(missing, collapse = ", "))

  raw <- data.table::rbindlist(
    lapply(files, data.table::fread, showProgress = FALSE, colClasses = "character"),
    use.names = TRUE, fill = TRUE
  )

  num <- function(x) suppressWarnings(as.numeric(x))

  d <- as.data.frame(raw) %>%
    transmute(
      fiscal_year = as.integer(fiscal_year),
      agency      = normalize_agency(agency_name),
      title       = normalize_title(title_description),
      # Payroll first names occasionally carry a trailing middle initial
      # ("MARIA T"). Keep the first whitespace-delimited token so the SSA
      # join does not silently drop them.
      first_name  = toupper(sub("\\s.*$", "", trimws(first_name))),
      borough     = toupper(trimws(work_location_borough)),
      status      = toupper(trimws(leave_status_as_of_june_30)),
      pay_basis   = trimws(pay_basis),
      start_date  = as.Date(substr(agency_start_date, 1, 10)),
      base_salary = num(base_salary),
      regular_hours = num(regular_hours),
      regular_gross = num(regular_gross_paid),
      ot_hours    = num(ot_hours),
      ot_paid     = num(total_ot_paid),
      other_pay   = num(total_other_pay)
    ) %>%
    filter(!is.na(fiscal_year), title != "", agency != "")

  d %>%
    left_join(
      names_ref %>% select(name, male_weight, female_weight, name_common = common),
      by = c("first_name" = "name")
    ) %>%
    left_join(prices %>% select(fiscal_year, deflator), by = "fiscal_year") %>%
    mutate(
      # A name absent from SSA entirely is uncommon for the same reason a
      # name below the count threshold is: it is rare in US birth records.
      name_common = ifelse(is.na(name_common), FALSE, name_common),
      gender_known = !is.na(male_weight),

      # Tenure as of the last day of the fiscal year.
      fy_end = as.Date(sprintf("%d-06-30", fiscal_year)),
      tenure_years = as.numeric(fy_end - start_date) / 365.25,

      total_comp = rowSums(cbind(regular_gross, ot_paid, other_pay), na.rm = TRUE),
      ot_share   = ifelse(total_comp > 0, ot_paid / total_comp, NA_real_),

      real_salary    = base_salary * deflator,
      real_total_comp = total_comp * deflator,
      real_ot_paid   = ot_paid * deflator
    ) %>%
    # A negative tenure means the start date postdates the fiscal year end,
    # which is a data-entry artifact rather than a real value.
    mutate(tenure_years = ifelse(!is.na(tenure_years) & tenure_years < 0,
                                 NA_real_, tenure_years)) %>%
    select(-fy_end)
}


prepare_all <- function() {
  message("Preparing prices...")
  prices <- prepare_prices()

  message("Preparing names...")
  names_ref <- prepare_names()

  message("Preparing payroll (this takes a minute)...")
  payroll <- prepare_payroll(prices, names_ref)

  message(sprintf("  %s employee-years, %d titles, %d agencies",
                  format(nrow(payroll), big.mark = ","),
                  length(unique(payroll$title)),
                  length(unique(payroll$agency))))
  message(sprintf("  name matched: %.1f%%", 100 * mean(payroll$gender_known)))

  list(payroll = payroll, prices = prices, names_ref = names_ref)
}
