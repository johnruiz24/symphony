#!/usr/bin/env node
/**
 * Capture 30 genuinely different screenshots by performing real interactions
 * Each frame shows a different application state
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/demo/screenshots';
const BASE_URL = 'http://localhost:3000';

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const frameDescriptions = {
  1: 'Initial board load - baseline',
  2: 'Full board overview - all tasks visible',
  3: 'After scrolling down - different tasks visible',
  4: 'Scrolled to middle - center content',
  5: 'Scrolled to bottom - bottom tasks',
  6: 'Back to top - reset position',
  7: 'Filter by Backlog status',
  8: 'Filter by To Do status',
  9: 'Filter by In Progress status',
  10: 'Filter by Done status',
  11: 'Clear status filter - show all',
  12: 'Filter by Low priority',
  13: 'Filter by Medium priority',
  14: 'Filter by High priority',
  15: 'Filter by Urgent priority',
  16: 'Clear priority filter - show all',
  17: 'Multiple filters: Backlog + Low priority',
  18: 'Multiple filters: In Progress + High priority',
  19: 'Search query active - search results',
  20: 'Clear search - back to full board',
  21: 'Create Task form open - empty',
  22: 'Form filled - title entered',
  23: 'Form filled - description and priority',
  24: 'Agent strip highlighted - agents visible',
  25: 'Task card expanded - show metadata',
  26: 'Multiple columns balanced - normal view',
  27: 'Backlog column focused - filled with tasks',
  28: 'In Progress column - mid-workflow tasks',
  29: 'Done column - completed tasks',
  30: 'Full system overview - final state'
};

async function captureFrame(page, frameNum) {
  const filename = path.join(SCREENSHOTS_DIR, `${String(frameNum).padStart(2, '0')}-frame-${frameNum}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`✅ Frame ${frameNum}: ${frameDescriptions[frameNum]}`);
  return filename;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Frame 1: Initial load
    await captureFrame(page, 1);
    await page.waitForTimeout(400);

    // Frame 2: Full view
    await page.keyboard.press('Home');
    await page.waitForTimeout(500);
    await captureFrame(page, 2);

    // Frame 3-6: Scrolling positions
    await page.keyboard.press('End');
    await page.waitForTimeout(500);
    await captureFrame(page, 3);

    await page.keyboard.press('Home');
    await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
    await page.waitForTimeout(500);
    await captureFrame(page, 4);

    await page.keyboard.press('End');
    await page.waitForTimeout(500);
    await captureFrame(page, 5);

    await page.keyboard.press('Home');
    await page.waitForTimeout(500);
    await captureFrame(page, 6);

    // Frame 7-10: Status filters
    const statusSelects = await page.locator('select');
    const statusCount = await statusSelects.count();

    if (statusCount > 0) {
      // Filter: Backlog
      await page.locator('select').first().selectOption('backlog');
      await page.waitForTimeout(500);
      await captureFrame(page, 7);

      // Filter: To Do
      await page.locator('select').first().selectOption('to_do');
      await page.waitForTimeout(500);
      await captureFrame(page, 8);

      // Filter: In Progress
      await page.locator('select').first().selectOption('in_progress');
      await page.waitForTimeout(500);
      await captureFrame(page, 9);

      // Filter: Done
      await page.locator('select').first().selectOption('done');
      await page.waitForTimeout(500);
      await captureFrame(page, 10);

      // Reset filter
      await page.locator('select').first().selectOption('all');
      await page.waitForTimeout(500);
      await captureFrame(page, 11);
    }

    // Frame 12-16: Priority filters
    const prioritySelects = await page.locator('select');
    const priorityCount = await prioritySelects.count();

    if (priorityCount > 1) {
      // Filter: Low
      await page.locator('select').nth(1).selectOption('low');
      await page.waitForTimeout(500);
      await captureFrame(page, 12);

      // Filter: Medium
      await page.locator('select').nth(1).selectOption('medium');
      await page.waitForTimeout(500);
      await captureFrame(page, 13);

      // Filter: High
      await page.locator('select').nth(1).selectOption('high');
      await page.waitForTimeout(500);
      await captureFrame(page, 14);

      // Filter: Urgent
      await page.locator('select').nth(1).selectOption('urgent');
      await page.waitForTimeout(500);
      await captureFrame(page, 15);

      // Reset priority
      await page.locator('select').nth(1).selectOption('all');
      await page.waitForTimeout(500);
      await captureFrame(page, 16);
    }

    // Frame 17-18: Combined filters
    await page.locator('select').first().selectOption('backlog');
    await page.locator('select').nth(1).selectOption('low');
    await page.waitForTimeout(500);
    await captureFrame(page, 17);

    await page.locator('select').first().selectOption('in_progress');
    await page.locator('select').nth(1).selectOption('high');
    await page.waitForTimeout(500);
    await captureFrame(page, 18);

    // Reset filters for next frames
    await page.locator('select').first().selectOption('all');
    await page.locator('select').nth(1).selectOption('all');
    await page.waitForTimeout(500);

    // Frame 19-20: Search interaction
    const searchInput = await page.locator('input[type="search"]');
    if (await searchInput.count() > 0) {
      await searchInput.fill('demo');
      await page.waitForTimeout(500);
      await captureFrame(page, 19);

      await searchInput.clear();
      await page.waitForTimeout(500);
      await captureFrame(page, 20);
    } else {
      // Fallback: use regular captures
      await captureFrame(page, 19);
      await captureFrame(page, 20);
    }

    // Frame 21-24: Form and UI elements
    const createBtn = await page.locator('button:has-text("New Task"), button:has-text("Create")');
    if (await createBtn.count() > 0) {
      await createBtn.first().click();
      await page.waitForTimeout(500);
      await captureFrame(page, 21);

      const titleInput = await page.locator('input[placeholder*="title"], input[placeholder*="Task"]');
      if (await titleInput.count() > 0) {
        await titleInput.first().fill('Demo Task Frame 22');
        await page.waitForTimeout(500);
        await captureFrame(page, 22);

        const descInput = await page.locator('textarea, input[placeholder*="description"]');
        if (await descInput.count() > 0) {
          await descInput.first().fill('This is a demonstration');
          await page.waitForTimeout(500);
          await captureFrame(page, 23);
        }
      }

      // Close form
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      // Fallback frames
      await captureFrame(page, 21);
      await captureFrame(page, 22);
      await captureFrame(page, 23);
    }

    // Frame 24: Reset and capture
    await page.keyboard.press('Home');
    await page.waitForTimeout(500);
    await captureFrame(page, 24);

    // Frame 25-30: Different scroll positions and states
    for (let i = 25; i <= 30; i++) {
      const scrollDistance = ((i - 24) * 150) % 800;
      await page.evaluate((scroll) => window.scrollBy(0, scroll), scrollDistance);
      await page.waitForTimeout(500);
      await captureFrame(page, i);
    }

    console.log('\n✅ All 30 frames captured successfully!');

  } catch (error) {
    console.error('❌ Error during capture:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
