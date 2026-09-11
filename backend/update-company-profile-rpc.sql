-- RPC to update workspace company_profile (bypasses RLS)
CREATE OR REPLACE FUNCTION update_company_profile(p_workspace_id BIGINT, p_profile JSONB)
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

-- Allow authenticated users to call it
GRANT EXECUTE ON FUNCTION update_company_profile(BIGINT, JSONB) TO authenticated;
