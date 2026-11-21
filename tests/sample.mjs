// The sample, read without logging in: the hours under their days, the counts, the best hour, names.
import { open, config, sleep } from './lib.mjs'
const SAMPLE = config.repo + 'samples/call/index.ttl#this'
for (const width of [1300, 400]) {
  const { page, check, finish, shot, address } = await open({ width, login: false, fresh: true, resource: SAMPLE })
  try {
    await page.waitFor(() => document.querySelectorAll('.pol-option').length === 6, { timeout: 40000 })
    await sleep(2000)
    const seen = await page.evaluate(() => ({ title: document.querySelector('.pol-title').textContent, meta: document.querySelector('.pol-meta').textContent, days: [...document.querySelectorAll('.pol-day')].map(d => d.textContent), zone: document.querySelector('.pol-zone').textContent, options: [...document.querySelectorAll('.pol-option')].map(o => o.querySelector('.pol-name').textContent + '|' + o.querySelector('.pol-count').textContent + '|' + (o.classList.contains('pol-lead') ? 'lead' : '') + '|' + o.querySelector('.pol-who').textContent), buttons: document.querySelectorAll('.pol-choose button').length, status: document.querySelector('.pol-status').textContent, wide: document.documentElement.scrollWidth > innerWidth }))
    check(width + ' px: title and people', seen.title === 'Call about the tool index' && /By Alice · 3 people have answered/.test(seen.meta), seen.meta)
    check(width + ' px: two days of hours, then the other choice', seen.days.length === 3 && /3/.test(seen.days[0]) && /4/.test(seen.days[1]) && seen.days[2] === 'Also to decide' && seen.options.slice(0, 5).every(o => / to /.test(o.split('|')[0])) && /^Record the call/.test(seen.options[5]), seen.days.join(' / '))
    check(width + ' px: it names the time zone', /your time zone: \S+/.test(seen.zone), seen.zone)
    check(width + ' px: the hour everyone can make is the best so far', /\|3 yes\|lead\|Alice, Bob, Carol$/.test(seen.options[1]) && seen.options.filter(o => /\|lead\|/.test(o)).length === 1, seen.options[1])
    check(width + ' px: if need be is counted apart', /\|1 yes · 1 if need be\|\|Carol, Alice \(if need be\)$/.test(seen.options[3]), seen.options[3])
    check(width + ' px: logged out, nothing to press, and it says so', seen.buttons === 0 && /Log in to say when/.test(seen.status), seen.buttons + ' ' + seen.status)
    check(width + ' px: no sideways scroll', !seen.wide)
    await shot('sample-' + width)
  } catch (error) { await finish(error) }
  if (width === 400) await finish(); else await page.close()
}
