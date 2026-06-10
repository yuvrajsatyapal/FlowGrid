import { createContext, useContext, useEffect, useRef, useState } from 'react'
import '../styles/landing.css'

/* ─── theme ─────────────────────────────────────────────────────────────────── */
const ThemeCtx = createContext<{ isDark: boolean; toggle: () => void }>({ isDark: false, toggle: () => {} })
const useTheme = () => useContext(ThemeCtx)

function mkPalette(isDark: boolean) {
  return isDark ? {
    bg:       '#111113',
    text:     '#EDE8E0',
    coral:    '#E05A3A',
    teal:     '#1A7279',
    tealCard: '#4A8B7C',
    blush:    '#F2DADA',
    cream:    '#FBF7F2',
    dark:     '#0a0a0b',
    muted:    'rgba(237,232,224,0.50)',
    border:   'rgba(237,232,224,0.14)',
    dim:      'rgba(180,200,210,0.55)',
  } : {
    bg:       '#F5F0EB',
    text:     '#1c1b1b',
    coral:    '#E05A3A',
    teal:     '#1A7279',
    tealCard: '#4A8B7C',
    blush:    '#F2DADA',
    cream:    '#FBF7F2',
    dark:     '#0f0f10',
    muted:    'rgba(28,27,27,0.55)',
    border:   'rgba(28,27,27,0.12)',
    dim:      'rgba(10,39,41,0.55)',
  }
}

/* ─── palette (light — kept for static data that references it) ─────────────── */
const C = mkPalette(false)

/* ─── data ─────────────────────────────────────────────────────────────────── */
const HERO_CARDS = [
  { num: '01', label: 'Boards',    bg: C.cream,    textDark: true,  code: 'FG-BORD-01',
    icon: <><rect x="7" y="7" width="4" height="4"/><rect x="13" y="7" width="4" height="4"/><rect x="7" y="13" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/></> },
  { num: '02', label: 'Timeline',  bg: C.coral,    textDark: false, code: 'FG-TMLN-02',
    icon: <><rect x="6" y="8" width="12" height="2.5"/><rect x="6" y="12.5" width="9" height="2.5"/><rect x="6" y="17" width="6" height="2.5"/></> },
  { num: '03', label: 'Analytics', bg: C.tealCard, textDark: false, code: 'FG-ANLT-03',
    icon: <><rect x="6" y="14" width="3" height="6"/><rect x="11" y="10" width="3" height="10"/><rect x="16" y="6" width="3" height="14"/></> },
  { num: '04', label: 'Real-time', bg: C.blush,    textDark: true,  code: 'FG-RLTM-04',
    icon: <polyline points="5,16 9,10 13,14 17,6 19,10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/> },
]

type StepColors = { coral: string; dim: string }
const PROCESS_STEPS = [
  { num: '01', title: 'Planning',
    body: (active: boolean, c: StepColors) => <>Create a <strong style={{color: active ? c.coral : c.dim, transition: 'color 0.5s'}}>CLEAR WORKFLOW</strong> using drag-and-drop boards, lists, labels, priorities, and rich card details.</> },
  { num: '02', title: 'Collaborate',
    body: (active: boolean, c: StepColors) => <>Work together with <strong style={{color: active ? c.coral : c.dim, transition: 'color 0.5s'}}>INSTANT REAL-TIME SYNC</strong> — see cards, comments, and updates appear across teammates immediately.</> },
  { num: '03', title: 'Organize',
    body: (active: boolean, c: StepColors) => <>Reduce repetitive work with <strong style={{color: active ? c.coral : c.dim, transition: 'color 0.5s'}}>RECURRING TASKS</strong>, notifications, dependencies, and streamlined workflows.</> },
  { num: '04', title: 'Deliver',
    body: (active: boolean, c: StepColors) => <>Track progress with <strong style={{color: active ? c.coral : c.dim, transition: 'color 0.5s'}}>ANALYTICS</strong> and activity history to keep projects moving and blockers visible.</> },
]

const FEATURES = [
  {
    num: '01', bg: C.coral, textLight: true, title: 'Planning',
    desc: 'Create a clear workflow using drag-and-drop cards, lists, labels, priorities, and rich card details.',
    list: ['Drag-and-drop cards','Lists & labels','Priority flags','Rich card details','Custom fields','Board templates','Multiple views','Due dates'],
  },
  {
    num: '02', bg: C.cream, textLight: false, title: 'Collaborate',
    desc: 'Work together with instant real-time sync — see cards, comments, and updates appear instantly for everyone.',
    list: ['Real-time sync','Live collaboration','Comments','Activity feed','Team mentions','Notifications','Shared workspaces','Member roles'],
  },
  {
    num: '03', bg: C.tealCard, textLight: true, title: 'Organize',
    desc: 'Reduce repetitive work with recurring tasks, notifications, dependencies, and streamlined workflows.',
    list: ['Recurring tasks','Notifications','Dependencies','Workflow organization','Status tracking','Smart filters','Task management','File attachments'],
  },
  {
    num: '04', bg: C.blush, textLight: false, title: 'Deliver',
    desc: 'Track progress with analytics and activity history to keep projects moving with full visibility into work.',
    list: ['Analytics','Activity history','Progress tracking','Team insights','Completion metrics','Reports','Workspace analytics','Export data'],
  },
]

const FAQ_ITEMS = [
  { q: 'How is FlowGrid different from others?',
    a: "FlowGrid combines multi-dimensional planning, intelligent task relationships, real-time collaboration, and built-in analytics in a workspace designed for fast-moving teams." },
  { q: 'Is collaboration really real-time?',
    a: 'Yes. FlowGrid keeps everyone in sync as work happens. Board updates, task changes, and team activity appear instantly across the workspace, so everyone stays on the same page without refreshing.' },
  { q: 'Can we migrate from other tools?',
    a: 'Not currently. FlowGrid is focused on delivering a powerful project management experience, and migration tools are being considered for future releases.' },
  { q: 'What is the typical setup time?',
    a: 'Setup takes less than 2 minutes. Create a workspace, set up your first board, and start collaborating right away.' },
  { q: 'What happens after we sign up?',
    a: "You'll walk through a 3-step setup to create your workspace and first board. Enterprise customers get a dedicated success manager and custom onboarding session." },
]

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.lp-reveal')
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('lp-visible')
          obs.unobserve(e.target)
        }
      }),
      { threshold: 0.12 }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
}

