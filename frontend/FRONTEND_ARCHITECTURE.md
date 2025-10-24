# Frontend Architecture Guide

**Framework:** Next.js (Pages Router) + React + TypeScript
**Status:** Well-organized, production-ready

This guide helps engineers understand and navigate the Ironbad frontend codebase.

---

## Directory Structure

```
frontend/
├── pages/                      # Next.js routes (~150-570 lines each)
│   ├── _app.tsx               # App wrapper with NotificationProvider
│   ├── index.tsx              # Home/dashboard
│   ├── upload.tsx             # Contract upload
│   ├── contracts.tsx          # Contract list
│   ├── contracts/[id].tsx     # Contract detail (tabs: metadata, clauses, issues, chat)
│   ├── review.tsx             # Review workspace with annotation panels & agent
│   └── standard-clauses.tsx   # Configuration
│
├── components/
│   ├── common/                # Shared: Header, Toast, Spinner, NotificationProvider
│   ├── contracts/             # PDFViewer, MetadataForm, ClausesTab, IssuesTab, ChatTab, AgentChatTab, AgentProgressPanel, ContractList
│   ├── review/                # CommentsPanel, RevisionsPanel, SectionAddsPanel, SectionRemovesPanel, ChangelogPanel
│   ├── standard-clauses/      # StandardClauseForm, StandardClauseList
│   ├── upload/                # DropZone, UploadList
│   └── ContractSectionTree.tsx  # Large tree component for contract sections (~1370 lines)
│
├── hooks/                     # Custom React hooks
│   ├── useContract.ts         # Contract data fetching
│   ├── useContractChat.ts     # Contract Q&A chat with SSE streaming
│   ├── useAgentChat.ts        # Agent chat with tool calls & SSE streaming
│   ├── usePDFViewer.ts        # PDF viewer state
│   └── useNotifications.ts    # SSE + toast system
│
├── lib/
│   ├── api/                   # Backend communication (index exports all)
│   │   ├── contracts.ts       # CRUD, status, metadata
│   │   ├── clauses.ts         # Clause operations
│   │   ├── issues.ts          # Issue management
│   │   ├── chat.ts            # Contract Q&A chat operations
│   │   ├── agent.ts           # Agent operations with tool calls
│   │   ├── annotations.ts     # Comments, revisions, sections
│   │   └── standard-clauses.ts
│   │
│   ├── types/                 # TypeScript definitions (index exports all)
│   │   ├── contract.ts
│   │   ├── clause.ts
│   │   ├── issue.ts
│   │   ├── chat.ts            # Contract Q&A chat types
│   │   ├── agent.ts           # Agent chat, messages, events
│   │   ├── upload.ts
│   │   ├── annotation.ts
│   │   └── standard-clause.ts
│   │
│   └── utils/
│       ├── date.ts            # formatDate(), formatDateTime()
│       └── icons.tsx          # getFileIcon(), getStatusBadge()
│
└── styles/
    └── globals.css
```

---

## Core Principles

1. **Separation of Concerns**
   - Pages: routing + high-level state
   - Components: UI + local interactions
   - Hooks: reusable business logic
   - API: all backend calls
   - Types: shared definitions

2. **Type Safety**
   - All code is fully typed
   - Types defined once in `lib/types/`
   - Import via `import { Contract, Issue } from '../../lib/types'`

3. **Error Handling**
   - Use toast notifications, never `alert()`
   - Pattern: try/catch with `showToast({ type, title, message })`

4. **Naming Conventions**
   - Event handlers: `handleX` (internal), `onX` (props)
   - API functions: `fetchX`, `updateX`, `deleteX`
   - Hooks: `useResourceName`

---

## Quick Start Patterns

### Page Component
```tsx
const Page: NextPage = () => {
  const { showToast } = useNotificationContext()
  const [data, setData] = useState<Type[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const result = await fetchData()
      setData(result)
    } catch (err) {
      showToast({ type: 'error', title: 'Load Failed', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Spinner />
  return <Content data={data} />
}
```

### API Call
```typescript
import { fetchContract, updateContractMetadata } from '../../lib/api'

const data = await fetchContract(id)
await updateContractMetadata(id, metadata)
```

### Custom Hook
```typescript
export function useResource(id: string) {
  const [resource, setResource] = useState<Resource | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = async () => {
    setLoading(true)
    const data = await fetchAPI(id)
    setResource(data)
    setLoading(false)
  }

  useEffect(() => { fetch() }, [id])

  return { resource, loading, refetch: fetch, setResource }
}
```

### Toast Notifications
```typescript
const { showToast } = useNotificationContext()

// Success
showToast({ type: 'success', title: 'Saved', message: 'Changes saved' })

// Error
showToast({ type: 'error', title: 'Failed', message: error.message })

// Warning
showToast({ type: 'warning', title: 'Invalid', message: 'Fill required fields' })
```

---

## Key Features & Components

### Contract Upload (`/upload`)
- Drag-and-drop or file picker
- PDF/DOCX support
- Batch ingestion

