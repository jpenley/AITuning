# Sources

Each endpoint in [scripts/boards.mjs](scripts/boards.mjs) was checked against its vendor's documentation on 2026-09-27, then read live (`greenhouse:stripe`, `lever:palantir`, `ashby:ashby`, 1,087 postings). All three are public, unauthenticated GET endpoints that companies publish for their own careers pages.

- Greenhouse Job Board API (`GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true&pay_transparency=true`; "Job Board data is publicly available, so authentication is not required for any GET endpoints"; `content` arrives entity-escaped; `first_published` and `updated_at` on each job; `pay_transparency=true` adds `pay_input_ranges`, documented for the one-job endpoint and honoured by the list endpoint in live requests on 2026-09-28): https://docs.greenhouse.io/job-board.html
- Lever Postings API (`GET https://api.lever.co/v0/postings/{site}?mode=json`, EU host `api.eu.lever.co`; no authentication for GET; `salaryRange` with `currency`, `interval`, `min`, `max`): https://github.com/lever/postings-api
- Ashby public job posting API (`GET https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=true`; `isListed` false means reachable only by direct link): https://developers.ashbyhq.com/docs/public-job-posting-api

## Freshness checks

Tried on 2026-09-28 against eleven live boards (Greenhouse: stripe, airbnb, figma, databricks, discord; Lever: palantir, spotify; Ashby: ashby, openai, notion, ramp; 3,543 postings), and kept only where the flags were right when read by hand. Idea from gzchenhao/openhire (posting age from the employer's own date, relisting as a signal, and its finding that Greenhouse's `updated_at` is bumped without any change).

- **Kept: age**, from Greenhouse `first_published`, Lever `createdAt`, Ashby `publishedAt`. Flagged past 90 days. Palantir had a London posting from 2009 still open; Databricks' median was 97 days.
- **Kept: pipeline or evergreen wording** in the title or the department/team name. All 179 hits were Databricks postings under "Engineering - Pipeline" teams (median age 474 days against 74 for the rest of the board) plus one titled "Evergreen - FDE Brazil". A "Data Pipeline" team doesn't match.
- **Kept: the same title and location posted again 30 or more days apart.** 17 postings across the boards, including one Databricks role posted in 2022 and again in 2025 under the same requisition, and Stripe's London Customer Success Manager posted in April, June, and September.
- **Dropped: `updated_at` as a sign of life.** On Stripe, Airbnb, and Databricks every posting was updated in the last 7 days.
- **Dropped: evergreen wording in the description.** Boilerplate ("the broadest talent pool", "evergreen pages", "not a general application") matched 141 of Airbnb's 160 postings.
- **Dropped: missing pay where a pay-transparency law requires it.** Stripe shows its US pay ranges on its own careers page but not in the API (279 of its 302 postings in those places would have been flagged), and Spotify writes ranges without a currency symbol. The API can't show that a posting lacks a range.
- **Dropped: several posts under one Greenhouse `internal_job_id`.** They were almost all the same job in several cities or languages.

## Not covered

Job-board sites (LinkedIn, Indeed, national boards) have no public posting API for this and forbid scraping in their terms. How their postings come in is in [SKILL.md](SKILL.md).
