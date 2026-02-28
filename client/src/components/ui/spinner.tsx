import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, size = "default" }: { className?: string; size?: "default" | "sm" | "lg" }) {
  const sizeClasses = {
    sm: "h-4 w-4",
    default: "h-8 w-8",
    lg: "h-12 w-12"
  };
  
  return (
    <Loader2 className={cn("animate-spin text-primary/60", sizeClasses[size], className)} />
  );
}
