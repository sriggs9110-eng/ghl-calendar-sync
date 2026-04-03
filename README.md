# GHL Calendar Sync

Webhook middleware between GoHighLevel and Google Calendar. When appointments are booked, cancelled, or rescheduled on specific GHL calendars, this service creates/updates/deletes corresponding Google Calendar events on a shared "Vendor - Booked Meetings" calendar.

## API Endpoints

- `POST /api/webhooks/booking` — Handles GHL "Customer Booked Appointment" webhooks
- `POST /api/webhooks/status-change` — Handles GHL "Appointment Status Changed" webhooks
- `GET /api/health` — Health check

## Setup

### 1. Google Cloud Project & Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Google Calendar API**: APIs & Services → Library → search "Google Calendar API" → Enable
4. Create a Service Account: IAM & Admin → Service Accounts → Create
5. Download the JSON key file
6. From the JSON key, grab:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`

### 2. Google Calendar Setup

1. In Google Calendar, create a new calendar called **"Vendor - Booked Meetings"**
2. Go to the calendar's Settings → Share with specific people
3. Add the service account email (from step 1) with **"Make changes to events"** permission
4. Copy the Calendar ID from the calendar settings → `GOOGLE_CALENDAR_ID`

### 3. Supabase Migration

Run this SQL in your Supabase SQL Editor (or use the migration file at `supabase/migrations/001_event_mappings.sql`):

```sql
CREATE TABLE IF NOT EXISTS event_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_appointment_id text UNIQUE NOT NULL,
  google_event_id text NOT NULL,
  calendar_name text,
  contact_name text,
  created_at timestamptz DEFAULT now()
);
```

Get your Supabase service role key from: Supabase Dashboard → Settings → API → `service_role` key.

### 4. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

### 5. GHL Webhook Setup

In GoHighLevel, set up workflows with webhook actions pointing to your deployed URL:

- **Customer Booked Appointment** → `https://your-domain.vercel.app/api/webhooks/booking`
- **Appointment Status Changed** → `https://your-domain.vercel.app/api/webhooks/status-change`

### 6. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add all environment variables in Vercel Dashboard → Settings → Environment Variables.

## Local Development

```bash
npm install
npm run dev
```

The API will be available at `http://localhost:3000`.
