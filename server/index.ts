import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const isIntegrationTestMode = process.env.INTEGRATION_TEST_MODE === "1";
  // Auto-create any missing tables (handles new schema columns added after deployment)
  try {
    const { pool } = await import("./db");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS answer_sheet_pages (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER NOT NULL REFERENCES exams(id),
        admission_number TEXT,
        student_name TEXT,
        sheet_number INTEGER,
        image_base64 TEXT NOT NULL,
        ocr_output TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS merged_answer_scripts (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER NOT NULL REFERENCES exams(id),
        admission_number TEXT NOT NULL,
        student_name TEXT NOT NULL,
        merged_answers TEXT NOT NULL,
        page_ids TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        answer_sheet_id INTEGER REFERENCES answer_sheets(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS question_images TEXT;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS model_answer_images TEXT;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS section TEXT;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject_code TEXT;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS use_ncert INTEGER DEFAULT 0;
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS created_at TEXT DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log("[DB] Schema auto-migration complete");
  } catch (migErr: any) {
    console.warn("[DB] Auto-migration warning (non-fatal):", migErr?.message);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else if (!isIntegrationTestMode) {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  } else {
    console.log("[server] Integration test mode active: Vite disabled");
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "localhost"
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
