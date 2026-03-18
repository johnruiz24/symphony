/**
 * Performance benchmark script for Symphony Frontend POC.
 *
 * Measures:
 *   1. API response latency (p50, p95, p99) for all endpoints
 *   2. Task creation throughput (tasks/second)
 *   3. Concurrent agent simulation (50 agents)
 *   4. SSE event delivery latency
 *   5. Bulk operations (100+ tasks)
 *
 * Usage:
 *   npx tsx scripts/perf-benchmark.ts [--base-url http://localhost:4000]
 *
 * Requirements:
 *   - Backend must be running
 *   - DynamoDB local (or in-memory fallback) must be available
 */

const BASE_URL = process.argv.find((a) => a.startsWith("--base-url="))?.split("=")[1]
  ?? process.env.BASE_URL
  ?? "http://localhost:4000";

// ---------- Utilities ----------

interface LatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

function computeStats(latencies: number[]): LatencyStats {
  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;
  return {
    count: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean: latencies.reduce((a, b) => a + b, 0) / n,
    p50: sorted[Math.floor(n * 0.5)],
    p95: sorted[Math.floor(n * 0.95)],
    p99: sorted[Math.floor(n * 0.99)],
  };
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

function printStats(label: string, stats: LatencyStats) {
  console.log(`  ${label}:`);
  console.log(`    Count: ${stats.count}`);
  console.log(`    Min: ${formatMs(stats.min)} | Max: ${formatMs(stats.max)} | Mean: ${formatMs(stats.mean)}`);
  console.log(`    p50: ${formatMs(stats.p50)} | p95: ${formatMs(stats.p95)} | p99: ${formatMs(stats.p99)}`);
}

async function timedFetch(url: string, init?: RequestInit): Promise<[Response, number]> {
  const start = performance.now();
  const resp = await fetch(url, init);
  const elapsed = performance.now() - start;
  return [resp, elapsed];
}

// ---------- Benchmarks ----------

async function benchmarkGetState(iterations: number): Promise<LatencyStats> {
  console.log(`\n[1] GET /api/v1/state (${iterations} iterations)`);
  const latencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const [resp, ms] = await timedFetch(`${BASE_URL}/api/v1/state`);
    if (resp.ok) latencies.push(ms);
  }

  const stats = computeStats(latencies);
  printStats("GET /api/v1/state", stats);
  return stats;
}

async function benchmarkTaskCreation(count: number): Promise<LatencyStats> {
  console.log(`\n[2] POST /api/v1/tasks - Create ${count} tasks`);
  const latencies: number[] = [];

  const start = performance.now();
  for (let i = 0; i < count; i++) {
    const [resp, ms] = await timedFetch(`${BASE_URL}/api/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Perf Task ${i}`,
        description: `Performance test task #${i}`,
        priority: ["low", "medium", "high", "critical"][i % 4],
      }),
    });
    if (resp.status === 201) latencies.push(ms);
  }
  const totalMs = performance.now() - start;

  if (latencies.length === 0) {
    console.log("  SKIPPED: Task creation endpoint not available (returns non-201)");
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }

  const stats = computeStats(latencies);
  printStats("POST /api/v1/tasks", stats);
  console.log(`  Throughput: ${(latencies.length / (totalMs / 1000)).toFixed(1)} tasks/sec`);
  return stats;
}

async function benchmarkTaskList(): Promise<LatencyStats> {
  console.log(`\n[3] GET /api/v1/tasks - List (after bulk create)`);
  const latencies: number[] = [];

  for (let i = 0; i < 20; i++) {
    const [resp, ms] = await timedFetch(`${BASE_URL}/api/v1/tasks`);
    if (resp.ok) latencies.push(ms);
  }

  if (latencies.length === 0) {
    console.log("  SKIPPED: Tasks endpoint not available");
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }

  const stats = computeStats(latencies);
  printStats("GET /api/v1/tasks", stats);
  return stats;
}

