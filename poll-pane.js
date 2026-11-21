// poll-pane.js: a poll kept in a pod. Pick a time, or vote on options.
//
// One file, no imports. It reads and writes the format of SolidOS's own scheduling pane
// (http://www.w3.org/ns/pim/schedule#), so a poll made there opens here and the other way round:
//
//   index.ttl     <#this> a sched:SchedulableEvent ; cal:summary "Dinner" ; dc:author <WebID> ;
//                     sched:option <#o1>, <#o2> ; sched:results <results.ttl> .
//                 <#o1> cal:dtstart "2026-12-04T19:00:00"^^xsd:dateTime .     (a time)
//                 <#o2> rdfs:label "The Thai place" .                         (anything else)
//
//   results.ttl   <index.ttl#this> sched:response <#r1> .
//                 <#r1> dc:author <WebID> ; sched:cell <#r1-o1> .
//                 <#r1-o1> sched:option <index.ttl#o1> ; cal:dtstart "…" ; sched:availabilty sched:Yes .
//
// ("availabilty" is the spelling the vocabulary uses.) An answer is matched to its option by the
// sched:option link, or by the same cal:dtstart, which is all SolidOS's pane writes.
//
// What this pane writes, and when:
// - "New Poll" in a folder's Add menu: the two files above and an access rule for each, so that
//   anyone with the link can see the poll and anyone logged in can answer.
// - The person who made the poll: its title, notes and options, in index.ttl.
// - Anyone logged in, on pressing an answer: their own answer, in results.ttl.

const SCHED = 'http://www.w3.org/ns/pim/schedule#'
const CAL = 'http://www.w3.org/2002/12/cal/ical#'
const DC = 'http://purl.org/dc/elements/1.1/'
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const FOAF_NAME = 'http://xmlns.com/foaf/0.1/name'
const VCARD_FN = 'http://www.w3.org/2006/vcard/ns#fn'
const ACL = 'http://www.w3.org/ns/auth/acl#'
const ANSWERS = [['Yes', 'Yes'], ['Maybe', 'If need be'], ['No', 'No']]

const CSS = `
.pol.poll-pane { max-width: 760px; margin: 0 auto; padding: 20px 16px 40px; color: #1f2430; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; box-sizing: border-box; }
.pol * { box-sizing: border-box; }
.pol-title { margin: 0 0 4px; font-size: 26px; line-height: 1.2; letter-spacing: -.01em; overflow-wrap: anywhere; }
.pol-meta { margin: 0 0 4px; color: #5b6272; font-size: 14px; overflow-wrap: anywhere; }
.pol-notes { margin: 8px 0 0; color: #33405c; white-space: pre-wrap; overflow-wrap: anywhere; }
.pol-status { margin: 14px 0 0; padding: 9px 12px; border-radius: 10px; font-size: 14px; }
.pol-status:empty { display: none; }
.pol-good { background: #f3fbf6; border: 1px solid #b8e2c8; color: #17693a; }
.pol-bad { background: #fdf5f5; border: 1px solid #efc2c2; color: #a12727; }
.pol-info { background: #f3f1ff; border: 1px solid #d9d2fb; color: #4b3bd6; }
.pol-list { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 10px; }
.pol-option { background: #fff; border: 1px solid #e3e6ee; border-radius: 14px; padding: 14px 16px; }
.pol-option.pol-lead { border-color: #6d4aff; box-shadow: 0 0 0 1px #6d4aff; }
.pol-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.pol-name { font-weight: 680; font-size: 17px; overflow-wrap: anywhere; min-width: 0; }
.pol-tag { padding: 1px 9px; border-radius: 999px; font-size: 12px; font-weight: 650; background: #ede9fe; color: #5b21b6; }
.pol-count { margin-left: auto; font-size: 14px; color: #5b6272; white-space: nowrap; }
.pol-bar { height: 6px; margin: 10px 0 8px; border-radius: 999px; background: #eef1f6; overflow: hidden; display: flex; }
.pol-bar span { display: block; height: 100%; }
.pol-bar .pol-yes { background: #2fa866; }
.pol-bar .pol-maybe { background: #e5b53b; }
.pol-who { font-size: 14px; color: #5b6272; overflow-wrap: anywhere; }
.pol-who:empty { display: none; }
.pol-choose { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pol button { font: inherit; font-size: 14px; font-weight: 600; padding: 7px 14px; border-radius: 999px; border: 1px solid #cfd4e0; background: #fff; color: #33405c; cursor: pointer; }
.pol button:hover { background: #f3f1ff; }
.pol button:disabled { opacity: .55; cursor: default; }
.pol button.pol-on-Yes { background: #2fa866; border-color: #2fa866; color: #fff; }
.pol button.pol-on-Maybe { background: #e5b53b; border-color: #e5b53b; color: #3d2f00; }
.pol button.pol-on-No { background: #5b6272; border-color: #5b6272; color: #fff; }
.pol button.pol-primary { background: #6d4aff; border-color: #6d4aff; color: #fff; }
.pol button.pol-primary:hover { background: #5b3be0; }
.pol button.pol-quiet { border-color: transparent; color: #a12727; padding: 4px 8px; }
.pol-empty { padding: 18px; border: 1px dashed #cfd4e0; border-radius: 14px; color: #5b6272; text-align: center; }
.pol-box { margin-top: 22px; padding: 16px; background: #fafbfe; border: 1px solid #e3e6ee; border-radius: 14px; }
.pol-box h3 { margin: 0 0 4px; font-size: 16px; }
.pol-hint { margin: 0 0 12px; font-size: 14px; color: #5b6272; }
.pol-fields { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.pol-fields label { display: grid; gap: 4px; font-size: 13px; font-weight: 600; color: #33405c; flex: 1 1 200px; min-width: 0; }
.pol input, .pol textarea { font: inherit; font-size: 15px; width: 100%; padding: 8px 10px; border: 1px solid #cfd4e0; border-radius: 10px; background: #fff; color: #1f2430; }
.pol textarea { min-height: 64px; resize: vertical; }
.pol-foot { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 14px; color: #5b6272; }
.pol-link { flex: 1 1 260px; min-width: 0; }
`

