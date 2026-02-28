/**
 * EXAMPLE WIRING — Privacy-Guarded AI Route
 *
 * This file demonstrates how to wire the privacy layer into a single route.
 * Do NOT import into routes.ts yet — ask the user which routes to migrate first.
 *
 * Pattern:
 *   1. authMiddleware  — validates JWT, attaches req.user
 *   2. aiContextMiddleware — enriches req.aiContext with ownName / allowedStudentNames
 *   3. Route handler  — calls gateway functions (never OpenAI directly)
 */

import type { Response } from "express";
import type { AiRequest } from "../middleware/aiRequestMiddleware";
import { aiContextMiddleware } from "../middleware/aiRequestMiddleware";
import { askQuestion } from "./gateway";

/**
 * EXAMPLE: POST /api/ai/query
 *
 * Body: { prompt: string }
 * Auth: Bearer JWT (teacher, student, or admin)
 *
 * To add to routes.ts, register like this:
 *
 *   app.post("/api/ai/query", authMiddleware, aiContextMiddleware, aiQueryHandler);
 */
export async function aiQueryHandler(req: AiRequest, res: Response): Promise<void> {
  try {
    const { prompt } = req.body as { prompt: string };

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      res.status(400).json({ message: "prompt is required" });
      return;
    }

    if (!req.aiContext) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const answer = await askQuestion(prompt.trim(), req.aiContext);
    res.json({ answer });
  } catch (err: any) {
    if (err.name === "UnsafePayloadError") {
      res.status(400).json({ message: "Prompt contains unmasked personal data. Please remove it and try again." });
      return;
    }
    if (err.name === "TokenLimitError") {
      res.status(400).json({ message: "Prompt is too long. Please shorten your query." });
      return;
    }
    console.error("[aiQueryHandler] error:", err.message);
    res.status(500).json({ message: "AI service temporarily unavailable." });
  }
}

/**
 * MIDDLEWARE CHAIN for AI routes:
 *
 *   authMiddleware        → validates JWT from Authorization header
 *   aiContextMiddleware   → loads student/teacher context from DB (ownName, allowedStudentNames)
 *
 * Registration template:
 *
 *   import { aiContextMiddleware } from "./middleware/aiRequestMiddleware";
 *   import { aiQueryHandler } from "./ai/exampleWiring";
 *
 *   app.post("/api/ai/query",     authMiddleware, aiContextMiddleware, aiQueryHandler);
 *   app.post("/api/ai/evaluate",  authMiddleware, aiContextMiddleware, aiEvaluateHandler);
 *   app.post("/api/ai/insight",   authMiddleware, aiContextMiddleware, aiInsightHandler);
 */
