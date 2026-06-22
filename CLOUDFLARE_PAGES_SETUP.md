# Cloudflare Pages Setup for usm.dev

This is a one-time manual setup. The GitHub Actions workflow will handle
deployments automatically once the Cloudflare Pages project exists.

## Prerequisites

You need a Cloudflare API token with these permissions:

- **Account → Cloudflare Pages → Edit**
- **Account → Account Settings → Read**
- (Optional) **User → User Details → Read** (for `tokens/verify`)

### Create the token

1. Go to <https://dash.cloudflare.com/profile/api-tokens>
2. Click **Create Token**
3. Use the **Edit Cloudflare Pages** template (or create a custom token with the scopes above)
4. Set **Account Resources** to `Include → James@smith-gray.com's Account`
5. Click **Continue to summary → Create Token**
6. Copy the token (it starts with `cfat_...`)

### Add secrets to the GitHub repo

1. Go to <https://github.com/Smith-Gray-Pty-Ltd/usm/settings/secrets/actions>
2. Click **New repository secret**
3. Add two secrets:
   - `CLOUDFLARE_API_TOKEN` — the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID (found in the dashboard URL)

## Create the Pages project

### Option A: Cloudflare Dashboard (recommended)

1. Go to <https://dash.cloudflare.com/?to=/:account/pages>
2. Click **Create a project → Connect to Git**
3. Select **Smith-Gray-Pty-Ltd/usm**
4. **Build settings**:
   - Framework preset: **None**
   - Build command: `pnpm install --frozen-lockfile && pnpm run build && node dist/cli/index.js init && node dist/cli/index.js generate`
   - Build output directory: `.agents-workspace/docs`
   - Root directory: `/` (leave blank)
   - Environment variables:
     - `NODE_VERSION` = `22`
     - `PNPM_VERSION` = `11`
5. Click **Save and Deploy**

The first build will take ~2-3 minutes. Subsequent builds push to `main`
and trigger a new deploy.

### Option B: Wrangler CLI

```bash
# Install wrangler
npm install -g wrangler

# Login
wrangler login

# Create the Pages project (uses Cloudflare Pages' direct upload)
wrangler pages project create usm-dev --production-branch main

# Add custom domain
wrangler pages domain add usm.dev --project-name usm-dev
```

## Add the custom domain

After the project is created:

1. Go to <https://dash.cloudflare.com/?to=/:account/pages/view/usm-dev>
2. Click **Custom domains → Set up a custom domain**
3. Enter `usm.dev` and click **Continue**
4. Cloudflare will automatically add the CNAME record

## Verify the workflow

After the project is set up:

1. Push a commit to `main` (e.g. update the README)
2. Go to <https://github.com/Smith-Gray-Pty-Ltd/usm/actions>
3. The **Deploy docs to Cloudflare Pages** workflow should run
4. Visit <https://usm.dev> to see the docs

## DNS configuration (already done)

The `usm.dev` zone is in your Cloudflare account. The Pages integration
will automatically add the CNAME record when you connect the custom domain.
You don't need to touch DNS manually.

## Costs

Cloudflare Pages is **free** for unlimited static sites, requests, and bandwidth.

## Troubleshooting

### Build fails with "Cannot find module 'pnpm'"

Add a `engines` field to `package.json` or set `PNPM_VERSION` in the
Cloudflare Pages environment variables.

### Build succeeds but site shows 404

Check that the **Build output directory** is exactly `.agents-workspace/docs`
(not `docs/` or `./docs/`).

### Custom domain won't connect

Make sure `usm.dev` is on Cloudflare (it is).
The CNAME should auto-add when you click "Set up a custom domain".
