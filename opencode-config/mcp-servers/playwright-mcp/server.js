import { createServer } from "node:http"
import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { join } from "node:path"
import { tmpdir } from "node:os"

const PLAYWRIGHT_PATH = "/usr/lib/node_modules/playwright"
const PORT = process.env.PORT || 3001

function runScript(code, timeout = 15000) {
  const scriptPath = join(tmpdir(), `pw-${Date.now()}.js`)
  writeFileSync(scriptPath, code)
  try {
    return execSync(`node ${scriptPath}`, { timeout, encoding: "utf8" }).trim()
  } catch (e) {
    return e.stdout || e.stderr || e.message
  }
}

const handlers = {
  screenshot: async ({ url, path }) => {
    const saveTo = path || "/tmp/screenshot.png"
    const code = `
const { chromium } = require('${PLAYWRIGHT_PATH}');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('${url}', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '${saveTo}', fullPage: true });
  await browser.close();
  console.log('OK');
})().catch(e => { console.error(e.message); process.exit(1); });
`
    runScript(code, 30000)
    return { saved: saveTo }
  },

  scrape: async ({ url, selector }) => {
    const sel = selector || "body"
    const code = `
const { chromium } = require('${PLAYWRIGHT_PATH}');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('${url}', { waitUntil: 'networkidle' });
  const text = await page.locator('${sel}').innerText();
  console.log(text.slice(0, 5000));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
`
    return { text: runScript(code, 30000) }
  },

  snapshot: async ({ url }) => {
    const code = `
const { chromium } = require('${PLAYWRIGHT_PATH}');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('${url}', { waitUntil: 'networkidle', timeout: 10000 });
  const elements = await page.evaluate(() => {
    const els = document.querySelectorAll('a, button, input, [role], h1, h2, h3, label');
    return Array.from(els).map(el => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      name: el.textContent?.trim().slice(0, 50) || el.getAttribute('aria-label') || '',
      type: el.getAttribute('type') || '',
      href: el.getAttribute('href') || '',
    }));
  });
  console.log(JSON.stringify(elements));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
`
    const result = runScript(code, 15000)
    try {
      return { elements: JSON.parse(result) }
    } catch {
      return { error: "Failed to parse snapshot" }
    }
  },

  eval: async ({ code: userCode }) => {
    const code = `
const { chromium } = require('${PLAYWRIGHT_PATH}');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  ${userCode}
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
`
    return { output: runScript(code, 30000) }
  },

  test_run: async ({ testPath }) => {
    const code = `
const { execSync } = require('child_process');
const output = execSync('npx playwright test ${testPath} --reporter=line 2>&1', {timeout: 120000, encoding: 'utf8'});
console.log(output);
`
    return { output: runScript(code, 120000) }
  },

  test_fix: async ({ testPath, maxIterations }) => {
    const maxIter = maxIterations || 3
    const summary = { broken: [], fixed: [], iterations: 0 }

    for (let iter = 1; iter <= maxIter; iter++) {
      summary.iterations = iter
      const output = runScript(`
const { execSync } = require('child_process');
console.log(execSync('npx playwright test ${testPath} --reporter=line 2>&1', {timeout: 120000, encoding: 'utf8'}));
`, 120000)

      if (output.includes("passed") && !output.includes("failed")) {
        return { ...summary, status: "PASS", output: output.slice(-500) }
      }

      const failMatch = output.match(/Error: (.+)/g)
      if (failMatch) {
        for (const err of failMatch) {
          if (!summary.broken.includes(err)) summary.broken.push(err)
        }
      }
    }

    return { ...summary, status: "FAIL" }
  },
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ tools: Object.keys(handlers) }))
    return
  }

  let body = ""
  for await (const chunk of req) body += chunk

  try {
    const { method, params } = JSON.parse(body)
    if (!handlers[method]) {
      res.writeHead(400, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ error: `Unknown method: ${method}` }))
      return
    }
    const result = await handlers[method](params || {})
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ result }))
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: e.message }))
  }
})

server.listen(PORT, () => console.log(`Playwright MCP on :${PORT}`))
