# ZENOX — Complete Project Context
## For GitLab Duo (Claude Opus) — Read This Before Touching Any File

---

## What Is Zenox

An AI research and assistant platform. It starts as a smart chatbot, grows into a research engine with contradiction detection and source reliability scoring, and eventually executes tasks autonomously.

**Current stage:** Phase 1 — Basic chatbot MVP.

**Long-term vision:**
```
Phase 1  → Stable chatbot (current)
Phase 2  → Smarter structured responses
Phase 3  → Research engine (core differentiator)
Phase 4  → Research enhancements
Phase 5  → Productivity layer
Phase 6  → Tool integrations
Phase 7  → Lightweight execution
Phase 8  → Autonomous workflows
Phase 9  → Full research agent
Phase 10 → Outcome platform
```

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React + Vite + TypeScript | Vercel |
| Backend | FastAPI Python | Render |
| Database | Supabase PostgreSQL | Supabase cloud |
| Auth | Supabase Auth | Supabase cloud |
| Primary AI | Gemini API (Google AI Studio) | External |
| Backup AI | Groq API | External |
| Search | Serper API (future) | External |

**Live URLs:**
- Backend: https://zenox-o03p.onrender.com
- Frontend: deployed on Vercel (check your Vercel dashboard)

---

## Architecture Rules — NEVER VIOLATE THESE

**Rule 1 — Nested modules, maximum 3 levels deep:**
```
Level 1 → Feature         (auth, chat, research)
Level 2 → Sub-feature     (login, register, messages)
Level 3 → Component       (specific helper)
Level 4 → NEVER GO HERE
```

**Rule 2 — Every module owns its own files:**
Each module has its own router.py, service.py, schema.py (backend)
and its own Component.tsx, component.types.ts (frontend).
Nothing shared unless it is truly shared across the whole app.

**Rule 3 — Registry system, not god file:**
Each module registers itself. main.py and App.tsx import only
the registry. Adding a module = create it + add one line to registry.

**Rule 4 — Module size = one responsibility:**
If a module does two things, split it. If smaller than one clear
responsibility, it is too small.

**Rule 5 — Core folder, never global:**
The shared backend utilities live in backend/app/core/ — NOT global.
`global` is a reserved Python keyword and causes SyntaxError on import.

**Rule 6 — Never rewrite working code without evidence:**
Only change code if a bug is proven or user data shows a problem.

**Rule 7 — Daily rule before coding:**
```
Module I am building today:
It does exactly:
I will know it is done when:
```

---

## Complete Folder Structure (Current State)

```
zenox/
│
├── frontend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── registry.ts
│   │   │   ├── auth/
│   │   │   │   ├── auth.index.ts
│   │   │   │   ├── login/
│   │   │   │   │   ├── Login.tsx         ✅ BUILT
│   │   │   │   │   └── login.types.ts    ✅ BUILT
│   │   │   │   └── register/
│   │   │   │       ├── Register.tsx      ✅ BUILT
│   │   │   │       └── register.types.ts ✅ BUILT
│   │   │   ├── chat/
│   │   │   │   ├── chat.index.ts
│   │   │   │   ├── messages/
│   │   │   │   │   ├── Messages.tsx      ✅ BUILT
│   │   │   │   │   └── messages.types.ts ✅ BUILT
│   │   │   │   ├── input/
│   │   │   │   │   ├── ChatInput.tsx     ✅ BUILT
│   │   │   │   │   └── input.types.ts    ✅ BUILT
│   │   │   │   └── status/
│   │   │   │       ├── StatusPanel.tsx   ✅ BUILT
│   │   │   │       └── status.types.ts   ✅ BUILT
│   │   │   └── dashboard/
│   │   │       └── sessions/
│   │   │           └── Sessions.tsx      ✅ BUILT (mock data)
│   │   ├── global/
│   │   │   ├── api.ts                    ✅ BUILT
│   │   │   ├── store.ts                  ✅ BUILT
│   │   │   └── theme.ts                  ✅ BUILT
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── utils/
│   │   ├── App.tsx                       ✅ BUILT
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── core/                         ← shared utilities
│   │   │   ├── config.py                 ✅ BUILT
│   │   │   ├── database.py               ✅ BUILT
│   │   │   ├── ai_provider.py            ✅ BUILT (has bug)
│   │   │   ├── auth_middleware.py        ✅ BUILT
│   │   │   └── errors.py                 (empty)
│   │   ├── modules/
│   │   │   ├── registry.py               ✅ BUILT
│   │   │   ├── auth/
│   │   │   │   ├── index.py              ✅ BUILT
│   │   │   │   ├── login/
│   │   │   │   │   ├── router.py         ✅ BUILT
│   │   │   │   │   ├── service.py        ✅ BUILT
│   │   │   │   │   └── schema.py         ✅ BUILT
│   │   │   │   └── register/
│   │   │   │       ├── router.py         ✅ BUILT
│   │   │   │       ├── service.py        ✅ BUILT
│   │   │   │       └── schema.py         ✅ BUILT
│   │   │   └── chat/
│   │   │       ├── index.py              ✅ BUILT
│   │   │       ├── messages/
│   │   │       │   ├── router.py         ✅ BUILT
│   │   │       │   ├── service.py        ✅ BUILT (has bug)
│   │   │       │   └── schema.py         ✅ BUILT
│   │   │       └── sessions/
│   │   │           ├── router.py         ✅ BUILT
│   │   │           ├── service.py        ✅ BUILT
│   │   │           └── schema.py         ✅ BUILT
│   │   └── main.py                       ✅ BUILT
│   ├── requirements.txt
│   └── .env.example
│
├── .gitignore
└── README.md
```

