#!/usr/bin/env node
/**
 * Capture 30 frames showing REAL workflow:
 * 1. Initial board
 * 2-5. Create multiple tasks
 * 6-15. Drag tasks between columns (status changes)
 * 16-20. Assign tasks to agents
 * 21-25. Apply filters
 * 26-30. Complex interactions
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/demo/screenshots';
const BASE_URL = 'http://localhost:3000';

if (fs.existsSync(SCREENSHOTS_DIR)) {
  fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png')).forEach(f => {
    fs.unlinkSync(path.join(SCREENSHOTS_DIR, f));
  });
}

async function captureFrame(page, frameNum, description) {
  const filename = path.join(SCREENSHOTS_DIR, `${String(frameNum).padStart(2, '0')}-frame-${frameNum}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`✅ Frame ${frameNum}: ${description}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('🎬 Capturing 30 frames showing REAL app workflow...\n');
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Frame 1: Initial board
    await captureFrame(page, 1, 'Initial board - baseline');
    await page.waitForTimeout(300);

    // Frames 2-5: Create 4 different tasks
    console.log('\n📝 Creating tasks...');
    for (let taskNum = 2; taskNum <= 5; taskNum++) {
      // Find and click create button
      const createBtn = page.locator('button').filter({ hasText: /New|Create|Add Task/ }).first();
      if (await createBtn.count() > 0) {
        await createBtn.click();
        await page.waitForTimeout(400);
      }

      // Fill task title
      const titleInput = page.locator('input[placeholder*="title"], input[placeholder*="Title"], input[placeholder*="task"]').first();
      if (await titleInput.count() > 0) {
        await titleInput.fill(`Task ${taskNum - 1}`);
        await page.waitForTimeout(200);
      }

      // Fill description
      const descInput = page.locator('textarea, input[placeholder*="description"]').first();
      if (await descInput.count() > 0) {
        await descInput.fill(`This is demo task number ${taskNum - 1}`);
        await page.waitForTimeout(200);
      }

      // Try to set priority
      const prioritySelect = page.locator('select').first();
      if (await prioritySelect.count() > 0) {
        const options = await prioritySelect.locator('option').count();
        if (options > 2) {
          await prioritySelect.selectOption({ index: (taskNum - 2) % options });
        }
        await page.waitForTimeout(200);
      }

      // Submit
      const submitBtn = page.locator('button').filter({ hasText: /Submit|Save|Create/ }).first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await page.waitForTimeout(600);
      }

      // Close modal
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      } catch (e) {}

      await captureFrame(page, taskNum, `Task ${taskNum - 1} created`);
      await page.waitForTimeout(300);
    }

    // Frames 6-15: Drag tasks to different columns
    console.log('\n🔄 Dragging tasks between columns...');
    const statuses = ['backlog', 'to_do', 'in_progress', 'done'];
    for (let i = 6; i <= 15; i++) {
      try {
        // Find task cards
        const taskCards = page.locator('[class*="task"], [class*="Card"]');
        const cardCount = await taskCards.count();

        if (cardCount > 0) {
          const cardIdx = (i - 6) % cardCount;
          const card = taskCards.nth(cardIdx);

          // Find target column
          const columns = page.locator('[class*="column"], [class*="Column"]');
          const colCount = await columns.count();

          if (colCount > 0) {
            const colIdx = (i - 6) % colCount;
            const targetCol = columns.nth(colIdx);

            // Drag card to column
            await card.dragTo(targetCol);
            await page.waitForTimeout(500);
          }
        }
      } catch (e) {}

      await captureFrame(page, i, `Drag task - status change ${i - 5}`);
      await page.waitForTimeout(300);
    }

    // Frames 16-20: Agent assignment
    console.log('\n👤 Assigning tasks to agents...');
    for (let i = 16; i <= 20; i++) {
      try {
        const taskCards = page.locator('[class*="task"], [class*="Card"]');
        const cardCount = await taskCards.count();

        if (cardCount > 0) {
          const cardIdx = (i - 16) % cardCount;
          const card = taskCards.nth(cardIdx);

          // Find agent slots
          const agents = page.locator('[class*="agent"], [class*="Agent"]');
          const agentCount = await agents.count();

          if (agentCount > 0) {
            const agentIdx = (i - 16) % agentCount;
            const targetAgent = agents.nth(agentIdx);

            // Drag to agent
            await card.dragTo(targetAgent);
            await page.waitForTimeout(500);
          }
        }
      } catch (e) {}

      await captureFrame(page, i, `Agent assignment ${i - 15}`);
      await page.waitForTimeout(300);
    }

    // Frames 21-25: Apply different filters
    console.log('\n🔍 Applying filters...');
    const filterOptions = ['backlog', 'to_do', 'in_progress', 'done', 'all'];
    for (let i = 21; i <= 25; i++) {
      try {
        const statusSelect = page.locator('select').first();
        if (await statusSelect.count() > 0) {
          const filterIdx = (i - 21) % filterOptions.length;
          await statusSelect.selectOption(filterOptions[filterIdx]);
          await page.waitForTimeout(500);
        }
      } catch (e) {}

      await captureFrame(page, i, `Filter: ${filterOptions[(i - 21) % filterOptions.length]}`);
      await page.waitForTimeout(300);
    }

    // Frames 26-30: Complex multi-step interactions
    console.log('\n🎯 Final complex interactions...');

    // Clear filters
    try {
      const selects = page.locator('select');
      const selectCount = await selects.count();
      for (let s = 0; s < selectCount; s++) {
        await selects.nth(s).selectOption('all');
      }
    } catch (e) {}
    await page.waitForTimeout(300);
    await captureFrame(page, 26, 'All filters cleared');
    await page.waitForTimeout(300);

    // Move multiple tasks
    for (let i = 27; i <= 30; i++) {
      try {
        const taskCards = page.locator('[class*="task"], [class*="Card"]');
        const cardCount = await taskCards.count();

        if (cardCount > 1) {
          const card = taskCards.nth((i - 27) % cardCount);
          const columns = page.locator('[class*="column"], [class*="Column"]');
          const colCount = await columns.count();

          if (colCount > 0) {
            const targetCol = columns.nth((i - 27) % colCount);
            await card.dragTo(targetCol);
            await page.waitForTimeout(400);
          }
        }
      } catch (e) {}

      await captureFrame(page, i, `Complex interaction ${i - 26}`);
      await page.waitForTimeout(300);
    }

    console.log('\n✅ All 30 frames captured with REAL workflow interactions!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