function el (dom, tag, className, text) {
  const node = dom.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const rdflib = () => globalThis.$rdf || (globalThis.UI && globalThis.UI.rdf)

function currentUser (context) {
  const places = [
    context && context.session && context.session.logic && context.session.logic.authn,
    globalThis.SolidLogic && globalThis.SolidLogic.authn,
    globalThis.UI && globalThis.UI.authn
  ]
  for (const authn of places) {
    try { const me = authn && authn.currentUser && authn.currentUser(); if (me) return me } catch { /* try the next */ }
  }
  return null
}

const webFetch = (store) => (store.fetcher && store.fetcher._fetch) || fetch

function isPoll (store, subject) {
  const sym = store.sym.bind(store)
  return store.holds(subject, sym(RDF_TYPE), sym(SCHED + 'SchedulableEvent')) || !!store.any(subject, sym(SCHED + 'option'))
}

// A time as people read it, or the text of the option.
function optionLabel (store, option, doc) {
  const sym = store.sym.bind(store)
  const text = store.any(option, sym(RDFS_LABEL), null, doc)
  if (text) return text.value
  const when = store.any(option, sym(CAL + 'dtstart'), null, doc)
  if (!when) return option.value.split('#').pop()
  return timeLabel(when.value)
}

function timeLabel (value) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? value + 'T12:00:00' : value)
  if (isNaN(date)) return value
  const day = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return dateOnly ? day : day + ', ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function personName (store, person) {
  const sym = store.sym.bind(store)
  const name = store.any(person, sym(FOAF_NAME)) || store.any(person, sym(VCARD_FN))
  if (name) return name.value
  try { const url = new URL(person.value); return url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 && !/^\/(profile\/card(\.jsonld)?)?$/.test(url.pathname) ? url.pathname : '') } catch { return person.value }
}

