# poll

A dynamic SolidOS pane that finds a time for a call or a meeting. The poll is kept in a pod.

Loads at runtime by link, with no build or release.

**Try it:** [open a sample poll](https://solidos.org/docs/browser/?pane=https%3A%2F%2Fsolid-panes.github.io%2Fpoll%2Fpoll-pane.js&uri=https%3A%2F%2Fsolid-panes.github.io%2Fpoll%2Fsamples%2Fcall%2Findex.ttl%23this)

The data browser asks before it adds a pane from a site it has not seen. Allow it, and the poll opens. The sample is read-only; answers are saved only on a pod.

## What it does

- The person arranging it picks a day and a range of hours. Each hour becomes one choice.
- Every hour is an exact moment. Each person sees it in their own time zone, and the pane says which zone that is.
- Each person answers **Yes**, **If need be** or **No** for each hour. Pressing the same answer again clears it.
- Each hour shows its count, a bar, and who can make it. The best hour so far is outlined.
- Other things can be decided in the same poll: add a choice that is not a time.
- With the pane loaded, a folder's Add menu has **New Poll**. Its maker can add and remove times and edit what it is for, where, and notes.
- One column on a phone; no sideways scrolling at 400 px.

## What it writes

A pane runs as the person using it, so this is the whole list:

| When | What |
|---|---|
| **New Poll** | `index.ttl` and `results.ttl` in a new folder, and an access rule for each |
| The maker edits the poll | the title, place, notes and options in `index.ttl` |
| Someone presses an answer | their own answer in `results.ttl` |

A new poll can be read by anyone who has its address, and its answers file can be read and written by anyone who is logged in. That is what lets the people you invite answer, and it is what SolidOS's own pane does. It also means a logged-in person could change another person's answer: use it among people you trust.

## The data

The format is the one SolidOS's scheduling pane uses (`http://www.w3.org/ns/pim/schedule#`), so a poll made there opens here.

```turtle
# index.ttl
<#this> a sched:SchedulableEvent ; cal:summary "Call" ; dc:author <WebID> ;
    sched:option <#o1>, <#o2> ; sched:results <results.ttl> .
<#o1> cal:dtstart "2026-12-04T14:00:00Z"^^xsd:dateTime ; cal:dtend "2026-12-04T15:00:00Z"^^xsd:dateTime .
<#o2> rdfs:label "Record the call" .

# results.ttl
<index.ttl#this> sched:response <#r1> .
<#r1> dc:author <WebID> ; sched:cell <#r1-a> .
<#r1-a> sched:option <index.ttl#o1> ; sched:availabilty sched:Yes .
```

`availabilty` is the vocabulary's own spelling. Three things are added to what SolidOS writes: an hour has an end (`cal:dtend`) and is written as an exact moment in UTC; an option may have a text label in place of a time; and an answer links to its option with `sched:option`. Answers that only repeat the option's `cal:dtstart`, as SolidOS's pane writes them, are read too.

## Load it

```js
panes.register((await import('https://solid-panes.github.io/poll/poll-pane.js')).default)
```

or `jss start ... --panes https://solid-panes.github.io/poll/poll-pane.js`, or add it to your tool index from the [store](https://solid-panes.github.io/store/).

## Not yet

- Closing a poll, or fixing the chosen option.
- Limiting who may answer to a list of people.

## Licence

[MIT](LICENSE), copyright Melvin Carvalho. Written from the data format of the SolidOS [scheduling pane](https://github.com/SolidOS/solid-panes) (MIT); no code is shared.

## Tests

```sh
node tests/run.mjs
```

They drive a real browser (Chromium) against a local test pod: make a poll, add options, answer, change, clear, edit,
reload, then read the sample logged out at 1300 and 400 px. They need a local
[JavaScript Solid Server](https://github.com/JavaScriptSolidServer/JavaScriptSolidServer) pod that serves the data
browser ([mashlib/dynamic](https://github.com/mashlib/dynamic)) and this folder from its public folder, and
`tests/local.json`, copied from `tests/local.example.json` and filled in. It is not committed.
