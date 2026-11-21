// The sample poll, read without logging in: every option, the counts, the leader, names.
import { open, config, sleep } from './lib.mjs'
const SAMPLE = config.repo + 'samples/dinner/index.ttl#this'
for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ width, login: false, fresh: true, resource: SAMPLE })
  try {
    await page.waitFor(() => document.querySelectorAll('.pol-option').length === 5, { timeout: 40000 })
    await sleep(2000)
    const seen = await page.evaluate(() => ({ title: document.querySelector('.pol-title').textContent, meta: document.querySelector('.pol-meta').textContent, options: [...document.querySelectorAll('.pol-option')].map(o => o.querySelector('.pol-name').textContent + '|' + o.querySelector('.pol-count').textContent + '|' + (o.classList.contains('pol-lead') ? 'lead' : '') + '|' + o.querySelector('.pol-who').textContent), buttons: document.querySelectorAll('.pol-choose button').length, status: document.querySelector('.pol-status').textContent, wide: document.documentElement.scrollWidth > innerWidth }))
    check(width + ' px: title and people', seen.title === 'Team dinner in December' && /By Alice · 3 people have answered/.test(seen.meta), seen.meta)
    check(width + ' px: times first, in order, then the text options', /3/.test(seen.options[0]) && /4/.test(seen.options[1]) && /10/.test(seen.options[2]) && /^The Thai place/.test(seen.options[3]) && /^Pizza/.test(seen.options[4]), seen.options.map(o => o.split('|')[0]).join(' ; '))
    check(width + ' px: the evening everyone can make leads', /\|3 yes\|lead\|Alice, Bob, Carol$/.test(seen.options[1]) && seen.options.filter(o => /\|lead\|/.test(o)).length === 1, seen.options[1])
    check(width + ' px: if need be is counted apart', /\|1 yes · 1 if need be\|\|Alice, Carol \(if need be\)$/.test(seen.options[3]), seen.options[3])
    check(width + ' px: logged out, nothing to press, and it says so', seen.buttons === 0 && /Log in to answer/.test(seen.status), seen.buttons + ' ' + seen.status)
    check(width + ' px: no sideways scroll', !seen.wide)
    await shot('sample-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}
