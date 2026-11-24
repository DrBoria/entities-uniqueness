# Changelog

All notable changes to `@md-code/entities-uniqueness` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.0] - 2026-11-24

### Changed

- `collectFiles` now skips emitted `.d.ts` siblings, so generated declaration
  files are no longer scanned as duplicate entities.
- Report theme, tokens and palette are now sourced from the shared internal
  `@md-code/report-shared` module.
