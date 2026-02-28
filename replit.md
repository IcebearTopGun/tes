# School Exam Evaluator

A full-stack web application for teachers and students to manage exams, process answer sheets using AI (OCR), and track performance.

## Architecture

- **Frontend**: React + TypeScript + Vite, TailwindCSS, shadcn/ui components, Wouter for routing
- **Backend**: Express.js (TypeScript) served via tsx in development
- **Database**: PostgreSQL via Drizzle ORM (Replit-managed Neon database)
- **Auth**: JWT-based authentication (stored in localStorage), bcryptjs for password hashing
- **AI**: OpenAI GPT-4o via Replit AI Integrations (for OCR of answer sheets)

## Key Files

- `server/index.ts` — Express server entry point
- `server/routes.ts` — All API routes (auth, dashboard, exams, answer sheet processing)
- `server/storage.ts` — Database access layer (DatabaseStorage class)
- `server/db.ts` — Drizzle ORM + pg Pool connection
- `shared/schema.ts` — Database schema (teachers, students, exams, answerSheets tables)
- `shared/routes.ts` — Shared API route definitions and Zod schemas
- `shared/models/chat.ts` — Chat/conversation schema (Replit AI integration scaffold)
- `client/src/App.tsx` — React app entry point
- `client/src/pages/` — Page components (auth, dashboard, home)

## Running

- Development: `npm run dev` (starts tsx server on port 5000)
- Build: `npm run build`
- Production: `npm start`
- DB schema push: `npm run db:push`

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (Replit-managed)
- `SESSION_SECRET` — JWT signing secret
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI key via Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI base URL via Replit AI Integrations
- `PORT` — Server port (default: 5000)

## Default Seed Data

On startup, the server seeds default accounts if they don't exist:
- Teacher: employeeId `T001`, password `password123`
- Student: admissionNumber `S001`, password `password123`

## Integration Tests

Run the full pipeline test suite with:
```bash
npx tsx tests/integration/run-pipeline.ts
# or
bash tests/integration/run.sh
```

Tests validate (server must be running on port 5000):
- Teacher authentication
- Exam creation
- Answer sheet OCR (GPT-4o vision) for 4 scoring scenarios (~100%, ~99%, ~78%, ~50%)
- Evaluation scoring — marks awarded, stored in DB, and in expected range
- Relative ordering: higher-ability students always outscore lower-ability ones
- Conversational AI chat endpoint

Test files: `tests/integration/`
- `run-pipeline.ts` — main test runner
- `generate-sheet.ts` — generates PNG answer sheet images (`@napi-rs/canvas`)
- `api.ts` — HTTP client helpers
- `run.sh` — shell wrapper

## AI Pipeline Notes

- **OCR route** (`POST /api/exams/:id/process-answer-sheet`): sends answer sheet image to GPT-4o vision, extracts student name, admission number, and answers array
- **Evaluation route** (`POST /api/answer-sheets/:id/evaluate`): extracts model answer as text first (`extractDocumentText`), then does text-to-text GPT-4o comparison — no vision in evaluation call
- **Exam text fields**: Create Exam form uses three textareas — Questions (`questionText`), Model Answer Key (`modelAnswerText`), Marking Scheme (`markingSchemeText`) — replacing all PDF/image file uploads
- Model answer text takes priority over any legacy uploaded URL in evaluation; marking scheme text similarly preferred over URL
- Answer sheets (student submissions) must be images (JPEG/PNG/WEBP); PDFs blocked with clear error
- Replit AI Integration env vars (`AI_INTEGRATIONS_OPENAI_*`) are set automatically — no manual API key management needed

## Security Notes

- Passwords are hashed with bcryptjs (cost factor 10)
- JWTs expire after 1 day
- Password fields are stripped from all API responses
- Role-based route authorization enforced server-side
