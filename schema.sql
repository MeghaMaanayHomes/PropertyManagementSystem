-- ==========================================
-- MEGHA MAANAY HOMES - DATABASE SETUP SCRIPT
-- ==========================================
-- Paste this script in the SQL Editor of your Supabase Dashboard:
-- https://supabase.com/dashboard/project/rstuapmplhviybvhkoqq
-- ==========================================
-- NOTE: If you already ran this script previously, run the following SQL command:
-- ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS is_owner_occupied BOOLEAN DEFAULT TRUE;
-- ==========================================

-- 1. Create flats table
CREATE TABLE IF NOT EXISTS public.flats (
    flat_no TEXT PRIMARY KEY,
    owner_name TEXT DEFAULT '',
    tenant_name TEXT DEFAULT '',
    is_vacant BOOLEAN DEFAULT TRUE,
    is_owner_occupied BOOLEAN DEFAULT TRUE,
    phone_number TEXT DEFAULT '',
    email TEXT DEFAULT '',
    password TEXT NOT NULL, -- Default will be 'flat' + flat_no (e.g. 'flat001')
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create admins table
CREATE TABLE IF NOT EXISTS public.admins (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Insert default admin credentials
INSERT INTO public.admins (username, password)
VALUES ('admin', 'admin123')
ON CONFLICT (username) DO NOTHING;

-- 4. Create maintenance_records table to track monthly billing and payments
CREATE TABLE IF NOT EXISTS public.maintenance_records (
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    billing_month TEXT, -- Format: 'YYYY-MM', e.g. '2026-07'
    amount_due NUMERIC(10, 2) DEFAULT 2000.00,
    amount_paid NUMERIC(10, 2) DEFAULT 0.00,
    payment_status TEXT DEFAULT 'Unpaid' CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid')),
    payment_date TIMESTAMP WITH TIME ZONE,
    payment_method TEXT DEFAULT '', -- 'UPI', 'Cash', 'Bank Transfer', etc.
    transaction_id TEXT DEFAULT '',
    remarks TEXT DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (flat_no, billing_month)
);

-- 5. Create announcements table (community notice board)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. Create complaints table (service requests)
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flat_no TEXT REFERENCES public.flats(flat_no) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Disable Row Level Security (RLS) to allow simple anon key operations
ALTER TABLE public.flats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints DISABLE ROW LEVEL SECURITY;

-- 8. Populate all 40 flats (001-008 to 401-408)
INSERT INTO public.flats (flat_no, is_vacant, password)
VALUES
('001', true, 'flat001'), ('002', true, 'flat002'), ('003', true, 'flat003'), ('004', true, 'flat004'), ('005', true, 'flat005'), ('006', true, 'flat006'), ('007', true, 'flat007'), ('008', true, 'flat008'),
('101', true, 'flat101'), ('102', true, 'flat102'), ('103', true, 'flat103'), ('104', true, 'flat104'), ('105', true, 'flat105'), ('106', true, 'flat106'), ('107', true, 'flat107'), ('108', true, 'flat108'),
('201', true, 'flat201'), ('202', true, 'flat202'), ('203', true, 'flat203'), ('204', true, 'flat204'), ('205', true, 'flat205'), ('206', true, 'flat206'), ('207', true, 'flat207'), ('208', true, 'flat208'),
('301', true, 'flat301'), ('302', true, 'flat302'), ('303', true, 'flat303'), ('304', true, 'flat304'), ('305', true, 'flat305'), ('306', true, 'flat306'), ('307', true, 'flat307'), ('308', true, 'flat308'),
('401', true, 'flat401'), ('402', true, 'flat402'), ('403', true, 'flat403'), ('404', true, 'flat404'), ('405', true, 'flat405'), ('406', true, 'flat406'), ('407', true, 'flat407'), ('408', true, 'flat408')
ON CONFLICT (flat_no) DO NOTHING;
