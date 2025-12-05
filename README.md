# ADO Sync

Bi-directional sync between YAML work item definitions and Azure DevOps.

## Features

- **YAML-based work items**: Define work items in human-readable YAML files
- **Flexible hierarchy**: Supports Epic → Feature → PBI → Task (full), Feature → PBI → Task (medium), or PBI → Task (simple)
- **Bi-directional sync**: Push to ADO and pull updates back
- **Conflict detection**: Identifies when both YAML and ADO have changed
- **Comments & PRs**: Pull linked comments and pull requests from ADO

## Installation

```bash
npm install -g ado-sync
```

Or run directly with npx:

```bash
npx ado-sync --help
```

## Quick Start

1. **Initialize a new YAML file**:
   ```bash
   ado-sync init workitems.yaml --template --hierarchy medium
   ```

2. **Set your PAT**:
   ```bash
   export ADO_PAT=your-personal-access-token
   # Or store securely:
   ado-sync config set pat your-personal-access-token
   ```

3. **Edit the YAML file** with your work items

4. **Push to Azure DevOps**:
   ```bash
   ado-sync push workitems.yaml --dry-run  # Preview changes
   ado-sync push workitems.yaml            # Apply changes
   ```

5. **Pull updates from ADO**:
   ```bash
   ado-sync pull workitems.yaml
   ```

## YAML Schema

### Full Hierarchy (Epic → Feature → PBI → Task)

```yaml
schemaVersion: "1.0"
hierarchyType: "full"

project:
  organization: "your-org"
  project: "your-project"

workItems:
  - type: Epic
    id: "epic-001"
    title: "My Epic"
    children:
      - type: Feature
        id: "feat-001"
        title: "My Feature"
        children:
          - type: "Product Backlog Item"
            id: "pbi-001"
            title: "My PBI"
            acceptanceCriteria: |
              - [ ] Criterion 1
              - [ ] Criterion 2
            children:
              - type: Task
                id: "task-001"
                title: "My Task"
                remainingWork: 4
```

### Simple Hierarchy (PBI → Task)

```yaml
schemaVersion: "1.0"
hierarchyType: "simple"

project:
  organization: "your-org"
  project: "your-project"

workItems:
  - type: "Product Backlog Item"
    id: "pbi-001"
    title: "Fix Bug"
    effort: 3
    children:
      - type: Task
        id: "task-001"
        title: "Investigate"
        remainingWork: 2
```

## Commands

### `ado-sync init [filename]`

Initialize a new work items YAML file.

```bash
ado-sync init workitems.yaml
ado-sync init sprint-1.yaml --hierarchy simple --template
```

Options:
- `-h, --hierarchy <type>` - Hierarchy type: full, medium, simple (default: medium)
- `-t, --template` - Include example work items
- `--org <organization>` - Azure DevOps organization
- `--project <project>` - Azure DevOps project

### `ado-sync validate <file>`

Validate YAML file against schema.

```bash
ado-sync validate workitems.yaml
ado-sync validate workitems.yaml --check-ado
```

Options:
- `-s, --strict` - Fail on warnings
- `--check-ado` - Validate ADO connection

### `ado-sync push <file>`

Push work items from YAML to Azure DevOps.

```bash
ado-sync push workitems.yaml --dry-run
ado-sync push workitems.yaml --filter "pbi-*"
```

Options:
- `-n, --dry-run` - Preview changes without applying
- `-f, --force` - Force update even with conflicts
- `--create-only` - Only create new items
- `--update-only` - Only update existing items
- `--filter <pattern>` - Filter by local ID pattern

### `ado-sync pull <file>`

Pull updates from Azure DevOps to YAML.

```bash
ado-sync pull workitems.yaml
ado-sync pull workitems.yaml --include-history
```

Options:
- `--include-comments` - Pull work item comments (default: true)
- `--include-prs` - Pull linked pull requests (default: true)
- `--include-history` - Pull state change history

### `ado-sync sync <file>`

Bi-directional sync (pull then push).

```bash
ado-sync sync workitems.yaml --strategy ado-wins
```

Options:
- `--strategy <strategy>` - Conflict resolution: ado-wins, yaml-wins, manual
- `-n, --dry-run` - Preview changes

### `ado-sync diff <file>`

Show differences between YAML and ADO.

```bash
ado-sync diff workitems.yaml
ado-sync diff workitems.yaml --format json
```

### `ado-sync status <file>`

Show sync status of all work items.

```bash
ado-sync status workitems.yaml
ado-sync status workitems.yaml --filter pending
```

