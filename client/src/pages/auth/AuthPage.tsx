import { useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2, Phone, KeyRound, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const schoolLoginSchema = z.object({
  employeeId: z.string().min(1, "Employee ID required"),
  password: z.string().min(1, "Password required"),
});

const schoolSignupSchema = z.object({
  role: z.enum(["ADMIN", "PRINCIPAL"]),
  employeeId: z.string().min(1, "Employee ID required"),
  name: z.string().min(1, "Name required"),
  email: z.string().email("Valid email required"),
  phoneNumber: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function AuthPage({ mode }: { mode: "login" | "signup" }) {
  // "student" | "teacher" | "school"  (school covers both admin + principal)
  const [role, setRole] = useState<"teacher" | "student" | "school">("student");
  const [otpStep, setOtpStep] = useState<"phone" | "verify">("phone");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpIdentifier, setOtpIdentifier] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [schoolAuthMode, setSchoolAuthMode] = useState<"login" | "signup">("login");

  const { adminUserLogin, adminUserSignup, requestOtp, verifyOtp } = useAuth();

  const isPending =
    adminUserLogin.isPending ||
    adminUserSignup.isPending ||
    requestOtp.isPending ||
    verifyOtp.isPending;

  const loginForm = useForm<z.infer<typeof schoolLoginSchema>>({
    resolver: zodResolver(schoolLoginSchema),
    defaultValues: { employeeId: "", password: "" },
  });

  const signupForm = useForm<z.infer<typeof schoolSignupSchema>>({
    resolver: zodResolver(schoolSignupSchema),
    defaultValues: {
      role: "ADMIN",
      employeeId: "",
      name: "",
      email: "",
      phoneNumber: "",
      password: "",
    },
  });

  const handleOtpRequest = () => {
    if (!otpIdentifier || !otpPhone) return;
    requestOtp.mutate(
      { phone: otpPhone, role: role as "teacher" | "student", identifier: otpIdentifier },
      { onSuccess: () => setOtpStep("verify") },
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

  const onSchoolLoginSubmit = (data: z.infer<typeof schoolLoginSchema>) => {
    adminUserLogin.mutate({ employeeId: data.employeeId, password: data.password });
  };

  const onSchoolSignupSubmit = (data: z.infer<typeof schoolSignupSchema>) => {
    adminUserSignup.mutate({
      role: data.role,
      employeeId: data.employeeId,
      name: data.name,
      email: data.email,
      phoneNumber: data.phoneNumber?.trim() ? data.phoneNumber.trim() : undefined,
      password: data.password,
    });
  };

  const handleRoleChange = (v: string) => {
    setRole(v as "teacher" | "student" | "school");
    setSchoolAuthMode("login");
    loginForm.reset();
    signupForm.reset();
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
                            onChange={(e) => setOtpIdentifier(e.target.value)}
                            className="bg-background/50 h-11 rounded-xl"
                            placeholder={role === "teacher" ? "T001" : "S001"}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Phone Number</Label>
                          <Input
                            value={otpPhone}
                            onChange={(e) => setOtpPhone(e.target.value)}
                            className="bg-background/50 h-11 rounded-xl"
                            placeholder="9876543210"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl text-xs text-green-700 dark:text-green-300">
                          OTP sent to {otpPhone}. Check your phone for the code.
                        </div>
                        <div className="space-y-2">
                          <Label>Enter OTP</Label>
                          <Input
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
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

            {/* School tab — login and signup for admin/principal */}
            {role === "school" && (
              <div className="space-y-5">
                <Tabs value={schoolAuthMode} onValueChange={(v) => setSchoolAuthMode(v as "login" | "signup")} className="w-full">
                  <TabsList className="grid w-full p-1 bg-muted/50 rounded-xl grid-cols-2">
                    <TabsTrigger value="login" className="rounded-lg font-medium data-[state=active]:shadow-sm">Sign In</TabsTrigger>
                    <TabsTrigger value="signup" className="rounded-lg font-medium data-[state=active]:shadow-sm">Sign Up</TabsTrigger>
                  </TabsList>
                </Tabs>

                {schoolAuthMode === "login" ? (
                  <form onSubmit={loginForm.handleSubmit(onSchoolLoginSubmit)} className="space-y-5">
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
                            {...loginForm.register("employeeId")}
                            className="bg-background/50 h-11 rounded-xl"
                            placeholder="ADMIN001 or PRIN001"
                            data-testid="input-admin-id"
                          />
                          {loginForm.formState.errors.employeeId && <p className="text-xs text-destructive">{loginForm.formState.errors.employeeId.message as string}</p>}
                        </div>
                        <div className="space-y-2 pb-2">
                          <Label htmlFor="password">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            {...loginForm.register("password")}
                            className="bg-background/50 h-11 rounded-xl"
                            placeholder="••••••••"
                            data-testid="input-admin-password"
                          />
                          {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message as string}</p>}
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
                ) : (
                  <form onSubmit={signupForm.handleSubmit(onSchoolSignupSubmit)} className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                      <UserPlus size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">
                        Create a new School Admin or Principal account.
                      </span>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <select
                        id="role"
                        {...signupForm.register("role")}
                        className="w-full bg-background/50 h-11 rounded-xl border border-input px-3 text-sm"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="PRINCIPAL">Principal</option>
                      </select>
                      {signupForm.formState.errors.role && <p className="text-xs text-destructive">{signupForm.formState.errors.role.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signupEmployeeId">Employee ID</Label>
                      <Input
                        id="signupEmployeeId"
                        {...signupForm.register("employeeId")}
                        className="bg-background/50 h-11 rounded-xl"
                        placeholder="ADM123"
                      />
                      {signupForm.formState.errors.employeeId && <p className="text-xs text-destructive">{signupForm.formState.errors.employeeId.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signupName">Full Name</Label>
                      <Input
                        id="signupName"
                        {...signupForm.register("name")}
                        className="bg-background/50 h-11 rounded-xl"
                        placeholder="Full name"
                      />
                      {signupForm.formState.errors.name && <p className="text-xs text-destructive">{signupForm.formState.errors.name.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signupEmail">Email</Label>
                      <Input
                        id="signupEmail"
                        type="email"
                        {...signupForm.register("email")}
                        className="bg-background/50 h-11 rounded-xl"
                        placeholder="name@school.edu"
                      />
                      {signupForm.formState.errors.email && <p className="text-xs text-destructive">{signupForm.formState.errors.email.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signupPhone">Phone Number (optional)</Label>
                      <Input
                        id="signupPhone"
                        {...signupForm.register("phoneNumber")}
                        className="bg-background/50 h-11 rounded-xl"
                        placeholder="9876543210"
                      />
                    </div>

                    <div className="space-y-2 pb-2">
                      <Label htmlFor="signupPassword">Password</Label>
                      <Input
                        id="signupPassword"
                        type="password"
                        {...signupForm.register("password")}
                        className="bg-background/50 h-11 rounded-xl"
                        placeholder="••••••••"
                      />
                      {signupForm.formState.errors.password && <p className="text-xs text-destructive">{signupForm.formState.errors.password.message as string}</p>}
                    </div>

                    <Button
                      type="submit"
                      disabled={isPending}
                      className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
                    >
                      {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create Account"}
                    </Button>
                  </form>
                )}
              </div>
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
