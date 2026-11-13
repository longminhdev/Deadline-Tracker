# Multi-user beta setup

The invite-only beta is separate from the existing single-user dashboard. Set `MULTIUSER_BETA=1` only on a separate Vercel beta project until the migration and pilot have been reviewed.

## Supabase

1. Create a Supabase project and copy its project URL, publishable/anon key, and server secret key.
2. Run [`supabase/migrations/202611130001_beta_user_data.sql`](supabase/migrations/202611130001_beta_user_data.sql) in the Supabase SQL Editor.
3. In Authentication → URL Configuration, set the beta site's production URL and allow that URL as a redirect destination.
4. Keep public sign-ups disabled. Invite each beta tester by email after configuring a custom SMTP provider.
5. In the beta app, users enter their own HTTPS ICS calendar URL. Only approved hostnames listed in `ICS_ALLOWED_HOSTS` are accepted. The server encrypts each URL before storing it.

Supabase's default email service only sends to addresses on the project's organization team and is limited to two messages per hour. It cannot send magic links to outside testers. Configure custom SMTP before inviting beta users. See [Supabase custom SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

## Vercel beta project

Create a separate Vercel project (for example, `deadline-tracker-beta`) linked to this repository. Add these Production variables:

- `MULTIUSER_BETA=1`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ICS_ENCRYPTION_KEY` (random 32-byte base64url value)
- `ICS_ALLOWED_HOSTS` (comma-separated exact eLearning hostnames)
- `CRON_SECRET` (a separate random secret)

Do not put the Supabase server secret, encryption key, cron secret, or ICS URLs in browser code or Git. After adding the variables, deploy this project to Production. The existing daily `/api/cron/sync` schedule then syncs each connected account independently.

The Vercel Hobby Cron schedule is daily and may run up to 59 minutes after its configured time. The schedule in `vercel.json` targets 22:30 Bangkok time (`30 15 * * *` UTC).

## Local beta

1. Copy `.env.beta.example` to `.env` and fill in the Supabase and beta settings.
2. Run `npm start`.
3. Invite your email in Supabase before requesting a magic link.
4. Enter the HTTPS calendar feed URL for the same eLearning host configured in `ICS_ALLOWED_HOSTS`.

