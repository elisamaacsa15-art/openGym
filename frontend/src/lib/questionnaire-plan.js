// Fork: the personal questionnaire's plan builder. Pure, no React, no store: answers in, a plan out.
//
// The answers (views/Questionnaire.jsx) are the person's goal, the muscles to prioritise and the
// ones not to grow much, the weekdays they train, the minutes a session may take and the
// exercises they don't want. The plan is built from a weekly volume per muscle rather than a
// fixed template:
//
//   1. The weekdays pick a split (full body for up to three days, upper/lower for four, push /
//      pull / legs from five) and each session gets movement slots in order of importance.
//   2. Every slot is filled from a hand-picked pool of catalogue exercises (POOL): never a
//      disliked one, never one that mostly trains a muscle the person does not want to grow,
//      never one the active equipment profile cannot do, and the least used one this week so
//      two days of the same kind differ.
//   3. The minutes become a set budget per session; the sets go first to the muscles furthest
//      below their weekly target (more for the prioritised ones, none on purpose for the avoided
//      ones), counted with the app's own effective-set model (lib/muscles.js musclesOf), so the
//      plan and the Stats screen agree on what a week holds.
//
// The output's `sessions` are what the review screen shows and edits; `routinesOf` turns them
// into the starter-plan shape (lib/starter.js) that the plan loader already knows.
import { EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'
import { eqAvailable } from './equipment.js'

export const GOALS = ['muscle', 'fatloss', 'strength', 'health']

// The muscle groups a person picks on the map, as the map's own slugs (lib/muscles.js MUSCLES).
export const GROUPS = {
  chest: ['chest'],
  back: ['lats', 'upper-back'],
  shoulders: ['front-delts', 'side-delts', 'rear-delts'],
  traps: ['trapezius'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  abs: ['abs', 'obliques'],
  glutes: ['gluteal'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  calves: ['calves'],
}
export const GROUP_IDS = Object.keys(GROUPS)
/** The group a tapped map muscle belongs to, or null for one the questionnaire does not offer. */
export const groupOfSlug = slug => GROUP_IDS.find(g => GROUPS[g].includes(slug)) || null

// Movement slots and the catalogue exercises that fill them, best first. Plain gym classics on
// purpose: free weights, the common machines and cables, and a body-weight fallback per slot.
export const POOL = {
  squat: ['0043', '0739', '0743', '0770', '1760', '1197'],
  hinge: ['0085', '1459', '0032', '1206'],
  lunge: ['2290', '0336', '0431', '0781'],
  quadiso: ['0585'],
  ham: ['0586', '0599', '0582'],
  glute: ['1060', '4742', '3110', '2471'],
  gluteiso: ['0597', '5120'],
  calf: ['0605', '0594', '1372'],
  hpush: ['0025', '0289', '0576', '0748', '0662'],
  incline: ['0047', '0314', '1299', '0757'],
  chestiso: ['0596', '0227', '0308', '0155'],
  vpush: ['0405', '0603', '0091', '0426'],
  lateral: ['0334', '0178', '0584'],
  reardelt: ['0602', '2487', '0203'],
  vpull: ['2330', '0198', '0652', '0017'],
  hpull: ['0861', '1350', '0293', '0027', '1323'],
  biceps: ['0031', '0868', '0313', '0285', '0447'],
  triceps: ['0200', '0241', '0194', '0060', '0333'],
  traps: ['0406', '0095'],
  core: ['0175', '0463', '0472', '0274', '0276'],
}
// Every exercise the questionnaire may put in a plan, for the "exercises you don't like" list.
export const POOL_IDS = [...new Set(Object.values(POOL).flat())]

// When a slot has nothing left (all disliked, avoided or out of the equipment), the next best.
const FALLBACK = { gluteiso: 'glute', quadiso: 'squat', squat: 'lunge', lunge: 'glute', glute: 'hinge', ham: 'hinge', incline: 'hpush', chestiso: 'hpush', vpush: 'lateral', lateral: 'reardelt', reardelt: 'hpull', vpull: 'hpull', hpull: 'vpull' }
const COMPOUND = new Set(['squat', 'hinge', 'lunge', 'hpush', 'incline', 'vpush', 'vpull', 'hpull'])
// Which group a slot exists for, so a slot for an avoided muscle is left out instead of filled.
const SLOT_GROUP = { quadiso: 'quads', ham: 'hamstrings', glute: 'glutes', gluteiso: 'glutes', calf: 'calves', chestiso: 'chest', lateral: 'shoulders', reardelt: 'shoulders', biceps: 'biceps', triceps: 'triceps', traps: 'traps', core: 'abs' }

// Session kinds: slots in training order with an importance (1 = most). The importance decides
// what goes when the minutes are short; the order is how the session runs.
export const KINDS = {
  full: [['squat', 1], ['hpush', 1], ['vpull', 1], ['hinge', 2], ['lateral', 3], ['core', 3], ['biceps', 4], ['triceps', 4], ['calf', 5]],
  full2: [['hinge', 1], ['vpush', 1], ['hpull', 1], ['lunge', 2], ['incline', 3], ['core', 3], ['ham', 4], ['glute', 4], ['calf', 5]],
  full3: [['squat', 1], ['incline', 1], ['hpull', 1], ['glute', 2], ['lateral', 3], ['triceps', 3], ['biceps', 4], ['core', 4]],
  upper: [['hpush', 1], ['vpull', 1], ['hpull', 2], ['vpush', 2], ['chestiso', 3], ['lateral', 3], ['biceps', 4], ['triceps', 4]],
  upper2: [['vpush', 1], ['hpull', 1], ['incline', 2], ['vpull', 2], ['lateral', 3], ['reardelt', 3], ['triceps', 4], ['biceps', 4]],
  lower: [['squat', 1], ['hinge', 1], ['quadiso', 2], ['ham', 2], ['glute', 3], ['calf', 3], ['core', 4]],
  lower2: [['hinge', 1], ['lunge', 1], ['squat', 2], ['glute', 2], ['ham', 3], ['calf', 3], ['core', 4]],
  push: [['hpush', 1], ['incline', 1], ['vpush', 2], ['lateral', 2], ['chestiso', 3], ['triceps', 3]],
  pull: [['vpull', 1], ['hpull', 1], ['hpull', 2], ['reardelt', 2], ['biceps', 3], ['core', 4]],
  legs: [['squat', 1], ['hinge', 1], ['lunge', 2], ['quadiso', 2], ['ham', 3], ['glute', 3], ['calf', 4]],
}
// Which kind a session is for display ("Upper", "Legs"…), whatever its variant.
export const kindLabel = kind => kind.replace(/\d+$/, '')
// The slots a prioritised muscle may add, by session kind, in order: the first one the session does
// not have yet, so a priority brings a second kind of exercise (an abduction beside the hip
// thrust) rather than the same lift twice.
const PRIORITY_SLOT = {
  chest: { full: ['chestiso', 'incline'], upper: ['chestiso', 'incline'], push: ['chestiso'] },
  back: { full: ['hpull', 'vpull'], upper: ['hpull', 'vpull'], pull: ['vpull'] },
  shoulders: { full: ['lateral', 'reardelt'], upper: ['lateral', 'reardelt'], push: ['lateral'], pull: ['reardelt'] },
  traps: { full: ['traps'], upper: ['traps'], pull: ['traps'] },
  biceps: { full: ['biceps'], upper: ['biceps'], pull: ['biceps'] },
  triceps: { full: ['triceps'], upper: ['triceps'], push: ['triceps'] },
  abs: { full: ['core'], upper: ['core'], lower: ['core'], push: ['core'], pull: ['core'], legs: ['core'] },
  glutes: { full: ['glute', 'gluteiso'], lower: ['gluteiso', 'glute'], legs: ['gluteiso', 'glute'] },
  quads: { full: ['quadiso', 'lunge'], lower: ['quadiso', 'lunge'], legs: ['quadiso'] },
  hamstrings: { full: ['ham', 'hinge'], lower: ['ham'], legs: ['ham'] },
  calves: { full: ['calf'], lower: ['calf'], legs: ['calf'] },
}

/** The sessions for a number of training days, in the order they run. */
export function splitFor(n) {
  if (n <= 1) return ['full']
  if (n === 2) return ['full', 'full2']
  if (n === 3) return ['full', 'full2', 'full3']
  if (n === 4) return ['upper', 'lower', 'upper2', 'lower2']
  if (n === 5) return ['push', 'pull', 'legs', 'upper2', 'lower2']
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs']
}

// Weekly effective sets a group aims for, by goal; a prioritised group gets half again.
export const WEEKLY_TARGET = { muscle: 12, strength: 9, fatloss: 10, health: 8 }
export const PRIORITY_BOOST = 1.5
export const MAX_SETS = 5
// Reps per set by goal: [compound, isolation]. A hold (the plank) is seconds instead.
export const REPS = { muscle: [8, 12], strength: [5, 10], fatloss: [12, 15], health: [10, 12] }
const HOLD_SEC = 40

/** Working sets a session of `minutes` has room for: about 2.6 minutes a set with its rest, after a warm-up. */
export const setBudget = minutes => Math.max(6, Math.min(28, Math.floor((Math.max(20, +minutes || 60) - 7) / 2.6)))

const isHold = id => !!EXIDX[id]?.hold || id === '0463'
// A group's share of one set of an exercise: its strongest head (a shoulder exercise counts for
// "shoulders" by its front, side or rear head, whichever it works most).
const groupWeight = (weights, g) => Math.max(0, ...GROUPS[g].map(s => weights[s] || 0))
const weightsOf = id => (EXIDX[id] ? musclesOf(EXIDX[id]) : {})
/** The group an exercise trains most, or null. */
export const mainGroup = id => {
  const w = weightsOf(id)
  let best = null, bw = 0
  for (const g of GROUP_IDS) { const v = groupWeight(w, g); if (v > bw) { best = g; bw = v } }
  return best
}

/** Normalised answers: the defaults fill what was skipped, so every caller reads one shape. */
export function normalizeAnswers(a = {}) {
  const days = [...new Set((a.days || []).map(Number).filter(d => d >= 0 && d <= 6))]
  return {
    goal: GOALS.includes(a.goal) ? a.goal : 'muscle',
    priority: (a.priority || []).filter(g => GROUPS[g]).slice(0, 3),
    avoid: (a.avoid || []).filter(g => GROUPS[g] && !(a.priority || []).includes(g)),
    days: (days.length ? days : [1, 3, 5]).sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)),
    minutes: Math.max(20, Math.min(120, +a.minutes || 60)),
    dislikes: new Set(a.dislikes || []),
    age: +a.age || null,
  }
}

// Whether an exercise may fill a slot for this person.
function allowed(id, ans, equipment, machines) {
  const ex = EXIDX[id]
  if (!ex || ans.dislikes.has(id)) return false
  if (equipment && !eqAvailable(equipment, ex, machines)) return false
  const w = weightsOf(id)
  // Mostly an avoided muscle: a hip thrust for someone who does not want bigger glutes.
  return !ans.avoid.some(g => groupWeight(w, g) >= 0.75)
}

/** Candidates for a slot, best first, following the fallbacks when the slot itself has none. */
export function candidatesFor(pattern, ans, { equipment, machines, exclude = new Set() } = {}) {
  const seen = new Set()
  for (let p = pattern, hops = 0; p && hops < 4; p = FALLBACK[p], hops++) {
    if (seen.has(p)) break
    seen.add(p)
    const list = (POOL[p] || []).filter(id => !exclude.has(id) && allowed(id, ans, equipment, machines))
    if (list.length) return { pattern: p, ids: list }
  }
  return { pattern, ids: [] }
}

const repsFor = (pattern, ans) => {
  const [comp, iso] = REPS[ans.goal]
  let r = COMPOUND.has(pattern) ? comp : iso
  // Hip hinges lose their form first when tired: never past ten reps, whatever the goal.
  if (pattern === 'hinge') r = Math.min(r, 10)
  if (ans.age >= 60 && r < 8) r = 8
  return r
}

/**
 * The plan for a set of answers. `equipment`/`machines` (an equipment profile, lib/equipment.js)
 * keep every exercise to what that gym has.
 * Returns { sessions: [{ key, kind, day, exercises: [{ id, pattern, sets, reps | sec, priority }] }],
 *           weekly: { group: effective sets }, targets: { group: sets }, budget, answers }.
 */
export function buildPlan(answers, { equipment, machines } = {}) {
  const ans = normalizeAnswers(answers)
  const kinds = splitFor(ans.days.length)
  const budget = setBudget(ans.minutes)
  const used = {}
  const sessions = kinds.map((kind, i) => {
    const base = kindLabel(kind)
    const slots = KINDS[kind].map(([pattern, imp], order) => ({ pattern, imp, order }))
      // A slot that exists only for an avoided muscle (leg extensions for someone keeping their
      // quads as they are) is not part of this plan at all.
      .filter(s => !ans.avoid.includes(SLOT_GROUP[s.pattern]))
    // A prioritised muscle gets its own slot early in the sessions that train it.
    for (const g of ans.priority) {
      const options = PRIORITY_SLOT[g]?.[base] || []
      // Every kind already here: no repeat; the higher weekly target gives it more sets instead.
      const p = options.find(x => !slots.some(s => s.pattern === x))
      if (p) slots.push({ pattern: p, imp: 1.5, order: (slots.find(s => s.pattern === p)?.order ?? 50) + 0.5, priority: g })
    }
    slots.sort((x, y) => x.imp - y.imp || x.order - y.order)
    const taken = new Set(), chosen = []
    // Room for one exercise per 2 sets of the budget at most, three exercises at least.
    const maxEx = Math.max(3, Math.floor(budget / 2.5))
    for (const s of slots) {
      if (chosen.length >= maxEx) break
      const { pattern, ids } = candidatesFor(s.pattern, ans, { equipment, machines, exclude: taken })
      if (!ids.length) continue
      // Least used so far this week; the pool's order breaks a tie, so the classic comes first.
      const id = ids.reduce((best, x) => (used[x] || 0) < (used[best] || 0) ? x : best, ids[0])
      taken.add(id); used[id] = (used[id] || 0) + 1
      chosen.push({ id, pattern, order: s.order, priority: s.priority || null, sets: COMPOUND.has(pattern) ? 3 : 2 })
    }
    chosen.sort((x, y) => x.order - y.order)
    return { key: `q${i + 1}`, kind, day: ans.days[i], exercises: chosen }
  })

  // Weekly targets, then the sets that are left in each session go where the week falls shortest.
  const targets = Object.fromEntries(GROUP_IDS.map(g => [g, ans.avoid.includes(g) ? 0 : Math.round(WEEKLY_TARGET[ans.goal] * (ans.priority.includes(g) ? PRIORITY_BOOST : 1))]))
  const weekly = () => {
    const out = Object.fromEntries(GROUP_IDS.map(g => [g, 0]))
    for (const s of sessions) for (const e of s.exercises) {
      const w = weightsOf(e.id)
      for (const g of GROUP_IDS) out[g] += e.sets * groupWeight(w, g)
    }
    return out
  }
  for (const s of sessions) {
    // Too many sets for the minutes: the least important exercises go first.
    while (s.exercises.reduce((t, e) => t + e.sets, 0) > budget && s.exercises.length > 3) {
      const drop = [...s.exercises].sort((x, y) => (y.order - x.order))[0]
      s.exercises.splice(s.exercises.indexOf(drop), 1)
    }
    // Still over with the fewest exercises (a short session): trim sets, never below two.
    while (s.exercises.reduce((t, e) => t + e.sets, 0) > budget) {
      const most = [...s.exercises].sort((x, y) => y.sets - x.sets || y.order - x.order)[0]
      if (most.sets <= 2) break
      most.sets--
    }
    let left = budget - s.exercises.reduce((t, e) => t + e.sets, 0)
    while (left > 0) {
      const now = weekly()
      // The exercise that works hardest a group furthest below its target, among those with
      // room. A squat counts for quads and glutes alike, so it helps whichever is shorter.
      let best = null, gap = 0
      for (const e of s.exercises) {
        if (e.sets >= MAX_SETS) continue
        const w = weightsOf(e.id)
        const d = Math.max(0, ...GROUP_IDS.filter(g => groupWeight(w, g) >= 0.75).map(g => targets[g] - now[g]))
        if (d > gap) { best = e; gap = d }
      }
      if (!best) break
      best.sets++
      left--
    }
    for (const e of s.exercises) {
      if (isHold(e.id)) { e.sec = HOLD_SEC; e.sets = Math.min(e.sets, 3) } else e.reps = repsFor(e.pattern, ans)
      if (ans.age >= 60) e.sets = Math.min(e.sets, 4)
    }
  }
  const w = weekly()
  return {
    sessions,
    weekly: Object.fromEntries(GROUP_IDS.map(g => [g, Math.round(w[g] * 10) / 10])),
    targets,
    budget,
    answers: { ...ans, dislikes: [...ans.dislikes] },
  }
}

/** The exercises one exercise of a plan may be swapped for, best first: same slot, same rules. */
export function swapOptions(plan, sessionKey, index, { equipment, machines } = {}) {
  const s = plan.sessions.find(x => x.key === sessionKey)
  const e = s?.exercises[index]
  if (!e) return []
  const ans = normalizeAnswers(plan.answers)
  const exclude = new Set(s.exercises.map(x => x.id))
  return candidatesFor(e.pattern, ans, { equipment, machines, exclude }).ids
}

/** A copy of the plan with one exercise swapped; sets and reps stay, the weekly count is redone. */
export function swapExercise(plan, sessionKey, index, newId) {
  const sessions = plan.sessions.map(s => s.key !== sessionKey ? s : {
    ...s, exercises: s.exercises.map((e, i) => {
      if (i !== index) return e
      const next = { ...e, id: newId }
      if (isHold(newId)) { delete next.reps; next.sec = next.sec || HOLD_SEC } else if (next.sec) { delete next.sec; next.reps = repsFor(e.pattern, normalizeAnswers(plan.answers)) }
      return next
    })
  })
  const out = Object.fromEntries(GROUP_IDS.map(g => [g, 0]))
  for (const s of sessions) for (const e of s.exercises) { const w = weightsOf(e.id); for (const g of GROUP_IDS) out[g] += e.sets * groupWeight(w, g) }
  return { ...plan, sessions, weekly: Object.fromEntries(GROUP_IDS.map(g => [g, Math.round(out[g] * 10) / 10])) }
}

/**
 * The plan's sessions in the starter-plan shape lib/starter.js builds routines from:
 * [key, name, glyph, [[id, sets, reps], [id, sets, sec, 'time']…]] and a [weekday, key] schedule.
 * `nameOf(session, index)` gives each routine its (translated) name.
 */
export function routinesOf(plan, nameOf) {
  const glyph = { full: 'figureStrength', upper: 'barbell', lower: 'legs', push: 'barbell', pull: 'pullup', legs: 'legs' }
  return {
    routines: plan.sessions.map((s, i) => [s.key, nameOf(s, i), glyph[kindLabel(s.kind)] || 'figureStrength',
      s.exercises.map(e => e.sec ? [e.id, e.sets, e.sec, 'time'] : [e.id, e.sets, e.reps])]),
    schedule: plan.sessions.map(s => [s.day, s.key]),
  }
}
