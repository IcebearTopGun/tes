import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2, Phone, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  // "student" | "teacher" | "school"  (school covers both admin + principal)
  const [role, setRole] = useState<"teacher" | "student" | "school">("student");
  const [otpStep, setOtpStep] = useState<"phone" | "verify">("phone");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpIdentifier, setOtpIdentifier] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const { adminUserLogin, requestOtp, verifyOtp } = useAuth();

  const isPending =
    adminUserLogin.isPending ||
    requestOtp.isPending || verifyOtp.isPending;

  const schoolLoginSchema = z.object({
    employeeId: z.string().min(1, "Employee ID required"),
    password: z.string().min(1, "Password required"),
  });

  const form = useForm({
    resolver: zodResolver(schoolLoginSchema),
    defaultValues: { employeeId: "", password: "" },
  });

  const handleOtpRequest = () => {
    if (!otpIdentifier || !otpPhone) return;
    requestOtp.mutate(
      { phone: otpPhone, role: role as "teacher" | "student", identifier: otpIdentifier },
      { onSuccess: () => setOtpStep("verify") }
    );
  };

  const handleOtpVerify = () => {
    if (!otpCode) return;
    verifyOtp.mutate({
      phone: otpPhone,
      code: otpCode,
      role: role as "teacher" | "student",
      identifier: otpIdentifier,
    });
  };

  // "School" tab — single login that server resolves to admin or principal
  const onSubmit = (data: Record<string, unknown>) => {
    const d = data as Record<string, string>;
    adminUserLogin.mutate({ employeeId: d.employeeId, password: d.password });
  };

  const handleRoleChange = (v: string) => {
    setRole(v as "teacher" | "student" | "school");
    form.reset();
    setOtpStep("phone");
    setOtpCode("");
    setOtpPhone("");
    setOtpIdentifier("");
  };

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
      <Link href="/" className="absolute top-8 left-8 flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div className="h-8 w-8 bg-primary rounded-xl flex items-center justify-center shadow-md">
          <BookOpen className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-display font-bold text-xl tracking-tight hidden sm:block">scholarai</span>
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
              Welcome back
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Enter your credentials to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* 3 tabs: Student · Teacher · School */}
            <Tabs value={role} onValueChange={handleRoleChange} className="w-full mb-6">
              <TabsList className="grid w-full p-1 bg-muted/50 rounded-xl grid-cols-3">
                <TabsTrigger value="student" className="rounded-lg font-medium data-[state=active]:shadow-sm">Student</TabsTrigger>
                <TabsTrigger value="teacher" className="rounded-lg font-medium data-[state=active]:shadow-sm">Teacher</TabsTrigger>
                <TabsTrigger value="school" className="rounded-lg font-medium data-[state=active]:shadow-sm">School</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* OTP Login Flow for teacher / student */}
            {role !== "school" && (
              <div className="space-y-5">
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <Phone size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    {role === "teacher" ? "Teachers" : "Students"} sign in via OTP verification only
                  </span>
                </div>

                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={`otp-${role}-${otpStep}-${mode}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    {otpStep === "phone" ? (
                        <>
                          <div className="space-y-2">
                            <Label>{role === "teacher" ? "Employee ID" : "Admission Number"}</Label>
                            <Input
                              value={otpIdentifier}
                              onChange={e => setOtpIdentifier(e.target.value)}
                              className="bg-background/50 h-11 rounded-xl"
                              placeholder={role === "teacher" ? "T001" : "S001"}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Phone Number</Label>
                            <Input
                              value={otpPhone}
                              onChange={e => setOtpPhone(e.target.value)}
                              className="bg-background/50 h-11 rounded-xl"
                              placeholder="9876543210"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-xs text-green-700 dark:text-green-300">
                            OTP sent to {otpPhone}. Check your phone (or server console for demo).
                          </div>
                          <div className="space-y-2">
                            <Label>Enter OTP</Label>
                            <Input
                              value={otpCode}
                              onChange={e => setOtpCode(e.target.value)}
                              className="bg-background/50 h-11 rounded-xl text-center text-lg tracking-widest"
                              placeholder="000000"
                              maxLength={6}
                            />
                          </div>
                          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOtpStep("phone")}>
                            Change phone number
                          </button>
                        </>
                      )}
                  </motion.div>
                </AnimatePresence>

                <Button
                  type="button"
                  disabled={isPending}
                  className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
                  onClick={otpStep === "phone" ? handleOtpRequest : handleOtpVerify}
                >
                  {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                    otpStep === "phone" ? "Send OTP" : "Verify & Sign In"
                  )}
                </Button>
              </div>
            )}

            {/* School tab — single password login; server resolves to admin or principal */}
            {role === "school" && (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key="school-login"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                      <KeyRound size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        School accounts use password authentication. You'll be redirected based on your role.
                      </span>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="employeeId">Employee ID</Label>
                      <Input
                        id="employeeId"
                        {...form.register("employeeId")}
                        className="bg-background/50 h-11 rounded-xl"
                        placeholder="ADMIN001 or PRIN001"
                        data-testid="input-admin-id"
                      />
                      {form.formState.errors.employeeId && <p className="text-xs text-destructive">{form.formState.errors.employeeId.message as string}</p>}
                    </div>
                    <div className="space-y-2 pb-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        {...form.register("password")}
                        className="bg-background/50 h-11 rounded-xl"
                        placeholder="••••••••"
                        data-testid="input-admin-password"
                      />
                      {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message as string}</p>}
                    </div>
                  </motion.div>
                </AnimatePresence>

                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
                  data-testid="button-login"
                >
                  {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
                </Button>
              </form>
            )}

            {role !== "school" && (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                <p>Accounts are created by school admin only.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {mode === "login" && (
          <div className="mt-4 text-center text-xs text-muted-foreground space-y-1">
            <p>Demo: Teacher <strong>T001</strong> · Student <strong>S001</strong> — phone: <strong>any registered phone</strong></p>
            <p>School → Admin: <strong>ADMIN001 / 123</strong> · Principal: <strong>PRIN001 / 123</strong></p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