// The poll as plain data: its options, and for each one who answered what.
function readPoll (store, subject, resultsDoc) {
  const sym = store.sym.bind(store)
  const doc = subject.doc()
  const options = store.each(subject, sym(SCHED + 'option'), null, doc).map(node => {
    const when = store.any(node, sym(CAL + 'dtstart'), null, doc)
    return { node, when: when ? when.value : '', label: optionLabel(store, node, doc), answers: [] }
  })
  options.sort((a, b) => (a.when && b.when) ? a.when.localeCompare(b.when) : (a.when ? -1 : b.when ? 1 : a.node.value.localeCompare(b.node.value, undefined, { numeric: true })))
  const byNode = new Map(options.map(o => [o.node.value, o]))
  const byTime = new Map(options.filter(o => o.when).map(o => [o.when, o]))
  const people = new Map()
  for (const response of store.each(subject, sym(SCHED + 'response'), null, resultsDoc)) {
    const author = store.any(response, sym(DC + 'author'), null, resultsDoc)
    if (!author) continue
    people.set(author.value, author)
    for (const cell of store.each(response, sym(SCHED + 'cell'), null, resultsDoc)) {
      const value = store.any(cell, sym(SCHED + 'availabilty'), null, resultsDoc)
      if (!value) continue
      const linked = store.any(cell, sym(SCHED + 'option'), null, resultsDoc)
      const when = store.any(cell, sym(CAL + 'dtstart'), null, resultsDoc)
      const option = (linked && byNode.get(linked.value)) || (when && byTime.get(when.value))
      if (!option) continue
      const answer = value.value.slice(SCHED.length)
      const earlier = option.answers.find(a => a.who.value === author.value)
      if (earlier) earlier.answer = answer; else option.answers.push({ who: author, answer, response, cell })
    }
  }
  return { options, people: [...people.values()] }
}

// Where a resource's access rule lives: the server says in a Link header; else beside it.
async function aclAddress (fetcher, address) {
  try {
    const response = await fetcher(address, { method: 'HEAD' })
    const link = (response.headers.get('link') || '').split(',').map(part => part.match(/<([^>]+)>\s*;\s*rel="?acl"?/)).find(Boolean)
    if (link) return new URL(link[1], address).href
  } catch { /* fall through */ }
  return address + '.acl'
}

// An access rule for one file: its maker has full control; `others` (an agent class) gets `modes`.
async function putAcl (fetcher, address, me, others, modes) {
  const target = await aclAddress(fetcher, address)
  const turtle = `@prefix acl: <${ACL}>.\n@prefix foaf: <http://xmlns.com/foaf/0.1/>.\n` +
    `<#owner> a acl:Authorization; acl:agent <${me}>; acl:accessTo <${address}>; acl:mode acl:Read, acl:Write, acl:Control.\n` +
    `<#others> a acl:Authorization; acl:agentClass ${others}; acl:accessTo <${address}>; acl:mode ${modes.map(m => 'acl:' + m).join(', ')}.\n`
  let response = await fetcher(target, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: turtle })
  if (response.status === 415) {
    const jsonld = JSON.stringify({
      '@context': { acl: ACL, foaf: 'http://xmlns.com/foaf/0.1/' },
      '@graph': [
        { '@id': '#owner', '@type': 'acl:Authorization', 'acl:agent': { '@id': me }, 'acl:accessTo': { '@id': address }, 'acl:mode': ['Read', 'Write', 'Control'].map(m => ({ '@id': 'acl:' + m })) },
        { '@id': '#others', '@type': 'acl:Authorization', 'acl:agentClass': { '@id': others }, 'acl:accessTo': { '@id': address }, 'acl:mode': modes.map(m => ({ '@id': 'acl:' + m })) }
      ]
    }, null, 2)
    response = await fetcher(target, { method: 'PUT', headers: { 'Content-Type': 'application/ld+json' }, body: jsonld })
  }
  if (!response.ok) throw new Error('the access rule for ' + address.split('/').pop() + ' was refused (' + response.status + ')')
}

const turtleText = (text) => '"' + String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'

