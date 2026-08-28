import { readFileSync, writeFileSync } from "node:fs"
import { execSync } from "node:child_process"
import { tool } from "@opencode-ai/plugin"

const PLAYWRIGHT_PATH = "/usr/lib/node_modules/playwright"

function run(cmd, timeout = 60000) {
  try {
    return execSync(cmd, { timeout, encoding: "utf8", cwd: process.cwd() })
  } catch (e) {
    return e.stdout || e.stderr || e.message
  }
}

function getA11ySnapshot(url) {
  const code = `
const { chromium } = require('${PLAYWRIGHT_PATH}');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('${url}', { waitUntil: 'networkidle', timeout: 10000 });
  const snapshot = await page.accessibility.snapshot({ interestingOnly: false });
  console.log(JSON.stringify(snapshot, null, 2));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
`
  const result = run(`node -e "${code.replace(/"/g, '\\"')}"`, 15000)
  try {
    return JSON.parse(result)
  } catch {
    return null
  }
}

function parseTestFailures(output) {
  const failures = []
  const lines = output.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("FAIL") || lines[i].includes("Error:") || lines[i].includes("expect(")) {
      failures.push({
        line: i,
        text: lines.slice(Math.max(0, i - 2), i + 5).join("\n"),
      })
    }
  }
  return failures
}

export const PlaywrightVisionLoop = async () => {
  return {
    tool: {
      vision_loop_test: tool({
        description:
          "Run Playwright tests with vision loop: run → diagnose failures from a11y snapshot → fix test → re-run. Max 3 iterations.",
        args: {
          test_path: tool.schema.string().describe("Path to test file(s)"),
          max_iterations: tool.schema.number().optional().describe("Max iterations per test (default 3)"),
        },
        async execute(args) {
          const maxIter = args.max_iterations || 3
          const testPath = args.test_path
          const summary = { broken: [], fixed: [], stillFailing: [] }

          for (let iter = 1; iter <= maxIter; iter++) {
            const output = run(`npx playwright test ${testPath} --reporter=line 2>&1`, 120000)
            const pass = output.includes("passed") && !output.includes("failed")

            if (pass) {
              return `✅ All tests passed on iteration ${iter}.\n\nOutput:\n${output.slice(-500)}`
            }

            const failures = parseTestFailures(output)
            if (failures.length === 0) {
              return `Tests failed but no parseable failures found:\n${output.slice(-1000)}`
            }

            for (const fail of failures) {
              const testFile = fail.text.match(/([\w\/\-]+\.test\.[\w]+)/)?.[1] || testPath
              const errorMsg = fail.text.match(/Error: (.+)/)?.[1] || fail.text.slice(0, 200)

              if (!summary.broken.find(b => b.error === errorMsg)) {
                summary.broken.push({ file: testFile, error: errorMsg, iteration: iter })
              }

              const snapshot = getA11ySnapshot("about:blank")

              const fixed = fixTestFile(testFile, fail.text, snapshot)
              if (fixed) {
                summary.fixed.push({ file: testFile, fix: fixed, iteration: iter })
              } else {
                summary.stillFailing.push({ file: testFile, error: errorMsg })
              }
            }
          }

          const finalOutput = run(`npx playwright test ${testPath} --reporter=line 2>&1`, 120000)
          const finalPass = finalOutput.includes("passed") && !finalOutput.includes("failed")

          let report = `## Vision Loop Summary\n`
          report += `- Iterations: ${maxIter}\n`
          report += `- Broken: ${summary.broken.length}\n`
          report += `- Fixed: ${summary.fixed.length}\n`
          report += `- Still failing: ${summary.stillFailing.length}\n`
          report += `- Final status: ${finalPass ? "PASS ✅" : "FAIL ❌"}\n\n`

          if (summary.fixed.length > 0) {
            report += `### Fixes Applied\n`
            for (const f of summary.fixed) {
              report += `- ${f.file}: ${f.fix}\n`
            }
          }

          if (summary.stillFailing.length > 0) {
            report += `### Still Failing\n`
            for (const f of summary.stillFailing) {
              report += `- ${f.file}: ${f.error}\n`
            }
          }

          return report
        },
      }),

      vision_snapshot: tool({
        description: "Get accessibility snapshot of a URL for diagnosing test failures",
        args: {
          url: tool.schema.string().describe("URL to snapshot"),
        },
        async execute(args) {
          const snapshot = getA11ySnapshot(args.url)
          if (!snapshot) return "Failed to get snapshot"
          return JSON.stringify(snapshot, null, 2).slice(0, 5000)
        },
      }),
    },
  }
}

function fixTestFile(testFile, errorText, snapshot) {
  try {
    let content = readFileSync(testFile, "utf8")
    let changed = false

    const locatorMatch = errorText.match(/locator\(['"](.+?)['"]\)/)
    if (locatorMatch) {
      const oldLocator = locatorMatch[1]
      if (oldLocator.startsWith(".") || oldLocator.startsWith("#") || oldLocator.includes(" >> ")) {
        const role = snapshot?.children?.find(c => c.role)
        if (role) {
          const newLocator = `getByRole('${role.role}', { name: '${role.name || ""}' })`
          content = content.replace(
            new RegExp(`locator\\(['"]${oldLocator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]\\)`),
            newLocator
          )
          changed = true
        }
      }
    }

    if (errorText.includes("waitForTimeout")) {
      content = content.replace(/await page\.waitForTimeout\(\d+\)/g, "// removed waitForTimeout")
      changed = true
    }

    if (changed) {
      writeFileSync(testFile, content)
      return `Fixed locators in ${testFile}`
    }
  } catch {}
  return null
}