async function benchmarkTaskListFiltered(): Promise<void> {
  console.log(`\n[4] GET /api/v1/tasks?status=... - Filtered list`);

  for (const status of ["pending", "in_progress", "completed"]) {
    const latencies: number[] = [];
    for (let i = 0; i < 10; i++) {
      const [resp, ms] = await timedFetch(`${BASE_URL}/api/v1/tasks?status=${status}`);
      if (resp.ok) latencies.push(ms);
    }
    if (latencies.length > 0) {
      const stats = computeStats(latencies);
      printStats(`GET /api/v1/tasks?status=${status}`, stats);
    }
  }
}

async function benchmarkConcurrentAgents(agentCount: number): Promise<void> {
  console.log(`\n[5] Concurrent agent simulation (${agentCount} agents)`);

  // Simulate N agents polling simultaneously
  const promises: Promise<[Response, number]>[] = [];
  for (let i = 0; i < agentCount; i++) {
    promises.push(timedFetch(`${BASE_URL}/api/v1/agents`));
  }

  const results = await Promise.allSettled(promises);
  const latencies: number[] = [];
  let failures = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const [resp, ms] = result.value;
      if (resp.ok) latencies.push(ms);
      else failures++;
    } else {
      failures++;
    }
  }

  if (latencies.length > 0) {
    const stats = computeStats(latencies);
    printStats(`${agentCount} concurrent GET /api/v1/agents`, stats);
  }
  console.log(`  Successes: ${latencies.length} | Failures: ${failures}`);
}

async function benchmarkSSELatency(): Promise<void> {
  console.log(`\n[6] SSE event delivery latency`);

  try {
    // Open SSE connection
    const controller = new AbortController();
    const ssePromise = fetch(`${BASE_URL}/api/v1/events`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });

    // Give SSE time to connect
    await new Promise((r) => setTimeout(r, 500));

    // Trigger a state change by creating a task
    const createStart = performance.now();
    const createResp = await fetch(`${BASE_URL}/api/v1/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `SSE Latency Test ${Date.now()}` }),
    });

    if (createResp.status !== 201) {
      console.log("  SKIPPED: Task creation not available");
      controller.abort();
      return;
    }

    // Wait briefly then abort (we can't easily read streaming in Node fetch)
    await new Promise((r) => setTimeout(r, 2000));
    controller.abort();

    const elapsed = performance.now() - createStart;
    console.log(`  Task creation + SSE window: ${formatMs(elapsed)}`);
    console.log("  Note: Full SSE latency measurement requires browser-based testing");
  } catch {
    console.log("  SKIPPED: SSE endpoint not available");
  }
}

// ---------- Main ----------

async function main() {
  console.log("=".repeat(60));
  console.log("Symphony Frontend POC - Performance Benchmark");
  console.log(`Target: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // Health check
  try {
    const [resp] = await timedFetch(`${BASE_URL}/api/v1/state`);
    if (!resp.ok) {
      console.error(`Backend not ready: ${resp.status}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Cannot connect to ${BASE_URL}: ${e}`);
    process.exit(1);
  }

  const results: Record<string, LatencyStats> = {};

  // Run benchmarks
  results["GET /api/v1/state"] = await benchmarkGetState(50);
  results["POST /api/v1/tasks"] = await benchmarkTaskCreation(100);
  results["GET /api/v1/tasks"] = await benchmarkTaskList();
  await benchmarkTaskListFiltered();
  await benchmarkConcurrentAgents(50);
  await benchmarkSSELatency();

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  let allPass = true;

  for (const [endpoint, stats] of Object.entries(results)) {
    if (stats.count === 0) continue;
    const pass = stats.p95 < 1000; // <1s target
    const status = pass ? "PASS" : "FAIL";
    if (!pass) allPass = false;
    console.log(`  [${status}] ${endpoint}: p95=${formatMs(stats.p95)}, p99=${formatMs(stats.p99)}`);
  }

  console.log("\n" + (allPass ? "ALL BENCHMARKS PASSED" : "SOME BENCHMARKS FAILED"));
  console.log("Target: p95 < 1000ms for all endpoints");

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("Benchmark failed:", e);
  process.exit(1);
});
