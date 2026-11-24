// Fork: the personal questionnaire (route /avaliacao). One question per screen, in the same look
// as the Coach's intake (coach.css .ob-*), then a review of the plan it builds
// (lib/questionnaire-plan.js): every day, why it looks the way it does, and a swap for any
// exercise before it is saved. Needs no server and no AI: it runs in the static build too.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { DAYN, uid, exerciseNameText } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { activeProfile, profileEquipment } from '../lib/equipment.js'
import { profileMachines } from '../lib/machine-kinds.js'
import { starterEntry } from '../lib/starter.js'
import {
  GROUPS, GROUP_IDS, POOL_IDS, buildPlan, swapOptions, swapExercise, routinesOf, groupOfSlug, mainGroup, kindLabel,
} from '../lib/questionnaire-plan.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { Thumb } from '../components/Media.jsx'
import BodyMap from '../components/BodyMap.jsx'
import { HourMinuteWheel } from '../components/DurationWheel.jsx'
import { confirmSheet } from '../sheets.jsx'
import '../coach.css'
import '../questionnaire.css'

export const ANSWERS_KEY = 'gym_questionnaire_v1'
const readAnswers = () => { try { return JSON.parse(localStorage.getItem(ANSWERS_KEY)) || null } catch { return null } }

// Each choice's text through literal t() calls, so check-source-strings sees every key.
const GOAL_CHOICES = [
  ['muscle', () => [t('Build muscle'), t('Volume and progression.')], 'arm'],
  ['fatloss', () => [t('Lose fat'), t('Keep strength while leaning out.')], 'flame'],
  ['strength', () => [t('Get stronger'), t('Heavier lifts, lower reps.')], 'barbell'],
  ['health', () => [t('General fitness'), t('Balanced, sustainable training.')], 'heart'],
]
const GROUP_LABEL = {
  chest: () => t('Chest'), back: () => t('Back muscles'), shoulders: () => t('Shoulders'), traps: () => t('Traps'),
  biceps: () => t('Biceps'), triceps: () => t('Triceps'), abs: () => t('Abs'), glutes: () => t('Glutes'),
  quads: () => t('Quads'), hamstrings: () => t('Hamstrings'), calves: () => t('Calves'),
}
const KIND_LABEL = {
  full: () => t('Full body'), upper: () => t('Upper body'), lower: () => t('Lower body'),
  push: () => t('Push'), pull: () => t('Pull'), legs: () => t('Legs'),
}
const QUICK_MIN = [30, 45, 60, 75, 90]
const toHHMM = min => Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0')
const STEPS = ['sex', 'body', 'goal', 'priority', 'avoid', 'days', 'length', 'dislikes', 'review']
const list = gs => new Intl.ListFormat(dateLocale(), { type: 'conjunction' }).format(gs.map(g => GROUP_LABEL[g]()))
const doseText = e => e.sec ? t('{0} × {1} s', e.sets, e.sec) : t('{0} × {1}', e.sets, e.reps)

