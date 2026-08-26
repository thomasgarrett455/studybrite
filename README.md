# StudyBrite

StudyBrite is an AI-powered learning platform built around **classrooms**. You create a classroom for a course, upload the material that belongs to it — syllabus, slides, PDFs, Word docs, photos of handwritten notes — and everything the AI does afterward is grounded in *your* course content instead of generic internet knowledge.

Once a classroom has material in it, you can:

- **Chat** with an assistant that answers using your uploaded notes
- **Generate and take quizzes** built from your material, with scoring and review
- **Build study plans** based on your deadlines and what you've already mastered
- **Teach the bot** (Feynman-style sessions) and get assessed on how well you explained it
- **Generate diagrams** from a topic, rendered as Mermaid
- **Drive the whole app from the home page** with plain-English commands — "make me a quiz on chapter 3 in Biology" — via a tool-using assistant

---

## Technologies

### Frontend

| Technology | What it does here |
|---|---|
| **React 19 + TypeScript** | The UI. Everything under `src/` is a React component tree; TypeScript keeps the API payloads honest between client and server. |
| **Vite 8** | Dev server and bundler. Gives instant hot-reload during development and produces the static `dist/` folder that gets deployed. |
| **React Router 7** | Client-side routing (`/login`, `/signup`, classroom views) with an auth guard on protected routes. |
| **Tailwind CSS 4** | Utility-class styling, applied directly in the JSX rather than in separate stylesheets. |
| **react-markdown + remark-gfm** | Renders the AI's markdown replies — tables, code blocks, lists — as real HTML instead of raw text. |
| **Mermaid** | Turns AI-generated diagram source into an actual rendered diagram in the browser. |

### Backend

| Technology | What it does here |
|---|---|
| **Node + Express 5** | The REST API. Routes live in `server/src/routes/`, one file per feature area, all mounted under `/api`. |
| **TypeScript + tsx** | The server is written in TypeScript and run directly by `tsx` — no separate build step in development. |
| **Prisma 7** | The ORM and migration tool. The schema in `server/prisma/schema.prisma` is the source of truth; Prisma generates a fully typed database client from it. |
| **MariaDB** | The relational database — users, classrooms, materials, quizzes, attempts, chat messages, study plans, diagrams. Connected through Prisma's MariaDB driver adapter. |
| **JWT + bcrypt** | Auth. Passwords are hashed with bcrypt; login returns a signed JWT that the frontend stores and sends on every request. The `requireAuth` middleware verifies it. |
| **Zod** | Runtime validation of request bodies, so bad input is rejected at the edge instead of blowing up deeper in a route. |
| **Multer** | Handles file uploads (in memory, 15 MB cap) before they're passed to the extraction pipeline. |

### AI layer

This is the part that makes StudyBrite more than a CRUD app. It's a **RAG** (retrieval-augmented generation) pipeline:

1. **Extraction** — an uploaded file is turned into markdown text. `pdf-parse` handles PDFs, `mammoth` handles `.docx`, `officeparser` handles `.pptx`, and **OpenAI `gpt-4o`** (which can read images) handles photos of handwritten notes via OCR.
2. **Chunking** — the extracted text is split into ~2000-character chunks with 300 characters of overlap, so a single idea doesn't get sliced in half at a boundary.
3. **Embedding** — each chunk is sent to **OpenAI `text-embedding-3-small`**, which returns a 1536-number vector representing that chunk's *meaning*. Similar ideas end up as similar vectors.
4. **Vector storage** — the vectors go into **Pinecone**, a vector database, tagged with `classroom_id` and `note_id`. Pinecone's job is to answer "which chunks are closest in meaning to this question?" quickly.
5. **Retrieval + generation** — when you ask something, your question is embedded the same way, Pinecone returns the top-k most similar chunks *from that classroom only*, and those chunks are pasted into the prompt sent to **Anthropic Claude** (`claude-sonnet-5`), which writes the actual answer.

Claude also does **tool use** in two places: the home-page assistant is given tools like `list_classrooms`, `create_quiz`, and `create_diagram` and decides which to call from a plain-English command; and the teach-mode assessor returns structured JSON through a tool schema instead of free text.

### Infrastructure

| Technology | What it does here |
|---|---|
| **AWS S3 + CloudFront** | The built frontend is uploaded to an S3 bucket and served through the CloudFront CDN. CloudFront also forwards `/api/*` to the backend, so the browser only ever talks to one origin. |
| **AWS EC2** | Runs the Express server and MariaDB, managed as a `systemd` service. |
| **GitHub Actions** | CI/CD. Every push to `main` SSHes into EC2 to pull, migrate, and restart the backend, and separately builds the frontend, syncs it to S3, and invalidates the CloudFront cache. See `.github/workflows/deploy.yml`. |

