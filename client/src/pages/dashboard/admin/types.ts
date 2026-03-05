export type TeacherRecord = { id: number; employeeId: string; name: string; phone: string; email?: string | null; subjectsAssigned?: string | null; classesAssigned?: string | null; isClassTeacher?: number | null; classTeacherOf?: string | null; };
export type StudentRecord = { id: number; admissionNumber: string; name: string; phone: string; studentClass: string; section: string; };
export type ClassRecord = { id: number; name: string; section: string; description?: string | null; classTeacherId?: number | null; classTeacherName?: string | null; };
export type SubjectRecord = { id: number; name: string; code?: string | null; description?: string | null; className?: string | null; section?: string | null; teacherId?: number | null; teacherName?: string | null; };

/*
File Purpose:
This file declares shared TypeScript types used by admin dashboard modules.

Responsibilities:

* Defines local record shapes used in admin views and forms
* Provides a shared type contract for future extracted admin components

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
