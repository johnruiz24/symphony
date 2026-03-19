#!/usr/bin/env node
/**
 * Simple 30-frame capture using only scrolling and basic interactions
 * Focus on visual variety through viewport changes
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = '/Users/john.ruiz/.claude/worktrees/symphony/feat-explore/demo/screenshots';
const BASE_URL = 'http://localhost:3000';

// Clear old screenshots
const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
files.forEach(f => fs.unlinkSync(path.join(SCREENSHOTS_DIR, f)));
console.log(`Cleared ${files.length} old screenshots\n`);

const frameDescriptions = [
  'Initial board load - baseline view',
  'Scroll down - see more tasks',
  'Continue scrolling - middle section',
  'Scroll more - additional tasks',
  'Near bottom - more tasks visible',
  'Bottom section - final tasks',
  'Scroll up - return to top',
  'Scroll down 100px - slight change',
  'Scroll down 200px - different view',
  'Scroll down 300px - more content',
  'Scroll down 400px - further down',
  'Scroll down 500px - middle-bottom',
  'Scroll down 600px - near bottom',
  'Scroll down 700px - even further',
  'Back to top - reset view',
  'Scroll to center - middle tasks',
  'Scroll gradually - 1/6 down',
  'Scroll gradually - 2/6 down',
  'Scroll gradually - 3/6 down',
  'Scroll gradually - 4/6 down',
  'Scroll gradually - 5/6 down',
  'Scroll gradually - almost bottom',
  'Final scroll - bottom reached',
  'Viewport focus top - beginning',
  'Viewport focus middle - center',
  'Viewport focus bottom - end',
  'Rapid scroll - full view',
  'Pause at top - stable view',
  'Pause at bottom - end view',
  'Final overview - complete state'
];

async function captureFrame(page, frameNum) {
  const filename = path.join(SCREENSHOTS_DIR, `${String(frameNum).padStart(2, '0')}-frame-${frameNum}.png`);
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`✅ Frame ${frameNum}: ${frameDescriptions[frameNum - 1]}`);
  return filename;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  try {
    console.log('🎬 Capturing 30 frames with visual variety...\n');
    await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
    await page.waitForTimeout(1500);

    // Get max scroll height
    const maxScroll = await page.evaluate(() =>
      Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        document.body.scrollHeight - window.innerHeight,
        1
      )
    );

    console.log(`Max scroll height: ${maxScroll}px\n`);

    // Frame 1-7: Different scroll positions
    for (let i = 1; i <= 7; i++) {
      const scroll = Math.floor((maxScroll / 6) * (i - 1));
      await page.evaluate((s) => window.scrollTo(0, s), scroll);
      await page.waitForTimeout(300);
      await captureFrame(page, i);
    }

    // Frame 8-15: Small incremental scrolls (100px each)
    for (let i = 8; i <= 15; i++) {
      const scroll = 100 * (i - 7);
      await page.evaluate((s) => window.scrollTo(0, s), Math.min(scroll, maxScroll));
      await page.waitForTimeout(300);
      await captureFrame(page, i);
    }

    // Frame 16-22: Gradual progression through full scroll
    for (let i = 16; i <= 22; i++) {
      const percent = (i - 16) / 6;
      const scroll = Math.floor(maxScroll * percent);
      await page.evaluate((s) => window.scrollTo(0, s), scroll);
      await page.waitForTimeout(300);
      await captureFrame(page, i);
    }

    // Frame 23-27: Focus on different areas
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await captureFrame(page, 23);

    await page.evaluate((m) => window.scrollTo(0, m / 2), maxScroll);
    await page.waitForTimeout(300);
    await captureFrame(page, 24);

    await page.evaluate((m) => window.scrollTo(0, m), maxScroll);
    await page.waitForTimeout(300);
    await captureFrame(page, 25);

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
    await page.waitForTimeout(300);
    await captureFrame(page, 26);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await captureFrame(page, 27);

    // Frame 28-30: Slow scroll to create variety
    for (let frame = 28; frame <= 30; frame++) {
      const increment = Math.floor(maxScroll / 10) * (frame - 27);
      await page.evaluate((s) => window.scrollBy(0, s), increment);
      await page.waitForTimeout(300);
      await captureFrame(page, frame);
    }

    console.log('\n✅ All 30 frames captured successfully!');

  } catch (error) {
    console.error('❌ Error during capture:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
