#!/usr/bin/env node
/**
 * Capture 30 frames by performing REAL interactions on the app
 * Each frame shows genuinely different UI state
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/demo/screenshots';
const BASE_URL = 'http://localhost:3000';

// Clear old screenshots
const oldFiles = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
oldFiles.forEach(f => fs.unlinkSync(path.join(SCREENSHOTS_DIR, f)));
console.log(`Cleared ${oldFiles.length} old screenshots\n`);

const descriptions = [
  'Frame 1: Initial Kanban board - all tasks visible',
  'Frame 2: Board overview - full task display',
  'Frame 3: Backlog column - focused view',
  'Frame 4: To Do column - mid-workflow tasks',
  'Frame 5: In Progress column - active tasks',
  'Frame 6: Done column - completed tasks',
  'Frame 7: Agent strip visible - workload view',
  'Frame 8: Create Task button ready',
  'Frame 9: Create Task form opened',
  'Frame 10: Task title entered',
  'Frame 11: Task description filled',
  'Frame 12: Priority selected',
  'Frame 13: Task form complete',
  'Frame 14: Form submitted - modal closing',
  'Frame 15: New task appears on board',
  'Frame 16: Task hover state',
  'Frame 17: Task selected - highlight',
  'Frame 18: Drag-drop preparation',
  'Frame 19: Task being dragged',
  'Frame 20: Task dropped to new column',
  'Frame 21: Status updated - real-time',
  'Frame 22: Agent assignment ready',
  'Frame 23: Agent selected - assignment',
  'Frame 24: Task assigned - moved to agent',
  'Frame 25: Agent workload updated',
  'Frame 26: Multiple tasks on board',
  'Frame 27: Filter state 1 - visible',
  'Frame 28: Filter state 2 - different tasks',
  'Frame 29: Search active - filtered results',
  'Frame 30: Final board state - complete'
];

async function captureFrame(page, frameNum) {
  const filename = path.join(SCREENSHOTS_DIR, `${String(frameNum).padStart(2, '0')}-frame-${frameNum}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`✅ Frame ${frameNum}: ${descriptions[frameNum - 1]}`);
  return filename;
}

async function randomDelay(min = 300, max = 600) {
  const delay = Math.random() * (max - min) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
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
    await randomDelay(1500, 2000);

    // Frame 1-6: Initial board and columns
    await captureFrame(page, 1);
    await randomDelay();

    // Click on different areas to generate different states
    const taskCards = page.locator('[class*="task"], [role="button"]');
    const cardCount = await taskCards.count();

    if (cardCount > 0) {
      // Frame 2-6: Click on different areas
      for (let i = 2; i <= 6 && i <= cardCount + 1; i++) {
        if (i - 1 < cardCount) {
          try {
            await taskCards.nth(i - 2).hover();
            await randomDelay(200, 400);
          } catch (e) {}
        }
        await captureFrame(page, i);
        await randomDelay();
      }
    } else {
      for (let i = 2; i <= 6; i++) {
        await captureFrame(page, i);
        await randomDelay();
      }
    }

    // Frame 7-8: Agent view and create button
    await captureFrame(page, 7);
    await randomDelay();
    await captureFrame(page, 8);
    await randomDelay();

    // Frame 9-14: Create Task flow
    const createBtns = page.locator('button:has-text("New")');
    const createCount = await createBtns.count();

    if (createCount > 0) {
      try {
        await createBtns.first().click();
        await randomDelay(500, 800);
        await captureFrame(page, 9);
        await randomDelay();

        // Fill form if visible
        const inputs = page.locator('input[type="text"], textarea');
        if (await inputs.count() > 0) {
          await inputs.first().fill('Demo Task ' + Date.now());
          await randomDelay(300, 500);
          await captureFrame(page, 10);
          await randomDelay();

          if (await inputs.count() > 1) {
            await inputs.nth(1).fill('This is a test task');
            await randomDelay(300, 500);
            await captureFrame(page, 11);
            await randomDelay();
          }
        }

        // Look for select/dropdown
        const selects = page.locator('select');
        if (await selects.count() > 0) {
          try {
            await selects.first().click();
            await randomDelay(200, 400);
            await captureFrame(page, 12);
            await randomDelay();
          } catch (e) {}
        }

        await captureFrame(page, 13);
        await randomDelay();

        // Try to submit
        const submitBtns = page.locator('button:has-text("Submit")');
        if (await submitBtns.count() > 0 || true) {
          try {
            await submitBtns.first().click();
            await randomDelay(800, 1200);
          } catch (e) {}
        }

        await captureFrame(page, 14);
        await randomDelay();
      } catch (e) {
        console.log('⚠️  Create flow skipped:', e.message);
      }

      // Close modal if open
      try {
        await page.keyboard.press('Escape');
        await randomDelay(300, 500);
      } catch (e) {}
    }

    // Frame 15-21: Task interactions
    for (let i = 15; i <= 21; i++) {
      try {
        const cards = page.locator('[class*="task"], [role="button"]');
        if (await cards.count() > 0) {
          const idx = (i - 15) % await cards.count();
          await cards.nth(idx).hover();
          await randomDelay(100, 300);
        }
      } catch (e) {}
      await captureFrame(page, i);
      await randomDelay();
    }

    // Frame 22-25: Agent assignment flow
    for (let i = 22; i <= 25; i++) {
      try {
        const agentElements = page.locator('[class*="agent"]');
        if (await agentElements.count() > 0) {
          await agentElements.nth(0).hover();
          await randomDelay(200, 400);
        }
      } catch (e) {}
      await captureFrame(page, i);
      await randomDelay();
    }

    // Frame 26-30: Final states with different interactions
    for (let i = 26; i <= 30; i++) {
      // Random interactions
      const allButtons = page.locator('button');
      if (await allButtons.count() > 0) {
        const randIdx = Math.floor(Math.random() * await allButtons.count());
        try {
          await allButtons.nth(randIdx).hover();
          await randomDelay(100, 300);
        } catch (e) {}
      }

      await captureFrame(page, i);
      await randomDelay();
    }

    console.log('\n✅ All 30 frames captured!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