const pane = {
  name: 'poll',
  icon: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 15v-3M12 15V8M17 15v-5"/></svg>'),
  audience: [],

  label (subject, context) {
    try { return isPoll(context.session.store, subject) ? 'Poll' : null } catch { return null }
  },

  shouldGetFocus (subject, context) {
    try { return isPoll((context && context.session && context.session.store) || (globalThis.SolidLogic && globalThis.SolidLogic.store) || (globalThis.UI && globalThis.UI.store), subject) } catch { return false }
  },

  // "New Poll" in a folder's Add menu.
  mintClass: { termType: 'NamedNode', value: SCHED + 'SchedulableEvent', uri: SCHED + 'SchedulableEvent' },

  async mintNew (context, options) {
    const store = context.session.store
    const fetcher = webFetch(store)
    const me = options.me || currentUser(context)
    if (!me) throw new Error('log in to make a poll')
    const base = options.newBase
    const index = base + 'index.ttl'
    const results = base + 'results.ttl'
    const title = options.title || 'Poll'
    const body = `@prefix sched: <${SCHED}>.\n@prefix cal: <${CAL}>.\n@prefix dc: <${DC}>.\n@prefix xsd: <${XSD}>.\n\n` +
      `<#this> a sched:SchedulableEvent;\n    cal:summary ${turtleText(title)};\n    dc:author <${me.value}>;\n    dc:created "${new Date().toISOString()}"^^xsd:dateTime;\n    sched:results <results.ttl>.\n`
    const put = async (address, text) => {
      const response = await fetcher(address, { method: 'PUT', headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' }, body: text })
      if (!response.ok) throw new Error(address.split('/').pop() + ' was not created (' + response.status + ')')
    }
    await put(index, body)
    await put(results, `@prefix sched: <${SCHED}>.\n`)
    await putAcl(fetcher, index, me.value, 'foaf:Agent', ['Read'])
    await putAcl(fetcher, results, me.value, 'acl:AuthenticatedAgent', ['Read', 'Write'])
    return { ...options, newInstance: store.sym(index + '#this') }
  },

  render (subject, context) {
    const dom = context.dom
    const store = context.session.store
    const sym = store.sym.bind(store)
    const doc = subject.doc()
    const root = el(dom, 'div', 'pol poll-pane')
    root.appendChild(el(dom, 'style', '', CSS))

    const title = root.appendChild(el(dom, 'h2', 'pol-title'))
    const meta = root.appendChild(el(dom, 'p', 'pol-meta'))
    const where = root.appendChild(el(dom, 'p', 'pol-meta'))
    const notes = root.appendChild(el(dom, 'p', 'pol-notes'))
    const status = root.appendChild(el(dom, 'div', 'pol-status'))
    status.setAttribute('role', 'status')
    const list = root.appendChild(el(dom, 'ul', 'pol-list'))
    const owner = root.appendChild(el(dom, 'div'))
    const foot = root.appendChild(el(dom, 'div', 'pol-foot'))

    const say = (text, kind) => { status.textContent = text || ''; status.className = 'pol-status' + (text ? ' pol-' + (kind || 'info') : '') }
    const linked = store.any(subject, sym(SCHED + 'results'), null, doc) || store.any(subject, sym(SCHED + 'resultsDocument'), null, doc)
    const resultsDoc = linked && linked.termType === 'NamedNode' && linked.value !== doc.value ? linked.doc() : sym(new URL('results.ttl', doc.value).href)
    let busy = false
    let resultsRead = false

    const me = () => currentUser(context)
    const mine = () => { const who = me(); const author = store.any(subject, sym(DC + 'author'), null, doc); return !!who && !!author && author.value === who.value }
    const literal = (value, datatype) => { const rdf = rdflib(); return datatype ? rdf.literal(value, sym(XSD + datatype)) : rdf.literal(value) }
    const st = (s, p, o, g) => rdflib().st(s, p, o, g)

    async function change (deletions, insertions, done) {
      if (busy) return
      busy = true
      for (const button of root.querySelectorAll('button')) button.disabled = true
      try {
        await store.updater.update(deletions, insertions)
        say(done, 'good')
      } catch (error) {
        say('Not saved: ' + (error && error.message ? error.message : error), 'bad')
      }
      busy = false
      draw()
    }

    async function answer (option, value) {
      const who = me()
      if (!who) return
      const poll = readPoll(store, subject, resultsDoc)
      const current = poll.options.find(o => o.node.value === option.node.value)
      const earlier = current && current.answers.find(a => a.who.value === who.value)
      const deletions = []
      const insertions = []
      let response = null
      for (const candidate of store.each(subject, sym(SCHED + 'response'), null, resultsDoc)) {
        if (store.holds(candidate, sym(DC + 'author'), who, resultsDoc)) response = candidate
      }
      if (!response) {
        response = sym(resultsDoc.value + '#r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))
        insertions.push(st(subject, sym(SCHED + 'response'), response, resultsDoc), st(response, sym(DC + 'author'), who, resultsDoc))
      }
      let cell = earlier && earlier.cell
      if (cell) {
        for (const old of store.statementsMatching(cell, sym(SCHED + 'availabilty'), null, resultsDoc)) deletions.push(old)
      } else {
        cell = sym(response.value + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5))
        insertions.push(st(response, sym(SCHED + 'cell'), cell, resultsDoc), st(cell, sym(SCHED + 'option'), option.node, resultsDoc))
        const when = store.any(option.node, sym(CAL + 'dtstart'), null, doc)
        if (when) insertions.push(st(cell, sym(CAL + 'dtstart'), when, resultsDoc))
      }
      if (earlier && earlier.answer === value) return change(deletions, [], 'Your answer for ' + option.label + ' was cleared.')
      insertions.push(st(cell, sym(SCHED + 'availabilty'), sym(SCHED + value), resultsDoc))
      await change(deletions, insertions, 'Saved: ' + ANSWERS.find(a => a[0] === value)[1] + ' for ' + option.label + '.')
    }

    function ownerTools () {
      owner.replaceChildren()
      if (!mine()) return
      const add = owner.appendChild(el(dom, 'form', 'pol-box pol-add'))
      add.appendChild(el(dom, 'h3', '', 'Add an option'))
      add.appendChild(el(dom, 'p', 'pol-hint', 'A date and time, or anything else to vote on. Fill in one of the two.'))
      const fields = add.appendChild(el(dom, 'div', 'pol-fields'))
      const whenLabel = fields.appendChild(el(dom, 'label', '', 'Date and time'))
      const when = whenLabel.appendChild(el(dom, 'input'))
      when.type = 'datetime-local'
      const textLabel = fields.appendChild(el(dom, 'label', '', 'Or some text'))
      const text = textLabel.appendChild(el(dom, 'input'))
      text.type = 'text'
      text.maxLength = 120
      text.placeholder = 'The Thai place'
      const addButton = fields.appendChild(el(dom, 'button', 'pol-primary', 'Add'))
      addButton.type = 'submit'
      add.addEventListener('submit', (event) => {
        event.preventDefault()
        const label = text.value.trim()
        if (!when.value && !label) { say('Give a date and time, or some text.', 'bad'); return }
        const taken = new Set(store.each(subject, sym(SCHED + 'option'), null, doc).map(o => o.value))
        let n = taken.size + 1
        while (taken.has(doc.value + '#o' + n)) n++
        const option = sym(doc.value + '#o' + n)
        const insertions = [st(subject, sym(SCHED + 'option'), option, doc)]
        if (when.value) insertions.push(st(option, sym(CAL + 'dtstart'), literal(when.value.length === 16 ? when.value + ':00' : when.value, 'dateTime'), doc))
        if (label) insertions.push(st(option, sym(RDFS_LABEL), literal(label), doc))
        change([], insertions, 'Option added.')
      })

      const edit = owner.appendChild(el(dom, 'form', 'pol-box pol-edit'))
      edit.appendChild(el(dom, 'h3', '', 'About this poll'))
      const editFields = edit.appendChild(el(dom, 'div', 'pol-fields'))
      const field = (labelText, term, multi) => {
        const label = editFields.appendChild(el(dom, 'label', '', labelText))
        const input = label.appendChild(el(dom, multi ? 'textarea' : 'input'))
        if (!multi) input.type = 'text'
        input.maxLength = multi ? 1000 : 160
        const now = store.any(subject, sym(CAL + term), null, doc)
        input.value = now ? now.value : ''
        return { term, input }
      }
      const inputs = [field('Title', 'summary'), field('Where', 'location'), field('Notes', 'comment', true)]
      const saveButton = editFields.appendChild(el(dom, 'button', 'pol-primary', 'Save'))
      saveButton.type = 'submit'
      edit.addEventListener('submit', (event) => {
        event.preventDefault()
        const deletions = []
        const insertions = []
        for (const { term, input } of inputs) {
          const old = store.statementsMatching(subject, sym(CAL + term), null, doc)
          const value = input.value.trim()
          if (old.length === 1 && old[0].object.value === value) continue
          deletions.push(...old)
          if (value) insertions.push(st(subject, sym(CAL + term), literal(value), doc))
        }
        if (!deletions.length && !insertions.length) { say('Nothing to save.'); return }
        change(deletions, insertions, 'Saved.')
      })
    }

    function draw () {
      const poll = readPoll(store, subject, resultsDoc)
      const who = me()
      const text = (term) => { const value = store.any(subject, sym(CAL + term), null, doc); return value ? value.value : '' }
      title.textContent = text('summary') || 'Poll'
      const author = store.any(subject, sym(DC + 'author'), null, doc)
      const count = poll.people.length
      meta.textContent = (author ? 'By ' + personName(store, author) + ' · ' : '') + (count === 1 ? '1 person has answered' : count + ' people have answered')
      where.textContent = text('location')
      where.hidden = !where.textContent
      notes.textContent = text('comment')
      notes.hidden = !notes.textContent

      list.replaceChildren()
      const score = (option) => option.answers.filter(a => a.answer === 'Yes').length * 2 + option.answers.filter(a => a.answer === 'Maybe').length
      const best = Math.max(0, ...poll.options.map(score))
      for (const option of poll.options) {
        const yes = option.answers.filter(a => a.answer === 'Yes')
        const maybe = option.answers.filter(a => a.answer === 'Maybe')
        const item = list.appendChild(el(dom, 'li', 'pol-option' + (best > 0 && score(option) === best ? ' pol-lead' : '')))
        item.dataset.option = option.node.value
        const head = item.appendChild(el(dom, 'div', 'pol-head'))
        head.appendChild(el(dom, 'span', 'pol-name', option.label))
        if (best > 0 && score(option) === best) head.appendChild(el(dom, 'span', 'pol-tag', 'Leading'))
        head.appendChild(el(dom, 'span', 'pol-count', yes.length + ' yes' + (maybe.length ? ' · ' + maybe.length + ' if need be' : '')))
        const bar = item.appendChild(el(dom, 'div', 'pol-bar'))
        const total = Math.max(count, 1)
        bar.appendChild(el(dom, 'span', 'pol-yes')).style.width = (100 * yes.length / total) + '%'
        bar.appendChild(el(dom, 'span', 'pol-maybe')).style.width = (100 * maybe.length / total) + '%'
        const names = [...yes.map(a => personName(store, a.who)), ...maybe.map(a => personName(store, a.who) + ' (if need be)')]
        item.appendChild(el(dom, 'div', 'pol-who', names.join(', ')))
        if (who && resultsRead) {
          const own = option.answers.find(a => a.who.value === who.value)
          const choose = item.appendChild(el(dom, 'div', 'pol-choose'))
          for (const [value, label] of ANSWERS) {
            const button = choose.appendChild(el(dom, 'button', own && own.answer === value ? 'pol-on-' + value : '', label))
            button.type = 'button'
            button.dataset.answer = value
            button.setAttribute('aria-pressed', own && own.answer === value ? 'true' : 'false')
            button.addEventListener('click', () => answer(option, value))
          }
          if (mine()) {
            const remove = choose.appendChild(el(dom, 'button', 'pol-quiet', 'Remove option'))
            remove.type = 'button'
            let armed = false
            remove.addEventListener('click', () => {
              if (!armed) { armed = true; remove.textContent = 'Press again to remove'; return }
              change([...store.statementsMatching(subject, sym(SCHED + 'option'), option.node, doc), ...store.statementsMatching(option.node, null, null, doc)], [], option.label + ' was removed.')
            })
          }
        }
      }
      if (!poll.options.length) list.appendChild(el(dom, 'li', 'pol-empty', mine() ? 'No options yet. Add the first one below.' : 'This poll has no options yet.'))
      if (!who && !status.textContent) say('Log in to answer.')
      ownerTools()

      foot.replaceChildren()
      const link = foot.appendChild(el(dom, 'input', 'pol-link'))
      link.type = 'text'
      link.readOnly = true
      link.value = subject.value
      link.setAttribute('aria-label', 'The address of this poll, to send to people')
      link.addEventListener('focus', () => link.select())
      const again = foot.appendChild(el(dom, 'button', '', 'Refresh'))
      again.type = 'button'
      again.addEventListener('click', () => load(true))
    }

    async function load (force) {
      try {
        await store.fetcher.load(resultsDoc, force ? { force: true } : undefined)
        resultsRead = true
      } catch (error) {
        resultsRead = false
        const code = error && error.status
        say(code === 404 ? 'This poll has no answers file yet.' : code === 401 || code === 403 ? 'You are not allowed to see the answers.' : 'The answers could not be read.', 'bad')
      }
      draw()
      // People's names come from their profiles: fetched in the background, shown when they arrive.
      const poll = readPoll(store, subject, resultsDoc)
      const author = store.any(subject, sym(DC + 'author'), null, doc)
      const unnamed = [...poll.people, ...(author ? [author] : [])].filter(p => p.termType === 'NamedNode' && !store.any(p, sym(FOAF_NAME)) && !store.any(p, sym(VCARD_FN)))
      if (unnamed.length) Promise.allSettled(unnamed.slice(0, 30).map(p => store.fetcher.load(p.doc()))).then(() => { if (!busy) draw() })
    }

    draw()
    load(false)
    return root
  }
}

export default pane