---

## Environment Variables (Render Dashboard)

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
SERP_API_KEY=
FRONTEND_URL=https://your-vercel-url.vercel.app
```

Frontend (Vercel Dashboard):
```
VITE_BACKEND_URL=https://zenox-o03p.onrender.com
```

---

## Database Schema (Already Created in Supabase)

```sql
-- Users
create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar unique not null,
  created_at timestamp default now(),
  plan varchar default 'free'
);

-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  title varchar default 'New Chat',
  mode varchar default 'chat',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  user_id uuid,
  role varchar not null,
  content text not null,
  created_at timestamp default now()
);

-- Analytics
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_name varchar not null,
  properties jsonb default '{}',
  created_at timestamp default now()
);

-- Status updates
create table status_updates (
  id uuid primary key default gen_random_uuid(),
  message_id uuid,
  text varchar not null,
  type varchar default 'info',
  created_at timestamp default now()
);
```

RLS is enabled on all tables.

---

## API Endpoints (Currently Built)

```
Auth:
POST /auth/register     → creates Supabase auth user
POST /auth/login        → returns JWT access_token
POST /auth/logout       → signs out
GET  /auth/me           → returns current user from token

Chat:
POST /chat/message      → sends message, gets AI response
POST /chat/sessions     → creates new session
GET  /chat/sessions     → gets all sessions for user
GET  /chat/sessions/{id}/messages → gets messages for session

Health:
GET  /                  → returns {"status": "alive"}
```

---

## Design System

```typescript
export const theme = {
  primary: '#7C3AED',      // purple — buttons, user messages
  background: '#0F0F0F',   // main background
  surface: '#1A1A1A',      // cards, sidebars, panels
  border: '#2A2A2A',       // borders
  textPrimary: '#E5E5E5',  // main text
  textSecondary: '#888888',// secondary text
  success: '#22C55E',      // success states
  error: '#EF4444',        // error states
}
// Font: Inter (loaded from Google Fonts)
// Code font: JetBrains Mono
```

---

## What Is Working Right Now

```
✅ Register new account (real Supabase Auth)
✅ Login with email and password
✅ Stay logged in after refresh (localStorage)
✅ Sign out
✅ Chat UI with messages, status panel, sessions sidebar
✅ Loading dots animation when waiting for response
✅ Error handling — errors show in chat area
✅ Auth connected to real Supabase backend
✅ Backend deployed on Render
✅ Frontend deployed on Vercel
✅ AI provider with 7-model fallback (Gemini → Groq)
✅ 90-second frontend timeout with abort controller
```

---

## What Is NOT Working (Bugs)

### BUG 1 — CRITICAL — AI responses timing out
**File:** backend/app/core/ai_provider.py
**Problem:** Each AI model hangs silently for 15-20 seconds
before giving up. With 7 models total, worst case is 90-140
seconds. Frontend times out at 90 seconds before getting response.
**Fix needed:** Add asyncio.wait_for(timeout=10.0) around each
individual model call. 7 models × 10 seconds = 70 seconds maximum.

**Exact fix:**
```python
import time

