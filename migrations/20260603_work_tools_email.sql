-- Add separate email column to work_tools
ALTER TABLE public.work_tools
  ADD COLUMN IF NOT EXISTS email text;