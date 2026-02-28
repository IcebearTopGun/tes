import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { fetchWithAuth } from "@/lib/fetcher";

export function useTeacherDashboard() {
  return useQuery({
    queryKey: [api.dashboard.teacherStats.path],
    queryFn: async () => {
      const res = await fetchWithAuth(api.dashboard.teacherStats.path);
      const json = await res.json();
      return api.dashboard.teacherStats.responses[200].parse(json);
    },
  });
}

export function useStudentDashboard() {
  return useQuery({
    queryKey: [api.dashboard.studentStats.path],
    queryFn: async () => {
      const res = await fetchWithAuth(api.dashboard.studentStats.path);
      const json = await res.json();
      return api.dashboard.studentStats.responses[200].parse(json);
    },
  });
}
