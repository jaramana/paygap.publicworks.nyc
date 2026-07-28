# thepaygap.nyc / analysis
#
# One function per theme. Each takes the prepared payroll and returns a tidy
# frame. No file I/O here and no formatting: numbers stay numbers so the
# export layer can write both JSON and machine-readable CSV from the same
# object. Formatting happens in the browser.


# ---- Shared helpers ----------------------------------------------------

# The salaried, active workforce. Every headline figure uses this population
# so the numbers on different pages are comparable to each other.
salaried <- function(payroll) {
  payroll %>%
    filter(pay_basis == PAY_BASIS_SALARIED,
           status == ACTIVE_STATUS,
           !is.na(base_salary), base_salary > 0)
}

# weighted.mean returns NaN when every weight is zero, which happens for any
# group where no first name matched SSA. Return NA so it suppresses cleanly
# rather than propagating NaN into the JSON.
wmean <- function(x, w) {
  keep <- !is.na(x) & !is.na(w)
  if (!any(keep) || sum(w[keep]) == 0) return(NA_real_)
  stats::weighted.mean(x[keep], w[keep])
}

# The conventional pay gap: how much less the lower-paid group earns as a
# share of the higher-paid group's pay. The 2020 script used (a-b)/(a+b),
# which is a different quantity and roughly half the size.
pay_gap <- function(higher, lower) {
  ifelse(is.na(higher) | is.na(lower) | higher <= 0, NA_real_,
         (higher - lower) / higher)
}

# Groups below MIN_GROUP_N get their statistics blanked but keep their row,
# so a consumer can tell "too small to report" from "not in the data".
suppress_small <- function(df, cols, n_col = "n", min_n = MIN_GROUP_N) {
  small <- df[[n_col]] < min_n
  df$suppressed <- small
  for (cl in cols) df[[cl]][small] <- NA_real_
  df
}

salary_percentiles <- function(x) {
  q <- stats::quantile(x, c(0.1, 0.25, 0.5, 0.75, 0.9), na.rm = TRUE, names = FALSE)
  list(p10 = q[1], p25 = q[2], median = q[3], p75 = q[4], p90 = q[5])
}


# ---- 2A. Real wages against inflation and rent -------------------------

