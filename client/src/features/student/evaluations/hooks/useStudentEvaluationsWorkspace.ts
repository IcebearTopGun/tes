import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudentWorkspaceService } from "@/features/student/services/student-workspace.service";
import type { EvaluationStats } from "@/features/student/shared/types";

export function useStudentEvaluationsWorkspace() {
  const evaluationsQuery = useQuery({
    queryKey: ["/api/student/evaluations"],
    queryFn: () => StudentWorkspaceService.getEvaluations(),
    staleTime: 30000,
  });

  const stats = useMemo<EvaluationStats>(() => {
    const list = evaluationsQuery.data || [];
    const total = list.length;
    const avgPct = total > 0 ? Math.round(list.reduce((sum, item) => sum + (item.pct || 0), 0) / total) : 0;
    const topPct = total > 0 ? Math.max(...list.map((item) => item.pct || 0)) : 0;
    const improveCount = list.filter((item) => (item.areasOfImprovement?.length || 0) > 0).length;

    return { total, avgPct, topPct, improveCount };
  }, [evaluationsQuery.data]);

  return {
    evaluationsQuery,
    stats,
  };
}
