# The Pay Gap (paygap.publicworks.nyc) / fetch
#
# Downloads every external source into data-raw/ and caches it there.
# Historical fiscal years never change, so a re-run only fetches whatever
# is new. Nothing here transforms data; that is 02_prepare.R's job.


# ---- Payroll -----------------------------------------------------------

# One fiscal year of the Citywide Payroll table, paged out of the Socrata
# API. Returns the cache path.
#
# Socrata caps a single response, so we page with $limit/$offset until a
# page comes back short. Sorting by :id gives a stable page boundary; without
# it, paging can silently skip or duplicate rows.
fetch_payroll_year <- function(year, overwrite = FALSE) {
  dest <- file.path(PATH_RAW, sprintf("payroll_FY%d.csv.gz", year))
  if (file.exists(dest) && !overwrite) {
    message(sprintf("  FY%d cached", year))
    return(dest)
  }

  message(sprintf("  FY%d downloading...", year))
  page_size <- 100000L
  offset    <- 0L
  pages     <- list()

  repeat {
    url <- sprintf(
      "%s/resource/%s.csv?$select=%s&$where=fiscal_year=%d&$order=:id&$limit=%d&$offset=%d",
      SOCRATA_HOST, SOCRATA_DATASET,
      URLencode(paste(PAYROLL_COLUMNS, collapse = ","), reserved = TRUE),
      year, page_size, offset
    )

    page <- data.table::fread(url, showProgress = FALSE, colClasses = "character")
    if (nrow(page) == 0L) break

    pages[[length(pages) + 1L]] <- page
    offset <- offset + nrow(page)
    message(sprintf("    %s rows", format(offset, big.mark = ",")))

    if (nrow(page) < page_size) break
  }

  out <- data.table::rbindlist(pages, use.names = TRUE, fill = TRUE)
  data.table::fwrite(out, dest, compress = "gzip")
  message(sprintf("  FY%d done: %s rows", year, format(nrow(out), big.mark = ",")))
  dest
}

fetch_payroll <- function(years = YEARS, overwrite = FALSE) {
  message("Payroll:")
  invisible(vapply(years, fetch_payroll_year, character(1), overwrite = overwrite))
}


# ---- BLS ---------------------------------------------------------------

# The keyless BLS API allows 10 years per request, so a 2014-2025 window
# needs two calls. Returns a long frame: series_id, year, month, value.
fetch_bls_series <- function(series_ids, start_year, end_year) {
  windows <- split(start_year:end_year, ceiling(seq_len(end_year - start_year + 1) / 10))

  out <- lapply(windows, function(yrs) {
    body <- jsonlite::toJSON(list(
      seriesid  = series_ids,
      startyear = as.character(min(yrs)),
      endyear   = as.character(max(yrs))
    ), auto_unbox = TRUE)

    tmp <- tempfile(fileext = ".json")
    on.exit(unlink(tmp), add = TRUE)

    # curl rather than httr2 to keep the dependency list short.
    status <- system2("curl", c(
      "-s", "--max-time", "60",
      "-X", "POST",
      "-H", shQuote("Content-Type: application/json"),
      "-d", shQuote(as.character(body)),
      "-o", shQuote(tmp),
      shQuote(BLS_API)
    ))
    if (status != 0) stop("BLS request failed (curl exit ", status, ")")

    res <- jsonlite::fromJSON(tmp, simplifyDataFrame = TRUE)
    if (!identical(res$status, "REQUEST_SUCCEEDED")) {
      stop("BLS API: ", paste(res$message, collapse = "; "))
    }

    do.call(rbind, lapply(seq_len(nrow(res$Results$series)), function(i) {
      s <- res$Results$series[i, ]
      d <- s$data[[1]]
      if (is.null(d) || nrow(d) == 0) return(NULL)
      data.frame(
        series_id = s$seriesID,
        year      = as.integer(d$year),
        month     = as.integer(sub("^M", "", d$period)),
        value     = suppressWarnings(as.numeric(d$value)),
        stringsAsFactors = FALSE
      )
    }))
  })

  res <- do.call(rbind, out)
  # BLS returns "-" for months withheld (the 2025 appropriations lapse blanked
  # October). Those become NA above and are dropped here so a missing month
  # never silently reads as zero.
  res <- res[!is.na(res$value) & res$month <= 12, ]
  res[order(res$series_id, res$year, res$month), ]
}

