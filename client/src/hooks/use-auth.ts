import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AuthResponse, type AuthMeResponse } from "@shared/routes";
import { fetchWithAuth } from "@/lib/fetcher";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export function useAuth() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Fetch current user session
  const { data: session, isLoading } = useQuery<AuthMeResponse | null>({
    queryKey: [api.auth.me.path],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      if (!token) return null;
      try {
        const res = await fetchWithAuth(api.auth.me.path);
        const json = await res.json();
        return api.auth.me.responses[200].parse(json);
      } catch (err: any) {
        if (err.message.includes("401")) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });

  const handleAuthSuccess = (data: AuthResponse) => {
    localStorage.setItem("token", data.token);
    queryClient.setQueryData([api.auth.me.path], { role: data.role, user: data.user });
    toast({
      title: "Welcome back!",
      description: "Successfully authenticated.",
    });
    setLocation(data.role === "teacher" ? "/teacher-dashboard" : "/student-dashboard");
  };

  const handleAuthError = (err: Error) => {
    toast({
      title: "Authentication Failed",
      description: err.message,
      variant: "destructive",
    });
  };

  const teacherLogin = useMutation({
    mutationFn: async (credentials: typeof api.auth.teacherLogin.input._type) => {
      const res = await fetchWithAuth(api.auth.teacherLogin.path, {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      return api.auth.teacherLogin.responses[200].parse(await res.json());
    },
    onSuccess: handleAuthSuccess,
    onError: handleAuthError,
  });

  const studentLogin = useMutation({
    mutationFn: async (credentials: typeof api.auth.studentLogin.input._type) => {
      const res = await fetchWithAuth(api.auth.studentLogin.path, {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      return api.auth.studentLogin.responses[200].parse(await res.json());
    },
    onSuccess: handleAuthSuccess,
    onError: handleAuthError,
  });

  const teacherSignup = useMutation({
    mutationFn: async (data: typeof api.auth.teacherSignup.input._type) => {
      const res = await fetchWithAuth(api.auth.teacherSignup.path, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return api.auth.teacherSignup.responses[201].parse(await res.json());
    },
    onSuccess: handleAuthSuccess,
    onError: handleAuthError,
  });

  const studentSignup = useMutation({
    mutationFn: async (data: typeof api.auth.studentSignup.input._type) => {
      const res = await fetchWithAuth(api.auth.studentSignup.path, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return api.auth.studentSignup.responses[201].parse(await res.json());
    },
    onSuccess: handleAuthSuccess,
    onError: handleAuthError,
  });

  const logout = () => {
    localStorage.removeItem("token");
    queryClient.setQueryData([api.auth.me.path], null);
    queryClient.clear();
    setLocation("/");
  };

  return {
    user: session?.user,
    role: session?.role,
    isLoading,
    teacherLogin,
    studentLogin,
    teacherSignup,
    studentSignup,
    logout,
  };
}
