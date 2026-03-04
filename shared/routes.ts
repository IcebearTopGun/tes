import { z } from 'zod';
import { insertTeacherSchema, insertStudentSchema, insertExamSchema, teachers, students, exams } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Exclude password from responses
export const teacherResponseSchema = z.custom<Omit<typeof teachers.$inferSelect, "password">>();
export const studentResponseSchema = z.custom<Omit<typeof students.$inferSelect, "password">>();
const adminUserResponseSchema = z.object({
  id: z.number(),
  employeeId: z.string(),
  name: z.string(),
  email: z.string(),
  phoneNumber: z.string().nullable().optional(),
  role: z.string().optional(),
});

export const authResponseSchema = z.object({
  token: z.string(),
  role: z.enum(["teacher", "student", "admin", "principal"]),
  user: z.union([teacherResponseSchema, studentResponseSchema, adminUserResponseSchema])
});

export const otpSendResponseSchema = z.object({
  message: z.string(),
  expiresIn: z.number(),
});

export const otpSendInputSchema = z.object({
  phone: z.string().min(1, "Phone number required"),
  role: z.enum(["teacher", "student"]),
  identifier: z.string().min(1, "Identifier required"),
});

export const otpVerifyInputSchema = z.object({
  phone: z.string().min(1, "Phone number required"),
  code: z.string().min(1, "OTP code required"),
  role: z.enum(["teacher", "student"]),
  identifier: z.string().min(1, "Identifier required"),
});

export const api = {
  auth: {
    teacherLogin: {
      method: 'POST' as const,
      path: '/api/auth/teacher/login' as const,
      input: z.object({
        employeeId: z.string(),
        password: z.string()
      }),
      responses: {
        200: authResponseSchema,
        401: errorSchemas.unauthorized
      }
    },
    studentLogin: {
      method: 'POST' as const,
      path: '/api/auth/student/login' as const,
      input: z.object({
        admissionNumber: z.string(),
        password: z.string()
      }),
      responses: {
        200: authResponseSchema,
        401: errorSchemas.unauthorized
      }
    },
    teacherSignup: {
      method: 'POST' as const,
      path: '/api/auth/teacher/signup' as const,
      input: insertTeacherSchema,
      responses: {
        201: authResponseSchema,
        400: errorSchemas.validation
      }
    },
    studentSignup: {
      method: 'POST' as const,
      path: '/api/auth/student/signup' as const,
      input: insertStudentSchema,
      responses: {
        201: authResponseSchema,
        400: errorSchemas.validation
      }
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: authResponseSchema.omit({ token: true }),
        401: errorSchemas.unauthorized
      }
    },
    otpSend: {
      method: 'POST' as const,
      path: '/api/auth/otp/send' as const,
      input: otpSendInputSchema,
      responses: {
        200: otpSendResponseSchema,
        400: errorSchemas.validation,
        404: errorSchemas.notFound
      }
    },
    otpVerify: {
      method: 'POST' as const,
      path: '/api/auth/otp/verify' as const,
      input: otpVerifyInputSchema,
      responses: {
        200: authResponseSchema,
        400: errorSchemas.validation,
        404: errorSchemas.notFound
      }
    }
  },
  dashboard: {
    teacherStats: {
      method: 'GET' as const,
      path: '/api/teacher/dashboard' as const,
      responses: {
        200: z.object({
          totalStudents: z.number(),
          activeClasses: z.number(),
          totalExams: z.number(),
          sheetsEvaluated: z.number(),
          avgPerformance: z.number(),
          recentActivity: z.array(z.object({
            id: z.number(),
            action: z.string(),
            target: z.string(),
            time: z.string()
          }))
        }),
        401: errorSchemas.unauthorized
      }
    },
    studentStats: {
      method: 'GET' as const,
      path: '/api/student/dashboard' as const,
      responses: {
        200: z.object({
          assignments: z.number(),
          attendance: z.number(),
          performanceSummary: z.string(),
          marksOverview: z.array(z.object({
            subject: z.string(),
            score: z.number(),
            total: z.number()
          })),
          improvementAreas: z.array(z.string()),
          feedback: z.array(z.object({
            from: z.string(),
            comment: z.string(),
            date: z.string()
          })),
          classRank: z.number().nullable().optional(),
          classTotal: z.number().optional(),
          classAvg: z.number().optional(),
          leaderboard: z.array(z.object({
            rank: z.number(),
            initials: z.string(),
            name: z.string(),
            score: z.number(),
            me: z.boolean(),
          })).optional(),
        }),
        401: errorSchemas.unauthorized
      }
    }
  },
  exams: {
    create: {
      method: 'POST' as const,
      path: '/api/exams' as const,
      input: insertExamSchema,
      responses: {
        201: z.custom<typeof exams.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized
      }
    },
    list: {
      method: 'GET' as const,
      path: '/api/exams' as const,
      responses: {
        200: z.array(z.custom<typeof exams.$inferSelect>()),
        401: errorSchemas.unauthorized
      }
    },
    processAnswerSheet: {
      method: 'POST' as const,
      path: '/api/exams/:id/process-answer-sheet' as const,
      input: z.object({
        imageBase64: z.string()
      }),
      responses: {
        200: z.object({
          id: z.number(),
          admissionNumber: z.string(),
          studentName: z.string(),
          answers: z.array(z.object({
            question_number: z.number(),
            answer_text: z.string()
          }))
        }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized
      }
    },
    evaluate: {
      method: 'POST' as const,
      path: '/api/answer-sheets/:id/evaluate' as const,
      responses: {
        200: z.any(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type AuthResponse = z.infer<typeof authResponseSchema>;
export type AuthMeResponse = z.infer<typeof api.auth.me.responses[200]>;
