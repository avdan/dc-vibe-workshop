# Vibe Coding Workshop Companion

A guided Next.js app that authenticates attendees via Supabase and walks them through the workshop journey: collect names, capture the build idea, spin up a GitHub repository, pick an AI tool, and deploy with tailored instructions-including a collapsible terminal cheat sheet.

## Prerequisites

- Node.js 18+
- Supabase project with Email (magic link) or OAuth providers enabled
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Quick Start

```bash
npm install
npm run dev
```

Create a `.env.local` file before running `npm run dev`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Deploying

- **Vercel**: Create/associate the project with your GitHub repo, add any AI-suggested environment variables, then push to `main` for the first deploy (or trigger it from the dashboard).
- **GitHub Pages**: Run `npm run build && npm run export`, push the `out/` directory or automate with a GitHub Action.

## Workshop Flow

1. Attendee signs in with Supabase (email magic link, GitHub, or Google).
2. They select their AI assistant environment and get tailored instructions.
3. They capture their build description, create a GitHub repository (with SSH guidance), and choose how they'll code with Codex.
4. The app surfaces prep prompts, an external API checklist, and a collapsible terminal cheat sheet.
5. Attendee confirms their deployment URL for easy sharing with the cohort—and the data persists through Supabase when they return.

## Notes

- Update the instructions under `TOOL_GUIDES`, `DEPLOYMENT_GUIDES`, or the terminal cheat sheet in `pages/index.tsx` to match your workshop.
- The Supabase project needs the redirect URL whitelisted (`http://localhost:3000` for dev, plus production domain).
- Create the `workshop_profiles` table (see below) so attendee names, build ideas, and deployment URLs persist across sessions.

### Supabase table & policies

```sql
create table public.workshop_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  build_description text,
  deployment_link text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_workshop_profile_updated_at()
returns trigger as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger workshop_profiles_set_updated_at
before update on public.workshop_profiles
for each row execute function public.set_workshop_profile_updated_at();

alter table public.workshop_profiles enable row level security;

create policy "Users select own profile"
  on public.workshop_profiles
  for select
  using (auth.uid() = user_id);

create policy "Users insert own profile"
  on public.workshop_profiles
  for insert
  with check (auth.uid() = user_id);

create policy "Users update own profile"
  on public.workshop_profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```
