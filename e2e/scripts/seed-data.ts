/**
 * Seed script for populating the backend with test data.
 *
 * Reads fixtures from ../fixtures/ and creates tasks and agents via the API.
 * Useful for local development and before running E2E tests.
 *
 * Usage:
 *   npx tsx scripts/seed-data.ts [--base-url http://localhost:4000]
 *   npx tsx scripts/seed-data.ts --clear  # Clear then seed
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const BASE_URL =
  process.argv.find((a) => a.startsWith("--base-url="))?.split("=")[1] ??
  process.env.BASE_URL ??
  "http://localhost:4000";

const CLEAR = process.argv.includes("--clear");

interface SeedTask {
  title: string;
  description: string;
  priority: string;
  status: string;
  assignee: string | null;
}

interface SeedAgent {
  id: string;
  name: string;
  status: string;
  capabilities: string[];
  workload: number;
}

function loadFixture<T>(filename: string): T {
  const path = resolve(import.meta.dirname ?? __dirname, "../fixtures", filename);
  return JSON.parse(readFileSync(path, "utf-8"));
}

async function seedTasks(): Promise<void> {
  const tasks = loadFixture<SeedTask[]>("seed-tasks.json");
  console.log(`Seeding ${tasks.length} tasks...`);

  let created = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      const resp = await fetch(`${BASE_URL}/api/v1/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          priority: task.priority,
          assignee: task.assignee,
        }),
      });

      if (resp.status === 201) {
        const body = await resp.json();

        // If the task should be in a non-pending status, update it
        if (task.status !== "pending") {
          await fetch(`${BASE_URL}/api/v1/tasks/${body.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: task.status }),
          });
        }

        created++;
        console.log(`  + ${task.title} (${task.status})`);
      } else {
        failed++;
        const text = await resp.text();
        console.log(`  ! ${task.title}: ${resp.status} ${text.slice(0, 100)}`);
      }
    } catch (e) {
      failed++;
      console.log(`  ! ${task.title}: ${e}`);
    }
  }

  console.log(`Tasks: ${created} created, ${failed} failed`);
}

async function checkHealth(): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL}/api/v1/state`);
    return resp.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log("=".repeat(50));
  console.log("Symphony Test Data Seed Script");
  console.log(`Target: ${BASE_URL}`);
  console.log("=".repeat(50));

  // Health check
  const healthy = await checkHealth();
  if (!healthy) {
    console.error(`Cannot connect to ${BASE_URL}. Is the backend running?`);
    process.exit(1);
  }
  console.log("Backend is healthy.\n");

  // Seed data
  await seedTasks();

  console.log("\nSeed complete.");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