async def call_ai(messages, system_prompt="", max_tokens=1000):
    if GEMINI_API_KEY:
        for model_name in GEMINI_MODELS:
            try:
                print(f"[AI] Trying {model_name}...")
                start = time.time()
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        _call_gemini_sync,
                        model_name, messages,
                        system_prompt, max_tokens
                    ),
                    timeout=10.0
                )
                print(f"[AI] {model_name} OK in {round(time.time()-start,2)}s")
                return result
            except asyncio.TimeoutError:
                print(f"[AI] {model_name} timed out")
                continue
            except Exception as e:
                print(f"[AI] {model_name} failed: {e}")
                continue

    if GROQ_API_KEY:
        for model_name in GROQ_MODELS:
            try:
                print(f"[AI] Trying Groq {model_name}...")
                start = time.time()
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        _call_groq_sync,
                        model_name, messages,
                        system_prompt, max_tokens
                    ),
                    timeout=10.0
                )
                print(f"[AI] Groq {model_name} OK in {round(time.time()-start,2)}s")
                return result
            except asyncio.TimeoutError:
                print(f"[AI] Groq {model_name} timed out")
                continue
            except Exception as e:
                print(f"[AI] Groq {model_name} failed: {e}")
                continue

    raise Exception("All AI models unavailable. Please try again later.")
```

### BUG 2 — Sessions sidebar shows mock data
**File:** frontend/src/modules/dashboard/sessions/Sessions.tsx
**Problem:** Sessions are hardcoded. Not loading from Supabase.
**Fix needed:** Module 1.4 — Session management.

### BUG 3 — Messages not saved after refresh
**File:** backend/app/modules/chat/messages/service.py
**Problem:** DB insert runs but session_id may be invalid.
Messages disappear on page refresh.
**Fix needed:** Part of Module 1.4.

### BUG 4 — Render sleeps after 15 minutes
**Problem:** Render free tier sleeps after inactivity.
First request takes 30-60 seconds on cold start.
**Fix:** Set up UptimeRobot (free) to ping
https://zenox-o03p.onrender.com every 5 minutes.

### BUG 5 — Test files in repo root
**Files:** test.js, test2.js, test_ai.js, test_ai_2.js,
test_http.js, test_ver.js
**Fix:** Delete all of them.

---

## Modules Completed

```
✅ 0.1 — GitHub Repository
✅ 0.2 — Frontend Skeleton
✅ 0.3 — Backend Skeleton
✅ 0.4 — Connect Frontend to Backend
✅ 0.5 — Supabase Tables Created
✅ 0.6 — Deployed to Render + Vercel
✅ 0.7 — AI Provider with 7-model fallback
✅ 1.1 — Auth Backend + Frontend
✅ 1.2 — Chat UI Shell
✅ 1.3 — Real AI connected to chat
```

---

## Modules To Build Next (Phase 1)

### Module 1.4 — Session Management
**Goal:** Real sessions created in DB. Load past conversations.

Backend:
- Auto-create session when user sends first message if no session exists
- GET /chat/sessions returns real sessions from Supabase
- GET /chat/sessions/{id}/messages returns real messages

Frontend:
- Sessions.tsx loads real sessions from backend on login
- Clicking session loads its messages
- New Chat button creates new session in DB
- Session title auto-generated from first message

---

### Module 1.5 — Streaming Responses
**Goal:** AI response appears word by word, not all at once.

Backend:
- New endpoint GET /chat/stream using FastAPI StreamingResponse
- Streams Gemini response as Server-Sent Events (SSE)

Frontend:
- api.ts reads SSE stream
- Messages.tsx updates content word by word as stream arrives
- Loading dots replaced by streaming text

---

### Module 1.6 — Analytics
**Goal:** Know what users actually do so you know what to build.

Backend:
- POST /analytics/event saves event to analytics_events table

Frontend:
- Track: user_signed_up, user_logged_in, message_sent,
  session_created, error_occurred
- Fire and forget — never blocks UI

---

### Module 1.7 — Phase 1 Polish
**Goal:** Make it reliable and mobile-friendly before launch.

- Mobile responsive layout
- Error boundaries (app never shows white screen)
- Loading states on all buttons
- Delete test files from root
- UptimeRobot setup confirmed

---

## Modules To Build (Phase 2+)

### Phase 2 — Intelligence Layer
- Structured responses (Goal → Analysis → Plan → Result)
- Visible reasoning in status panel (short status updates only,
  NOT walls of text)

### Phase 3 — Research Engine (Core Differentiator)
- Web search via Serper API
- Multi-source analysis
- Contradiction detection between sources
- Source reliability scoring
- Confidence scoring (High / Medium / Low)
- Structured research reports with citations

### Phase 4 — Research Enhancements
- Deep research (search → validate → cross-check → report)
- Export to PDF, DOCX, Markdown
- Research workspace (save and revisit)

### Phase 5 — Productivity
- Document generator
- Notes and collections
- Only build if it strengthens research

### Phase 6 — Tool Integrations
- GitHub repository reader
- Google Drive
- Notion

### Phase 7 — Lightweight Execution
- Code generation and execution (Judge0)
- File management

### Phase 8 — Autonomous Workflows
- Planner Agent, Executor Agent, Critic Agent
- Error recovery system

### Phase 9+ — Full Autonomy
- Long-running research agent
- Outcome-focused delivery

---

## Current Priority Order

```
1. Fix BUG 1 (ai_provider.py timeout) — FIRST THING
2. Set up UptimeRobot — keeps Render awake
3. Delete test files from repo root
4. Build Module 1.4 (Session management)
5. Build Module 1.5 (Streaming)
6. Build Module 1.6 (Analytics)
7. Build Module 1.7 (Polish)
8. Launch Phase 1
9. Get 20 real users
10. Start Phase 2
```

---

## Important Rules When Writing Code

1. NEVER use "global" as a folder or module name — Python reserved keyword
2. ALWAYS import from app.core.* not app.global.*
3. ALWAYS use asyncio.to_thread() for synchronous SDK calls inside async functions
4. NEVER hardcode colors — always use theme.ts values
5. NEVER put logic in main.py or App.tsx — use modules
6. ALWAYS add error handling that shows in chat area, not just status panel
7. Session_id must be a valid UUID — never send 'default' or empty string
8. Use SUPABASE_SERVICE_KEY for all backend DB operations (bypasses RLS safely)
9. Use SUPABASE_ANON_KEY only for frontend (if ever needed)
10. All API keys loaded in backend/app/core/config.py only

---

## How The Codebase Is Connected

```
Frontend:
App.tsx
  → reads store.ts (auth state, token, current session)
  → renders Login.tsx or Register.tsx if not logged in
  → renders main layout if logged in:
      Sessions.tsx (left, 250px)
      Messages.tsx (center, flex)
      StatusPanel.tsx (right, 300px)
      ChatInput.tsx (bottom, full width)
  → handleSend() calls api.ts → sendMessage()
  → api.ts → fetchWithAuth() → adds Bearer token to all requests

