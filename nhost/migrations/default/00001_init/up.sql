CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    quota_allowed integer DEFAULT 100,
    quota_used integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.org_members (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL, -- references auth.users in nhost
    role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    UNIQUE(org_id, user_id)
);

CREATE TABLE public.workflows (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workflow_steps (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate')),
    config jsonb DEFAULT '{}'::jsonb,
    "order" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workflow_triggers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('manual', 'webhook', 'scheduled', 'event')),
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.workflow_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.step_runs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    workflow_run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
    step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
    input jsonb,
    output jsonb,
    error text,
    attempt_count integer DEFAULT 0,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
