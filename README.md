# Auzura

Auzura is a Nuxt 4 + Nuxt UI 4 Azure DevOps Boards control surface. The first milestone keeps the scope intentionally sharp:

- pick an Azure DevOps project from the sidebar
- list the 25 most recently changed work items in the selected project
- create a `Task`, `Bug`, or `User Story`
- transition a work item between common states
- authenticate Azure DevOps API calls through Microsoft OAuth

## Setup

```bash
bun install
cp .env.example .env
bun run dev
```

Fill `.env`:

```bash
NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION=your-org
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_REDIRECT_URI=http://localhost:3000/api/auth/azure/callback
NUXT_SESSION_PASSWORD=password-with-at-least-32-characters

# Optional server-only org alias:
# AZURE_DEVOPS_ORGANIZATION=your-org
```

For production/Vercel, set `AZURE_REDIRECT_URI` to `https://auzura.vercel.app/api/auth/azure/callback` and configure the same redirect URI in the Microsoft Entra app registration.

`NUXT_SESSION_PASSWORD` is required by `nuxt-auth-utils` to encrypt the session cookie. It must be at least 32 characters; otherwise `/api/_auth/session` fails with `Empty password` in production.

## Why a server proxy?

Azure DevOps OAuth tokens should never be exposed to unrelated services. The Nuxt server routes in `server/api/azure/**` own Azure API calls and expose a small app-specific API to the UI.

## API routes

- `GET /api/azure/projects` — list selectable Azure DevOps projects
- `GET /api/azure/work-items?project=<name>` — recent work item snapshot
- `POST /api/azure/work-items?project=<name>` — create a work item
- `PATCH /api/azure/work-items/:id/state?project=<name>` — move a work item to another state

## Next milestones

- proper process-template state discovery instead of hard-coded `New/Active/Resolved/Closed`
- saved board views and filters
- comments/evidence posting
- local mapping table for agent/session links
- saved OAuth refresh-token handling for long-lived sessions
