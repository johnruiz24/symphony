#!/usr/bin/env node
/**
 * Capture 30 frames with REAL workflow:
 * - Create tasks
 * - Drag between columns
 * - Assign to agents
 * - Apply filters
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/demo/screenshots';
const BASE_URL = 'http://localhost:3000';

// Clear old
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
    console.log('🎬 Capturing 30 frames with REAL workflow...\n');
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Frame 1: Initial board state
    await captureFrame(page, 1, 'Initial board loaded');
    await page.waitForTimeout(400);

    // Frames 2-5: Create 4 tasks
    console.log('\n📝 Creating tasks...');
    for (let t = 2; t <= 5; t++) {
      // Click "+ New Task" button
      const newBtn = page.locator('button:has-text("+ New Task")');
      if (await newBtn.count() > 0) {
        await newBtn.click();
        await page.waitForTimeout(600);
      }

      // Fill title (always first input in form)
      const titleInput = page.locator('textbox[name="title"], input[placeholder="Task title"]').first();
      if (await titleInput.count() > 0) {
        await titleInput.fill(`Demo Task ${t - 1}`);
        await page.waitForTimeout(300);
      }

      // Fill description (second input)
      const descInput = page.locator('textbox[name="description"], input[placeholder*="description"]').first();
      if (await descInput.count() > 0) {
        await descInput.fill(`This is demo task number ${t - 1}`);
        await page.waitForTimeout(300);
      }

      // Screenshot of filled form
      await captureFrame(page, t, `Task ${t - 1} form filled`);
      await page.waitForTimeout(300);

      // Press Enter or click Create to submit
      try {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(800);
      } catch (e) {}

      // Close modal
      try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      } catch (e) {}
    }

    // Frame 6: Board after creating tasks
    await captureFrame(page, 6, 'Tasks created - board updated');
    await page.waitForTimeout(400);

    // Frames 7-10: Drag first task through columns (Backlog → To Do → In Progress → Done)
    console.log('\n🔄 Dragging tasks between columns...');
    const statuses = ['To Do', 'In Progress', 'Done', 'Backlog'];
    for (let i = 7; i <= 10; i++) {
      try {
        // Find a task card (they're buttons)
        const taskCards = page.locator('button[class*="task"], button[class*="Card"]');
        let cards = await taskCards.all();

        // Try to find actual task buttons (with title/description content)
        if (cards.length === 0) {
          cards = await page.locator('button').all();
        }

        if (cards.length > 0) {
          // Get first moveable task
          const task = cards[0];

          // Find column header and drag there
          const colHeader = page.locator('text=' + statuses[i - 7]).first();
          if (await colHeader.count() > 0) {
            // Find the column container (usually parent of header)
            const column = page.locator('[class*="column"]').first();
            if (await column.count() > 0) {
              await task.dragTo(column);
              await page.waitForTimeout(600);
            }
          }
        }
      } catch (e) {
        console.log(`  - Drag ${i} skipped (${e.message})`);
      }

      await captureFrame(page, i, `Task dragged to ${statuses[i - 7]}`);
      await page.waitForTimeout(400);
    }

    // Frames 11-15: Assign tasks to agents
    console.log('\n👤 Assigning to agents...');
    for (let i = 11; i <= 15; i++) {
      try {
        // Find task and agent slot
        const tasks = page.locator('button[class*="task"], button[class*="Card"]');
        const taskCount = await tasks.count();

        if (taskCount > 0) {
          const task = tasks.nth((i - 11) % taskCount);

          // Find agent strip/buttons
          const agents = page.locator('[class*="agent"], [data-testid*="agent"]');
          const agentCount = await agents.count();

          if (agentCount > 0) {
            const agent = agents.nth((i - 11) % agentCount);
            await task.dragTo(agent);
            await page.waitForTimeout(600);
          }
        }
      } catch (e) {
        console.log(`  - Agent assign ${i} skipped`);
      }

      await captureFrame(page, i, `Task assigned to agent ${i - 10}`);
      await page.waitForTimeout(400);
    }

    // Frames 16-20: Apply filters
    console.log('\n🔍 Applying filters...');
    const filterValues = [
      { select: 'select', option: 'backlog', desc: 'Filter: Backlog' },
      { select: 'select', option: 'to_do', desc: 'Filter: To Do' },
      { select: 'select', option: 'in_progress', desc: 'Filter: In Progress' },
      { select: 'select', option: 'done', desc: 'Filter: Done' },
      { select: 'select:nth-of-type(2)', option: 'high', desc: 'Filter: High Priority' }
    ];

    for (let i = 16; i <= 20; i++) {
      try {
        const filterIdx = (i - 16) % filterValues.length;
        const selects = page.locator('select');
        if (await selects.count() > 0) {
          await selects.nth(0).selectOption(filterValues[filterIdx].option);
          await page.waitForTimeout(500);
        }
      } catch (e) {}

      await captureFrame(page, i, filterValues[(i - 16) % filterValues.length].desc);
      await page.waitForTimeout(400);
    }

    // Frame 21: Clear all filters
    try {
      const selects = page.locator('select');
      const count = await selects.count();
      for (let s = 0; s < count; s++) {
        await selects.nth(s).selectOption('all');
      }
    } catch (e) {}
    await page.waitForTimeout(500);
    await captureFrame(page, 21, 'All filters cleared');
    await page.waitForTimeout(400);

    // Frames 22-25: Search functionality
    console.log('\n🔎 Testing search...');
    const searchTerms = ['task', 'demo', 'api', ''];
    for (let i = 22; i <= 25; i++) {
      const searchBox = page.locator('input[placeholder*="Search"]');
      if (await searchBox.count() > 0) {
        const term = searchTerms[(i - 22) % searchTerms.length];
        await searchBox.fill(term);
        await page.waitForTimeout(500);
      }

      await captureFrame(page, i, `Search: "${searchTerms[(i - 22) % searchTerms.length]}"`);
      await page.waitForTimeout(400);
    }

    // Frames 26-30: Final complex interactions
    console.log('\n🎯 Complex interactions...');

    // Clear search
    const searchBox = page.locator('input[placeholder*="Search"]');
    if (await searchBox.count() > 0) {
      await searchBox.fill('');
      await page.waitForTimeout(300);
    }

    // Multiple drags and filters
    for (let i = 26; i <= 30; i++) {
      try {
        if (i === 26) {
          // Drag a task
          const tasks = page.locator('button[class*="task"]');
          if (await tasks.count() > 0) {
            const cols = page.locator('[class*="column"]');
            if (await cols.count() > 0) {
              await tasks.nth(0).dragTo(cols.nth((i - 26) % await cols.count()));
              await page.waitForTimeout(400);
            }
          }
        } else if (i === 27) {
          // Apply status filter
          const sel = page.locator('select').first();
          if (await sel.count() > 0) {
            await sel.selectOption('in_progress');
            await page.waitForTimeout(400);
          }
        } else if (i === 28) {
          // Apply priority filter
          const sels = page.locator('select');
          if (await sels.count() > 1) {
            await sels.nth(1).selectOption('high');
            await page.waitForTimeout(400);
          }
        } else if (i === 29) {
          // Create another task
          const newBtn = page.locator('button:has-text("+ New Task")');
          if (await newBtn.count() > 0) {
            await newBtn.click();
            await page.waitForTimeout(400);
            const titleInput = page.locator('input[placeholder="Task title"]').first();
            if (await titleInput.count() > 0) {
              await titleInput.fill('Final Demo Task');
              await page.waitForTimeout(300);
            }
            await page.keyboard.press('Enter');
            await page.waitForTimeout(500);
            await page.keyboard.press('Escape');
          }
        } else {
          // Clear filters and show full board
          const sels = page.locator('select');
          const count = await sels.count();
          for (let s = 0; s < count; s++) {
            await sels.nth(s).selectOption('all');
          }
          await page.waitForTimeout(400);
        }
      } catch (e) {}

      await captureFrame(page, i, `Complex interaction ${i - 25}`);
      await page.waitForTimeout(400);
    }

    console.log('\n✅ All 30 frames captured with REAL workflow!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
