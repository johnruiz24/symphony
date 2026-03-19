#!/usr/bin/env node
/**
 * Capture 30 frames by scrolling, resizing, and taking viewport screenshots
 * Each frame shows different content through scrolling and viewport changes
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/demo/screenshots';
const BASE_URL = 'http://localhost:3000';

// Clear old screenshots
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('🎬 Capturing 30 frames with varied scroll positions...\n');
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Get total scrollable height
    const maxScroll = await page.evaluate(() => {
      return Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        document.body.scrollHeight - window.innerHeight,
        1
      );
    });
    console.log(`Max scroll height: ${maxScroll}px\n`);

    // Frames 1-10: Scroll through 0-40% of page
    for (let i = 1; i <= 10; i++) {
      const scrollPercent = (i - 1) / 10;
      const scrollPos = Math.floor(maxScroll * scrollPercent);
      await page.evaluate((pos) => window.scrollTo(0, pos), scrollPos);
      await page.waitForTimeout(200);
      await captureFrame(page, i, `Scroll position: ${scrollPercent * 100}% (${scrollPos}px)`);
    }

    // Frames 11-20: Scroll through 40-80% of page
    for (let i = 11; i <= 20; i++) {
      const scrollPercent = (i - 1) / 30;
      const scrollPos = Math.floor(maxScroll * scrollPercent);
      await page.evaluate((pos) => window.scrollTo(0, pos), scrollPos);
      await page.waitForTimeout(200);
      await captureFrame(page, i, `Scroll position: ${scrollPercent * 100}% (${scrollPos}px)`);
    }

    // Frames 21-25: Scroll through 80-100% of page
    for (let i = 21; i <= 25; i++) {
      const scrollPercent = (20 + (i - 20) * 4) / 100;
      const scrollPos = Math.floor(maxScroll * scrollPercent);
      await page.evaluate((pos) => window.scrollTo(0, pos), scrollPos);
      await page.waitForTimeout(200);
      await captureFrame(page, i, `Scroll position: ${(scrollPercent * 100).toFixed(0)}% (${scrollPos}px)`);
    }

    // Frames 26-28: Different viewport widths
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await captureFrame(page, 26, 'Viewport: 1200x900 - scroll 0%');

    await page.evaluate((pos) => window.scrollTo(0, pos), Math.floor(maxScroll * 0.5));
    await page.waitForTimeout(200);
    await captureFrame(page, 27, 'Viewport: 1200x900 - scroll 50%');

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await captureFrame(page, 28, 'Viewport: 1600x900 - scroll 0%');

    // Frames 29-30: Back to original viewport with different scroll positions
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate((pos) => window.scrollTo(0, pos), Math.floor(maxScroll * 0.3));
    await page.waitForTimeout(200);
    await captureFrame(page, 29, 'Back to 1440x900 - scroll 30%');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await captureFrame(page, 30, 'Back to 1440x900 - scroll 0% (final)');

    console.log('\n✅ All 30 frames captured!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
