import type { HomeworkAnalytics } from "@/features/student/shared/types";

interface HomeworkStatsProps {
  analytics: HomeworkAnalytics;
}

export function HomeworkStats({ analytics }: HomeworkStatsProps) {
  return (
    <div className="sf-funnel sf-funnel-5">
      <div className="sf-f-col">
        <div className="sf-f-cat">Assigned</div>
        <div className="sf-f-num">{analytics.totalAssigned}</div>
        <div className="sf-f-desc">Total homework assigned</div>
      </div>
      <div className="sf-f-col">
        <div className="sf-f-cat">Submitted</div>
        <div className="sf-f-num">{analytics.totalSubmitted}</div>
        <div className="sf-f-desc">Total submitted</div>
      </div>
      <div className="sf-f-col">
        <div className="sf-f-cat">Late</div>
        <div className="sf-f-num">{analytics.lateSubmissions ?? 0}</div>
        <div className="sf-f-desc">Submitted after due date</div>
      </div>
      <div className="sf-f-col">
        <div className="sf-f-cat">On-time</div>
        <div className="sf-f-num">{analytics.onTimePct}%</div>
        <div className="sf-f-desc">On-time submission rate</div>
      </div>
      <div className="sf-f-col">
        <div className="sf-f-cat">Avg Score</div>
        <div className="sf-f-num">{analytics.avgCorrectness}%</div>
        <div className="sf-f-desc">Average correctness</div>
      </div>
    </div>
  );
}
