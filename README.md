# Auzura

Auzura is a Nuxt 4 + Nuxt UI 4 Azure DevOps Boards control surface. The first milestone keeps the scope intentionally sharp:

- pick an Azure DevOps project from the sidebar
- list the 25 most recently changed work items in the selected project
- create a `Task`, `Bug`, or `User Story`
- transition a work item between common states
- keep the Azure DevOps PAT server-side only

## Setup

```bash
bun install
cp .env.example .env
bun run dev
```

Fill `.env`:

```bash
NUXT_PUBLIC_AZURE_DEVOPS_ORGANIZATION=your-org
NUXT_AZURE_DEVOPS_TOKEN=your-pat

# aliases also supported:
# AZURE_DEVOPS_ORGANIZATION=your-org
# AZURE_DEVOPS_TOKEN=your-pat
```

The PAT needs Azure DevOps **Work Items: Read & write** scope.

## Why a server proxy?

Azure DevOps Personal Access Tokens should never be exposed to the browser. The Nuxt server routes in `server/api/azure/**` own all Azure API calls and expose a small app-specific API to the UI.

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
- OAuth app flow for multi-user installs
