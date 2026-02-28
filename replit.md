# EduSync — School Exam Evaluation Platform

A full-stack web application for teachers and students to manage exams, process answer sheets using AI (OCR + GPT-4o), grade homework, and track performance with analytics.

## Architecture

- **Frontend**: React + TypeScript + Vite, TailwindCSS, shadcn/ui components, Wouter for routing
- **Backend**: Express.js (TypeScript) served via tsx in development
- **Database**: PostgreSQL via Drizzle ORM (Replit-managed Neon database)
- **Auth**: JWT-based authentication (stored in localStorage), bcryptjs for password hashing
- **AI**: OpenAI GPT-4o via Replit AI Integrations (OCR + evaluation + chat)

## Key Files

- `server/index.ts` — Express server entry point
- `server/routes.ts` — All API routes
- `server/storage.ts` — Database access layer (DatabaseStorage class)
- `server/db.ts` — Drizzle ORM + pg Pool connection
- `shared/schema.ts` — Full database schema
- `shared/routes.ts` — Shared API route definitions and Zod schemas
- `client/src/App.tsx` — React app entry point
- `client/src/pages/` — Page components

## Pages

- `/` — Landing page
- `/login`, `/signup` — Auth pages (teacher + student)
- `/teacher-dashboard` — Main teacher interface (tabs: Overview, Exams, Sheets, Analytics)
- `/student-dashboard` — Student analytics + AI coach chat
- `/ncert-chapters` — NCERT chapter reference management (teacher only)

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

## Database Tables

| Table | Purpose |
|-------|---------|
| `teachers` | Teacher accounts |
| `students` | Student accounts |
| `exams` | Exams with questions, model answers, marking scheme (all text) |
| `answer_sheets` | Individual student answer sheets (single upload) |
| `evaluations` | AI-generated evaluation results per answer sheet |
| `answer_sheet_pages` | Individual pages uploaded via bulk upload |
| `merged_answer_scripts` | Merged scripts per student (from bulk upload) |
| `ncert_chapters` | NCERT reference content used in evaluation |
| `conversations` | Chat conversations (teacher or student) |
| `messages` | Chat messages per conversation |

## AI Pipeline Notes

- **OCR route** (`POST /api/exams/:id/process-answer-sheet`): sends single answer sheet image to GPT-4o vision
- **Bulk OCR** (`POST /api/exams/:id/bulk-upload`): accepts multiple images, OCRs all in parallel, groups by admission number, orders by sheet number, merges into one script per student
- **Evaluation route** (`POST /api/answer-sheets/:id/evaluate`): uses stored model answer text + marking scheme + NCERT chapters as context; returns per-question `chapter`, `deviation_reason`, `improvement_suggestion`
- **Merged script evaluation** (`POST /api/merged-scripts/:id/evaluate`): same evaluation pipeline for bulk-uploaded scripts
- **Exam text fields**: Create Exam form uses three textareas (questionText, modelAnswerText, markingSchemeText) — no file uploads
- **Exam categories**: mid_term, unit_test, end_sem, class_test — exam name auto-generated as `YYYY-MM-DD-subject-category-class`
- **NCERT context**: chapters fetched by class+subject and injected into AI evaluation prompt
- Replit AI Integration env vars (`AI_INTEGRATIONS_OPENAI_*`) are set automatically

## Teacher Features

- Create exams with category (Mid Term / Unit Test / End Sem / Class Test) — auto-names generated
- Single answer sheet upload (OCR) → evaluate per-sheet
- **Bulk upload**: select multiple image files → parallel OCR → auto-grouped by student → merge → evaluate
- Evaluation results include: chapter mapping, deviation reason, improvement suggestions
- AI Analyst chat: ask questions about class performance using real evaluation data
- Analytics: class averages, marks distribution, improvement trends, student performance

## Student Features

- Real-time marks from actual evaluations (by admission number)
- Improvement areas pulled from question-level AI feedback
- AI Coach chat: personalised academic advice using the student's evaluation data

## Security Notes

- Passwords hashed with bcryptjs
- JWT tokens expire after 1 day
- All `/api/*` routes require valid JWT (except auth routes)
- Teachers can only access their own exams/students
