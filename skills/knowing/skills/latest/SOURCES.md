# Sources

What [scripts/latest.mjs](scripts/latest.mjs) reads, and why some sources are left out. Checked against each provider's documentation and with live requests on 2026-09-28.

## Used

- **arXiv API**, `https://export.arxiv.org/api/query` (Atom), newest first with `sortBy=submittedDate&sortOrder=descending`. The terms ask for "no more than one request every three seconds" on a single connection, which the script keeps. Metadata is CC0. Docs: https://info.arxiv.org/help/api/user-manual.html, https://info.arxiv.org/help/api/tou.html
- **Hacker News, Algolia API**, `https://hn.algolia.com/api/v1/search_by_date` with `numericFilters=created_at_i>…`, stories only, titles only (`typoTolerance=false&restrictSearchableAttributes=title`: without them, typo tolerance matches unrelated authors). 10,000 requests an hour per IP. Docs: https://hn.algolia.com/api
- **GitHub REST search**, `search/repositories` (new repositories created in the window, by stars; a push date is activity, not news) and `search/issues` (created in the window, titles only, by reactions), with the topic as a quoted phrase. Keyless allows 10 searches a minute; when `gh` is installed and logged in, the script uses `gh api -X GET` and the user's 30 a minute. Docs: https://docs.github.com/en/rest/search/search
- **OpenAlex works API** (optional), `https://api.openalex.org/works` with both date bounds (without `to_publication_date`, future-dated records come first). Keyless allows about 100 searches a day; set `OPENALEX_API_KEY` for more. On by default only when the key is set. Docs: https://help.openalex.org/api-reference/works, https://help.openalex.org/api-reference/authentication

## Left out

- **Reddit.** Its robots.txt disallows all crawling, its User Agreement forbids automated collection without written consent, and its Data API terms require an OAuth token. In testing, the public JSON search returned 403 and the RSS feeds 429. There is no permitted keyless route. Reddit threads a user links to can still be read like any page they give you.

  A hosted keyless Firecrawl MCP test on 2026-09-29 returned Reddit URLs and search excerpts, but `scrape` rejected the selected public thread with "we do not support this site". The same thread loaded its post body and visible comments in connected Chrome, even while signed out. This verified a discovery-to-browser route for one thread, not general Firecrawl extraction or complete comment coverage. Search results also included older posts despite a month in the query; their dates need checking before inclusion in a recent window.
- **YouTube.** yt-dlp removed date-sorted search (`ytsearchdate`, PR #15959, February 2026) because YouTube dropped the date filter; what remains is relevance search that needs an external binary scraping each video page.
- **X, LinkedIn, TikTok, Instagram.** No keyless API; the tools that reach them replay browser cookies or resell scraping.

The agent's own web search covers news sites, blogs, and release notes; the script covers what those searches miss or can't date.
