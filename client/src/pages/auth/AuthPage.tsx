import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@shared/routes";
import { insertTeacherSchema, insertStudentSchema } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const [role, setRole] = useState<"teacher" | "student" | "admin">("student");
  const { teacherLogin, studentLogin, adminLogin, teacherSignup, studentSignup } = useAuth();

  const isPending =
    teacherLogin.isPending || studentLogin.isPending || adminLogin.isPending ||
    teacherSignup.isPending || studentSignup.isPending;

  const adminLoginSchema = z.object({ employeeId: z.string().min(1, "Employee ID required"), password: z.string().min(1, "Password required") });
  const teacherLoginSchema = z.object({ employeeId: z.string().min(1, "Employee ID required"), password: z.string().min(1, "Password required") });
  const studentLoginSchema = z.object({ admissionNumber: z.string().min(1, "Admission Number required"), password: z.string().min(1, "Password required") });

  const currentSchema =
    role === "admin" ? adminLoginSchema :
    mode === "login" ? (role === "teacher" ? teacherLoginSchema : studentLoginSchema) :
    (role === "teacher" ? insertTeacherSchema : insertStudentSchema);

  const form = useForm({
    resolver: zodResolver(currentSchema),
    defaultValues: { employeeId: "", admissionNumber: "", name: "", email: "", studentClass: "", section: "", password: "" }
  });

  const onSubmit = (data: any) => {
    if (role === "admin") {
      adminLogin.mutate({ employeeId: data.employeeId, password: data.password });
    } else if (mode === "login") {
      if (role === "teacher") teacherLogin.mutate({ employeeId: data.employeeId, password: data.password });
      else studentLogin.mutate({ admissionNumber: data.admissionNumber, password: data.password });
    } else {
      if (role === "teacher") teacherSignup.mutate(data);
      else studentSignup.mutate(data);
    }
  };

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
      <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div className="h-8 w-8 bg-primary rounded-xl flex items-center justify-center shadow-md">
          <BookOpen className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-display font-bold text-xl tracking-tight hidden sm:block">EduSync</span>
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <Card className="border-border/50 shadow-premium bg-card/80 backdrop-blur-xl rounded-3xl overflow-hidden">
          <CardHeader className="text-center pb-6">
            <CardTitle className="font-display text-3xl font-bold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create an account"}
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {mode === "login" ? "Enter your credentials to access your dashboard" : "Join EduSync to manage your educational journey"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={role} onValueChange={(v) => { setRole(v as any); form.reset(); }} className="w-full mb-8">
              <TabsList className={`grid w-full p-1 bg-muted/50 rounded-xl ${mode === "login" ? "grid-cols-3" : "grid-cols-2"}`}>
                <TabsTrigger value="student" className="rounded-lg font-medium data-[state=active]:shadow-sm">Student</TabsTrigger>
                <TabsTrigger value="teacher" className="rounded-lg font-medium data-[state=active]:shadow-sm">Teacher</TabsTrigger>
                {mode === "login" && (
                  <TabsTrigger value="admin" className="rounded-lg font-medium data-[state=active]:shadow-sm">Admin</TabsTrigger>
                )}
              </TabsList>
            </Tabs>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={`${mode}-${role}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* ADMIN FIELDS */}
                  {role === "admin" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="employeeId">Admin Employee ID</Label>
                        <Input id="employeeId" {...form.register("employeeId")} className="bg-background/50 h-11 rounded-xl" placeholder="A001" data-testid="input-admin-id" />
                        {form.formState.errors.employeeId && <p className="text-xs text-destructive">{form.formState.errors.employeeId.message as string}</p>}
                      </div>
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-300">
                        Admin accounts are pre-provisioned by the system. Contact your administrator for access credentials.
                      </div>
                    </>
                  )}

                  {/* TEACHER FIELDS */}
                  {role === "teacher" && (
                    <div className="space-y-2">
                      <Label htmlFor="employeeId">Employee ID</Label>
                      <Input id="employeeId" {...form.register("employeeId")} className="bg-background/50 h-11 rounded-xl" placeholder="T001" data-testid="input-teacher-id" />
                      {form.formState.errors.employeeId && <p className="text-xs text-destructive">{form.formState.errors.employeeId.message as string}</p>}
                    </div>
                  )}

                  {mode === "signup" && role === "teacher" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input id="name" {...form.register("name")} className="bg-background/50 h-11 rounded-xl" placeholder="Ramesh Sharma" />
                        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message as string}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input id="email" type="email" {...form.register("email")} className="bg-background/50 h-11 rounded-xl" placeholder="ramesh@school.edu" />
                        {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message as string}</p>}
                      </div>
                    </>
                  )}

                  {/* STUDENT FIELDS */}
                  {role === "student" && (
                    <div className="space-y-2">
                      <Label htmlFor="admissionNumber">Admission Number</Label>
                      <Input id="admissionNumber" {...form.register("admissionNumber")} className="bg-background/50 h-11 rounded-xl" placeholder="S001" data-testid="input-student-id" />
                      {form.formState.errors.admissionNumber && <p className="text-xs text-destructive">{form.formState.errors.admissionNumber.message as string}</p>}
                    </div>
                  )}

                  {mode === "signup" && role === "student" && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="studentName">Full Name</Label>
                        <Input id="studentName" {...form.register("name")} className="bg-background/50 h-11 rounded-xl" placeholder="Aarav Sharma" />
                        {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message as string}</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Class</Label>
                          <select {...form.register("studentClass")} className="w-full h-11 rounded-xl border border-input bg-background/50 px-3 text-sm">
                            <option value="">Select class</option>
                            {["9", "10", "11", "12"].map(c => <option key={c} value={c}>Class {c}</option>)}
                          </select>
                          {form.formState.errors.studentClass && <p className="text-xs text-destructive">{form.formState.errors.studentClass.message as string}</p>}
                        </div>
                        <div className="space-y-2">
                          <Label>Section</Label>
                          <select {...form.register("section")} className="w-full h-11 rounded-xl border border-input bg-background/50 px-3 text-sm">
                            <option value="">Select section</option>
                            {["A", "B", "C", "D"].map(s => <option key={s} value={s}>Section {s}</option>)}
                          </select>
                          {form.formState.errors.section && <p className="text-xs text-destructive">{form.formState.errors.section.message as string}</p>}
                        </div>
                      </div>
                    </>
                  )}

                  {/* COMMON PASSWORD FIELD */}
                  {role !== "admin" && (
                    <div className="space-y-2 pb-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" {...form.register("password")} className="bg-background/50 h-11 rounded-xl" placeholder="••••••••" data-testid="input-password" />
                      {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message as string}</p>}
                    </div>
                  )}

                  {role === "admin" && (
                    <div className="space-y-2 pb-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" {...form.register("password")} className="bg-background/50 h-11 rounded-xl" placeholder="••••••••" data-testid="input-admin-password" />
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>

              <Button type="submit" disabled={isPending} className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl transition-all" data-testid="button-login">
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  role === "admin" ? "Admin Sign In" :
                  mode === "login" ? "Sign In" : "Create Account"
                )}
              </Button>
            </form>

            {role !== "admin" && (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <p>Don't have an account? <Link href="/signup" className="text-primary font-semibold hover:underline">Sign up</Link></p>
                ) : (
                  <p>Already have an account? <Link href="/login" className="text-primary font-semibold hover:underline">Log in</Link></p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {mode === "login" && (
          <div className="mt-4 text-center text-xs text-muted-foreground space-y-1">
            <p>Demo: Teacher <strong>T001</strong> · Student <strong>S001</strong> · Admin <strong>A001</strong> — password: <strong>123</strong></p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
