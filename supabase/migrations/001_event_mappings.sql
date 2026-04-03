CREATE TABLE IF NOT EXISTS event_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_appointment_id text UNIQUE NOT NULL,
  google_event_id text NOT NULL,
  calendar_name text,
  contact_name text,
  created_at timestamptz DEFAULT now()
);
