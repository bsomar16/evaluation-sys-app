-- Three tables that no upstream migration creates.
--
-- On the hosted Supabase project they only ever existed because the
-- browser issued DDL through the `execute_sql` RPC (src/lib/db-auto-migrate.ts).
-- That RPC grants DDL to `anon` and is not applied here, so the tables are
-- created explicitly, from the schema declared in src/lib/expected-db-schema.ts.

CREATE TABLE IF NOT EXISTS public.app_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key varchar(100) NOT NULL UNIQUE,
    value jsonb DEFAULT '{}'::jsonb,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calculation_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type varchar(50) NOT NULL,
    label varchar(100),
    max_points numeric(5,2) DEFAULT 10,
    config jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.evaluation_criteria (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    type varchar(50) NOT NULL,
    calculation_rule_id uuid REFERENCES public.calculation_rules(id) ON DELETE SET NULL,
    choice_option_1_label varchar(255),
    choice_option_2_label varchar(255),
    choice_option_labels text[] DEFAULT '{}',
    role_all boolean DEFAULT true,
    branch_all boolean DEFAULT true,
    department_all boolean DEFAULT true,
    role_ids text[] DEFAULT '{}',
    branch_ids text[] DEFAULT '{}',
    department_ids text[] DEFAULT '{}',
    weight numeric(5,2) DEFAULT 1,
    frequency integer DEFAULT 1,
    frequency_anchor_date date,
    description text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    archived_at timestamp,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_sort ON public.evaluation_criteria(sort_order);
CREATE INDEX IF NOT EXISTS idx_evaluation_criteria_active ON public.evaluation_criteria(is_active);
CREATE INDEX IF NOT EXISTS idx_calculation_rules_type ON public.calculation_rules(type);

-- Columns the app reads on the users table that the base schema does not
-- declare (the hosted project had them, added by hand at some point).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS code varchar(100);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password varchar(255);

-- The hierarchy columns the app selects on branches and departments.
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS parent_branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS child_branches text[] DEFAULT '{}';
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS parent_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS child_departments text[] DEFAULT '{}';

-- The multilingual labels added by the later migrations.
ALTER TABLE public.evaluation_criteria ADD COLUMN IF NOT EXISTS name_ar varchar(255);

-- Columns that no migration ever creates either: on the hosted project they
-- were added by the browser through the `execute_sql` RPC. The audit against
-- src/lib/expected-db-schema.ts is the reference.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamp;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS responses jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.evaluations ADD COLUMN IF NOT EXISTS activity_log jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.training_requests ADD COLUMN IF NOT EXISTS request_details jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.training_requests ADD COLUMN IF NOT EXISTS planning_details jsonb DEFAULT '{}'::jsonb;
