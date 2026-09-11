import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://akwinvaacrcpmjgkpjjl.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrd2ludmFhY3JjcG1qZ2twampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzA2NjMsImV4cCI6MjEwMDgwNjY2M30.TeYcJvXBdUVkhbpXDvA_fX-WUnWb9eu5ODptF9K-ehg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
