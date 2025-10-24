# AllergyPath Frontend

This React application connects to Supabase for authentication, storage, and real-time updates. The app expects the Supabase URL
and anonymous key to be present at build time.

## Environment configuration

1. Copy the provided `.env` file and populate the placeholders with your Supabase project details for local development.
2. Do the same for `.env.production` when building locally for production.
3. Never commit real credentials—use the hosting provider's environment variable manager in production.

### Required variables

| Variable | Description |
| --- | --- |
| `REACT_APP_SUPABASE_URL` | The Supabase project URL (e.g., `https://xyzcompany.supabase.co`). |
| `REACT_APP_SUPABASE_ANON_KEY` | The Supabase anonymous API key from **Project Settings → API**. |

If either variable is missing, the app will stop during initialization with a helpful error message so the problem can be fixed
before deployment.

### Hosting provider guidance

#### Netlify
- **UI:** Site settings → Build & deploy → Environment → Edit variables. Add both variables and trigger a new deploy.
- **CLI:** `netlify env:set REACT_APP_SUPABASE_URL <value>` and `netlify env:set REACT_APP_SUPABASE_ANON_KEY <value>`.
  Deployments automatically pick up the values on the next build.

#### Vercel
- **UI:** Project → Settings → Environment Variables. Add the two variables for the `Production`, `Preview`, and `Development` targets as needed.
- **CLI:** `vercel env add REACT_APP_SUPABASE_URL production` (repeat for each environment and variable).
  Trigger a redeploy to rebuild with the new values.

#### Supabase (Edge Functions/Hosting)
- **Dashboard:** Project Settings → Configuration → Environment Variables. Add the variables so that Supabase-hosted Edge Functions
  or SSR sites have access to them at build time.
- **CLI:** `supabase secrets set REACT_APP_SUPABASE_URL='<value>' REACT_APP_SUPABASE_ANON_KEY='<value>'` before running `supabase deploy`.

## Local development

```bash
npm install
npm start
```

## Production build

```bash
npm run build
```

Ensure the production environment variables are populated before running the build so the generated assets have the correct Supabase
configuration baked in.
