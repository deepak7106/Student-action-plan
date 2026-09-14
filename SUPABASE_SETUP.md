# Supabase authentication setup

The app uses Supabase Auth for email/password and Google sign-in. It stores each user's planner state in browser storage scoped by Supabase user id until the database sync layer is enabled.

## 1. Create the project

1. Create a project at https://supabase.com.
2. In **Project Settings > API**, copy the **Project URL** and the **anon public key**.
3. Copy `.env.example` to `.env` and put them there:

```js
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-publishable-anon-key
```

For this no-build static app, copy those same values into the ignored `env.js` runtime bridge. Browsers cannot read `.env` files directly. The anon/publishable key is intended for browser use; never put a service-role key in `.env`, `env.js`, or frontend code.

## 2. Enable providers

In **Authentication > Providers**:

- Enable Email.
- Enable Google and add the Google OAuth client id and secret.
- Add the deployed site URL under **Authentication > URL Configuration > Redirect URLs**.

For local testing, add `http://localhost:5500`.

## 3. Create the user-specific task table

The frontend uses per-user `localStorage` as an offline fallback and syncs the authenticated plan to Supabase. Run this SQL in Supabase SQL Editor for cross-device persistence:

```sql
create table public.user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_plans enable row level security;

create policy "Users can read their own tasks"
  on public.user_plans for select
  using (auth.uid() = user_id);

create policy "Users can create their own tasks"
  on public.user_plans for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own tasks"
  on public.user_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own tasks"
  on public.user_plans for delete
  using (auth.uid() = user_id);
```
