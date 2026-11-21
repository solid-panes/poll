// Shared by the tests: the local settings, a logged-in page, and the small helpers.
// Settings come from tests/local.json (not committed; copy local.example.json).
import { launch } from './cdp.mjs'
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const at = (...parts) => path.join(HERE, ...parts)
if (!existsSync(at('local.json'))) { console.log('No tests/local.json. Copy tests/local.example.json and fill it in. See README.'); process.exit(2) }
export const config = JSON.parse(readFileSync(at('local.json'), 'utf8'))
export const POD = config.pod
const SHOTS = at('shots')
const PROFILE = at('profile')
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const DEEP = `(sel, root = document) => { const walk = (node) => { const found = node.querySelector(sel); if (found) return found; for (const el of node.querySelectorAll('*')) if (el.shadowRoot) { const f = walk(el.shadowRoot); if (f) return f } return null }; return walk(root) }`

// A page on the browser with the pane added. login: true starts from a clean profile and logs in;
// login: false reuses the session the last logged-in run left behind.
export async function open ({ width = 1300, login = true, fresh = login, resource = POD } = {}) {
  const pane = config.repo + 'poll-pane.js'
  const address = (uri) => `${config.browser}?pane=${encodeURIComponent(pane)}&uri=${encodeURIComponent(uri)}`
  if (fresh) rmSync(PROFILE, { recursive: true, force: true }) // a clean browser: nobody logged in
  mkdirSync(SHOTS, { recursive: true })
  let failures = 0
  const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`) }
  const page = await launch({ profile: PROFILE, port: 9341, width, height: 900 })
  // The question box is made after load: wait for it to exist before answering.
  const answerQuestions = async () => {
    for (let i = 0; i < 4; i++) {
      const asked = await page.waitFor(() => { const box = document.getElementById('browseAsk'); return !!box && !box.hidden }, { timeout: 5000 }).catch(() => false)
      if (!asked) break
      await page.evaluate(() => document.getElementById('browseAskYes').click())
      await sleep(1200)
    }
  }
  const shot = (name) => page.screenshot(path.join(SHOTS, name + '.png')).catch(() => {})
  const finish = async (error) => {
    if (error) { failures++; console.log('FAIL ' + (error && error.message ? error.message : error)); await shot('error') }
    await page.close()
    console.log(failures ? `\n${failures} failure(s)` : '\nall passed')
    process.exit(failures ? 1 : 0)
  }
  try {
    await page.goto(address(resource))
    if (login) {
      await page.waitFor(`!!(${DEEP})('solid-ui-account')?.shadowRoot?.querySelector('solid-ui-login-button')`, { timeout: 40000 })
      await answerQuestions()
      await page.evaluate(`(${DEEP})('solid-ui-account').shadowRoot.querySelector('solid-ui-login-button solid-ui-button').shadowRoot.querySelector('button').click()`)
      await page.waitFor(`(() => { const m = (${DEEP})('solid-ui-login-modal'); return m && m.issuerInputValue })()`)
      await page.evaluate(`(() => { const m = (${DEEP})('solid-ui-login-modal'); const b = [...m.shadowRoot.querySelectorAll('solid-ui-dialog-footer solid-ui-button')][1]; b.shadowRoot.querySelector('button').click() })()`)
      await page.waitFor(() => location.pathname.startsWith('/idp/') && !!document.querySelector('#username'), { timeout: 30000 })
      await page.evaluate((who) => { const [user, password] = JSON.parse(who); document.querySelector('#username').value = user; document.querySelector('#password').value = password; document.querySelector('form[action$="/login"]').submit() }, JSON.stringify([config.user, config.password]))
      for (let step = 0; step < 4; step++) {
        const where = await page.waitFor(() => { if (!location.pathname.startsWith('/idp/')) return 'back'; if ([...document.querySelectorAll('button, a')].find(b => /skip for now/i.test(b.textContent))) return 'passkey'; if (document.querySelector('form[action$="/confirm"]')) return 'consent'; return false }, { timeout: 30000 })
        if (where === 'back') break
        if (where === 'passkey') await page.evaluate(() => [...document.querySelectorAll('button, a')].find(b => /skip for now/i.test(b.textContent)).click())
        if (where === 'consent') await page.evaluate(() => document.querySelector('form[action$="/confirm"]').submit())
        await sleep(1000)
      }
      await page.waitFor(`!!(${DEEP})('solid-ui-account')?.hasAttribute('data-state-loggedin')`, { timeout: 40000 })
      check('logged in', true)
      await answerQuestions()
    }
  } catch (error) { await finish(error) }

  return { page, check, finish, shot, address }
}
