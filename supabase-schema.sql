-- ============================================================================
-- Sentery — Consolidated Supabase Schema
-- ============================================================================
-- Run this in Supabase SQL Editor on a fresh project.
-- This file contains all CREATE TABLE, INDEX, RLS, RPC, and trigger
-- definitions for a complete Sentery deployment.
-- ============================================================================


-- ============================================================================
-- SECTION 1: TABLES
-- ============================================================================

-- 1. Workspaces
CREATE TABLE workspaces (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  company_profile JSONB DEFAULT '{}'
);

-- 2. Workspace Members
CREATE TABLE workspace_members (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
  is_default BOOLEAN DEFAULT false,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

-- 3. Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Prospects
CREATE TABLE prospects (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  title TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  linkedin TEXT,
  tier TEXT DEFAULT 'cold' CHECK (tier IN ('cold', 'warm', 'hot')),
  stage TEXT DEFAULT 'lead' CHECK (stage IN ('lead', 'contacted', 'engaged', 'meeting', 'proposal', 'negotiation', 'won', 'lost')),
  lifecycle_stage TEXT DEFAULT 'lead' CHECK (lifecycle_stage IN ('lead', 'mql', 'sql', 'opportunity', 'client')),
  status TEXT DEFAULT '' CHECK (status IN ('', 'new', 'working', 'nurture', 'disqualified')),
  deal_value NUMERIC DEFAULT 0,
  stage_entered_at DATE,
  angle TEXT,
  notes TEXT,
  outcome_reason TEXT,
  lost_to_competitor TEXT,
  won_against_competitor TEXT,
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',
  countries JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now(),
  industry TEXT,
  lead_source TEXT,
  city TEXT,
  province TEXT,
  expected_close_date DATE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_name TEXT,
  product TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Companies
CREATE TABLE companies (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  company_size TEXT NOT NULL DEFAULT '',
  annual_revenue TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT NOT NULL DEFAULT '',
  company_type TEXT DEFAULT 'prospect' CHECK (company_type IN ('prospect', 'partner', 'client', 'other')),
  tags JSONB NOT NULL DEFAULT '[]'::JSONB,
  custom_fields JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Deals
CREATE TABLE deals (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'lead',
  deal_value NUMERIC DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  close_date DATE,
  deal_type TEXT DEFAULT '',
  owner_id UUID,
  owner_name TEXT DEFAULT '',
  primary_contact_id BIGINT REFERENCES prospects(id) ON DELETE SET NULL,
  primary_contact_name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  associated_call TEXT DEFAULT '',
  closed_lost_reason TEXT DEFAULT '',
  closed_won_reason TEXT DEFAULT '',
  last_contacted TIMESTAMPTZ,
  stage_entered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Touchpoints
CREATE TABLE touchpoints (
  id BIGSERIAL PRIMARY KEY,
  prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE,
  deal_id BIGINT REFERENCES deals(id) ON DELETE CASCADE,
  channel TEXT,
  note TEXT,
  outcome TEXT,
  date DATE DEFAULT current_date,
  email_message_id BIGINT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Email Accounts
CREATE TABLE email_accounts (
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail', 'microsoft')),
  email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT,
  auto_logging BOOLEAN NOT NULL DEFAULT true,
  sync_window_days INTEGER NOT NULL DEFAULT 30,
  history_id TEXT,
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- 9. Email Messages
CREATE TABLE email_messages (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail',
  provider_message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL DEFAULT '',
  to_emails JSONB NOT NULL DEFAULT '[]'::JSONB,
  cc_emails JSONB NOT NULL DEFAULT '[]'::JSONB,
  sent_at TIMESTAMPTZ,
  labels JSONB NOT NULL DEFAULT '[]'::JSONB,
  matched_prospect_ids JSONB NOT NULL DEFAULT '[]'::JSONB,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, provider_message_id)
);

-- 10. Templates
CREATE TABLE templates (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  category TEXT DEFAULT 'Cold Email',
  use_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Sequences
CREATE TABLE sequences (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  steps JSONB DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Notes
CREATE TABLE notes (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 13. Segments
CREATE TABLE segments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  entity TEXT NOT NULL DEFAULT 'contact',
  rules JSONB NOT NULL DEFAULT '{"logic":"ALL","conditions":[]}'::JSONB,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Custom Fields
CREATE TABLE custom_fields (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  options JSONB NOT NULL DEFAULT '[]'::JSONB,
  required BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

-- 15. Tasks
CREATE TABLE tasks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  prospect_id BIGINT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. Calendar Events
CREATE TABLE calendar_events (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT false,
  color TEXT DEFAULT '#4B7B5B',
  linked_prospect_id BIGINT REFERENCES prospects(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 17. Due Diligence Investigations
CREATE TABLE due_diligence_investigations (
  id BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('organization', 'individual')),
  entity_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'researching', 'processing', 'completed', 'failed')),
  overall_risk TEXT CHECK (overall_risk IN ('low', 'medium', 'elevated', 'high')),
  summary TEXT DEFAULT '',
  research_result JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 18. MCP Clients
CREATE TABLE mcp_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT,
  client_name TEXT,
  client_uri TEXT,
  redirect_uris JSONB NOT NULL DEFAULT '[]'::JSONB,
  confidential BOOLEAN NOT NULL DEFAULT false,
  logo_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. MCP Codes
CREATE TABLE mcp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id BIGINT NOT NULL,
  code_challenge TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'sentery:read sentery:write',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. MCP Tokens
CREATE TABLE mcp_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id BIGINT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'sentery:read sentery:write',
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- SECTION 2: INDEXES
-- ============================================================================

-- Prospects
CREATE INDEX prospects_workspace_idx ON prospects (workspace_id);
CREATE INDEX prospects_stage_idx ON prospects (workspace_id, stage);
CREATE INDEX prospects_tier_idx ON prospects (workspace_id, tier);
CREATE INDEX prospects_deal_value_idx ON prospects (workspace_id, deal_value);
CREATE INDEX prospects_created_idx ON prospects (workspace_id, created_at);
CREATE INDEX prospects_updated_idx ON prospects (workspace_id, updated_at);
CREATE INDEX prospects_industry_idx ON prospects (workspace_id, industry);
CREATE INDEX prospects_owner_idx ON prospects (owner_id);
CREATE INDEX prospects_tags_gin ON prospects USING gin (tags);
CREATE INDEX prospects_custom_fields_gin ON prospects USING gin (custom_fields);
CREATE INDEX prospects_countries_gin ON prospects USING gin (countries);

-- Companies
CREATE INDEX companies_workspace_idx ON companies (workspace_id);
CREATE INDEX companies_name_idx ON companies (workspace_id, lower(name));
CREATE INDEX companies_tags_gin ON companies USING gin (tags);

-- Deals
CREATE INDEX idx_deals_workspace ON deals(workspace_id);
CREATE INDEX idx_deals_company ON deals(company_id);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_stage_entered ON deals(stage_entered_at);

-- Touchpoints
CREATE INDEX touchpoints_prospect_idx ON touchpoints (prospect_id);
CREATE INDEX touchpoints_channel_date_idx ON touchpoints (channel, date);
CREATE INDEX touchpoints_email_msg_idx ON touchpoints (prospect_id, email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX idx_touchpoints_deal_id ON touchpoints(deal_id);

-- Email Messages
CREATE INDEX email_messages_workspace_idx ON email_messages (workspace_id);
CREATE INDEX email_messages_thread_idx ON email_messages (workspace_id, thread_id);
CREATE INDEX email_messages_sentat_idx ON email_messages (workspace_id, sent_at DESC);
CREATE INDEX email_messages_from_idx ON email_messages (workspace_id, from_email);
CREATE INDEX email_messages_user_idx ON email_messages (user_id);
CREATE INDEX email_messages_ws_user_idx ON email_messages (workspace_id, user_id);

-- Email Accounts
CREATE UNIQUE INDEX email_accounts_ws_user_uq ON email_accounts (workspace_id, user_id);
CREATE INDEX email_accounts_user_idx ON email_accounts (user_id);

-- Segments
CREATE INDEX segments_workspace_idx ON segments (workspace_id, archived_at);
CREATE INDEX segments_entity_idx ON segments (workspace_id, entity);

-- Custom Fields
CREATE INDEX custom_fields_workspace_idx ON custom_fields (workspace_id);

-- Tasks
CREATE INDEX tasks_prospect_idx ON tasks (prospect_id);
CREATE INDEX tasks_workspace_status_idx ON tasks (workspace_id, status, due_date);

-- Calendar Events
CREATE INDEX idx_calendar_events_workspace ON calendar_events(workspace_id);
CREATE INDEX idx_calendar_events_dates ON calendar_events(starts_at, ends_at);

-- Due Diligence
CREATE INDEX idx_dd_inv_workspace ON due_diligence_investigations(workspace_id);
CREATE INDEX idx_dd_inv_user ON due_diligence_investigations(user_id);
CREATE INDEX idx_dd_inv_created ON due_diligence_investigations(created_at DESC);

-- MCP
CREATE INDEX mcp_codes_hash_idx ON mcp_codes (code_hash);
CREATE INDEX mcp_tokens_access_hash_idx ON mcp_tokens (access_hash);
CREATE INDEX mcp_tokens_refresh_hash_idx ON mcp_tokens (refresh_hash);


-- ============================================================================
-- SECTION 3: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE due_diligence_investigations ENABLE ROW LEVEL SECURITY;

-- Workspaces
CREATE POLICY "Users can view their workspaces" ON workspaces
  FOR SELECT USING (
    id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins can update their workspace" ON workspaces
  FOR UPDATE USING (
    id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Workspace Members
CREATE POLICY "Members can view workspace members" ON workspace_members
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Profiles
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Prospects
CREATE POLICY "Members can view prospects" ON prospects
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Members can insert prospects" ON prospects
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Members can update prospects" ON prospects
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "Members can delete prospects" ON prospects
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Companies
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "companies_write" ON companies
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Deals
CREATE POLICY "workspace member access" ON deals
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Touchpoints
CREATE POLICY "Members can view touchpoints" ON touchpoints
  FOR SELECT USING (
    prospect_id IN (SELECT id FROM prospects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );
CREATE POLICY "Members can insert touchpoints" ON touchpoints
  FOR INSERT WITH CHECK (
    prospect_id IN (SELECT id FROM prospects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );
CREATE POLICY "Members can update touchpoints" ON touchpoints
  FOR UPDATE USING (
    prospect_id IN (SELECT id FROM prospects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );
CREATE POLICY "Members can delete touchpoints" ON touchpoints
  FOR DELETE USING (
    prospect_id IN (SELECT id FROM prospects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

-- Templates
CREATE POLICY "Members can view templates" ON templates
  FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can insert templates" ON templates
  FOR INSERT WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update templates" ON templates
  FOR UPDATE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can delete templates" ON templates
  FOR DELETE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- Sequences
CREATE POLICY "Members can view sequences" ON sequences
  FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can insert sequences" ON sequences
  FOR INSERT WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update sequences" ON sequences
  FOR UPDATE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can delete sequences" ON sequences
  FOR DELETE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- Notes
CREATE POLICY "Members can view notes" ON notes
  FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can insert notes" ON notes
  FOR INSERT WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update notes" ON notes
  FOR UPDATE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can delete notes" ON notes
  FOR DELETE USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- Segments
CREATE POLICY "segments_select" ON segments
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "segments_write" ON segments
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Custom Fields
CREATE POLICY "custom_fields_select" ON custom_fields
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "custom_fields_write" ON custom_fields
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Tasks
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
CREATE POLICY "tasks_write" ON tasks
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  ) WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Calendar Events
CREATE POLICY "workspace member access" ON calendar_events
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Due Diligence Investigations
CREATE POLICY "workspace member access" ON due_diligence_investigations
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Note: email_accounts, email_messages, mcp_clients, mcp_codes, mcp_tokens
-- are accessed via the backend service role (no RLS policies).


-- ============================================================================
-- SECTION 4: TRIGGERS
-- ============================================================================

-- Auto-create profile + workspace on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  ws_id BIGINT;
  user_display_name TEXT;
BEGIN
  user_display_name := COALESCE(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));

  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, user_display_name);

  INSERT INTO public.workspaces (name, slug)
  VALUES (user_display_name || ' Workspace', 'ws-' || substr(md5(new.id::text), 1, 12))
  RETURNING id INTO ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (ws_id, new.id, 'admin');

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-set updated_at on prospects
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prospects_set_updated_at ON prospects;
CREATE TRIGGER prospects_set_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-set first member as admin on workspace_members insert
CREATE OR REPLACE FUNCTION public.set_first_member_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_member_count INT;
BEGIN
  SELECT count(*) INTO v_member_count FROM public.workspace_members
  WHERE workspace_id = NEW.workspace_id;
  IF v_member_count = 0 THEN
    NEW.role := 'admin';
  ELSE
    IF NEW.role IS NULL THEN
      NEW.role := 'member';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_first_member_admin ON workspace_members;
CREATE TRIGGER trg_set_first_member_admin
  BEFORE INSERT ON workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_first_member_admin();

-- Ensure only one default workspace per user
CREATE OR REPLACE FUNCTION public.set_single_default_workspace()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.workspace_members
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND workspace_id != NEW.workspace_id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_single_default ON workspace_members;
CREATE TRIGGER trg_single_default
  BEFORE INSERT OR UPDATE ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.set_single_default_workspace();

-- Due diligence updated_at trigger
CREATE OR REPLACE FUNCTION public.dd_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dd_inv_updated_at ON due_diligence_investigations;
CREATE TRIGGER trg_dd_inv_updated_at
  BEFORE UPDATE ON due_diligence_investigations
  FOR EACH ROW EXECUTE FUNCTION public.dd_set_updated_at();


-- ============================================================================
-- SECTION 5: RPC FUNCTIONS
-- ============================================================================

-- segment_query — run compiled segment SQL (backend service_role only)
CREATE OR REPLACE FUNCTION public.segment_query(query TEXT, params JSONB DEFAULT '[]'::JSONB)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q TEXT := query;
  i INT;
  v JSONB;
BEGIN
  FOR i IN REVERSE jsonb_array_length(params) .. 1 LOOP
    v := params->(i - 1);
    IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
      q := replace(q, '$' || i::text, 'NULL');
    ELSIF jsonb_typeof(v) = 'string' THEN
      q := replace(q, '$' || i::text, quote_literal(v #>> '{}'));
    ELSIF jsonb_typeof(v) = 'number' THEN
      q := replace(q, '$' || i::text, v #>> '{}');
    ELSIF jsonb_typeof(v) = 'boolean' THEN
      q := replace(q, '$' || i::text, CASE WHEN v #>> '{}' = 'true' THEN 'true' ELSE 'false' END);
    ELSIF jsonb_typeof(v) = 'array' THEN
      q := replace(q, '$' || i::text,
        'ARRAY[' || (SELECT string_agg(quote_literal(x), ',' ORDER BY ord) FROM jsonb_array_elements_text(v) WITH ORDINALITY AS t(x, ord)) || ']');
    ELSE
      q := replace(q, '$' || i::text, 'NULL');
    END IF;
  END LOOP;
  RETURN QUERY EXECUTE 'SELECT to_jsonb(t) FROM (' || q || ') t';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.segment_query(TEXT, JSONB) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.segment_query(TEXT, JSONB) TO service_role;

-- Create deal
CREATE OR REPLACE FUNCTION public.create_deal(
  p_workspace_id BIGINT,
  p_company_id BIGINT,
  p_name TEXT,
  p_stage TEXT DEFAULT 'lead',
  p_deal_value NUMERIC DEFAULT 0,
  p_priority TEXT DEFAULT 'medium',
  p_close_date DATE DEFAULT NULL,
  p_deal_type TEXT DEFAULT '',
  p_owner_id UUID DEFAULT NULL,
  p_owner_name TEXT DEFAULT '',
  p_primary_contact_id BIGINT DEFAULT NULL,
  p_primary_contact_name TEXT DEFAULT '',
  p_notes TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deal JSONB;
BEGIN
  INSERT INTO public.deals (
    workspace_id, company_id, name, stage, deal_value, priority,
    close_date, deal_type, owner_id, owner_name,
    primary_contact_id, primary_contact_name, notes
  ) VALUES (
    p_workspace_id, p_company_id, p_name, p_stage, p_deal_value, p_priority,
    p_close_date, p_deal_type, p_owner_id, p_owner_name,
    p_primary_contact_id, p_primary_contact_name, p_notes
  ) RETURNING to_jsonb(*) INTO v_deal;
  RETURN v_deal;
END;
$$;

-- Update deal
CREATE OR REPLACE FUNCTION public.update_deal(
  p_deal_id BIGINT,
  p_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deal JSONB;
BEGIN
  UPDATE public.deals SET
    name = COALESCE(p_updates->>'name', name),
    stage = COALESCE(p_updates->>'stage', stage),
    deal_value = COALESCE((p_updates->>'deal_value')::NUMERIC, deal_value),
    priority = COALESCE(p_updates->>'priority', priority),
    close_date = COALESCE((p_updates->>'close_date')::DATE, close_date),
    deal_type = COALESCE(p_updates->>'deal_type', deal_type),
    owner_id = COALESCE((p_updates->>'owner_id')::UUID, owner_id),
    owner_name = COALESCE(p_updates->>'owner_name', owner_name),
    primary_contact_id = COALESCE((p_updates->>'primary_contact_id')::BIGINT, primary_contact_id),
    primary_contact_name = COALESCE(p_updates->>'primary_contact_name', primary_contact_name),
    notes = COALESCE(p_updates->>'notes', notes),
    updated_at = now()
  WHERE id = p_deal_id
  RETURNING to_jsonb(*) INTO v_deal;
  RETURN v_deal;
END;
$$;

-- Delete deal
CREATE OR REPLACE FUNCTION public.delete_deal(p_deal_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.deals WHERE id = p_deal_id;
  RETURN '{"ok":true}'::JSONB;
END;
$$;

-- Get deals for workspace
CREATE OR REPLACE FUNCTION public.get_deals(p_workspace_id BIGINT)
RETURNS SETOF JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT to_jsonb(d.*) FROM public.deals d WHERE d.workspace_id = p_workspace_id ORDER BY d.created_at DESC;
$$;

-- Update company profile (bypasses RLS)
CREATE OR REPLACE FUNCTION public.update_company_profile(p_workspace_id BIGINT, p_profile JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE workspaces SET company_profile = p_profile WHERE id = p_workspace_id RETURNING company_profile INTO v_result;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_company_profile(BIGINT, JSONB) TO authenticated;

-- Get workspace members with avatars
DROP FUNCTION IF EXISTS public.get_workspace_members(BIGINT);
CREATE OR REPLACE FUNCTION public.get_workspace_members(ws_id BIGINT)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  avatar_url TEXT,
  is_default BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    wm.user_id,
    u.email,
    COALESCE(p.display_name, u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)) AS full_name,
    wm.role,
    p.avatar_url,
    COALESCE(wm.is_default, false) AS is_default,
    wm.created_at
  FROM public.workspace_members wm
  JOIN auth.users u ON u.id = wm.user_id
  LEFT JOIN public.profiles p ON p.id = wm.user_id
  WHERE wm.workspace_id = ws_id
  ORDER BY wm.created_at ASC;
$$;

-- Leave workspace (self-removal)
CREATE OR REPLACE FUNCTION public.leave_workspace(ws_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  v_admin_count INT;
BEGIN
  SELECT role INTO v_role FROM public.workspace_members
  WHERE workspace_id = ws_id AND user_id = v_user;
  IF v_role IS NULL THEN
    RETURN '{"error":"You are not a member of this workspace"}'::JSONB;
  END IF;

  IF v_role = 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM public.workspace_members
    WHERE workspace_id = ws_id AND role = 'admin' AND user_id != v_user;
    IF v_admin_count = 0 THEN
      IF EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ws_id AND user_id != v_user) THEN
        RETURN '{"error":"You are the last admin. Transfer admin role before leaving."}'::JSONB;
      END IF;
    END IF;
  END IF;

  DELETE FROM public.workspace_members WHERE workspace_id = ws_id AND user_id = v_user;
  RETURN '{"ok":true}'::JSONB;
END;
$$;

-- Remove member (admin only)
CREATE OR REPLACE FUNCTION public.remove_member(ws_id BIGINT, target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.workspace_members
  WHERE workspace_id = ws_id AND user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RETURN '{"error":"Only admins can remove members"}'::JSONB;
  END IF;

  IF target_user_id = v_caller THEN
    RETURN '{"error":"Use Leave Workspace to remove yourself"}'::JSONB;
  END IF;

  SELECT role INTO v_target_role FROM public.workspace_members
  WHERE workspace_id = ws_id AND user_id = target_user_id;
  IF v_target_role IS NULL THEN
    RETURN '{"error":"User is not a member"}'::JSONB;
  END IF;

  DELETE FROM public.workspace_members WHERE workspace_id = ws_id AND user_id = target_user_id;
  RETURN '{"ok":true}'::JSONB;
END;
$$;

-- Delete workspace (admin only)
CREATE OR REPLACE FUNCTION public.delete_workspace(ws_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.workspace_members
  WHERE workspace_id = ws_id AND user_id = v_caller;
  IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
    RETURN '{"error":"Only admins can delete the workspace"}'::JSONB;
  END IF;

  DELETE FROM public.workspaces WHERE id = ws_id;
  RETURN '{"ok":true}'::JSONB;
END;
$$;


-- ============================================================================
-- SECTION 6: SEED DATA
-- ============================================================================

-- Preset segments (seeded once per workspace)
INSERT INTO public.segments (workspace_id, name, description, rules, is_preset, created_by)
SELECT w.id, p.name, p.description, p.rules::JSONB, true, null
FROM public.workspaces w
CROSS JOIN (VALUES
  ('New Leads', 'Newly created leads from the last 30 days',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is","value":"lead"},{"field":"created_at","op":"within_days","value":30}]}'),
  ('Hot Leads', 'Hot-tier prospects with an open pipeline',
   '{"logic":"ALL","conditions":[{"field":"tier","op":"is","value":"hot"},{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"}]}'),
  ('High-Value Leads', 'Open deals worth $50K or more',
   '{"logic":"ALL","conditions":[{"field":"deal_value","op":"gte","value":50000},{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"}]}'),
  ('No Contact 7+ Days', 'Active prospects not contacted in over a week',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":7}]}'),
  ('No Contact 14+ Days', 'Active prospects not contacted in over two weeks',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":14}]}'),
  ('No Contact 30+ Days', 'Active prospects not contacted in over a month',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":30}]}'),
  ('Active Opportunities', 'Deals actively moving through the pipeline',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"in","value":["meeting","proposal","negotiation"]},{"field":"deal_value","op":"gt","value":0}]}'),
  ('At-Risk Opportunities', 'Active deals with no contact in 14+ days',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"in","value":["meeting","proposal","negotiation"]},{"field":"last_activity","op":"older_than","value":14}]}'),
  ('Recently Contacted', 'Prospects reached out to in the last week',
   '{"logic":"ALL","conditions":[{"field":"last_activity","op":"within_days","value":7}]}'),
  ('Unresponsive Contacts', 'Email sent but no reply in 7+ days',
   '{"logic":"ALL","conditions":[{"field":"email_count","op":"gt","value":0},{"field":"response_count","op":"eq","value":0},{"field":"last_email","op":"older_than","value":7}]}'),
  ('Overdue Follow-Ups', 'Open deals that need a follow-up now',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is_not","value":"won"},{"field":"stage","op":"is_not","value":"lost"},{"field":"last_activity","op":"older_than","value":5}]}'),
  ('Customers', 'Won deals — your customers',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is","value":"won"}]}'),
  ('Former Customers', 'Lost deals that previously generated revenue',
   '{"logic":"ALL","conditions":[{"field":"stage","op":"is","value":"lost"},{"field":"deal_value","op":"gt","value":0}]}')
) AS p(name, description, rules)
WHERE NOT EXISTS (
  SELECT 1 FROM public.segments s WHERE s.workspace_id = w.id AND s.is_preset = true
);
