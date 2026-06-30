import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rstuapmplhviybvhkoqq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzdHVhcG1wbGh2aXlidmhrb3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDA4NDQsImV4cCI6MjA5ODQxNjg0NH0.U2rnB0ryVQEgdsg4rsqJi8fLz1ym3tswRaN7cMlbiew';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
