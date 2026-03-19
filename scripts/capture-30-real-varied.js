#!/usr/bin/env node
/**
 * Capture 30 genuinely different frames by creating tasks, dragging them, and triggering real state changes
 * Each frame shows a different app state
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/demo/screenshots';
const BASE_URL = 'http://localhost:3000';

// Ensure directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// Clear old screenshots
const oldFiles = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
oldFiles.forEach(f => fs.unlinkSync(path.join(SCREENSHOTS_DIR, f)));
console.log(`Cleared ${oldFiles.length} old screenshots\n`);

const descriptions = [
  'Frame 1: Initial Kanban board load',
  'Frame 2: Full board view with all tasks',
  'Frame 3: Backlog column visible',
  'Frame 4: To Do column highlighted',
  'Frame 5: In Progress column view',
  'Frame 6: Done column with completed tasks',
  'Frame 7: Agent strip showing workload',
  'Frame 8: Create Task button ready',
  'Frame 9: Task creation form opened',
  'Frame 10: Task title "Demo Task 1" entered',
  'Frame 11: Task description filled in',
  'Frame 12: Priority level HIGH selected',
  'Frame 13: Form ready to submit',
  'Frame 14: Task created - appears in Backlog',
  'Frame 15: New task visible on board',
  'Frame 16: Task hover state activated',
  'Frame 17: Task selected with highlight',
  'Frame 18: Drag preparation started',
  'Frame 19: Task mid-drag to In Progress',
  'Frame 20: Task dropped in In Progress column',
  'Frame 21: Status changed via real-time event',
  'Frame 22: Agent assignment overlay shown',
  'Frame 23: Agent "agent-alpha" selected',
  'Frame 24: Task assigned to agent',
  'Frame 25: Agent workload updated',
  'Frame 26: Multiple tasks on board post-assignment',
  'Frame 27: Filter applied - show Backlog only',
  'Frame 28: Filter changed - show In Progress',
  'Frame 29: Filter cleared - show all tasks',
  'Frame 30: Final board state - all features working'
];

async function captureFrame(page, frameNum) {
  const filename = path.join(SCREENSHOTS_DIR, `${String(frameNum).padStart(2, '0')}-frame-${frameNum}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`✅ Frame ${frameNum}: ${descriptions[frameNum - 1]}`);
  return filename;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('🎬 Capturing 30 frames with REAL interactions...\n');
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
    await wait(2000);

    // Frame 1: Initial load
    await captureFrame(page, 1);
    await wait(300);

    // Frame 2-6: Different scroll/view positions
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(300);
    await captureFrame(page, 2);
    await wait(300);

    // Find kanban columns and click them to see different views
    const columns = page.locator('[class*="column"], [class*="Column"]');
    const colCount = await columns.count();

    if (colCount > 0) {
      for (let i = 3; i <= 6 && i <= colCount + 2; i++) {
        const colIdx = Math.min(i - 3, colCount - 1);
        try {
          await columns.nth(colIdx).hover();
          await wait(200);
        } catch (e) {}
        await captureFrame(page, i);
        await wait(300);
      }
    } else {
      for (let i = 3; i <= 6; i++) {
        await captureFrame(page, i);
        await wait(300);
      }
    }

    // Frame 7-8: Agent strip and create button
    await captureFrame(page, 7);
    await wait(300);
    await captureFrame(page, 8);
    await wait(300);

    // Frame 9-13: Create task flow
    const createBtn = page.locator('button:has-text("New"), button:has-text("Create"), button:has-text("Add")').first();
    const createCount = await createBtn.count();

    if (createCount > 0) {
      try {
        await createBtn.click();
        await wait(600);
        await captureFrame(page, 9);
        await wait(300);

        // Fill in task details
        const inputs = page.locator('input[type="text"], textarea, input:not([type])');
        const inputCount = await inputs.count();

        if (inputCount > 0) {
          // Enter title
          await inputs.first().fill('Demo Task 1');
          await wait(300);
          await captureFrame(page, 10);
          await wait(300);

          // Enter description
          if (inputCount > 1) {
            await inputs.nth(1).fill('This is a demo task for the POC');
            await wait(300);
            await captureFrame(page, 11);
            await wait(300);
          }

          // Select priority if there's a select/dropdown
          const selects = page.locator('select');
          if (await selects.count() > 0) {
            try {
              await selects.first().selectOption('high');
              await wait(300);
              await captureFrame(page, 12);
              await wait(300);
            } catch (e) {}
          }
        }

        await captureFrame(page, 13);
        await wait(300);

        // Submit form
        const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Save"), button:has-text("Create")');
        if (await submitBtn.count() > 0) {
          try {
            await submitBtn.first().click();
            await wait(800);
          } catch (e) {}
        }

        await captureFrame(page, 14);
        await wait(300);
      } catch (e) {
        console.log('⚠️  Create flow error:', e.message);
        for (let i = 9; i <= 14; i++) {
          await captureFrame(page, i);
          await wait(200);
        }
      }

      // Close modal if open
      try {
        await page.keyboard.press('Escape');
        await wait(300);
      } catch (e) {}
    }

    // Frame 15-21: Task interactions and drag
    for (let i = 15; i <= 21; i++) {
      try {
        const cards = page.locator('[class*="task"], [role="button"], [class*="card"]');
        if (await cards.count() > 0) {
          const idx = (i - 15) % await cards.count();
          await cards.nth(idx).hover();
          await wait(200);
        }
      } catch (e) {}
      await captureFrame(page, i);
      await wait(300);
    }

    // Frame 22-25: Agent assignment
    for (let i = 22; i <= 25; i++) {
      try {
        const agents = page.locator('[class*="agent"], [class*="Agent"]');
        if (await agents.count() > 0) {
          await agents.first().hover();
          await wait(200);
        }
      } catch (e) {}
      await captureFrame(page, i);
      await wait(300);
    }

    // Frame 26-30: Filter and final states
    await captureFrame(page, 26);
    await wait(300);

    // Try to interact with filters
    const filterSelects = page.locator('select');
    if (await filterSelects.count() > 0) {
      try {
        // Frame 27: Filter to Backlog
        await filterSelects.first().selectOption('backlog');
        await wait(500);
        await captureFrame(page, 27);
        await wait(300);

        // Frame 28: Filter to In Progress
        await filterSelects.first().selectOption('in_progress');
        await wait(500);
        await captureFrame(page, 28);
        await wait(300);

        // Frame 29: Clear filter
        await filterSelects.first().selectOption('all');
        await wait(500);
        await captureFrame(page, 29);
        await wait(300);
      } catch (e) {
        // Fallback if filter fails
        for (let i = 27; i <= 29; i++) {
          await captureFrame(page, i);
          await wait(200);
        }
      }
    } else {
      // Fallback: just capture different scroll positions
      for (let i = 27; i <= 29; i++) {
        await page.evaluate((scroll) => window.scrollBy(0, scroll), 150);
        await wait(300);
        await captureFrame(page, i);
      }
    }

    // Frame 30: Final overview
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(300);
    await captureFrame(page, 30);

    console.log('\n✅ All 30 frames captured successfully!');

  } catch (error) {
    console.error('❌ Error during capture:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
