-- Wizard Phase 1 Migration
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS context JSONB DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS deployed_url TEXT DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS build_id TEXT DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS files JSONB DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS app_schema TEXT DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS db_user TEXT DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS db_password TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_projects_context ON public.projects((context IS NOT NULL)) WHERE context IS NOT NULL;
COMMENT ON COLUMN public.projects.context IS 'Wizard context: app_type, pages, brand, language';
