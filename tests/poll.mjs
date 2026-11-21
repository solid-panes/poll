// The poll pane on a local test pod: make a poll, add options, answer, change, clear, edit, reload.
//   node tests/poll.mjs        logs in and runs everything at 1300 px, then removes the poll
//   POLL=name node tests/poll.mjs 400   reuses that login and a kept poll; checks the layout at 400 px
import { open, config, POD, sleep } from './lib.mjs'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
const width = +(process.argv[2] || 1300)
const NAME = process.env.POLL || 'poll-test-' + Date.now().toString(36)
const BASE = POD + 'public/' + NAME + '/'
const DIR = path.join(config.podDir, 'public', NAME)
const { page, check, finish, shot, address: at } = await open({ width, login: width === 1300 })
const disk = (f) => readFileSync(path.join(DIR, f), 'utf8')
const settled = () => page.waitFor(() => /pol-(good|bad)/.test(document.querySelector('.pol-status').className) && !document.querySelector('.pol button:disabled'), { timeout: 30000 })
const status = () => page.evaluate(() => document.querySelector('.pol-status').className + ' :: ' + document.querySelector('.pol-status').textContent)
try {
  if (width === 1300) {
    await page.goto(at(POD + 'public/'))
    await page.waitFor(() => !!(window.panes && window.panes.byName('poll')), { timeout: 40000 })
    check('the pane is registered', true)
    check('it is among the panes a folder can make new things with', await page.evaluate(() => window.panes.list.filter(p => p.mintNew).some(p => p.name === 'poll')))
    await page.evaluate((base) => { window.__mint = null; const store = (window.UI && window.UI.store) || window.SolidLogic.store; window.panes.byName('poll').mintNew({ dom: document, session: { store } }, { newBase: base, title: 'Dinner in December' }).then(r => { window.__mint = { ok: r.newInstance.value } }, e => { window.__mint = { error: String(e && e.message ? e.message : e) } }) }, BASE)
    await page.waitFor(() => !!window.__mint, { timeout: 30000 })
    const made = await page.evaluate(() => window.__mint)
    check('a new poll is created', made.ok === BASE + 'index.ttl#this', JSON.stringify(made))
    check('both files and both access rules are on the pod', ['index.ttl', 'results.ttl', 'index.ttl.acl', 'results.ttl.acl'].every(f => existsSync(path.join(DIR, f))), existsSync(DIR) ? (await import('node:fs')).readdirSync(DIR).join(' ') : 'no folder')
    const seen = async (f) => (await fetch(BASE + f)).status
    check('without login: the poll can be read', await seen('index.ttl') === 200, String(await seen('index.ttl')))
    check('without login: the answers cannot', [401, 403].includes(await seen('results.ttl')), String(await seen('results.ttl')))
  }
  await page.goto(at(BASE + 'index.ttl#this'))
  const shown = await page.waitFor(() => !!document.querySelector('.pol.poll-pane .pol-title'), { timeout: 40000 }).catch(() => false)
  check('the poll opens in the pane', !!shown)
  await sleep(2500)
  check('it shows its title', (await page.evaluate(() => document.querySelector('.pol-title').textContent)) === 'Dinner in December')
  check('its maker gets the tools to edit it', await page.evaluate(() => !!document.querySelector('.pol-add') && !!document.querySelector('.pol-edit')))
  if (width === 1300) {
    const addText = (t) => page.evaluate((v) => { const f = document.querySelector('.pol-add'); f.querySelector('input[type=text]').value = v; f.requestSubmit() }, t)
    await addText('The Thai place'); await settled()
    check('add a text option: saved', /pol-good/.test(await status()), (await status()).slice(0, 80))
    await page.evaluate(() => { const f = document.querySelector('.pol-add'); f.querySelector('input[type=datetime-local]').value = '2026-12-04T19:00'; f.requestSubmit() }); await settled()
    check('add a time option: saved', /pol-good/.test(await status()), (await status()).slice(0, 80))
    const d = disk('index.ttl')
    check('the pod file has both options', /Thai place/.test(d) && /2026-12-04T19:00:00/.test(d))
    const names = () => page.evaluate(() => [...document.querySelectorAll('.pol-option')].map(o => o.querySelector('.pol-name').textContent + '|' + o.querySelector('.pol-count').textContent + '|' + (o.classList.contains('pol-lead') ? 'lead' : '') + '|' + ([...o.querySelectorAll('.pol-choose button[aria-pressed=true]')].map(b => b.dataset.answer).join(''))))
    console.log('     ' + (await names()).join(' ; '))
    check('the time comes first and reads as a date', /^\w{3},? /.test((await names())[0]) && /Thai/.test((await names())[1]), (await names()).join(' ; '))
    const press = (i, a) => page.evaluate((v) => { const [n, ans] = v.split('|'); document.querySelectorAll('.pol-option')[+n].querySelector(`button[data-answer=${ans}]`).click() }, i + '|' + a)
    await press(1, 'Yes'); await settled()
    check('answer yes: saved', /pol-good/.test(await status()), (await status()).slice(0, 80))
    check('answer yes: in the answers file', /Yes/.test(disk('results.ttl')) && /availabilty/.test(disk('results.ttl')))
    check('answer yes: counted and leading', /Thai place\|1 yes\|lead\|Yes/.test((await names())[1]), (await names())[1])
    await press(1, 'Maybe'); await settled()
    check('change to if need be', /\|0 yes · 1 if need be\|lead\|Maybe/.test((await names())[1]) && !/schedule#Yes|sched:Yes/.test(disk('results.ttl')), (await names())[1])
    await press(0, 'Yes'); await settled()
    check('a yes on the other option takes the lead', /\|1 yes\|lead\|Yes/.test((await names())[0]) && !/lead/.test((await names())[1]), (await names()).join(' ; '))
    await press(1, 'Maybe'); await settled()
    check('pressing the same answer again clears it', /\|0 yes\|\|$/.test((await names())[1]), (await names())[1])
    await page.evaluate(() => { const f = document.querySelector('.pol-edit'); f.querySelectorAll('input')[1].value = 'Prague 2'; f.querySelector('textarea').value = 'Bring an appetite.'; f.requestSubmit() }); await settled()
    check('edit where and notes: saved and shown', /Prague 2/.test(disk('index.ttl')) && (await page.evaluate(() => document.querySelector('.pol-notes').textContent)) === 'Bring an appetite.')
    await page.goto(at(BASE + 'index.ttl#this'))
    await page.waitFor(() => document.querySelectorAll('.pol-option').length === 2, { timeout: 40000 })
    await sleep(2500)
    check('after a reload it reads back the same', /\|1 yes\|lead\|Yes/.test((await names())[0]), (await names()).join(' ; '))
    check('the maker is shown by name', await page.evaluate(() => document.querySelector('.pol-meta').textContent))
    console.log('     ' + await page.evaluate(() => document.querySelector('.pol-meta').textContent))
  }
  check('no sideways scroll at ' + width + ' px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await shot('poll-' + width)
  if (process.env.KEEP) console.log('kept: POLL=' + NAME); else rmSync(DIR, { recursive: true, force: true })
  await finish()
} catch (error) { await finish(error) }
