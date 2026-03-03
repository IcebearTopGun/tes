import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";

export interface StartedServer {
  process: ChildProcessWithoutNullStreams;
  baseUrl: string;
}

export async function startIntegrationServer(port: number): Promise<StartedServer> {
  const baseUrl = `http://localhost:${port}`;
  const serverPath = path.resolve(process.cwd(), "server/index.ts");
  const proc = spawn("npx", ["tsx", serverPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      INTEGRATION_TEST_MODE: "1",
      SESSION_SECRET: process.env.SESSION_SECRET || "integration-secret",
    },
    stdio: "pipe",
  });

  proc.stdout.on("data", () => undefined);
  proc.stderr.on("data", () => undefined);

  const maxWaitMs = 45000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/stats`);
      // 401/403 are enough to prove server is up.
      if (res.status === 401 || res.status === 403) {
        return { process: proc, baseUrl };
      }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  proc.kill("SIGTERM");
  throw new Error("Integration server did not become ready in time.");
}

export async function stopIntegrationServer(proc: ChildProcessWithoutNullStreams) {
  if (proc.killed) return;
  proc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (!proc.killed) proc.kill("SIGKILL");
}

export async function apiJson(baseUrl: string, endpoint: string, init?: RequestInit, token?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    headers,
  });

  let body: any;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

export async function adminLogin(baseUrl: string) {
  const res = await apiJson(baseUrl, "/api/auth/adminuser/login", {
    method: "POST",
    body: JSON.stringify({ employeeId: "ADMIN001", password: "123" }),
  });
  if (res.status !== 200) throw new Error(`Admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export async function otpLogin(baseUrl: string, role: "teacher" | "student", identifier: string, phone: string) {
  const send = await apiJson(baseUrl, "/api/auth/otp/send", {
    method: "POST",
    body: JSON.stringify({ role, identifier, phone }),
  });
  if (send.status !== 200) throw new Error(`OTP send failed: ${send.status} ${JSON.stringify(send.body)}`);
  const code = send.body?.code;
  if (!code) throw new Error("OTP code not returned in integration mode.");

  const verify = await apiJson(baseUrl, "/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ role, identifier, phone, code }),
  });
  if (verify.status !== 200) throw new Error(`OTP verify failed: ${verify.status} ${JSON.stringify(verify.body)}`);
  return verify.body.token as string;
}

export function makeMockOcrImage(payload: unknown) {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
}

export function makeMockTextFile(text: string) {
  return `data:text/plain;base64,${Buffer.from(text, "utf8").toString("base64")}`;
}
