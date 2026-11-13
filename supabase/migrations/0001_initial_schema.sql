-- ==============================================================================
-- Esquema inicial y Row Level Security (RLS) - Aplicación DS 66 (Chile)
-- Sección 13: Cuenta, datos guardados, almacenamiento privado y versionado
-- ==============================================================================

create extension if not exists "pgcrypto";

-- 1. Perfil del instalador (una sola vez por cuenta)
create table if not exists public.installer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  rut text not null,
  phone text not null,
  email text not null,
  installer_class text not null check (installer_class in ('1', '2', '3', '4')),
  sec_registration_number text not null,
  company_name text,
  signature_storage_path text,
  privacy_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.installer_profiles enable row level security;

create policy "installer_profiles_select_own"
  on public.installer_profiles for select
  using (auth.uid() = user_id);

create policy "installer_profiles_insert_own"
  on public.installer_profiles for insert
  with check (auth.uid() = user_id);

create policy "installer_profiles_update_own"
  on public.installer_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Clientes e instalaciones
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_name text not null,
  owner_rut text,
  address text not null,
  commune text not null,
  design_temp_c smallint not null default 0,
  gas_type text not null check (gas_type in ('GLP', 'GN_V_RM', 'GN_VIII', 'GN_XII')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

create policy "clients_all_own"
  on public.clients for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Proyectos (red compartida, recintos, hermeticidad, cilindros)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  gas_type text not null check (gas_type in ('GLP', 'GN_V_RM', 'GN_VIII', 'GN_XII')),
  network_json jsonb not null default '{"segments":[],"appliances":[]}'::jsonb,
  rooms_json jsonb not null default '[]'::jsonb,
  hermeticity_json jsonb not null default '{}'::jsonb,
  cylinders_json jsonb not null default '{}'::jsonb,
  status text not null default 'borrador' check (status in ('borrador', 'revisado', 'emitido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "projects_all_own"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Biblioteca de artefactos fotografiados (solo tras confirmación humana)
create table if not exists public.appliance_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text not null,
  model text not null,
  serial_number text,
  nominal_power_mcal_h numeric(10,3) not null check (nominal_power_mcal_h > 0),
  gas_type text,
  photo_storage_path text not null,
  confirmed_by_human boolean not null default false check (confirmed_by_human = true),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.appliance_library enable row level security;

create policy "appliance_library_all_own"
  on public.appliance_library for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Informes emitidos versionados e inmutables (Sección 13.7)
create table if not exists public.issued_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  report_type text not null check (
    report_type in ('memoria_calculo', 'hermeticidad', 'baja_artefacto', 'instalacion_nuevo', 'cambio_modificacion')
  ),
  version_number integer not null check (version_number >= 1),
  snapshot_json jsonb not null,
  integrity_sha256 text not null,
  pdf_storage_path text,
  issued_at timestamptz not null default now(),
  unique (project_id, report_type, version_number)
);

alter table public.issued_reports enable row level security;

create policy "issued_reports_select_own"
  on public.issued_reports for select
  using (auth.uid() = user_id);

create policy "issued_reports_insert_own"
  on public.issued_reports for insert
  with check (auth.uid() = user_id);
-- Nota: sin política UPDATE para mantener versiones emitidas congeladas.

-- 6. Registro de eventos importantes sin datos sensibles (Sección 13.6)
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_events enable row level security;

create policy "audit_events_select_own"
  on public.audit_events for select
  using (auth.uid() = user_id);

create policy "audit_events_insert_own"
  on public.audit_events for insert
  with check (auth.uid() = user_id);

-- 7. Control de cuota diaria de lectura IA por usuario (Sección 13.4)
create table if not exists public.vision_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.vision_usage_daily enable row level security;

create policy "vision_usage_select_own"
  on public.vision_usage_daily for select
  using (auth.uid() = user_id);

-- 8. Bucket privado para fotos de placas y firmas del instalador
insert into storage.buckets (id, name, public)
values ('installer-assets', 'installer-assets', false)
on conflict (id) do nothing;

create policy "storage_assets_own_select"
  on storage.objects for select
  using (
    bucket_id = 'installer-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_assets_own_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'installer-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_assets_own_delete"
  on storage.objects for delete
  using (
    bucket_id = 'installer-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