---

## Running it locally

### Prerequisites

- **Node.js 22+** and npm
- **MariaDB** (or MySQL) running locally
- API keys for **OpenAI**, **Anthropic**, and **Pinecone** (Pinecone's free tier is fine)

### 1. Clone and install

The frontend and backend are separate npm packages, so install both:

```bash
git clone <repo-url> studybrite
cd studybrite

npm install          # frontend
cd server
npm install          # backend (also runs `prisma generate`)
cd ..
```

### 2. Create the database

```bash
mysql -u root -p -e "CREATE DATABASE studybrite;"
```

### 3. Configure the backend environment

Create `server/.env`:

```env
# Used by the Prisma CLI for migrations
DATABASE_URL="mysql://root:yourpassword@localhost:3306/studybrite"

# Used by the app at runtime (Prisma's MariaDB adapter)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
DB=studybrite

PORT=3000
JWT_SECRET=any-long-random-string

OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
PINECONE_API_KEY=...
PINECONE_INDEX=studybrite
```

> **Why the connection is configured twice:** the Prisma *CLI* (used for migrations) reads the single `DATABASE_URL` string, while the *running app* connects through Prisma's MariaDB driver adapter, which takes host / user / password / database as separate values. Both must point at the same database.

The server validates every one of these on startup in `server/src/config.ts` and refuses to boot if any are missing — a missing key gives you a clear error message instead of a mysterious failure later.

You do **not** need to pre-create the Pinecone index. The app checks for it on first use and creates it with the right dimensions if it doesn't exist.

### 4. Run the migrations

```bash
cd server
npx prisma migrate deploy
```

This creates every table from the migration history in `server/prisma/migrations/`.

### 5. Start both servers

You need two terminals.

**Terminal 1 — backend:**

```bash
cd server
npm run dev          # tsx watch, restarts on save -> http://localhost:3000
```

**Terminal 2 — frontend:**

```bash
npm run dev          # Vite -> http://localhost:5173
```

Open **http://localhost:5173**. The frontend calls relative paths like `/api/classrooms`, and Vite's dev proxy (configured in `vite.config.ts`) forwards anything starting with `/api` to `localhost:3000` — which is why there's no API URL to configure on the frontend.

Confirm the backend is alive with:

```bash
curl http://localhost:3000/api/health
```

### 6. Try it

1. Sign up at `/signup`
2. Create a classroom
3. Upload a PDF or a photo of your notes (this triggers extract → chunk → embed → Pinecone)
4. Ask the chat a question about what you uploaded

---

## Available scripts

**Root (frontend):**

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

**`server/` (backend):**

| Command | Description |
|---|---|
| `npm run dev` | Start the API with auto-restart on file changes |
| `npm start` | Start the API once |
| `npx prisma migrate dev` | Create a new migration after editing the schema |
| `npx prisma migrate deploy` | Apply existing migrations |
| `npx prisma studio` | Browse the database in a GUI |

---

## Project structure

```
studybrite/
├── src/                      # React frontend
│   ├── components/           # Chat, quiz, plan, teach, diagram panels
│   ├── lib/api.ts            # Single API client — the JWT header lives here
│   ├── AppShell.tsx          # Layout + sidebar
│   └── RequireAuth.tsx       # Route guard
│
├── server/
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema (source of truth)
│   │   └── migrations/       # Migration history
│   └── src/
│       ├── app.ts            # Express entry point, mounts all routers
│       ├── config.ts         # Env validation
│       ├── routes/           # One file per feature area
│       ├── middleware/       # Auth, validation, error handling
│       └── lib/              # AI pipeline: extract, ingest, retrieve,
│                             #   openai, pinecone, anthropic, prompts
│
├── deploy/                   # CloudFront config, IAM policy, SPA router
└── .github/workflows/        # CI/CD
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `JWT_SECRET is required` (or similar) on startup | A variable is missing from `server/.env`. The error names the exact one. |
| `ECONNREFUSED` on the frontend | The backend isn't running, so Vite's proxy has nothing to forward to on port 3000. |
| Prisma can't reach the database | Check MariaDB is running and that `DATABASE_URL` and the `DB_*` variables agree. |
| Chat answers ignore your uploads | Ingestion may have failed for that upload. Check the backend logs and confirm `OPENAI_API_KEY` and `PINECONE_API_KEY` are valid. |
| `Cannot find module '../../generated/prisma/client.js'` | Run `npx prisma generate` inside `server/`. |

---

Built by Thomas Garrett as a CSE 499 capstone project.
