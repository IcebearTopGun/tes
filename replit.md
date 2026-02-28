# EduSync — School Exam Evaluation Platform

A full-stack web application for teachers, students, and administrators to manage exams, process answer sheets using AI (OCR + GPT-4o), grade homework, and track performance with analytics.

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
- `client/src/components/ProfilePanel.tsx` — Shared profile management component
- `client/src/dashboard.css` — Custom CSS design system for all dashboards

## Pages

- `/` — Landing page
- `/auth` — Auth page (3-tab login: Student / Teacher / Admin)
- `/teacher-dashboard` — Full teacher interface (Overview, Exams, Sheets, Homework, Profile tabs)
- `/student-dashboard` — Student analytics + AI coach + homework + Profile tabs
- `/admin-dashboard` — Admin governance dashboard (Overview, Students, Teachers, Profile)

## Running

- Development: `npm run dev` (starts tsx server on port 5008)
- Build: `npm run build`
- Production: `npm start`
- DB schema push: `npm run db:push`

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (Replit-managed)
- `SESSION_SECRET` — JWT signing secret
- `AI_INTEGRATIONS_OPENAI_API_KEY` — OpenAI key via Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI base URL via Replit AI Integrations
- `PORT` — Server port (default: 5008)

## Seed Accounts (all passwords: "123")

- **Admin**: A001 → admin@school.edu
- **Teachers**: T001–T005 (Ramesh Sharma, Sunita Patel, Vikram Iyer, Meena Krishnan, Rajan Singh)
- **Students**: S001–S050 across Class 9A, 9B, 10A, 10B

## Database Tables

| Table | Purpose |
|-------|---------|
| `teachers` | Teacher accounts (with phone, profilePhotoUrl, subjectsAssigned, classesAssigned) |
| `students` | Student accounts (with phone, profilePhotoUrl, studentClass, section) |
| `admins` | Admin accounts (with phone, profilePhotoUrl) |
| `exams` | Exams with questions, model answers, marking scheme |
| `answer_sheets` | Individual student answer sheets |
| `evaluations` | AI-generated evaluation results per answer sheet |
| `answer_sheet_pages` | Pages from bulk upload |
| `merged_answer_scripts` | Merged scripts per student from bulk upload |
| `homework` | Homework assignments |
| `homework_submissions` | Student homework submissions with correctnessScore |
| `ncert_chapters` | NCERT reference content |
| `conversations` | Chat conversations |
| `messages` | Chat messages per conversation |

## Admin Features

- 3-tab login (Student / Teacher / Admin) on `/auth`
- Admin Dashboard with exact TeacherDashboard nav layout (sf-root > sf-topnav + sf-page)
- **6 AI-driven KPIs** in 3-column funnel:
  1. School Academic Health Score (composite metric + grade A/B/C/D)
  2. Academic Improvement Index (% of students improving exam over exam)
  3. Students Requiring Intervention (count with avg < 50%)
  4. Teacher Effectiveness Score (consistency of class performance)
  5. Learning Engagement Index (homework submission rate)
  6. Homework Effectiveness Index (correctness score avg)
- School-wide analytics charts: class performance, subject difficulty, teacher stats, marks distribution
- **More Insights** collapsible section: class stability, subject difficulty, rank distribution, engagement alerts
- All Students directory (grouped by class-section)
- All Teachers directory with subject/class assignments
- AI Analyst chat sidebar (identical to TeacherDashboard)
- Profile tab (via shared ProfilePanel component)
- API routes: GET /api/admin/stats, /api/admin/analytics, /api/admin/students, /api/admin/teachers, /api/admin/kpis

## Profile System

- **Shared ProfilePanel** component (`client/src/components/ProfilePanel.tsx`) used in all 3 dashboards
- GET `/api/profile` — fetch current user's profile (all roles)
- PATCH `/api/profile` — update name and phone (all roles)
- POST `/api/profile/upload-photo` — upload profile photo as base64 (stored to `/uploads/profile-images/`)
- Photos served statically at `/uploads/profile-images/...`
- Role-specific fields shown (class/section for students, subjects/classes for teachers, designation for admins)

## Teacher Features

- Create exams with category (Mid Term / Unit Test / End Sem / Class Test)
- Single answer sheet upload (OCR) → evaluate per-sheet
- Bulk upload: select multiple image files → parallel OCR → auto-grouped by student → merge → evaluate
- Evaluation results include: chapter mapping, deviation reason, improvement suggestions
- Homework management: assign, track submissions, grade
- AI Analyst chat: ask questions about class performance
- Analytics: class averages, marks distribution, improvement trends
- **Profile tab** with photo upload, name/phone editing

## Student Features

- Real-time marks from actual evaluations (by admission number)
- Improvement areas pulled from question-level AI feedback
- AI Performance Profile (radar chart from AI analysis when OpenAI key available)
- Homework: view assignments, submit answers, track status
- AI Coach chat: personalised academic advice using the student's evaluation data
- **Profile tab** with photo upload, name/phone editing

## Security Notes

- Passwords hashed with bcryptjs
- JWT tokens expire after 1 day
- All `/api/*` routes require valid JWT (except auth routes)
- Teachers can only access their own exams/students
- Admin routes protected by role check (req.user.role === "admin")

## AI Pipeline Notes

- **OCR**: GPT-4o vision processes uploaded answer sheet images
- **Evaluation**: Uses model answer + marking scheme + NCERT chapters as context; returns per-question scores, chapter, deviation_reason, improvement_suggestion
- **Chat**: Context-aware AI chat using real evaluation data per teacher/student
- Replit AI Integration env vars (`AI_INTEGRATIONS_OPENAI_*`) set automatically