fetch_bls <- function(overwrite = FALSE) {
  dest <- file.path(PATH_RAW, "bls_series.csv")
  if (file.exists(dest) && !overwrite) {
    message("BLS: cached")
    return(dest)
  }
  message("BLS: downloading CPI and rent...")
  # Reach one year before the study period so a fiscal year that starts in
  # July of the prior calendar year still has all twelve months.
  d <- fetch_bls_series(c(CPI_SERIES, RENT_SERIES), min(YEARS) - 1L, max(YEARS))
  utils::write.csv(d, dest, row.names = FALSE)
  message(sprintf("BLS: %d observations", nrow(d)))
  dest
}


# ---- Zillow ------------------------------------------------------------

fetch_zori <- function(overwrite = FALSE) {
  dest <- file.path(PATH_RAW, "zori_metro.csv")
  if (file.exists(dest) && !overwrite) {
    message("ZORI: cached")
    return(dest)
  }
  message("ZORI: downloading...")
  utils::download.file(ZORI_URL, dest, quiet = TRUE, mode = "wb")
  message("ZORI: done")
  dest
}


# ---- SSA names ---------------------------------------------------------

ssa_names_path <- function() {
  file.path(PATH_RAW, if (GENDER_NAMES_SCOPE == "national") "ssa_national" else "ssa_state")
}

# ssa.gov rejects requests that do not look like a browser navigation. A user
# agent alone is not enough; it wants the Referer and Sec-Fetch headers too.
# download.file cannot send those, so this shells out to curl.
fetch_ssa_names <- function(overwrite = FALSE) {
  dir <- ssa_names_path()
  txt <- list.files(dir, pattern = "\\.(txt|TXT)$", full.names = TRUE)

  if (length(txt) > 0 && !overwrite) {
    message(sprintf("SSA names: cached (%d files)", length(txt)))
    return(dir)
  }

  url <- if (GENDER_NAMES_SCOPE == "national") SSA_NATIONAL_URL else SSA_STATE_URL
  zip <- file.path(PATH_RAW, "ssa_names.zip")
  message("SSA names: downloading...")

  status <- system2("curl", c(
    "-s", "--max-time", "180", "--compressed", "-o", shQuote(zip),
    "-H", shQuote("User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"),
    "-H", shQuote("Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    "-H", shQuote("Accept-Language: en-US,en;q=0.9"),
    "-H", shQuote("Referer: https://www.ssa.gov/oact/babynames/limits.html"),
    "-H", shQuote("Sec-Fetch-Dest: document"),
    "-H", shQuote("Sec-Fetch-Mode: navigate"),
    "-H", shQuote("Sec-Fetch-Site: same-origin"),
    shQuote(url)
  ))

  ok <- status == 0 && file.exists(zip) && file.size(zip) > 1e6
  if (!ok) {
    unlink(zip)
    stop(
      "\n\nCould not download SSA baby-name data (ssa.gov may have tightened\n",
      "its bot filtering). Download it by hand, then re-run:\n\n",
      "  1. Open ", url, " in a browser\n",
      "  2. Unzip it into ", normalizePath(dir, mustWork = FALSE), "\n\n",
      call. = FALSE
    )
  }

  utils::unzip(zip, exdir = dir)
  unlink(zip)
  message(sprintf("SSA names: %d year files", length(list.files(dir, pattern = "\\.txt$"))))
  dir
}


# ---- Orchestration -----------------------------------------------------

fetch_all <- function(overwrite = FALSE) {
  dir.create(PATH_RAW, showWarnings = FALSE, recursive = TRUE)
  dir.create(ssa_names_path(), showWarnings = FALSE, recursive = TRUE)

  fetch_payroll(overwrite = overwrite)
  fetch_bls(overwrite = overwrite)
  fetch_zori(overwrite = overwrite)
  fetch_ssa_names()
  invisible(TRUE)
}