# An index series for one grouping (citywide, agency or title): median pay
# each year in nominal dollars, alongside CPI, rent and ZORI, all set to 100
# in INDEX_YEAR. This generalizes the chart Allen built by hand for the
# Emergency Preparedness Specialist title.
real_wage_series <- function(payroll, prices, group_col = NULL) {
  d <- salaried(payroll)

  grouped <- if (is.null(group_col)) {
    d %>% group_by(fiscal_year)
  } else {
    d %>% group_by(across(all_of(group_col)), fiscal_year)
  }

  wages <- grouped %>%
    summarise(
      n              = n(),
      median_salary  = stats::median(base_salary, na.rm = TRUE),
      mean_salary    = mean(base_salary, na.rm = TRUE),
      real_median    = stats::median(real_salary, na.rm = TRUE),
      real_mean      = mean(real_salary, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    suppress_small(c("median_salary", "mean_salary", "real_median", "real_mean"))

  base <- prices %>%
    filter(fiscal_year == INDEX_YEAR) %>%
    slice(1)

  wages %>%
    left_join(prices, by = "fiscal_year") %>%
    mutate(
      cpi_index  = 100 * cpi / base$cpi,
      rent_index = 100 * rent / base$rent
    ) %>%
    group_by(across(all_of(group_col %||% character(0)))) %>%
    # Index each group against its own first reportable year: a title that
    # did not exist in 2014 still gets a meaningful trend line.
    mutate(
      wage_base  = first(median_salary[!is.na(median_salary)]),
      wage_index = 100 * median_salary / wage_base,
      index_year = first(fiscal_year[!is.na(median_salary)])
    ) %>%
    ungroup() %>%
    select(-wage_base)
}

`%||%` <- function(a, b) if (is.null(a)) b else a


# ---- 2B. Title profiles ------------------------------------------------

# The full distribution for every title and year. The mean alone has been
# flattering the data: salary distributions are right-skewed, so the median
# is what an actual jobholder recognizes as "what people like me earn".
title_profiles <- function(payroll) {
  salaried(payroll) %>%
    group_by(title, fiscal_year) %>%
    summarise(
      n       = n(),
      mean_salary = mean(base_salary, na.rm = TRUE),
      p10     = stats::quantile(base_salary, 0.10, na.rm = TRUE, names = FALSE),
      p25     = stats::quantile(base_salary, 0.25, na.rm = TRUE, names = FALSE),
      median_salary = stats::median(base_salary, na.rm = TRUE),
      p75     = stats::quantile(base_salary, 0.75, na.rm = TRUE, names = FALSE),
      p90     = stats::quantile(base_salary, 0.90, na.rm = TRUE, names = FALSE),
      real_median = stats::median(real_salary, na.rm = TRUE),
      mean_ot_share = mean(ot_share, na.rm = TRUE),
      median_tenure = stats::median(tenure_years, na.rm = TRUE),
      n_agencies = n_distinct(agency),
      .groups = "drop"
    ) %>%
    suppress_small(c("mean_salary", "p10", "p25", "median_salary", "p75", "p90",
                     "real_median", "mean_ot_share", "median_tenure"))
}

# Which agencies employ a title, and at what pay. Answers "am I underpaid
# for doing the same job somewhere else in the City?"
title_by_agency <- function(payroll, year = max(YEARS)) {
  salaried(payroll) %>%
    filter(fiscal_year == year) %>%
    group_by(title, agency) %>%
    summarise(
      n = n(),
      median_salary = stats::median(base_salary, na.rm = TRUE),
      mean_salary   = mean(base_salary, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    suppress_small(c("median_salary", "mean_salary"), min_n = 5)
}


# ---- 2C. Overtime dependence -------------------------------------------

# Overtime as a share of what people actually take home, by group and year.
# The question is not who earns the most overtime in total, it is which
# titles cannot reach a livable number without it.
overtime_dependence <- function(payroll, group_col = "title") {
  salaried(payroll) %>%
    filter(!is.na(total_comp), total_comp > 0) %>%
    group_by(across(all_of(group_col)), fiscal_year) %>%
    summarise(
      n = n(),
      median_base       = stats::median(base_salary, na.rm = TRUE),
      median_total_comp = stats::median(total_comp, na.rm = TRUE),
      real_median_total = stats::median(real_total_comp, na.rm = TRUE),
      total_ot_paid     = sum(ot_paid, na.rm = TRUE),
      mean_ot_paid      = mean(ot_paid, na.rm = TRUE),
      median_ot_hours   = stats::median(ot_hours, na.rm = TRUE),
      # Share of the group's total pay that came from overtime.
      ot_share_of_pay   = sum(ot_paid, na.rm = TRUE) / sum(total_comp, na.rm = TRUE),
      # Share of people who worked any overtime at all.
      pct_with_ot       = mean(ot_paid > 0, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    suppress_small(c("median_base", "median_total_comp", "real_median_total",
                     "mean_ot_paid", "median_ot_hours", "ot_share_of_pay",
                     "pct_with_ot"))
}


# ---- 2D. Salary compression --------------------------------------------

# Newly possible: agency_start_date is populated on all but one row.
#
# Compares what a title pays someone hired in the last NEW_HIRE_YEARS against
# someone past VETERAN_YEARS in the same title and year. A ratio near or above
# 1.0 means experience buys nothing, which is the grievance civil servants
# bring to bargaining and which nobody has quantified for NYC.
salary_compression <- function(payroll) {
  d <- salaried(payroll) %>%
    filter(!is.na(tenure_years)) %>%
    mutate(cohort = case_when(
      tenure_years <= NEW_HIRE_YEARS ~ "new_hire",
      tenure_years >= VETERAN_YEARS  ~ "veteran",
      TRUE                           ~ NA_character_
    )) %>%
    filter(!is.na(cohort))

  d %>%
    group_by(title, fiscal_year, cohort) %>%
    summarise(
      n = n(),
      median_salary = stats::median(base_salary, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    pivot_wider(
      names_from  = cohort,
      values_from = c(n, median_salary),
      values_fill = list(n = 0)
    ) %>%
    rename(n_new = n_new_hire, n_vet = n_veteran,
           median_new = median_salary_new_hire,
           median_vet = median_salary_veteran) %>%
    mutate(
      n = n_new + n_vet,
      # Above 1.0, new hires out-earn veterans outright.
      compression_ratio = median_new / median_vet,
      # What a decade-plus of service is worth, in dollars.
      experience_premium = median_vet - median_new
    ) %>%
    # Both cohorts need enough people for the comparison to mean anything.
    mutate(suppressed = n_new < MIN_GROUP_N | n_vet < MIN_GROUP_N) %>%
    mutate(across(c(median_new, median_vet, compression_ratio, experience_premium),
                  ~ ifelse(suppressed, NA_real_, .x)))
}

# Tenure mix per title, for the retirement-wave read.
tenure_distribution <- function(payroll, year = max(YEARS), group_col = "title") {
  salaried(payroll) %>%
    filter(fiscal_year == year, !is.na(tenure_years)) %>%
    mutate(band = cut(tenure_years, breaks = TENURE_BREAKS,
                      labels = TENURE_LABELS, right = FALSE)) %>%
    group_by(across(all_of(group_col)), band) %>%
    summarise(n = n(), .groups = "drop") %>%
    group_by(across(all_of(group_col))) %>%
    mutate(total = sum(n), share = n / total) %>%
    ungroup()
}


# ---- 2E. Hourly and day-rate workers -----------------------------------

# The 2020 analysis filtered to "per Annum" and discarded 2.7M rows: crossing
# guards, seasonal parks staff, per-diem nurses, election workers. They are
# the most precarious people on the City payroll and the site has never shown
# them. base_salary here is a rate, not an annual figure, so it must never be
# averaged together with the salaried population.

# Drops rows whose stated rate is a bookkeeping placeholder rather than a
# wage. See MIN_CREDIBLE_HOURLY_RATE in 00_config.R for why this matters.
credible_rate <- function(d) {
  d %>% filter(base_salary >= MIN_CREDIBLE_HOURLY_RATE,
               base_salary <= MAX_CREDIBLE_HOURLY_RATE)
}

hourly_workers <- function(payroll, prices) {
  d <- payroll %>%
    filter(pay_basis %in% c(PAY_BASIS_HOURLY, PAY_BASIS_DAILY),
           status == ACTIVE_STATUS,
           !is.na(base_salary), base_salary > 0) %>%
    credible_rate()

  d %>%
    group_by(pay_basis, title, fiscal_year) %>%
    summarise(
      n = n(),
      median_rate      = stats::median(base_salary, na.rm = TRUE),
      real_median_rate = stats::median(base_salary * deflator, na.rm = TRUE),
      median_hours     = stats::median(regular_hours, na.rm = TRUE),
      median_gross     = stats::median(regular_gross, na.rm = TRUE),
      real_median_gross = stats::median(regular_gross * deflator, na.rm = TRUE),
      # Only annualize where someone actually worked enough hours for an
      # annual figure to describe their year. A crossing guard who worked
      # 40 hours does not hold a "$X per year" job.
      pct_substantial  = mean(regular_hours >= HOURLY_MIN_HOURS, na.rm = TRUE),
      .groups = "drop"
    ) %>%
    suppress_small(c("median_rate", "real_median_rate", "median_hours",
                     "median_gross", "real_median_gross", "pct_substantial"))
}

# How the hourly floor has moved against inflation and rent. The comparison
# that matters here is against the NYC minimum wage, not against other
# City salaries.
#
# Reports the whole hourly roster and the continuously-employed subset side
# by side, because they are different populations telling different stories:
# most people on the hourly roster are intermittent, and a median taken
# across all of them describes nobody.
hourly_summary <- function(payroll, prices) {
  all_hourly <- payroll %>%
    filter(pay_basis == PAY_BASIS_HOURLY, status == ACTIVE_STATUS,
           !is.na(base_salary), base_salary > 0)

  counts <- all_hourly %>%
    group_by(fiscal_year) %>%
    summarise(
      n_roster      = n(),
      n_placeholder = sum(base_salary < MIN_CREDIBLE_HOURLY_RATE),
      n_zero_hours  = sum(regular_hours == 0, na.rm = TRUE),
      .groups = "drop"
    )

  rated <- all_hourly %>% credible_rate()

  rates <- rated %>%
    group_by(fiscal_year) %>%
    summarise(
      n = n(),
      p10 = stats::quantile(base_salary, 0.10, na.rm = TRUE, names = FALSE),
      median_rate = stats::median(base_salary, na.rm = TRUE),
      p90 = stats::quantile(base_salary, 0.90, na.rm = TRUE, names = FALSE),
      real_median_rate = stats::median(base_salary * deflator, na.rm = TRUE),
      .groups = "drop"
    )

  # Those who worked enough hours that an annual figure describes their year.
  substantial <- rated %>%
    filter(regular_hours >= HOURLY_MIN_HOURS) %>%
    group_by(fiscal_year) %>%
    summarise(
      n_substantial          = n(),
      median_rate_substantial = stats::median(base_salary, na.rm = TRUE),
      real_median_rate_substantial = stats::median(base_salary * deflator, na.rm = TRUE),
      median_gross           = stats::median(regular_gross, na.rm = TRUE),
      real_median_gross      = stats::median(regular_gross * deflator, na.rm = TRUE),
      median_hours           = stats::median(regular_hours, na.rm = TRUE),
      .groups = "drop"
    )

  counts %>%
    left_join(rates, by = "fiscal_year") %>%
    left_join(substantial, by = "fiscal_year") %>%
    mutate(pct_substantial = n_substantial / n_roster) %>%
    left_join(prices, by = "fiscal_year")
}


# ---- 2F. Gender gap, decomposed ----------------------------------------

# The naive citywide gap mixes two different problems: women paid less for
# the same title, and women concentrated in lower-paid titles. They call for
# different remedies, so the site should not report them as one number.
#
# Shift-share decomposition, using each title's share of the female workforce
# against its share of the male workforce:
#
#   within  = sum over titles of (female share of title) x (gap inside title)
#   between = the remainder, which is what occupational segregation costs
gender_gap <- function(payroll, group_col = NULL) {
  d <- salaried(payroll) %>% filter(gender_known)

  grouped <- if (is.null(group_col)) {
    d %>% group_by(fiscal_year)
  } else {
    d %>% group_by(across(all_of(group_col)), fiscal_year)
  }

  grouped %>%
    summarise(
      n            = n(),
      n_matched    = n(),
      mean_salary  = mean(base_salary, na.rm = TRUE),
      male_mean    = wmean(base_salary, male_weight),
      female_mean  = wmean(base_salary, female_weight),
      male_n       = sum(male_weight, na.rm = TRUE),
      female_n     = sum(female_weight, na.rm = TRUE),
      real_male_mean   = wmean(real_salary, male_weight),
      real_female_mean = wmean(real_salary, female_weight),
      .groups = "drop"
    ) %>%
    mutate(
      gap        = pay_gap(male_mean, female_mean),
      gap_dollars = male_mean - female_mean,
      female_share = female_n / (male_n + female_n)
    ) %>%
    suppress_small(c("mean_salary", "male_mean", "female_mean", "gap",
                     "gap_dollars", "female_share", "real_male_mean",
                     "real_female_mean"))
}

gender_decomposition <- function(payroll) {
  d <- salaried(payroll) %>% filter(gender_known)

  by_title <- d %>%
    group_by(fiscal_year, title) %>%
    summarise(
      male_n      = sum(male_weight, na.rm = TRUE),
      female_n    = sum(female_weight, na.rm = TRUE),
      male_mean   = wmean(base_salary, male_weight),
      female_mean = wmean(base_salary, female_weight),
      .groups = "drop"
    ) %>%
    filter(male_n > 0, female_n > 0, !is.na(male_mean), !is.na(female_mean))

  by_title %>%
    group_by(fiscal_year) %>%
    mutate(
      male_share_of_men     = male_n / sum(male_n),
      female_share_of_women = female_n / sum(female_n)
    ) %>%
    summarise(
      overall_male   = sum(male_share_of_men * male_mean),
      overall_female = sum(female_share_of_women * female_mean),
      # Hold the distribution across titles fixed at the male one, so the
      # only thing left moving is pay inside each title.
      counterfactual_female = sum(male_share_of_men * female_mean),
      n_titles = n(),
      .groups = "drop"
    ) %>%
    mutate(
      total_gap   = pay_gap(overall_male, overall_female),
      # Same title, different pay.
      within_gap  = pay_gap(overall_male, counterfactual_female),
      # Women concentrated in lower-paid titles.
      between_gap = total_gap - within_gap,
      within_share  = within_gap / total_gap,
      between_share = between_gap / total_gap
    )
}

# What share of the workforce the name proxy can actually speak for. This
# belongs next to every gender figure on the site.
gender_coverage <- function(payroll) {
  salaried(payroll) %>%
    group_by(fiscal_year) %>%
    summarise(
      n = n(),
      n_matched = sum(gender_known),
      coverage  = mean(gender_known),
      .groups = "drop"
    )
}


# ---- Names outside US birth records ------------------------------------

# The original site called this "uncommon names". It is worth being blunt
# about what it measures: whether an employee's first name appears in US
# birth registrations. It is a proxy for being born outside the US or to
# immigrant parents, so it reads on ethnicity and national origin, not on
# some neutral quality of a name.
name_origin_gap <- function(payroll, group_col = NULL) {
  d <- salaried(payroll)

  grouped <- if (is.null(group_col)) {
    d %>% group_by(fiscal_year)
  } else {
    d %>% group_by(across(all_of(group_col)), fiscal_year)
  }

  grouped %>%
    summarise(
      n = n(),
      n_common   = sum(name_common),
      n_uncommon = sum(!name_common),
      common_mean   = mean(base_salary[name_common], na.rm = TRUE),
      uncommon_mean = mean(base_salary[!name_common], na.rm = TRUE),
      common_median   = stats::median(base_salary[name_common], na.rm = TRUE),
      uncommon_median = stats::median(base_salary[!name_common], na.rm = TRUE),
      .groups = "drop"
    ) %>%
    mutate(
      gap = pay_gap(common_mean, uncommon_mean),
      gap_dollars = common_mean - uncommon_mean,
      uncommon_share = n_uncommon / n
    ) %>%
    mutate(suppressed = n_common < MIN_GROUP_N | n_uncommon < MIN_GROUP_N) %>%
    mutate(across(c(common_mean, uncommon_mean, common_median, uncommon_median,
                    gap, gap_dollars), ~ ifelse(suppressed, NA_real_, .x)))
}


# ---- 2G. Workforce, churn and the retirement wave ----------------------

headcount <- function(payroll, group_col = "agency") {
  payroll %>%
    filter(status == ACTIVE_STATUS) %>%
    group_by(across(all_of(group_col)), fiscal_year) %>%
    summarise(
      n = n(),
      n_salaried = sum(pay_basis == PAY_BASIS_SALARIED),
      n_hourly   = sum(pay_basis == PAY_BASIS_HOURLY),
      n_daily    = sum(pay_basis == PAY_BASIS_DAILY),
      .groups = "drop"
    )
}

# CEASED is the closest thing the payroll table has to a separation record.
# It counts people who left during the year, without saying why, so quits,
# retirements, layoffs and deaths are all mixed together. Treat it as a
# churn signal, not a resignation rate.
separations <- function(payroll, group_col = "agency") {
  payroll %>%
    group_by(across(all_of(group_col)), fiscal_year) %>%
    summarise(
      active  = sum(status == ACTIVE_STATUS),
      ceased  = sum(status == "CEASED"),
      .groups = "drop"
    ) %>%
    mutate(
      n = active + ceased,
      separation_rate = ifelse(n > 0, ceased / n, NA_real_)
    ) %>%
    suppress_small(c("separation_rate"))
}

# Share of a group already past VETERAN_YEARS x2, the rough shape of a
# retirement cliff. Tenure is time at the agency, not time in public service,
# so someone who transferred between agencies reads as newer than they are.
retirement_exposure <- function(payroll, year = max(YEARS), group_col = "title") {
  salaried(payroll) %>%
    filter(fiscal_year == year, !is.na(tenure_years)) %>%
    group_by(across(all_of(group_col))) %>%
    summarise(
      n = n(),
      median_tenure = stats::median(tenure_years, na.rm = TRUE),
      pct_over_20   = mean(tenure_years >= 20),
      pct_over_25   = mean(tenure_years >= 25),
      pct_under_5   = mean(tenure_years < 5),
      .groups = "drop"
    ) %>%
    suppress_small(c("median_tenure", "pct_over_20", "pct_over_25", "pct_under_5"))
}
