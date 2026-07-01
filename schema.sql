-- ==========================================
-- MEGHA MAANAY HOMES - DATABASE SETUP SCRIPT
-- ==========================================
-- Paste this script in the SQL Editor of your Supabase Dashboard:
-- https://supabase.com/dashboard/project/rstuapmplhviybvhkoqq
-- ==========================================
-- NOTE: If you already created the tables previously, run these update SQL queries:
-- ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS tenant_phone TEXT DEFAULT '';
-- ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS tenant_email TEXT DEFAULT '';
-- ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS occupancy_from DATE;
-- ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS owner_password TEXT;
-- ALTER TABLE public.flats ADD COLUMN IF NOT EXISTS tenant_password TEXT;
-- UPDATE public.flats SET owner_password = 'owner' || flat_no WHERE owner_password IS NULL;
-- UPDATE public.flats SET tenant_password = 'tenant' || flat_no WHERE tenant_password IS NULL;
-- ALTER TABLE public.flats ALTER COLUMN owner_password SET NOT NULL;
-- ALTER TABLE public.flats ALTER COLUMN tenant_password SET NOT NULL;
-- ==========================================

-- 1. Create flats table
CREATE TABLE IF NOT EXISTS public.flats (
    flat_no TEXT PRIMARY KEY,
    owner_name TEXT DEFAULT '',
    tenant_name TEXT DEFAULT '',
    is_vacant BOOLEAN DEFAULT TRUE,
    is_owner_occupied BOOLEAN DEFAULT TRUE,
    phone_number TEXT DEFAULT '', -- Owner Phone
    email TEXT DEFAULT '', -- Owner Email
    tenant_phone TEXT DEFAULT '',
    tenant_email TEXT DEFAULT '',
    occupancy_from DATE,
    owner_password TEXT NOT NULL, -- Default: 'owner' + flat_no (e.g. 'owner001')
    tenant_password TEXT NOT NULL, -- Default: 'tenant' + flat_no (e.g. 'tenant001')
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
INSERT INTO public.flats (flat_no, is_vacant, owner_password, tenant_password)
VALUES
('001', true, 'owner001', 'tenant001'), ('002', true, 'owner002', 'tenant002'), ('003', true, 'owner003', 'tenant003'), ('004', true, 'owner004', 'tenant004'), ('005', true, 'owner005', 'tenant005'), ('006', true, 'owner006', 'tenant006'), ('007', true, 'owner007', 'tenant007'), ('008', true, 'owner008', 'tenant008'),
('101', true, 'owner101', 'tenant101'), ('102', true, 'owner102', 'tenant102'), ('103', true, 'owner103', 'tenant103'), ('104', true, 'owner104', 'tenant104'), ('105', true, 'owner105', 'tenant105'), ('106', true, 'owner106', 'tenant106'), ('107', true, 'owner107', 'tenant107'), ('108', true, 'owner108', 'tenant108'),
('201', true, 'owner201', 'tenant201'), ('202', true, 'owner202', 'tenant202'), ('203', true, 'owner203', 'tenant203'), ('204', true, 'owner204', 'tenant204'), ('205', true, 'owner205', 'tenant205'), ('206', true, 'owner206', 'tenant206'), ('207', true, 'owner207', 'tenant207'), ('208', true, 'owner208', 'tenant208'),
('301', true, 'owner301', 'tenant301'), ('302', true, 'owner302', 'tenant302'), ('303', true, 'owner303', 'tenant303'), ('304', true, 'owner304', 'tenant304'), ('305', true, 'owner305', 'tenant305'), ('306', true, 'owner306', 'tenant306'), ('307', true, 'owner307', 'tenant307'), ('308', true, 'owner308', 'tenant308'),
('401', true, 'owner401', 'tenant401'), ('402', true, 'owner402', 'tenant402'), ('403', true, 'owner403', 'tenant403'), ('404', true, 'owner404', 'tenant404'), ('405', true, 'owner405', 'tenant405'), ('406', true, 'owner406', 'tenant406'), ('407', true, 'owner407', 'tenant407'), ('408', true, 'owner408', 'tenant408')
ON CONFLICT (flat_no) DO NOTHING;
