import { tool } from "@opencode-ai/plugin"
import { execSync } from "node:child_process"

const PLAYWRIGHT_PATH = "/usr/lib/node_modules/playwright"

async function runPlaywright(code) {
  const wrapped = `
const { chromium } = require('${PLAYWRIGHT_PATH}');
(async () => {
  ${code}
})().catch(e => { console.error(e.message); process.exit(1); });
`
  const result = execSync(`node -e "${wrapped.replace(/"/g, '\\"')}"`, {
    timeout: 30000,
    encoding: "utf8",
  })
  return result.trim()
}

export const PlaywrightPlugin = async () => {
  return {
    tool: {
      playwright_screenshot: tool({
        description: "Take a screenshot of a URL using Playwright",
        args: {
          url: tool.schema.string().describe("URL to screenshot"),
          path: tool.schema.string().optional().describe("Save path (optional)"),
        },
        async execute(args) {
          const saveTo = args.path || "/tmp/screenshot.png"
          await runPlaywright(`
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('${args.url}');
await page.screenshot({ path: '${saveTo}', fullPage: true });
console.log('Screenshot saved to ${saveTo}');
await browser.close();
`)
          return `Screenshot saved to ${saveTo}`
        },
      }),

      playwright_scrape: tool({
        description: "Scrape text content from a URL using Playwright",
        args: {
          url: tool.schema.string().describe("URL to scrape"),
          selector: tool.schema.string().optional().describe("CSS selector (optional, defaults to body)"),
        },
        async execute(args) {
          const sel = args.selector || "body"
          const result = await runPlaywright(`
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('${args.url}', { waitUntil: 'networkidle' });
const text = await page.locator('${sel}').innerText();
console.log(text.slice(0, 5000));
await browser.close();
`)
          return result
        },
      }),

      playwright_eval: tool({
        description: "Run arbitrary Playwright code and return stdout",
        args: {
          code: tool.schema.string().describe("JavaScript code to run (has access to chromium, page)"),
        },
        async execute(args) {
          const result = await runPlaywright(`
const browser = await chromium.launch();
const page = await browser.newPage();
${args.code}
await browser.close();
`)
          return result
        },
      }),
    },
  }
}
