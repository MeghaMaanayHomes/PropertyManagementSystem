-- ==========================================
-- MEGHA MAANAY HOMES - DATABASE SETUP SCRIPT
-- ==========================================
-- Paste this script in the SQL Editor of your Supabase Dashboard:
-- https://supabase.com/dashboard/project/rstuapmplhviybvhkoqq
-- ==========================================

-- 1. Create users table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT,
    username TEXT UNIQUE, -- only for admins or users who want usernames
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    session_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create flats table
CREATE TABLE IF NOT EXISTS public.flats (
    flat_no TEXT PRIMARY KEY,
    is_vacant BOOLEAN DEFAULT TRUE,
    is_owner_occupied BOOLEAN DEFAULT TRUE,
    owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    occupancy_from DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Create flat_to_users association table
CREATE TABLE IF NOT EXISTS public.flat_to_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    is_owner BOOLEAN DEFAULT FALSE,
    is_tenant BOOLEAN DEFAULT FALSE,
    associated_from TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    associated_to TIMESTAMP WITH TIME ZONE, -- NULL if current association
    UNIQUE (flat_no, user_id, is_owner, is_tenant)
);

-- 4. Insert default admin credentials
INSERT INTO public.users (username, password, name, is_admin, session_version, is_active)
VALUES ('admin', 'admin123', 'Administrator', TRUE, 1, TRUE)
ON CONFLICT (username) DO NOTHING;

-- 5. Create maintenance_records table to track monthly billing and payments
CREATE TABLE IF NOT EXISTS public.maintenance_records (
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    billing_month TEXT NOT NULL,        -- Format: 'YYYY-MM', e.g. '2026-07'
    amount_due NUMERIC(10, 2) DEFAULT 2000.00,
    amount_paid NUMERIC(10, 2) DEFAULT 0.00,
    payment_status TEXT DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid')),
    payment_date TIMESTAMP WITH TIME ZONE,
    payment_method TEXT DEFAULT '',     -- 'UPI', 'Cash', 'Bank Transfer', etc.
    transaction_id TEXT DEFAULT '',
    remarks TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (flat_no, billing_month)
);

-- 6. Create announcements table (community notice board)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    posted_by TEXT DEFAULT 'admin',     -- 'admin', 'owner', 'tenant'
    posted_by_name TEXT DEFAULT '',     -- Name of the author (admin name or resident name)
    posted_by_flat TEXT,                -- Flat number of author (if posted by a resident)
    attachment_url TEXT,
    attachment_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Create complaints table (service requests / maintenance tickets)
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 8. Create tenant_history table to track past tenants per flat
CREATE TABLE IF NOT EXISTS public.tenant_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    tenant_name TEXT NOT NULL,
    tenant_phone TEXT DEFAULT '',
    tenant_email TEXT DEFAULT '',
    occupied_from DATE NOT NULL,
    occupied_to DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 9. Create owner_history table to track past owners of flats
CREATE TABLE IF NOT EXISTS public.owner_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    owner_name TEXT NOT NULL,
    phone_number TEXT DEFAULT '',
    email TEXT DEFAULT '',
    transferred_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 10. Create approvals table (requests requiring admin action)
CREATE TABLE IF NOT EXISTS public.approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    request_type TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    details JSONB NOT NULL DEFAULT '{}',
    raised_by TEXT NOT NULL,            -- 'owner' or 'tenant'
    admin_comments TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 11. Create settings table for global portal configuration
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Seed default maintenance fee
INSERT INTO public.settings (key, value)
VALUES ('maintenance_amount', '2000')
ON CONFLICT (key) DO NOTHING;

-- 12. Create contacts table (emergency / apartment contacts directory)
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 13. Disable Row Level Security on all tables
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flat_to_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts DISABLE ROW LEVEL SECURITY;

-- 14. Grant permissions to anon, authenticated, and service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 15. Populate all 40 flats and their default users
DO $$
DECLARE
    f_no TEXT;
    f_arr TEXT[] := ARRAY[
        '001', '002', '003', '004', '005', '006', '007', '008',
        '101', '102', '103', '104', '105', '106', '107', '108',
        '201', '202', '203', '204', '205', '206', '207', '208',
        '301', '302', '303', '304', '305', '306', '307', '308',
        '401', '402', '403', '404', '405', '406', '407', '408'
    ];
    o_id UUID;
    t_id UUID;
BEGIN
    FOREACH f_no IN ARRAY f_arr LOOP
        -- Create default Owner user
        INSERT INTO public.users (name, phone, email, username, password, is_admin)
        VALUES (
            'Owner of ' || f_no,
            '',
            NULL,
            'owner' || f_no,
            'owner' || f_no,
            FALSE
        )
        ON CONFLICT (username) DO NOTHING
        RETURNING id INTO o_id;

        -- If returning null due to conflict, retrieve the ID
        IF o_id IS NULL THEN
            SELECT id INTO o_id FROM public.users WHERE username = 'owner' || f_no;
        END IF;

        -- Create default Tenant user
        INSERT INTO public.users (name, phone, email, username, password, is_admin)
        VALUES (
            'Tenant of ' || f_no,
            '',
            NULL,
            'tenant' || f_no,
            'tenant' || f_no,
            FALSE
        )
        ON CONFLICT (username) DO NOTHING
        RETURNING id INTO t_id;

        -- If returning null due to conflict, retrieve the ID
        IF t_id IS NULL THEN
            SELECT id INTO t_id FROM public.users WHERE username = 'tenant' || f_no;
        END IF;

        -- Create Flat (by default vacant, link owner, tenant is null)
        INSERT INTO public.flats (flat_no, is_vacant, is_owner_occupied, owner_id, tenant_id)
        VALUES (f_no, TRUE, TRUE, o_id, NULL)
        ON CONFLICT (flat_no) DO NOTHING;

        -- Seed initial owner association
        INSERT INTO public.flat_to_users (flat_no, user_id, is_owner, is_tenant)
        VALUES (f_no, o_id, TRUE, FALSE)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- 15. Storage bucket: payment-attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-attachments',
  'payment-attachments',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Drop and recreate payment-attachments storage policies
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
CREATE POLICY "Allow public uploads"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'payment-attachments');

DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
CREATE POLICY "Allow public updates"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'payment-attachments');

DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
CREATE POLICY "Allow public reads"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'payment-attachments');

-- 16. Storage bucket: announcement-attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-attachments',
  'announcement-attachments',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Drop and recreate announcement-attachments storage policies
DROP POLICY IF EXISTS "Allow public uploads for notices" ON storage.objects;
CREATE POLICY "Allow public uploads for notices"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'announcement-attachments');

DROP POLICY IF EXISTS "Allow public updates for notices" ON storage.objects;
CREATE POLICY "Allow public updates for notices"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'announcement-attachments');

DROP POLICY IF EXISTS "Allow public reads for notices" ON storage.objects;
CREATE POLICY "Allow public reads for notices"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'announcement-attachments');
