import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StudentWorkspaceService } from "@/features/student/services/student-workspace.service";
import type { StudentHomeworkItem } from "@/features/student/shared/types";

export interface HomeworkGrouping {
  [subject: string]: {
    [month: string]: StudentHomeworkItem[];
  };
}

function sortHomework(list: StudentHomeworkItem[]): StudentHomeworkItem[] {
  return [...list].sort((a, b) => {
    if ((a.subject || "") !== (b.subject || "")) {
      return String(a.subject || "").localeCompare(String(b.subject || ""));
    }
    return new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime();
  });
}

function groupHomework(list: StudentHomeworkItem[]): HomeworkGrouping {
  return list.reduce<HomeworkGrouping>((acc, homework) => {
    const subject = homework.subject || "General";
    const month = new Date(homework.dueDate).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    if (!acc[subject]) acc[subject] = {};
    if (!acc[subject][month]) acc[subject][month] = [];

    acc[subject][month].push(homework);
    return acc;
  }, {});
}

export function useStudentHomeworkWorkspace() {
  const homeworkQuery = useQuery({
    queryKey: ["/api/student/homework"],
    queryFn: () => StudentWorkspaceService.getHomework(),
    staleTime: 30000,
  });

  const analyticsQuery = useQuery({
    queryKey: ["/api/student/homework/analytics"],
    queryFn: () => StudentWorkspaceService.getHomeworkAnalytics(),
    staleTime: 30000,
  });

  const groupedHomework = useMemo(() => {
    const list = homeworkQuery.data || [];
    return groupHomework(sortHomework(list));
  }, [homeworkQuery.data]);

  return {
    homeworkQuery,
    analyticsQuery,
    groupedHomework,
  };
}
