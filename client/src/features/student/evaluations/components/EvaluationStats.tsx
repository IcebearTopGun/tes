import type { EvaluationStats as EvaluationStatsModel } from "@/features/student/shared/types";

interface EvaluationStatsProps {
  stats: EvaluationStatsModel;
}

export function EvaluationStats({ stats }: EvaluationStatsProps) {
  return (
    <div className="sf-funnel sf-funnel-4">
      <div className="sf-f-col">
        <div className="sf-f-cat">Completed</div>
        <div className="sf-f-num">{stats.total}</div>
        <div className="sf-f-desc">Evaluated exams</div>
      </div>
      <div className="sf-f-col">
        <div className="sf-f-cat">Average</div>
        <div className="sf-f-num">{stats.avgPct}%</div>
        <div className="sf-f-desc">Average score</div>
      </div>
      <div className="sf-f-col">
        <div className="sf-f-cat">Best</div>
        <div className="sf-f-num">{stats.topPct}%</div>
        <div className="sf-f-desc">Highest score</div>
      </div>
      <div className="sf-f-col">
        <div className="sf-f-cat">Needs Focus</div>
        <div className="sf-f-num">{stats.improveCount}</div>
        <div className="sf-f-desc">Evaluations with flagged areas</div>
      </div>
    </div>
  );
}