Backend:
main.py
  → loads registry.py
  → registry.py imports auth router + chat router
  → auth router: /auth/register, /auth/login, /auth/logout, /auth/me
  → chat router: /chat/message, /chat/sessions, /chat/sessions/{id}/messages
  → all protected routes use Depends(get_current_user) from auth_middleware.py
  → chat/messages/service.py calls ai_provider.call_ai()
  → ai_provider.py tries 7 models in order, returns first success
```

---

## What To Do First In GitLab

**Step 1:** Read this entire document.

**Step 2:** Fix backend/app/core/ai_provider.py using
the exact code in BUG 1 section above.
Keep _call_gemini_sync and _call_groq_sync exactly as they are.
Only rewrite call_ai() and add import time.

**Step 3:** Add this test endpoint to backend/app/main.py:
```python
@app.get("/test-ai")
async def test_ai():
    try:
        from app.core.ai_provider import call_ai
        from app.core.config import GEMINI_API_KEY, GROQ_API_KEY
        response = await call_ai(
            messages=[{"role": "user", "content": "Say hello"}],
            system_prompt="Reply in one word only",
            max_tokens=10
        )
        return {
            "success": True,
            "response": response,
            "gemini_key_set": bool(GEMINI_API_KEY),
            "groq_key_set": bool(GROQ_API_KEY)
        }
    except Exception as e:
        from app.core.config import GEMINI_API_KEY, GROQ_API_KEY
        return {
            "success": False,
            "error": str(e),
            "gemini_key_set": bool(GEMINI_API_KEY),
            "groq_key_set": bool(GROQ_API_KEY)
        }
```

**Step 4:** Delete these files from root:
test.js, test2.js, test_ai.js, test_ai_2.js, test_http.js, test_ver.js

**Step 5:** Commit. Wait for Render to redeploy.
Open https://zenox-o03p.onrender.com/test-ai
Tell us what it returns.

---

## This Is Zenox v1.0
## Next milestone: Get AI chat working = Zenox v1.1
