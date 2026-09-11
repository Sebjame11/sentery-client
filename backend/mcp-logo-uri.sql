-- Run this in Supabase SQL Editor
-- Adds logo_uri to mcp_clients so MCP connections (Claude.ai, ChatGPT, Cursor)
-- can show the the brand icon for the connection.
alter table public.mcp_clients
  add column if not exists logo_uri text;