### `ado-sync link <file> <local-id> <ado-id>`

Link a local YAML item to an existing ADO work item.

```bash
ado-sync link workitems.yaml pbi-001 12345
```

### `ado-sync config <action> [key] [value]`

Manage configuration.

```bash
ado-sync config list
ado-sync config set organization myorg
ado-sync config set pat my-token
ado-sync config get organization
ado-sync config delete pat
```

### `ado-sync import <file>`

Import work items from Azure DevOps into a new YAML file. This is useful for creating a YAML representation of existing ADO work items.

```bash
ado-sync import workitems.yaml --parent-id 12345
ado-sync import sprint.yaml --parent-id 38816 --org myorg --project myproject
ado-sync import frontend.yaml --parent-id 100 --filter-tag "frontend"
ado-sync import tasks.yaml --parent-id 100 --filter-type "Task"
```

Options:
- `--parent-id <id>` - Parent work item ID to import from (required)
- `--org <organization>` - Azure DevOps organization
- `--project <project>` - Azure DevOps project
- `--filter-tag <tag>` - Only import direct children with this tag (includes all their descendants)
- `--filter-type <type>` - Only import direct children of this type (includes all their descendants)
- `--include-comments` - Include work item comments (default: true)
- `--include-prs` - Include linked pull requests (default: true)

The import command will:
- Fetch the parent work item and all its children recursively
- Create a hierarchical YAML structure
- Auto-detect the hierarchy type (full/medium/simple)
- Generate local IDs like `feat-123`, `pbi-456`, `task-789`

**Filter Behavior:**

Filters only apply to **direct children** of the parent work item. Once a child matches the filter, **all its descendants are included** regardless of their tags or type.

Example: If you have a Feature with multiple PBIs, each with Tasks:
```
Feature #38816
├── PBI "Frontend Login" (tag: frontend)
│   ├── Task "Design UI"
│   └── Task "Implement API" (tag: backend)
├── PBI "Backend Auth" (tag: backend)
│   └── Task "Setup DB"
```

Running `--filter-tag "frontend"` will import:
- Feature #38816 (parent - always included)
- PBI "Frontend Login" (matches filter)
- All tasks under "Frontend Login" (descendants - included regardless of tags)

The "Backend Auth" PBI and its tasks are excluded because the PBI doesn't have the "frontend" tag.

## Configuration

### Environment Variables

```bash
ADO_PAT=your-personal-access-token
ADO_ORGANIZATION=your-organization
ADO_PROJECT=your-project
ADO_SYNC_LOG_LEVEL=info  # debug, info, warn, error
```

### Config File (`.ado-sync.yaml`)

```yaml
organization: "your-org"
project: "your-project"

defaults:
  areaPath: "your-project\\Team"
  iterationPath: "your-project\\Sprint 1"

sync:
  conflictStrategy: "manual"
  batchSize: 50
  includeComments: true
  includePRs: true

typeAliases:
  pbi: "Product Backlog Item"
  story: "User Story"
```

## Work Item Fields

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Work item type (Epic, Feature, PBI, Task, Bug) |
| `id` | string | Local reference ID (user-defined) |
| `title` | string | Work item title |
| `description` | string | Description (supports HTML) |
| `state` | string | State (New, Active, Resolved, Closed) |
| `priority` | number | Priority (1-4, 1 = highest) |
| `tags` | string[] | Tags/labels |
| `assignedTo` | string | Assigned user email |
| `areaPath` | string | Area path |
| `iterationPath` | string | Iteration path |
| `acceptanceCriteria` | string | Acceptance criteria (for PBI) |
| `effort` | number | Effort estimate |
| `storyPoints` | number | Story points |
| `remainingWork` | number | Remaining work in hours (for Task) |
| `originalEstimate` | number | Original estimate in hours |
| `completedWork` | number | Completed work in hours |
| `activity` | string | Activity type (Development, Testing, etc.) |

## ADO Metadata

After syncing, each item gets an `_ado` block with ADO metadata:

```yaml
_ado:
  workItemId: 12345
  url: "https://dev.azure.com/org/project/_workitems/edit/12345"
  rev: 3
  lastSyncedAt: "2025-01-15T10:30:00Z"
  state: "Active"
  assignedTo: "jane@example.com"
  comments:
    - author: "john@example.com"
      date: "2025-01-14T09:00:00Z"
      text: "Comment text"
  linkedPRs:
    - id: 456
      title: "PR title"
      status: "active"
      url: "https://..."
```

## License

MIT
