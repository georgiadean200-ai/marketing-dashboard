#!/usr/bin/env bash
# Builds a throwaway database from the migrations and runs the security test suite.
# Needs a local PostgreSQL superuser connection, e.g. PGURL=postgres://postgres:pw@127.0.0.1:5432
set -euo pipefail
PGURL="${PGURL:-postgres://postgres:testpw@127.0.0.1:5432}"
cd "$(dirname "$0")"
psql "$PGURL/postgres" -qc "drop database if exists studio_dbtest with (force);" -c "create database studio_dbtest;"
for f in tests_local_stubs.sql migrations/*.sql seed.sql; do psql "$PGURL/studio_dbtest" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$PGURL/studio_dbtest" -q -f tests_security.sql | grep -E "PASS|FAIL|passed"
psql "$PGURL/studio_dbtest" -q -f tests_ugc.sql | grep -E "PASS|FAIL|passed"
psql "$PGURL/postgres" -qc "drop database studio_dbtest with (force);"
