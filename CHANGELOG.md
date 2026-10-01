# Changelog

## Unreleased

### Breaking changes

- **PostgreSQL is now required.** SQLite support has been removed. Configure the
  database with `DATABASE_URL` (migrations run automatically at startup); the
  Compose file ships a required `postgres` service. There is no migration tool
  from SQLite data — deploy fresh on PostgreSQL. This is pre-1.0, per our
  backward-compatibility policy. The `DB_PATH` variable and the `secure-db`
  script are gone.

The changelog has moved to the docs: **[docs.openinary.dev/changelog](https://docs.openinary.dev/changelog)**.

You can also see raw releases and diffs on [GitHub Releases](https://github.com/openinary/openinary/releases).
