import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PrivateEvaluationQAProps {
  question: string;
  answer: string;
  loading: boolean;
  tutorLabel?: string;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
}

export function PrivateEvaluationQA({
  question,
  answer,
  loading,
  tutorLabel = "AI Tutotr",
  onQuestionChange,
  onAsk,
}: PrivateEvaluationQAProps) {
  return (
    <>
      <div style={{ width: "100%", display: "flex", gap: 8, alignItems: "center" }}>
        <Input
          placeholder="Ask a question about this evaluation…"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
        />
        <Button size="sm" disabled={!question.trim() || loading} onClick={onAsk}>
          Ask
        </Button>
      </div>

      {answer && (
        <div
          style={{
            width: "100%",
            padding: "10px 14px",
            background: "var(--cream)",
            borderRadius: 10,
            fontSize: 12.5,
            color: "var(--ink2)",
            lineHeight: 1.6,
          }}
        >
          <b>{tutorLabel}:</b> {answer}
        </div>
      )}
    </>
  );
}
