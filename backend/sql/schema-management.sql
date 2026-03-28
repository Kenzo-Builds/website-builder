-- ============================================================
-- Schema Management Functions for Multi-Tenant App Builder
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Function to create a new schema for a user's app project
-- Called by: POST /api/create-schema
-- Creates an isolated Postgres schema like: app_proj_abc123
CREATE OR REPLACE FUNCTION create_app_schema(schema_name TEXT)
RETURNS void AS $$
BEGIN
  -- Validate schema name (alphanumeric + underscores only)
  IF schema_name !~ '^app_proj_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', schema_name;
  END IF;
  
  -- Create the schema
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);
  
  -- Grant usage to the anon and authenticated roles (Supabase standard)
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated', schema_name);
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO anon, authenticated', schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO anon, authenticated', schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Function to run a migration (SQL) inside a specific schema
-- Called by: POST /api/run-migration
-- Executes AI-generated schema.sql within the user's isolated schema
CREATE OR REPLACE FUNCTION run_app_migration(schema_name TEXT, migration_sql TEXT)
RETURNS void AS $$
BEGIN
  -- Validate schema name
  IF schema_name !~ '^app_proj_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', schema_name;
  END IF;
  
  -- Set search_path to the app schema so all CREATE TABLE statements
  -- go into the correct schema without needing schema prefixes
  EXECUTE format('SET search_path TO %I', schema_name);
  
  -- Run the migration SQL
  EXECUTE migration_sql;
  
  -- Reset search_path back to public
  EXECUTE 'SET search_path TO public';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to drop a schema (cleanup when project is deleted)
-- Called by: POST /api/delete-project (when project has a schema)
CREATE OR REPLACE FUNCTION drop_app_schema(schema_name TEXT)
RETURNS void AS $$
BEGIN
  -- Validate schema name
  IF schema_name !~ '^app_proj_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'Invalid schema name: %', schema_name;
  END IF;
  
  -- Drop everything in the schema and the schema itself
  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to list all tables in a user's schema
-- Useful for debugging and the builder UI
CREATE OR REPLACE FUNCTION list_app_tables(schema_name TEXT)
RETURNS TABLE(table_name TEXT, column_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.table_name::TEXT,
    (SELECT COUNT(*) FROM information_schema.columns c 
     WHERE c.table_schema = schema_name AND c.table_name = t.table_name)
  FROM information_schema.tables t
  WHERE t.table_schema = schema_name
  AND t.table_type = 'BASE TABLE';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add app_schema column to projects table (tracks which schema belongs to which project)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS app_schema TEXT DEFAULT NULL;

-- ============================================================
-- DONE! These functions are now available via Supabase RPC:
--   supabase.rpc('create_app_schema', { schema_name: 'app_proj_xxx' })
--   supabase.rpc('run_app_migration', { schema_name: 'app_proj_xxx', migration_sql: '...' })
--   supabase.rpc('drop_app_schema', { schema_name: 'app_proj_xxx' })
--   supabase.rpc('list_app_tables', { schema_name: 'app_proj_xxx' })
-- ============================================================
