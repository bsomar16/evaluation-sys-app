#!/bin/bash
# Installs the CPH Evaluation System schema into a self-hosted PostgreSQL
# database, then applies the Row Level Security policies.
#
#   PGPASSWORD=... ./deploy/sql/install.sh
#
# Connection settings come from the standard libpq environment variables
# (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE). The script is
# idempotent: it can be re-run over an existing database.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"

run() {
    echo "--- $1"
    psql -v ON_ERROR_STOP=1 -q -f "$1"
    echo "    ok"
}

echo "Target: host=$PGHOST port=$PGPORT db=$PGDATABASE user=$PGUSER"
echo

run "deploy/sql/00_roles.sql"

# Base schema. Both files are idempotent (CREATE TABLE IF NOT EXISTS /
# ON CONFLICT DO NOTHING); init-schema.sql carries the widest column set.
run "supabase/init-schema.sql"
run "supabase/migrations/20260524_init_schema.sql"

# Migrations in chronological order.
# 20260525_create_execute_sql_rpc.sql is deliberately NOT applied: it grants
# DDL to anon and is the upstream remote-code-execution hole.
for m in \
    20260525_add_password_column.sql \
    20260525_seed_data.sql \
    20260526_add_description_columns.sql \
    20260526_add_password_hashing.sql \
    20260602_add_appearance_mode.sql \
    20260608_add_agent_and_user_flags.sql \
    20260611_seed_evaluations_with_scores.sql \
    20260612_create_evaluation_periods.sql \
    20260613_add_period_id_to_evaluations.sql \
    20260613_create_evaluation_periods.sql \
    20260613_create_evaluation_period_intervals.sql \
    20260613_improve_evaluation_periods.sql \
    20260615_fix_evaluation_periods_rls.sql \
    20260908_add_criterion_name_ar.sql \
    20260908_add_rejection_reasons.sql \
    20260921_enable_rls_all_tables.sql
do
    run "supabase/migrations/$m"
done

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
SQL

echo
echo "Done. The API connects with SET ROLE app_api; the RLS policies above"
echo "enforce the per-branch visibility rules."
