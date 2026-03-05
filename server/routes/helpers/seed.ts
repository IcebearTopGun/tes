import bcrypt from "bcryptjs";
import { sql as drizzleSql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";

export async function initAdminUsers() {
  try {
    // Create table if not exists (raw SQL, safe to run multiple times)
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        employee_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        phone_number TEXT,
        profile_photo_url TEXT,
        role TEXT NOT NULL DEFAULT 'ADMIN',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    try {
      await db.execute(drizzleSql`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    } catch {}
    try {
      await db.execute(drizzleSql`DROP TABLE IF EXISTS admins CASCADE`);
    } catch {}
  } catch (err) {
    console.error("[initAdminUsers] Error:", err);
  }
}

export async function seedDatabase() {
  // Seeding is intentionally disabled. Keep only default admin users insertion if absent.
  try {
    const hp = await bcrypt.hash("123", 10);
    const existingAU = await storage.getAdminUserByEmployeeId("ADMIN001");
    if (!existingAU) {
      await storage.createAdminUser({ employeeId: "ADMIN001", name: "School Admin", email: "schooladmin@school.edu", passwordHash: hp, phoneNumber: "9000000001", role: "ADMIN" });
      await storage.createAdminUser({ employeeId: "PRIN001", name: "School Principal", email: "principal@school.edu", passwordHash: hp, phoneNumber: "9000000002", role: "PRINCIPAL" });
      console.log("[seed] Admin users seeded: ADMIN001/123 and PRIN001/123");
    }
  } catch (err) {
    console.error("[seed] Admin users seeding error:", err);
  }
}

/*
File Purpose:
This file contains database seed and admin-user initialization helpers.

Responsibilities:

* Ensures the admin_users table exists and is up to date
* Inserts default admin users (ADMIN001 and PRIN001) when missing

Notes:
This file was extracted from a large file during refactoring to improve maintainability.
No business logic was modified.
*/
