#!/bin/bash
# Installs the CPH Evaluation System schema into a self-hosted PostgreSQL
# database, then applies the Row Level Security policies.
#
#   PGPASSWORD=... ./deploy/sql/install.sh
#
# Connection settings come from the standard libpq environment variables
# (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE). The script is
# idempotent: it can be re-run over an existing database.
#
# Four upstream files are deliberately NOT applied:
#   20260525_create_execute_sql_rpc.sql  grants DDL to anon (RCE)
#   20260526_add_password_hashing.sql   needs pgcrypto, absent on this server
#   20260611_seed_evaluations_with_scores.sql
#                                       invalid SQL ("NOT u.archived_at" on a
#                                       timestamp), and only demo data
#   20260921_enable_rls_all_tables.sql   needs pgcrypto and CREATE ROLE
# The password functions are implemented in PHP instead, and the policies are
# replaced by deploy/sql/10_rls_policies.sql.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

run() {
    echo "--- $1"
    psql -v ON_ERROR_STOP=1 -q -f "$1"
    echo "    ok"
}

echo "Target: host=$PGHOST port=$PGPORT db=$PGDATABASE user=$PGUSER"
echo

run "deploy/sql/00_bootstrap.sql"
run "deploy/sql/01_disable_rls.sql"

# Base schema. The password helpers of the original file (crypt / gen_salt)
# are cut out: pgcrypto is not installed on this server and the API
# implements them in PHP.
awk '
  /PASSWORD HASHING \/ AUTH HELPERS/ { skip = 1 }
  /DATA SEEDING/                     { skip = 0 }
  !skip                               { print }
' supabase/init-schema.sql > "$WORK/base-schema.sql"
run "$WORK/base-schema.sql"

run "deploy/sql/05_missing_tables.sql"

# Migrations in chronological order.
for m in \
    20260525_add_password_column.sql \
    20260525_seed_data.sql \
    20260526_add_description_columns.sql \
    20260602_add_appearance_mode.sql \
    20260608_add_agent_and_user_flags.sql \
    20260612_create_evaluation_periods.sql \
    20260613_add_period_id_to_evaluations.sql \
    20260908_add_criterion_name_ar.sql \
    20260908_add_rejection_reasons.sql
do
    run "supabase/migrations/$m"
done

# The two upstream migrations describe evaluation_periods with a different
# shape, so the column they disagree on is added explicitly.
run "deploy/sql/07_convergence.sql"

for m in \
    20260613_create_evaluation_periods.sql \
    20260613_create_evaluation_period_intervals.sql \
    20260613_improve_evaluation_periods.sql \
    20260615_fix_evaluation_periods_rls.sql
do
    run "supabase/migrations/$m"
done

# Session helpers (they reference the tables, so they come after the schema).
run "deploy/sql/12_session_helpers.sql"

# Authoritative RLS (replaces every policy created above).
run "deploy/sql/10_rls_policies.sql"

echo
echo "=== verification ==="
psql -v ON_ERROR_STOP=1 -q <<'SQL'
SELECT c.relname AS table,
       c.relrowsecurity AS rls,
       c.relforcerowsecurity AS forced,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;
SQL

psql -v ON_ERROR_STOP=1 -q <<'SQL'
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_schema='public') AS columns,
       (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
       (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM roles) AS roles,
       (SELECT count(*) FROM branches) AS branches;
SQL

echo
echo "Done. The API connects as the owner of the tables; FORCE ROW LEVEL"
echo "SECURITY makes the policies above apply to it as well."