### Contract List (`/contracts`)
- Status-based actions (Ingest, Analyze)
- Real-time SSE updates
- Navigation to detail view

### Contract Detail (`/contracts/[id]`)
- PDF viewer with zoom/search (react-pdf)
- Tabs: Metadata, Clauses, Issues, Chat
- Resizable splitter
- **Components:** PDFViewer, MetadataForm, ClausesTab, IssuesTab, ChatTab

### Review Page (`/review`)
- Section tree with inline annotations
- Sidebar panels: Comments, Revisions, Section Adds/Removes, Changelog
- Agent chat panel for AI-assisted redlining
- Collapsible panels with dynamic height
- **Components:** ContractSectionTree, AgentChatTab, AgentProgressPanel, CommentsPanel, RevisionsPanel, etc.

### Standard Clauses (`/standard-clauses`)
- Configuration for policy rules
- CRUD operations
- **Components:** StandardClauseForm, StandardClauseList

---

## Making Changes

### Adding a New Page
1. Create `pages/my-page.tsx`
2. Add link in `components/common/Header.tsx`
3. Follow page component pattern above

### Adding a New API Endpoint
1. Add function to appropriate file in `lib/api/`
2. Export from `lib/api/index.ts`
3. Add types to `lib/types/` if needed

### Adding a New Component
1. Place in appropriate directory:
   - `components/common/` - shared across pages
   - `components/{domain}/` - domain-specific
2. Create TypeScript interface for props
3. Use `showToast()` for user feedback

### Adding a New Hook
1. Create `hooks/useMyHook.ts`
2. Return object with data + actions
3. Include loading/error states for async operations

---

## Important Notes

### Real-time Updates
- SSE connection via `useNotifications()` hook
- Automatically dispatches `contractStatusUpdate` events
- Components listen via `window.addEventListener('contractStatusUpdate', ...)`

### PDF Rendering
- Uses `react-pdf` with dynamic import for SSR
- Canvas-based rendering
- Search highlights via text layer

### Chat System
- **Contract Chat:** RAG-based Q&A about contract content
- **Agent Chat:** AI agent with tool-calling capabilities for redlining
- SSE streaming for AI responses
- Token-by-token updates
- Abort controller for cancellation
- Progress tracking for agent tool calls and reasoning

### Section Tree Annotations
- Complex component (~1370 lines)
- Handles comments, revisions, section operations
- Text-based offset calculations
- Click navigation between tree and panels

### Agent System
- **AgentChatTab:** Full-featured agent chat interface
- **AgentProgressPanel:** Collapsible panel showing tool calls and reasoning
- SSE event handling for run lifecycle (created, in_progress, responding, completed, failed)
- Tool call visualization with args and icons
- Real-time progress updates

---

## Common Tasks

**Add toast notification:**
```typescript
const { showToast } = useNotificationContext()
showToast({ type: 'error', title: 'Failed', message: 'Error message' })
```

**Fetch contract data:**
```typescript
import { fetchContract } from '../../lib/api'
const contract = await fetchContract(id)
```

**Handle async action:**
```typescript
try {
  await performAction()
  showToast({ type: 'success', title: 'Done', message: 'Success' })
} catch (error) {
  showToast({ type: 'error', title: 'Failed', message: error.message })
}
```

**Use contract hook:**
```typescript
const { contract, loading, error, refetch } = useContract(contractId)
```

**Use agent chat hook:**
```typescript
const {
  currentChatThread,
  chatMessages,
  isChatLoading,
  isSendingMessage,
  chatInput,
  setChatInput,
  sendMessage,
  handleNewChat,
  messageProgress
} = useAgentChat(contractId, {
  onError: (title, message) => showToast({ type: 'error', title, message }),
  onToolCall: (toolName, toolCallId, args) => console.log('Tool call:', toolName),
  onRunCompleted: () => refetch()
})
```

---

## Recommendations for Future Work

**High Priority:**
- Extract status strings to `lib/constants.ts` (avoid magic strings)
- Add error boundaries around major components (especially agent SSE streams)

**Medium Priority:**
- Add component index exports for cleaner imports
- Move ContractSectionTree to `components/review/` or `components/contracts/`
- Extract repeated inline styles to constants (especially in AgentProgressPanel)
- Consider unifying chat and agent chat hooks/components for code reuse

**Low Priority:**
- Consider CSS Modules for better style organization
- Add React Query/SWR for data fetching
- Add retry logic for failed agent tool calls

---

## Tech Stack Details

- **Framework:** Next.js 13+ (Pages Router)
- **Language:** TypeScript (strict mode)
- **Styling:** CSS + inline styles
- **State:** React Hooks (useState, useEffect, useContext)
- **PDF:** react-pdf + pdfjs-dist
- **Markdown:** react-markdown
- **Real-time:** Server-Sent Events (SSE)

---

For implementation details, refer to the specific component/hook files. All code is fully typed with clear interfaces.