export default function Questionnaire() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const profile = activeProfile(S)
  const fit = profile ? { equipment: profileEquipment(profile), machines: profileMachines(profile) } : {}
  const [step, setStep] = useState(0)
  const [a, setA] = useState(() => ({
    sex: null, age: '', weight: '', height: '', goal: null, priority: [], avoid: [], days: [1, 3, 5], minutes: 60, dislikes: [],
    ...(readAnswers() || {}),
  }))
  const set = patch => setA(v => ({ ...v, ...patch }))
  const [plan, setPlan] = useState(null)
  const [swapping, setSwapping] = useState(null)   // `${sessionKey}:${index}` whose options are open

  const key = STEPS[step]
  const canNext = key === 'sex' ? !!a.sex : key === 'goal' ? !!a.goal : key === 'days' ? a.days.length > 0 : true
  const optional = ['body', 'priority', 'avoid', 'dislikes'].includes(key)

  const go = n => {
    if (STEPS[n] === 'review') { setPlan(buildPlan(a, fit)); setSwapping(null) }
    setStep(n)
    window.scrollTo(0, 0)
  }
  const next = () => go(step + 1)
  const back = () => (step ? go(step - 1) : nav('/home'))

  const pickSex = sex => {
    set({ sex })
    // The exercise drawings follow: a woman sees the female figure where the catalogue has one.
    if (sex === 'f' || sex === 'm') update(s => { s.exFigure = sex === 'f' ? 'female' : 'male' })
  }
  const toggle = (field, g, max) => {
    const cur = a[field]
    if (cur.includes(g)) return set({ [field]: cur.filter(x => x !== g) })
    if (max && cur.length >= max) return toast(t('Up to {0}.', max))
    // A muscle is either a priority or one not to grow, never both.
    const other = field === 'priority' ? 'avoid' : 'priority'
    set({ [field]: [...cur, g], [other]: a[other].filter(x => x !== g) })
  }
  const toggleDay = d => set({ days: a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d] })
  const toggleDislike = id => set({ dislikes: a.dislikes.includes(id) ? a.dislikes.filter(x => x !== id) : [...a.dislikes, id] })

  const save = () => {
    const nameOf = (s, i) => `${t('Workout {0}', String.fromCharCode(65 + i))} · ${KIND_LABEL[kindLabel(s.kind)]()}`
    const { routines, schedule } = routinesOf(plan, nameOf)
    const apply = () => {
      update(st => {
        const idOf = {}
        for (const [k, name, emoji, lines] of routines) {
          const r = { id: uid(), name, emoji, ex: lines.map(starterEntry) }
          st.routines.push(r)
          idOf[k] = r.id
        }
        // The week becomes this plan: its days get their session, the others rest. Routines
        // already in the plan stay in the list, untouched.
        for (let d = 0; d < 7; d++) st.week[d] = []
        for (const [day, k] of schedule) st.week[day] = [idOf[k]]
      })
      try { localStorage.setItem(ANSWERS_KEY, JSON.stringify({ ...a })) } catch { /* storage off */ }
      toast(t('Your plan is ready'))
      nav('/plan', { replace: true })
    }
    const busy = Object.values(S.week || {}).some(v => [].concat(v || []).some(id => S.routines.some(r => r.id === id)))
    if (!busy) return apply()
    confirmSheet({
      title: t('Replace your weekly plan?'),
      message: t('The new workouts go on the days you picked and the other days become rest. Your existing routines stay saved.'),
      confirmText: t('Use this plan'),
      onConfirm: apply,
    })
  }

  const dots = STEPS.filter(s => s !== 'review')
  return <div className="narrow ob">
    <div className="ob-top">
      <button className="iconbtn" data-back={step ? '' : '/home'} onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      {key !== 'review' && <div className="ob-dots">{dots.map((s, i) => <span key={s} className={'ob-dot' + (i === step ? ' on' : i < step ? ' done' : '')} />)}</div>}
      {optional ? <button className="ob-skip" onClick={next}>{t('Skip')}</button> : <span style={{ width: 36 }} />}
    </div>

    <div className="ob-body">
      {key === 'sex' && <>
        <div className="ob-eyebrow">{t('About you')}</div>
        <h1 className="ob-h">{t('Which figure should show you the exercises?')}</h1>
        <p className="ob-p">{t('The drawings of each exercise follow this. You can change it later in Settings.')}</p>
        <div className="ob-choices">
          <Choice on={a.sex === 'f'} icon="figureStrength" title={t('Female')} onClick={() => pickSex('f')} />
          <Choice on={a.sex === 'm'} icon="figureStrength" title={t('Male')} onClick={() => pickSex('m')} />
        </div>
      </>}

      {key === 'body' && <>
        <div className="ob-eyebrow">{t('About you')}</div>
        <h1 className="ob-h">{t('Age, weight and height')}</h1>
        <p className="ob-p">{t('Optional. From 60 the plan keeps the sets a little lower.')}</p>
        <div className="q-fields">
          <label className="q-field"><span>{t('Age')}</span><input id="q-age" inputMode="numeric" value={a.age} onChange={e => set({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder={t('years')} /></label>
          <label className="q-field"><span>{t('Weight')}</span><input id="q-weight" inputMode="decimal" value={a.weight} onChange={e => set({ weight: e.target.value.replace(/[^\d.,]/g, '').slice(0, 5) })} placeholder="kg" /></label>
          <label className="q-field"><span>{t('Height')}</span><input id="q-height" inputMode="numeric" value={a.height} onChange={e => set({ height: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="cm" /></label>
        </div>
      </>}

      {key === 'goal' && <>
        <div className="ob-eyebrow">{t('Your goal')}</div>
        <h1 className="ob-h">{t('What are you training for?')}</h1>
        <p className="ob-p">{t('It sets the reps, the rest and how many sets each muscle gets.')}</p>
        <div className="ob-choices">
          {GOAL_CHOICES.map(([v, text, icon]) => { const [title, sub] = text(); return <Choice key={v} on={a.goal === v} icon={icon} title={title} sub={sub} onClick={() => set({ goal: v })} /> })}
        </div>
      </>}

      {(key === 'priority' || key === 'avoid') && <MuscleStep
        field={key} chosen={a[key]} body={a.sex === 'f' ? 'female' : 'male'} onToggle={g => toggle(key, g, key === 'priority' ? 3 : 0)} />}

      {key === 'days' && <>
        <div className="ob-eyebrow">{t('Schedule')}</div>
        <h1 className="ob-h">{t('Which days do you train?')}</h1>
        <p className="ob-p">{t('Pick the days you can really keep. The plan puts one workout on each.')}</p>
        <div className="ob-week">
          {[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} className={'ob-wd' + (a.days.includes(d) ? ' on' : '')} aria-pressed={a.days.includes(d)} onClick={() => toggleDay(d)}>{t(DAYN[d]).slice(0, 3)}</button>)}
        </div>
        <p className="ob-p" style={{ marginTop: 14 }}>{t('{0} days a week', a.days.length)}</p>
      </>}

      {key === 'length' && <>
        <div className="ob-eyebrow">{t('Session length')}</div>
        <h1 className="ob-h">{t('How long is a session?')}</h1>
        <p className="ob-p">{t('Including the warm-up and the rest between sets. The number of sets fits this time.')}</p>
        <div className="dw-read" aria-hidden="true">{toHHMM(a.minutes)}</div>
        <HourMinuteWheel value={a.minutes} onChange={m => set({ minutes: Math.max(20, m) })} min={20} />
        <div className="ob-quick">{QUICK_MIN.map(m => <button key={m} className={'chip nocap' + (a.minutes === m ? ' on' : '')} onClick={() => set({ minutes: m })}>{m} {t('min')}</button>)}</div>
      </>}

      {key === 'dislikes' && <>
        <div className="ob-eyebrow">{t('Preferences')}</div>
        <h1 className="ob-h">{t('Any exercise you don’t like?')}</h1>
        <p className="ob-p">{t('Tap the ones you never want in your plan. Another exercise for the same muscle takes their place.')}</p>
        {GROUP_IDS.map(g => {
          const ids = POOL_IDS.filter(id => mainGroup(id) === g)
          if (!ids.length) return null
          return <div key={g} className="q-group">
            <div className="ob-sub">{GROUP_LABEL[g]()}</div>
            <div className="q-grid">
              {ids.map(id => { const off = a.dislikes.includes(id); return <button key={id} className={'q-ex' + (off ? ' off' : '')} aria-pressed={off} onClick={() => toggleDislike(id)}>
                <Thumb ex={EXIDX[id]} />
                <span className="q-ex-n">{exerciseNameText(EXIDX[id])}</span>
                {off && <span className="q-ex-x" aria-hidden="true"><Icon name="x" /></span>}
              </button> })}
            </div>
          </div>
        })}
      </>}

      {key === 'review' && plan && <Review plan={plan} answers={a} profile={profile} swapping={swapping} setSwapping={setSwapping}
        options={(k, i) => swapOptions(plan, k, i, fit)} onSwap={(k, i, id) => { setPlan(swapExercise(plan, k, i, id)); setSwapping(null) }} />}
    </div>

    <div className="ob-foot">
      {key === 'review'
        ? <Button variant="primary" style={{ flex: 1 }} icon="check" onClick={save}>{t('Use this plan')}</Button>
        : <Button variant="primary" style={{ flex: 1 }} disabled={!canNext} onClick={next}>{step === STEPS.length - 2 ? t('Build my plan') : t('Continue')}</Button>}
    </div>
    {!canNext && <div className="ob-hint">{t('Pick one to continue.')}</div>}
  </div>
}

function Choice({ on, icon, title, sub, onClick }) {
  return <button className={'ob-choice' + (on ? ' on' : '')} onClick={onClick}>
    <Icon name={icon} />
    <span className="ob-choice-t">{title}{sub && <span className="ob-choice-s">{sub}</span>}</span>
    <Icon name="check" className="ob-k" />
  </button>
}

function MuscleStep({ field, chosen, body, onToggle }) {
  const priority = field === 'priority'
  const selected = chosen.flatMap(g => GROUPS[g])
  return <>
    <div className="ob-eyebrow">{t('Your goal')}</div>
    <h1 className="ob-h">{priority ? t('Which muscles do you want to stand out?') : t('Any muscle you don’t want to grow much?')}</h1>
    <p className="ob-p">{priority ? t('Up to 3. They get more sets and an exercise of their own. Tap the body or the names.') : t('They still work as helpers in the big lifts, but get no exercise of their own.')}</p>
    <BodyMap body={body} selected={selected} onMuscle={slug => { const g = groupOfSlug(slug); if (g) onToggle(g) }} className="q-map" />
    <div className="ob-chips">
      {GROUP_IDS.map(g => <button key={g} className={'chip nocap' + (chosen.includes(g) ? ' on' : '')} aria-pressed={chosen.includes(g)} onClick={() => onToggle(g)}>{GROUP_LABEL[g]()}</button>)}
    </div>
  </>
}

function Review({ plan, answers, profile, swapping, setSwapping, options, onSwap }) {
  const ans = plan.answers
  const why = useMemo(() => {
    const n = ans.days.length
    const out = [
      n <= 3 ? t('With {0} days, every workout trains the whole body, so each muscle is trained {0} times a week.', n)
        : n === 4 ? t('With 4 days, upper and lower body take turns: each muscle twice a week, the frequency that tends to work best.')
          : t('With {0} days, push, pull and legs each get their own day, so every muscle gets more work per session.', n),
      { muscle: t('To build muscle: the big lifts at about 8 reps and the small ones at about 12, ending each set with one or two reps left.'),
        fatloss: t('To lose fat: moderate to high reps and short rests. Lifting keeps your muscle while the diet takes the fat.'),
        strength: t('To get stronger: heavy big lifts at about 5 reps with long rests, the small ones at about 10.'),
        health: t('For general fitness: moderate volume, 10 to 12 reps, the whole body every week.') }[ans.goal],
      t('Each workout fits {0} minutes: about {1} working sets.', ans.minutes, plan.budget),
      { muscle: t('Rest about 2 minutes on the big lifts and about 1 minute on the small ones.'),
        fatloss: t('Rest about 1 minute between sets.'),
        strength: t('Rest 2 to 3 minutes on the big lifts and about 1 and a half on the small ones.'),
        health: t('Rest about 1 and a half minutes between sets.') }[ans.goal],
    ]
    if (ans.priority.length) out.push(t('{0}: more weekly sets and an exercise of their own.', list(ans.priority)))
    if (ans.avoid.length) out.push(t('{0}: no exercise of their own; they only help in the big lifts.', list(ans.avoid)))
    if (answers.dislikes.length) out.push(t('{0} exercises you don’t like are left out.', answers.dislikes.length))
    if (profile) out.push(t('Only exercises your gym profile “{0}” can do.', profile.name))
    if (ans.age >= 60) out.push(t('From 60: at most 4 sets per exercise and at least 8 reps.'))
    out.push(t('Log your weight and reps every set: the app tells you when to go up.'))
    return out
  }, [plan, answers, profile])

  return <>
    <div className="ob-eyebrow">{t('Your plan')}</div>
    <h1 className="ob-h">{t('Made from your answers')}</h1>
    <p className="ob-p">{t('Tap Swap on any exercise to change it before you save.')}</p>

    {plan.sessions.map((s, i) => <div key={s.key} className="card q-day">
      <div className="q-day-h"><b>{t('Workout {0}', String.fromCharCode(65 + i))} · {KIND_LABEL[kindLabel(s.kind)]()}</b><span className="dim">{t(DAYN[s.day])}</span></div>
      {s.exercises.map((e, j) => {
        const id = `${s.key}:${j}`, open = swapping === id
        return <div key={id} className="q-row-wrap">
          <div className="q-row">
            <Thumb ex={EXIDX[e.id]} />
            <span className="q-row-n">{exerciseNameText(EXIDX[e.id])}<span className="dim small">{doseText(e)}{e.priority ? ` · ${t('priority')}` : ''}</span></span>
            <button className="chip nocap" onClick={() => setSwapping(open ? null : id)} aria-expanded={open}>{open ? t('Close') : t('Swap')}</button>
          </div>
          {open && <div className="q-swap">
            {options(s.key, j).length ? options(s.key, j).map(o => <button key={o} className="q-row q-opt" onClick={() => onSwap(s.key, j, o)}>
              <Thumb ex={EXIDX[o]} /><span className="q-row-n">{exerciseNameText(EXIDX[o])}</span><Icon name="chevronRight" />
            </button>) : <div className="dim small">{t('No other exercise fits here with your answers.')}</div>}
          </div>}
        </div>
      })}
    </div>)}

    <div className="card">
      <div className="ob-sub" style={{ marginTop: 0 }}>{t('Why it looks like this')}</div>
      <ul className="q-why">{why.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </div>

    <div className="card">
      <div className="ob-sub" style={{ marginTop: 0 }}>{t('Weekly sets per muscle')}</div>
      {GROUP_IDS.map(g => {
        const v = plan.weekly[g], target = plan.targets[g]
        if (!v && !target) return null
        const pct = Math.min(100, target ? (v / target) * 100 : 100)
        return <div key={g} className="q-vol">
          <span>{GROUP_LABEL[g]()}</span>
          <div className="q-bar"><i style={{ width: pct + '%' }} className={ans.priority.includes(g) ? 'pri' : ''} /></div>
          <span className="dim">{Math.round(v)}{target ? ` / ${target}` : ''}</span>
        </div>
      })}
      <p className="dim small" style={{ marginTop: 8 }}>{t('Counted the way the Stats screen counts: a helper muscle gets part of a set.')}</p>
    </div>
    <p className="dim small">{t('Built from your answers by fixed rules, not by a person who has seen you train. If something hurts, stop and ask a professional.')}</p>
  </>
}
