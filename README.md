# Auzura

Auzura is a Nuxt 4 + Nuxt UI 4 Azure DevOps Boards control surface. The first milestone keeps the scope intentionally sharp:

- list the 25 most recently changed work items in a project
- create a `Task`, `Bug`, or `User Story`
- transition a work item between common states
- keep the Azure DevOps PAT server-side only

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Fill `.env`:

```bash
NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION=your-org
NUXT_PUBLIC_AZURE_DEVOPS_PROJECT=your-project
NUXT_AZURE_DEVOPS_TOKEN=your-pat
```

The PAT needs Azure DevOps **Work Items: Read & write** scope.

## Why a server proxy?

Azure DevOps Personal Access Tokens should never be exposed to the browser. The Nuxt server routes in `server/api/azure/**` own all Azure API calls and expose a small app-specific API to the UI.

## API routes

- `GET /api/azure/work-items` — recent work item snapshot
- `POST /api/azure/work-items` — create a work item
- `PATCH /api/azure/work-items/:id/state` — move a work item to another state

## Next milestones

- proper process-template state discovery instead of hard-coded `New/Active/Resolved/Closed`
- saved board views and filters
- comments/evidence posting
- local mapping table for agent/session links
- OAuth app flow for multi-user installs
