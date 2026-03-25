# client/ — Frontend Guide

The frontend is React 18 with React Router, TanStack Query, Tailwind CSS, and Recharts. Dev server runs on port 3460 and proxies `/api/*` + `/cubejs-api/*` to the backend on :3461.

## Structure

```
client/src/
  App.tsx               # Router setup, route definitions, AuthGuard wrapping
  main.tsx              # React entry point
  pages/                # One component per route — named *Page.tsx
  components/           # Shared, reusable UI components
  hooks/                # Custom hooks (data fetching, UI utilities)
  contexts/             # AuthContext — current user, login/logout
  theme/                # CSS custom properties, dark/light mode
```

## Adding a Page

1. Create `client/src/pages/MyFeaturePage.tsx`
2. Add a route in `App.tsx`:
   ```tsx
   <Route path="/my-feature" element={<AuthGuard><MyFeaturePage /></AuthGuard>} />
   ```
3. Add a nav link if it belongs in the sidebar (see `Layout.tsx`)

## Data Fetching

Use TanStack Query. See existing pages for the pattern:

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['my-resource'],
  queryFn: () => fetch('/api/my-resource').then(r => r.json()),
})

const mutation = useMutation({
  mutationFn: (body) => fetch('/api/my-resource', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-resource'] }),
})
```

## Modal / Dialog Rules

**Never use `alert()`, `confirm()`, or `prompt()`.**

Use the provided components:

```tsx
// Declarative
import { ConfirmModal, PromptModal } from '../components/Modal'
<ConfirmModal open={open} onConfirm={handleConfirm} onCancel={() => setOpen(false)} message="Are you sure?" />

// Imperative (from hooks)
import { useConfirm } from '../hooks/useConfirm'
import { usePrompt } from '../hooks/usePrompt'

const confirm = useConfirm()
const confirmed = await confirm('Delete this dashboard?')

const prompt = usePrompt()
const name = await prompt('Enter a name', { placeholder: 'Dashboard name' })
```

## Auth

Use `AuthContext` to get the current user:

```tsx
import { useAuth } from '../contexts/AuthContext'

const { user, isLoading } = useAuth()
```

Role-based rendering — check `user.role === 'admin'` for admin-only UI elements. Route-level protection uses `<AuthGuard>`.

## Theming

CSS variables are declared in `client/src/theme/`. Dark/light mode toggled via `<ThemeToggle>` and persisted in `localStorage`. Prefer CSS variables over hardcoded colors.

## Conventions

- Pages handle routing and data — keep them thin by extracting logic into hooks
- Shared state goes in TanStack Query cache, not React context (except auth)
- Component files match their export name: `ConnectionForm.tsx` exports `ConnectionForm`
- No `alert()`, `confirm()`, or `prompt()` — see modal rules above
