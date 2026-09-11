-- Workspace roles migration
-- Run this in Supabase SQL Editor

-- 1. Ensure role column has proper default
ALTER TABLE public.workspace_members ALTER COLUMN role SET DEFAULT 'member';

-- 2. Update existing members: first member of each workspace becomes admin
UPDATE public.workspace_members wm
SET role = 'admin'
WHERE wm.created_at = (
    SELECT MIN(wm2.created_at)
    FROM public.workspace_members wm2
    WHERE wm2.workspace_id = wm.workspace_id
)
AND wm.role IS NULL;

-- 3. Set remaining NULL roles to 'member'
UPDATE public.workspace_members SET role = 'member' WHERE role IS NULL;

-- 4. Function to leave workspace (self-removal)
CREATE OR REPLACE FUNCTION public.leave_workspace(ws_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_role text;
    v_admin_count int;
BEGIN
    -- Check user is a member
    SELECT role INTO v_role FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = v_user;
    IF v_role IS NULL THEN
        RETURN '{"error":"You are not a member of this workspace"}'::jsonb;
    END IF;

    -- Check if user is the last admin
    IF v_role = 'admin' THEN
        SELECT count(*) INTO v_admin_count FROM public.workspace_members
        WHERE workspace_id = ws_id AND role = 'admin' AND user_id != v_user;
        IF v_admin_count = 0 THEN
            -- Check if there are other members
            IF EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = ws_id AND user_id != v_user) THEN
                RETURN '{"error":"You are the last admin. Transfer admin role before leaving."}'::jsonb;
            END IF;
        END IF;
    END IF;

    -- Remove the member
    DELETE FROM public.workspace_members WHERE workspace_id = ws_id AND user_id = v_user;
    RETURN '{"ok":true}'::jsonb;
END;
$$;

-- 5. Function to remove a member (admin only)
CREATE OR REPLACE FUNCTION public.remove_member(ws_id bigint, target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_role text;
    v_target_role text;
BEGIN
    -- Check caller is admin
    SELECT role INTO v_caller_role FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = v_caller;
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        RETURN '{"error":"Only admins can remove members"}'::jsonb;
    END IF;

    -- Cannot remove yourself (use leave instead)
    IF target_user_id = v_caller THEN
        RETURN '{"error":"Use Leave Workspace to remove yourself"}'::jsonb;
    END IF;

    -- Check target is a member
    SELECT role INTO v_target_role FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = target_user_id;
    IF v_target_role IS NULL THEN
        RETURN '{"error":"User is not a member"}'::jsonb;
    END IF;

    -- Remove the member
    DELETE FROM public.workspace_members WHERE workspace_id = ws_id AND user_id = target_user_id;
    RETURN '{"ok":true}'::jsonb;
END;
$$;

-- 6. Function to delete workspace (admin only, last admin check)
CREATE OR REPLACE FUNCTION public.delete_workspace(ws_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_caller_role text;
BEGIN
    -- Check caller is admin
    SELECT role INTO v_caller_role FROM public.workspace_members
    WHERE workspace_id = ws_id AND user_id = v_caller;
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        RETURN '{"error":"Only admins can delete the workspace"}'::jsonb;
    END IF;

    -- Delete workspace (cascade will handle members, prospects, companies, etc.)
    DELETE FROM public.workspaces WHERE id = ws_id;
    RETURN '{"ok":true}'::jsonb;
END;
$$;

-- 7. Trigger to auto-set first member as admin when workspace is created
CREATE OR REPLACE FUNCTION public.set_first_member_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member_count int;
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

DROP TRIGGER IF EXISTS trg_set_first_member_admin ON public.workspace_members;
CREATE TRIGGER trg_set_first_member_admin
    BEFORE INSERT ON public.workspace_members
    FOR EACH ROW
    EXECUTE FUNCTION public.set_first_member_admin();
