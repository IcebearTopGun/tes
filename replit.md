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

## Security Notes

- Passwords are hashed with bcryptjs (cost factor 10)
- JWTs expire after 1 day
- Password fields are stripped from all API responses
- Role-based route authorization enforced server-side