function useClock() {
  const [time, setTime] = useState('--:--:--')
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-US', { hour12: false })
    setTime(fmt())
    const id = setInterval(() => setTime(fmt()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

/* ─── scroll-driven per-character text reveal ─────────────────────────────── */
function ScrollRevealText({ text }: { text: string }) {
  const { isDark } = useTheme()
  const P = mkPalette(isDark)
  const containerRef = useRef<HTMLDivElement>(null)
  const charsRef = useRef<(HTMLSpanElement | null)[]>([])
  const chars = text.split('')

  useEffect(() => {
    charsRef.current = charsRef.current.slice(0, chars.length)
  }, [chars.length])

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const wh = window.innerHeight
      const scrolled = wh - rect.top
      const total = wh * 1.3
      const progress = Math.max(0, Math.min(1, scrolled / total))
      const revealedCount = Math.floor(progress * chars.length)
      charsRef.current.forEach((span, i) => {
        if (!span) return
        span.style.opacity = i < revealedCount ? '1' : '0'
      })
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [chars.length])

  const sharedStyle: React.CSSProperties = {
    fontFamily: "'Hanken Grotesk', sans-serif",
    fontSize: 'clamp(26px,3.6vw,56px)',
    fontWeight: 600,
    lineHeight: 1.15,
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <h2 className="sr-only">{text}</h2>
      <p aria-hidden="true" style={{ ...sharedStyle, opacity: 0.35, color: P.text }}>
        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {chars.map((ch, i) => <span key={i}>{ch}</span>)}
        </span>
      </p>
      <p aria-hidden="true" style={{ ...sharedStyle, position: 'absolute', inset: 0, margin: 0, color: P.text }}>
        <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {chars.map((ch, i) => (
            <span
              key={i}
              ref={el => { charsRef.current[i] = el }}
              style={{ opacity: 0, transition: 'opacity 130ms linear' }}
            >
              {ch}
            </span>
          ))}
        </span>
      </p>
    </div>
  )
}

/* ─── NAV ───────────────────────────────────────────────────────────────────── */
function LandingNav({ scrolled }: { scrolled: boolean }) {
  const { isDark, toggle } = useTheme()
  const P = mkPalette(isDark)

  const navBg = isDark
    ? (scrolled ? 'rgba(17,17,19,0.96)' : '#111113')
    : (scrolled ? 'rgba(245,240,235,0.95)' : '#F5F0EB')

  const ThemeIcon = () => isDark
    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>

  return (
    <header style={{
      position: 'fixed', inset: '0 0 auto 0', zIndex: 50,
      background: navBg,
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <div style={{ maxWidth: '100rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
           className="px-4 sm:px-6 md:px-8 py-3.5 sm:py-5 md:py-6">
        <a href="/" aria-label="FlowGrid home" style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: '0.02em', color: P.text, textDecoration: 'none', flexShrink: 0 }}>
          FlowGrid
        </a>

        {/* Desktop-only: Features + FAQs links */}
        <nav style={{ gap: 24, alignItems: 'center' }} className="hidden md:flex flex-1 justify-center px-4">
          {[{ label: 'Features', href: '#features' }, { label: 'FAQs', href: '#faqs' }].map(({ label, href }) => (
            <a key={label} href={href}
               style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: P.muted, textDecoration: 'none', borderBottom: `2px solid ${P.border}`, padding: '8px 4px', transition: 'color 0.2s, border-color 0.2s' }}
               onMouseEnter={e => { e.currentTarget.style.color = P.text; e.currentTarget.style.borderBottomColor = P.text }}
               onMouseLeave={e => { e.currentTarget.style.color = P.muted; e.currentTarget.style.borderBottomColor = P.border }}>
              {label}
            </a>
          ))}
        </nav>

        {/* Always-visible: theme toggle + Get Started */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={toggle}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="lp-btn lp-nav-btn"
            style={{ padding: '10px 13px', fontSize: 12 }}
          >
            <ThemeIcon />
          </button>
          <a href="/login" className="lp-btn lp-nav-btn" style={{ fontSize: 12, padding: '10px 22px' }}>Get Started</a>
        </div>
      </div>
    </header>
  )
}

/* ─── HERO ──────────────────────────────────────────────────────────────────── */
function HeroSection({ time }: { time: string }) {
  const { isDark } = useTheme()
  const P = mkPalette(isDark)
  /* Mouse parallax — rAF lerp, each card gets its own depth layer */
  const cardParallaxRefs = useRef<(HTMLDivElement | null)[]>([])
  const currentPos = useRef({ x: 0, y: 0 })
  const targetPos  = useRef({ x: 0, y: 0 })
  const rafRef     = useRef<number>(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      targetPos.current.x = (e.clientX / window.innerWidth  - 0.5) * 2
      targetPos.current.y = (e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMove)

    const DEPTHS = [0.55, 0.90, 1.05, 0.70]
    const tick = () => {
      currentPos.current.x += (targetPos.current.x - currentPos.current.x) * 0.06
      currentPos.current.y += (targetPos.current.y - currentPos.current.y) * 0.06
      cardParallaxRefs.current.forEach((w, i) => {
        if (!w) return
        const d = DEPTHS[i] ?? 0.8
        const tx = currentPos.current.x * d * 14
        const ty = currentPos.current.y * d * 9
        w.style.transform = `translate(${tx}px, ${ty}px)`
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <section style={{ minHeight: '100svh', paddingTop: 80, paddingBottom: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: P.bg }}
             className="lp-hero-section px-4 sm:px-6 md:px-8">
      {/* ── Dual-font headline (NEXTEC pattern: normal-weight line + huge display line) */}
      <div className="lp-hero-anim lp-hero-d0 lp-hero-headline-pad" style={{ paddingTop: 40 }}>
        <h1 style={{ width: '100%', maxWidth: '92rem', margin: '0 auto', textAlign: 'center' }}>
          <span className="lp-hero-line1" style={{ color: P.text, marginBottom: '15px', }}>
            Organize work.{' '}
            <br className="lp-hero-br" />
            Collaborate faster.
          </span>
          <span className="lp-hero-line2" style={{ color: P.text }}>
            Stay in sync.
          </span>
        </h1>
      </div>

      {/* ── Hero cards with mouse parallax — flex row, NEXTEC card sizing */}
      <div className="lp-hero-cards-anim lp-hero-d1 lp-hero-cards-row"
           style={{ display: 'flex', gap: 28, justifyContent: 'center', flexWrap: 'wrap', marginTop: 40 }}
           role="list">
        {HERO_CARDS.map((card, i) => {
          const tc = card.textDark ? 'rgba(28,27,27,0.72)' : 'rgba(255,255,255,0.9)'
          const FLOAT_DUR   = ['3.2s', '3.9s', '3.5s', '4.2s']
          const FLOAT_DELAY = ['0s', '0.6s', '1.2s', '1.8s']
          return (
            /* outer: parallax depth wrapper — holds its own width */
            <div key={card.label}
                 ref={el => { cardParallaxRefs.current[i] = el }}
                 className="lp-parallax-card"
                 role="listitem">
              {/* float wrapper: CSS animation lives here, isolated from JS transforms */}
              <div className="lp-float-card"
                   style={{ '--float-dur': FLOAT_DUR[i], '--float-delay': FLOAT_DELAY[i] } as React.CSSProperties}>
              {/* inner: the actual card */}
              <div className="lp-hard-card"
                   style={{ backgroundColor: card.bg, position: 'relative', overflow: 'hidden', cursor: 'pointer',
                     width: 'clamp(108px, 15vw, 178px)', aspectRatio: '89/128',
                     flexShrink: 0, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', willChange: 'transform',
                     border: `2px solid ${P.text}`, boxShadow: `6px 6px 0px ${P.text}` }}
                   onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-6px) scale(1.02)')}
                   onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0) scale(1)')}>
                {/* ghost numeral */}
                <span aria-hidden style={{ position: 'absolute', right: '-0.16em', bottom: '-0.18em', fontFamily: "'Anton', sans-serif", fontSize: 'clamp(100px,17vw,200px)', lineHeight: 1, color: card.textDark ? 'rgba(28,27,27,0.07)' : 'rgba(0,0,0,0.07)', pointerEvents: 'none', userSelect: 'none' }}>
                  {card.num}
                </span>
                {/* label top-left */}
                <span style={{ position: 'absolute', top: 12, left: 12, fontFamily: "'Hanken Grotesk'", fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: tc }}>
                  {card.label}
                </span>
                {/* icon center */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <svg viewBox="0 0 24 24" width="52" height="52" style={{ color: card.textDark ? C.text : '#fff' }} aria-hidden shapeRendering="crispEdges" fill="currentColor">
                    {card.icon}
                  </svg>
                </div>
                {/* code badge bottom */}
                <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: tc }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, background: card.textDark ? 'rgba(28,27,27,0.7)' : 'rgba(255,255,255,0.7)', display: 'inline-block' }} />
                    <span style={{ fontFamily: 'monospace' }}>{card.code}</span>
                  </span>
                  <span>FG</span>
                </div>
              </div>
              </div>{/* /lp-float-card */}
            </div>
          )
        })}
      </div>

      {/* ── Bottom bar */}
      <div className="lp-hero-bottom-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, borderTop: `1px solid ${P.border}`, marginTop: 24 }}>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: P.muted }}>
          SCROLL DOWN
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', color: P.muted }}>India,</span>
          <span id="lp-clock" style={{ fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums', minWidth: '6ch', textAlign: 'right', color: P.text }}>
            {time}
          </span>
        </div>
      </div>
    </section>
  )
}

/* ─── WHAT IS FLOWGRID ──────────────────────────────────────────────────────── */
function WhatIsFlowGrid() {
  const { isDark } = useTheme()
  const P = mkPalette(isDark)
  return (
    <section style={{ padding: 'clamp(80px, 10vw, 144px) clamp(24px, 5vw, 64px)', background: P.bg, maxWidth: '100rem', margin: '0 auto' }}>
      <p className="lp-label lp-reveal" style={{ marginBottom: 20 }}>What is FlowGrid</p>
      <div style={{ maxWidth: '85%' }}>
        <ScrollRevealText text="FlowGrid is where your team's work lives. We stripped away the noise to build a platform that prioritises clarity over complexity. Designed for high-performance teams who need to move from ideation to delivery without the typical friction of legacy tools." />
      </div>
    </section>
  )
}

/* ─── PROCESS ───────────────────────────────────────────────────────────────── */
function ProcessSection() {
  const { isDark } = useTheme()
  const P = mkPalette(isDark)
  const [activeStep, setActiveStep] = useState(0)
  const [mobileOpen, setMobileOpen] = useState<number | null>(0)
  const articleRefs = useRef<(HTMLElement | null)[]>([])
  const progressBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const update = () => {
      const articles = articleRefs.current
      const target = window.innerHeight * 0.4

      const first = articles[0]
      const last = articles[articles.length - 1]
      if (first && last && progressBarRef.current) {
        const firstRect = first.getBoundingClientRect()
        const lastRect = last.getBoundingClientRect()
        const totalRange = lastRect.bottom - firstRect.top
        const scrolledRange = target - firstRect.top
        const p = Math.max(0, Math.min(1, scrolledRange / totalRange))
        progressBarRef.current.style.transform = `scaleX(${p})`

        // Derive activeStep from p so colors change exactly when bar hits each marker.
        // Markers sit at 0, 1/(n-1), 2/(n-1), 1 — i.e. equally spaced.
        const n = PROCESS_STEPS.length
        setActiveStep(Math.min(n - 1, Math.floor(p * (n - 1) + 0.001)))
      }
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <section style={{ padding: 'clamp(80px,10vw,144px) clamp(24px,5vw,64px)', background: P.bg, overflow: 'clip' }}>
      {/* ── Mobile: accordion */}
      <div className="lg:hidden">
        <p className="lp-label" style={{ marginBottom: 12 }}>From idea to shipped product</p>
        {PROCESS_STEPS.map((step, i) => {
          const open = mobileOpen === i
          return (
            <div key={step.num} style={{ borderBottom: `1px solid ${open ? 'rgba(224,90,58,0.5)' : P.border}`, paddingTop: 24, paddingBottom: 24, transition: 'border-color 0.4s ease-in-out' }}>
              <button style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}
                      aria-expanded={open}
                      onClick={() => setMobileOpen(open ? null : i)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 700, marginTop: 4, opacity: 0.8, color: open ? P.coral : P.muted }}>
                    {step.num}
                  </span>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 30, lineHeight: 1, color: open ? P.coral : P.text }}>
                    {step.title}
                  </span>
                </div>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
                     style={{ flexShrink: 0, color: open ? P.coral : P.text,
                              transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                              transition: 'transform 0.35s ease-in-out, color 0.5s ease-in-out' }}>
                  <path d="M6 18L18 6" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square"/>
                  <path d="M11 6H18V13" stroke="currentColor" strokeWidth="2.8" strokeLinecap="square"/>
                </svg>
              </button>
              <div style={{
                display: 'grid',
                gridTemplateRows: open ? '1fr' : '0fr',
                opacity: open ? 1 : 0,
                marginTop: open ? 16 : 0,
                transition: 'grid-template-rows 0.38s ease-in-out, opacity 0.32s ease-in-out, margin-top 0.38s ease-in-out',
              }}>
                <div style={{ overflow: 'hidden' }}>
                  <p style={{ fontFamily: "'Hanken Grotesk'", fontSize: 16, lineHeight: 1.7, fontWeight: 500, maxWidth: '82ch', color: P.muted }}>
                    {step.body(open, P)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop: sticky left + scrolling right */}
      <div className="hidden lg:grid" style={{ gridTemplateColumns: '0.78fr 1.22fr', gap: 80, alignItems: 'start' }}>
        <div style={{ position: 'sticky', top: 120 }}>
          {/* Step counter + progress bar */}
          <div style={{ marginBottom: 32, maxWidth: '25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
              {PROCESS_STEPS.map((s, i) => (
                <span key={s.num} style={{ color: i === activeStep ? P.teal : P.muted, transition: 'color 0.3s' }}>
                  {s.num}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 10, height: 8, background: isDark ? 'rgba(237,232,224,0.1)' : 'rgba(28,27,27,0.1)', overflow: 'hidden' }}>
              <div ref={progressBarRef} style={{ height: '100%', background: P.teal, transform: 'scaleX(0)', transformOrigin: 'left' }} />
            </div>
          </div>
          <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(58px,7vw,92px)', lineHeight: 0.88, color: P.coral, maxWidth: '11ch' }}>
            From idea to shipped product
          </h2>
        </div>

        <div>
          {PROCESS_STEPS.map((step, i) => {
            const isActive = i === activeStep
            const inactiveHeadingColor = isDark ? 'rgba(180,200,210,0.7)' : '#0A2729'
            return (
              <article
                key={step.num}
                ref={el => { articleRefs.current[i] = el }}
                className="lp-step"
                style={{ borderBottom: `1px solid ${isActive ? 'rgba(224,90,58,0.5)' : P.border}`, padding: '48px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 24, fontWeight: 400, minWidth: 48, color: isActive ? P.coral : P.dim, transition: 'color 0.5s' }}>
                    {step.num}
                  </span>
                  <div>
                    <h3 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(42px,4.5vw,68px)', lineHeight: 0.9, color: isActive ? P.coral : inactiveHeadingColor, transition: 'color 0.5s' }}>
                      {step.title}
                    </h3>
                    <p style={{ marginTop: 24, maxWidth: '78ch', fontSize: 20, lineHeight: 1.65, fontWeight: 500, fontFamily: "'Hanken Grotesk', sans-serif", color: P.muted, opacity: isActive ? 1 : 0.65, transition: 'opacity 0.5s' }}>
                      {step.body(isActive, P)}
                    </p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── BOLD STATEMENT ────────────────────────────────────────────────────────── */
function BoldStatement() {
  const sectionRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => {
      if (!sectionRef.current || !barRef.current) return
      const rect = sectionRef.current.getBoundingClientRect()
      const wh = window.innerHeight
      if (rect.top < wh && rect.bottom > 0) {
        const progress = (wh - rect.top) / (rect.height + wh)
        barRef.current.style.width = `${Math.min(100, Math.max(0, progress * 108))}%`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section ref={sectionRef} style={{ background: C.dark, padding: 'clamp(65px,7vw,110px) clamp(24px,5vw,64px)', position: 'relative', overflow: 'hidden' }}>
      {/* Top decorative bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.18)' }} />
      <div className="lp-reveal" style={{ maxWidth: '100rem', margin: '0 auto' }}>
        <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(48px,7.5vw,120px)', fontWeight: 400, lineHeight: 0.9, color: '#fff', textTransform: 'uppercase', textAlign: 'center' }}>
          From idea to
          <div style={{marginBottom: 7}}></div>
          shipped product.
        </h2>
      </div>
      {/* Bottom scroll-driven progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.08)' }}>
        <div ref={barRef} style={{ height: '100%', background: C.coral, width: '0%', transition: 'width 0.8s ease-out' }} />
      </div>
    </section>
  )
}

/* ─── FEATURES (flip cards) ─────────────────────────────────────────────────── */
function FeaturesSection() {
  const { isDark } = useTheme()
  const P = mkPalette(isDark)
  return (
    <section id="features" style={{ padding: 'clamp(80px,10vw,144px) clamp(24px,5vw,64px)', background: P.bg, maxWidth: '100rem', margin: '0 auto' }}>
      <p className="lp-label lp-reveal" style={{ marginBottom: 24 }}>Features</p>
      <div style={{ display: 'grid', gap: 20 }} className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" role="list">
        {FEATURES.map((feat, i) => {
          const tc = feat.textLight ? '#fff' : C.text
          const mutedTc = feat.textLight ? 'rgba(255,255,255,0.86)' : 'rgba(28,27,27,0.72)'
          return (
            <div key={feat.num} className={`lp-flip-card lp-reveal lp-d${i + 1}`}
                 style={{ position: 'relative', aspectRatio: '89/128', cursor: 'pointer',
                   border: `2px solid ${P.text}`, boxShadow: `6px 6px 0px ${P.text}` }}
                 role="listitem">
              <div className="lp-flip-inner">
                {/* Front */}
                <div className="lp-flip-face lp-hard-card" style={{ background: feat.bg, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 24 }}>
                  <span aria-hidden style={{ position: 'absolute', right: '-0.1em', bottom: '-0.15em', fontFamily: "'Anton', sans-serif", fontSize: 'clamp(160px,22vw,240px)', lineHeight: 1, color: 'rgba(28,27,27,0.07)', pointerEvents: 'none' }}>
                    {feat.num}
                  </span>
                  <p style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: feat.textLight ? 'rgba(255,255,255,0.72)' : 'rgba(28,27,27,0.72)' }}>
                    {feat.title}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <FeatureIcon num={feat.num} color={tc} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: mutedTc }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, background: feat.textLight ? 'rgba(255,255,255,0.7)' : 'rgba(28,27,27,0.7)', display: 'inline-block' }} />
                      <span style={{ fontFamily: 'monospace' }}>FG-24</span>
                    </span>
                    <span>FG</span>
                  </div>
                </div>

                {/* Back */}
                <div className="lp-flip-face lp-flip-back lp-hard-card" style={{ background: '#0f0f10', display: 'flex', flexDirection: 'column', padding: 24 }}>
                  <p style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', marginBottom: 16 }}>
                    What's included
                  </p>
                  <ul style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {feat.list.map(item => (
                      <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, lineHeight: 1.35 }}>
                        <span style={{ width: 9, height: 9, background: feat.bg, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'rgba(255,255,255,0.86)' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a href="/login" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: feat.bg, padding: '14px 24px', fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#030303', textDecoration: 'none' }}>
                    <span>Explore feature</span>
                    <span>→</span>
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function FeatureIcon({ num, color }: { num: string; color: string }) {
  const icons: Record<string, JSX.Element> = {
    '01': <><rect x="5" y="5" width="6" height="6"/><rect x="13" y="5" width="6" height="6"/><rect x="5" y="13" width="6" height="6"/><rect x="13" y="13" width="6" height="6"/></>,
    '02': <><rect x="5" y="6" width="14" height="3"/><rect x="5" y="11" width="10" height="3"/><rect x="5" y="16" width="7" height="3"/></>,
    '03': <><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="16" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="2"/><line x1="10.5" y1="10.5" x2="13.5" y2="13.5" stroke="currentColor" strokeWidth="1.5"/><line x1="13.5" y1="10.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="1.5"/></>,
    '04': <polyline points="4,18 8,11 12,15 16,7 20,10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>,
  }
  return (
    <svg viewBox="0 0 24 24" width="56" height="56" style={{ color }} fill="currentColor" aria-hidden shapeRendering="crispEdges">
      {icons[num]}
    </svg>
  )
}

/* ─── FAQ ─────────────────────────────────────────────────────────────────── */
function FAQSection() {
  const { isDark } = useTheme()
  const P = mkPalette(isDark)
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section id="faqs" style={{ padding: 'clamp(80px,10vw,144px) clamp(24px,5vw,64px)', background: P.bg, borderTop: `1px solid ${P.border}` }}>
      <div style={{ maxWidth: '100rem', margin: '0 auto', display: 'grid', gap: 64 }} className="lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
        {/* Sticky left */}
        <div className="lp-reveal lg:sticky lg:top-20 lg:self-start">
          <p className="lp-label" style={{ marginBottom: 16 }}>Frequently asked questions</p>
          <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(44px,7vw,68px)', lineHeight: 1, maxWidth: '12ch', color: P.text }}>
            What teams ask before switching to FlowGrid.
          </h2>
          <p style={{ marginTop: 20, maxWidth: '48ch', fontFamily: "'Hanken Grotesk'", fontSize: 16, lineHeight: 1.7, color: P.muted }}>
            Short answers on collaboration, migration, setup, and what happens after you sign up.
          </p>
        </div>

        {/* Accordion */}
        <div className="lp-reveal lp-d1" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIdx === i
            const dotBg = isOpen ? P.coral : (isDark ? 'rgba(237,232,224,0.18)' : 'rgba(28,27,27,0.18)')
            return (
              <div key={i} style={{ borderBottom: `1px solid ${isOpen ? 'rgba(224,90,58,0.5)' : P.border}`, paddingTop: 16, paddingBottom: 16, transition: 'border-color 0.3s' }}>
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '8px 0 8px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                    <span style={{ marginTop: 5, width: 12, height: 12, background: dotBg, flexShrink: 0, display: 'inline-block', transition: 'background 0.25s' }} />
                    <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 18, fontWeight: 700, lineHeight: 1.25, color: isOpen ? P.coral : P.text, transition: 'color 0.25s' }}>
                      {item.q}
                    </span>
                  </span>
                  <span className={`lp-faq-toggle${isOpen ? ' lp-faq-toggle-open' : ''}`} aria-hidden="true"
                        style={{ color: isOpen ? P.coral : P.muted }}>
                    <span className="lp-faq-bar-h" />
                    <span className="lp-faq-bar-v" />
                  </span>
                </button>
                <div style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  opacity: isOpen ? 1 : 0,
                  transition: 'grid-template-rows 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ paddingBottom: 24, paddingTop: 4, fontFamily: "'Hanken Grotesk'", fontSize: 16, lineHeight: 1.7, color: P.muted, maxWidth: '78ch' }}>
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── FOOTER ──────────────────────────────────────────────────────────────── */
const FOOTER_LINKS = [
  {
    label: 'GitHub', href: 'https://github.com/yuvrajsatyapal',
    icon: (
      <svg width="16" height="16" viewBox="0 0 98 96" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/>
      </svg>
    ),
  },
  {
    label: 'Gmail', href: 'yuvrajsatyapal21@gmail.com',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.146C21.69 2.28 24 3.434 24 5.457z"/>
      </svg>
    ),
  },
  {
    label: 'LinkedIn', href: 'https://www.linkedin.com/in/yuvraj-satyapal-295628256',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
]

function Footer() {
  return (
    <footer style={{ background: C.dark, borderTop: '1px solid rgba(255,255,255,0.08)', padding: '24px clamp(24px,5vw,64px) 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <a href="/" style={{ fontFamily: "'Anton', sans-serif", fontSize: 18, color: '#fff', textDecoration: 'none', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          FlowGrid
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 2vw, 12px)' }}>
          <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 'clamp(8px, 2vw, 10px)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginRight: 'clamp(2px, 1vw, 4px)' }}>Connect</span>
          {FOOTER_LINKS.map((s, i) => (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 2vw, 12px)' }}>
              {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 'clamp(10px, 3vw, 14px)', userSelect: 'none' }}>·</span>}
              <a href={s.href} title={s.label} target="_blank" rel="noopener noreferrer"
                 className="scale-[0.82] sm:scale-100"
                 style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', transition: 'color 0.15s' }}
                 onMouseEnter={e => (e.currentTarget.style.color = C.coral)}
                 onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
                {s.icon}
              </a>
            </span>
          ))}
        </div>
      </div>
      <p style={{ fontFamily: "'Hanken Grotesk'", fontSize: 'clamp(7px, 2vw, 10px)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
        <span className="sm:hidden">© 2026 FLOWGRID.</span>
        <span className="hidden sm:inline">© 2026 FLOWGRID. PLAN. BUILD. SHIP.</span>
      </p>
    </footer>
  )
}

/* ─── PAGE ────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const time = useClock()
  const [scrolled, setScrolled] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const toggle = () => setIsDark(d => !d)
  const P = mkPalette(isDark)
  useReveal()

  useEffect(() => {
    document.documentElement.style.background = isDark ? '#111113' : C.dark
    return () => { document.documentElement.style.background = '' }
  }, [isDark])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <ThemeCtx.Provider value={{ isDark, toggle }}>
      <div style={{ background: P.bg, color: P.text, overflowX: 'clip', transition: 'background 0.3s, color 0.3s' }}>
        <LandingNav scrolled={scrolled} />
        <HeroSection time={time} />
        <WhatIsFlowGrid />
        <ProcessSection />
        <BoldStatement />
        <FeaturesSection />
        <FAQSection />
        <Footer />
      </div>
    </ThemeCtx.Provider>
  )
}
