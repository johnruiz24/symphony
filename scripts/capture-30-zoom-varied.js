#!/usr/bin/env node
/**
 * Capture 30 frames by zooming, resizing viewport, and triggering JS state changes
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
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🎬 Capturing 30 frames with zoom and viewport variations...\n');

    // Frames 1-10: Different zoom levels
    for (let i = 1; i <= 10; i++) {
      const zoom = 0.7 + (i - 1) * 0.04;  // 0.7 to 1.06
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
      await page.evaluate((z) => document.body.style.transform = `scale(${z})`, zoom);
      await page.waitForTimeout(300);
      await captureFrame(page, i, `Zoom: ${(zoom * 100).toFixed(0)}%`);
    }

    // Frames 11-20: Different viewport sizes
    const viewports = [
      { w: 1920, h: 1080, desc: 'Desktop 1920x1080' },
      { w: 1600, h: 900, desc: 'Desktop 1600x900' },
      { w: 1440, h: 900, desc: 'Desktop 1440x900' },
      { w: 1280, h: 800, desc: 'Desktop 1280x800' },
      { w: 1024, h: 768, desc: 'Tablet 1024x768' },
      { w: 768, h: 1024, desc: 'Tablet 768x1024 (portrait)' },
      { w: 640, h: 960, desc: 'Mobile 640x960' },
      { w: 375, h: 667, desc: 'Phone 375x667' },
      { w: 1440, h: 900, desc: 'Back to 1440x900' },
      { w: 1600, h: 900, desc: 'Desktop 1600x900 again' }
    ];

    for (let i = 11; i <= 20; i++) {
      const vp = viewports[i - 11];
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
      await page.evaluate(() => document.body.style.transform = 'scale(1)');
      await page.waitForTimeout(500);
      await captureFrame(page, i, vp.desc);
    }

    // Frames 21-25: Simulated theme/style changes via CSS injection
    const themes = [
      { opacity: '1.0', filter: 'none', desc: 'Normal theme' },
      { opacity: '0.9', filter: 'brightness(0.9)', desc: 'Dimmed theme' },
      { opacity: '1.0', filter: 'invert(0.05)', desc: 'Dark theme hint' },
      { opacity: '1.0', filter: 'saturate(1.5)', desc: 'Saturated theme' },
      { opacity: '0.95', filter: 'hue-rotate(10deg)', desc: 'Warm theme' }
    ];

    await page.setViewportSize({ width: 1440, height: 900 });
    for (let i = 21; i <= 25; i++) {
      const theme = themes[i - 21];
      await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
      await page.evaluate((t) => {
        document.body.style.opacity = t.opacity;
        document.body.style.filter = t.filter;
      }, theme);
      await page.waitForTimeout(300);
      await captureFrame(page, i, theme.desc);
    }

    // Frames 26-30: Canvas/animation captures
    for (let i = 26; i <= 30; i++) {
      const scale = 0.8 + (i - 26) * 0.05;  // 0.8 to 1.0
      await page.goto(BASE_URL, { waitUntil: 'load', timeout: 10000 });
      await page.evaluate((s) => {
        document.body.style.transform = `scale(${s})`;
        document.body.style.transformOrigin = 'top left';
      }, scale);
      await page.waitForTimeout(300);
      await captureFrame(page, i, `Transform scale: ${(scale * 100).toFixed(0)}%`);
    }

    console.log('\n✅ All 30 frames captured with visual variety!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
