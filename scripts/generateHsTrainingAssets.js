const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const { chromium } = require('playwright');

const { HS_TRAINING_SAMPLE_FORM } = require('../src/utils/hsTrainingSampleForm');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'examples');
const HTML_PATH = path.join(OUTPUT_DIR, 'hs-builder-practice-pack.html');
const JSON_PATH = path.join(OUTPUT_DIR, 'hs-builder-practice-pack.formio.json');
const PDF_PATH = path.join(OUTPUT_DIR, 'hs-builder-practice-pack.pdf');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium'
];

async function resolveBrowserOptions() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await fs.access(candidate);
      return {
        executablePath: candidate,
        headless: true
      };
    } catch {
      // Keep looking.
    }
  }

  return { headless: true };
}

async function ensureInputHtml() {
  await fs.access(HTML_PATH);
}

async function writeJson() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(JSON_PATH, `${JSON.stringify(HS_TRAINING_SAMPLE_FORM, null, 2)}\n`, 'utf8');
}

async function writePdf() {
  const browser = await chromium.launch(await resolveBrowserOptions());

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(HTML_PATH).href, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: PDF_PATH,
      format: 'Letter',
      printBackground: true,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0'
      }
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  await ensureInputHtml();
  await writeJson();
  await writePdf();

  console.log(`Wrote ${path.relative(process.cwd(), JSON_PATH)}`);
  console.log(`Wrote ${path.relative(process.cwd(), PDF_PATH)}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
