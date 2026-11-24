// Fork: the personal questionnaire's plan builder (lib/questionnaire-plan.js).
import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'
import { eqAvailable } from './equipment.js'
import {
  POOL, POOL_IDS, GROUPS, buildPlan, splitFor, setBudget, swapOptions, swapExercise, routinesOf, groupOfSlug, mainGroup,
} from './questionnaire-plan.js'

const sets = s => s.exercises.reduce((t, e) => t + e.sets, 0)
const all = plan => plan.sessions.flatMap(s => s.exercises)

describe('the exercise pool', () => {
  it('names only exercises that are in the catalogue', () => {
    expect(POOL_IDS.filter(id => !EXIDX[id])).toEqual([])
  })
  it('reads the map muscles a person taps as groups', () => {
    expect(groupOfSlug('gluteal')).toBe('glutes')
    expect(groupOfSlug('side-delts')).toBe('shoulders')
    expect(groupOfSlug('forearm')).toBe(null)
    expect(mainGroup('0025')).toBe('chest')
    // A squat works quads and glutes equally in the app's model.
    expect(['quads', 'glutes']).toContain(mainGroup('0043'))
  })
})

describe('the split and the minutes', () => {
  it('follows the number of training days', () => {
    expect(splitFor(2)).toEqual(['full', 'full2'])
    expect(splitFor(4)).toEqual(['upper', 'lower', 'upper2', 'lower2'])
    expect(splitFor(6)).toHaveLength(6)
  })
  it('puts one session on each chosen weekday, Monday first', () => {
    const plan = buildPlan({ days: [5, 1, 3] })
    expect(plan.sessions.map(s => s.day)).toEqual([1, 3, 5])
    expect(buildPlan({ days: [0, 6] }).sessions.map(s => s.day)).toEqual([6, 0])
  })
  it('keeps every session inside the set budget of its minutes', () => {
    for (const minutes of [30, 45, 60, 90]) {
      const plan = buildPlan({ minutes, days: [1, 2, 4, 5] })
      for (const s of plan.sessions) expect(sets(s)).toBeLessThanOrEqual(setBudget(minutes))
    }
    expect(setBudget(30)).toBeLessThan(setBudget(60))
  })
  it('never repeats an exercise inside one session', () => {
    for (const s of buildPlan({ days: [1, 2, 3, 4, 5, 6] }).sessions) {
      const ids = s.exercises.map(e => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
  it('varies two sessions of the same kind', () => {
    const plan = buildPlan({ days: [1, 2, 3, 4, 5, 6] })
    const push = plan.sessions.filter(s => s.kind === 'push')
    expect(push[0].exercises.map(e => e.id)).not.toEqual(push[1].exercises.map(e => e.id))
  })
})

describe('the person’s choices', () => {
  it('never uses an exercise the person does not like', () => {
    const dislikes = ['0043', '0025', '0085', '2330']
    const ids = all(buildPlan({ dislikes, days: [1, 2, 4, 5] })).map(e => e.id)
    expect(ids.filter(id => dislikes.includes(id))).toEqual([])
  })
  it('keeps away from what mostly trains a muscle the person does not want to grow', () => {
    const plan = buildPlan({ avoid: ['quads', 'traps'], days: [1, 3, 5] })
    for (const e of all(plan)) {
      const w = musclesOf(EXIDX[e.id])
      expect(w.quadriceps || 0).toBeLessThan(0.75)
      expect(w.trapezius || 0).toBeLessThan(0.75)
    }
    expect(plan.targets.quads).toBe(0)
  })
  it('gives a prioritised muscle more weekly sets than it gets otherwise', () => {
    const base = buildPlan({ days: [1, 2, 4, 5] })
    const glutes = buildPlan({ days: [1, 2, 4, 5], priority: ['glutes'] })
    expect(glutes.weekly.glutes).toBeGreaterThan(base.weekly.glutes)
    expect(glutes.targets.glutes).toBeGreaterThan(base.targets.glutes)
  })
  it('lifts heavier and fewer reps for strength than for fat loss', () => {
    const reps = goal => all(buildPlan({ goal, days: [1, 3, 5] })).find(e => e.pattern === 'squat').reps
    expect(reps('strength')).toBeLessThan(reps('fatloss'))
  })
  it('keeps to the equipment of the active profile', () => {
    const equipment = ['body weight']
    const plan = buildPlan({ days: [1, 3, 5] }, { equipment })
    expect(all(plan).length).toBeGreaterThan(0)
    for (const e of all(plan)) expect(eqAvailable(equipment, EXIDX[e.id])).toBe(true)
  })
  it('brings a second kind of exercise for a priority, not the same lift twice', () => {
    for (const s of buildPlan({ days: [1, 2, 4, 5], priority: ['glutes', 'shoulders'] }).sessions) {
      const patterns = s.exercises.map(e => e.pattern).filter(p => p !== 'hpull')
      expect(new Set(patterns).size).toBe(patterns.length)
    }
  })
  it('keeps hip hinges at ten reps or fewer, even for fat loss', () => {
    for (const e of all(buildPlan({ goal: 'fatloss', days: [1, 3, 5], dislikes: ['0085'] }))) if (e.pattern === 'hinge') expect(e.reps).toBeLessThanOrEqual(10)
  })
  it('caps the sets for an older person', () => {
    for (const e of all(buildPlan({ age: 65, days: [1, 3, 5] }))) expect(e.sets).toBeLessThanOrEqual(4)
  })
})

describe('the review screen', () => {
  it('offers swaps from the same slot and never one already in the session', () => {
    const plan = buildPlan({ days: [1, 3, 5] })
    const s = plan.sessions[0]
    const opts = swapOptions(plan, s.key, 0)
    expect(opts.length).toBeGreaterThan(0)
    expect(opts.some(id => s.exercises.some(e => e.id === id))).toBe(false)
  })
  it('swaps one exercise and keeps its sets', () => {
    const plan = buildPlan({ days: [1, 3, 5] })
    const s = plan.sessions[0]
    const to = swapOptions(plan, s.key, 0)[0]
    const next = swapExercise(plan, s.key, 0, to)
    expect(next.sessions[0].exercises[0].id).toBe(to)
    expect(next.sessions[0].exercises[0].sets).toBe(s.exercises[0].sets)
    expect(plan.sessions[0].exercises[0].id).not.toBe(to)
  })
  it('turns the plan into the starter-plan shape, holds as seconds', () => {
    const plan = buildPlan({ days: [1, 3, 5], priority: ['abs'] })
    const { routines, schedule } = routinesOf(plan, (s, i) => `Day ${i + 1}`)
    expect(routines).toHaveLength(3)
    expect(schedule).toEqual([[1, 'q1'], [3, 'q2'], [5, 'q3']])
    for (const [, , , list] of routines) for (const line of list) {
      expect(EXIDX[line[0]]).toBeTruthy()
      if (line[3] === 'time') expect(line[2]).toBeGreaterThan(0)
    }
  })
})

it('covers every group with a pool slot', () => {
  for (const g of Object.keys(GROUPS)) expect(POOL_IDS.some(id => mainGroup(id) === g)).toBe(true)
})
