import { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/landing.css'

/* ─── palette ──────────────────────────────────────────────────────────────── */
const C = {
  bg: '#F5F0EB',
  text: '#1c1b1b',
  coral: '#E05A3A',
  teal: '#1A7279',
  tealCard: '#4A8B7C',
  blush: '#F2DADA',
  cream: '#FBF7F2',
  dark: '#0f0f10',
  muted: 'rgba(28,27,27,0.55)',
  border: 'rgba(28,27,27,0.12)',
} as const

/* ─── data ─────────────────────────────────────────────────────────────────── */
const HERO_CARDS = [
  { label: 'Boards',    bg: C.cream,    textDark: true,  code: 'FG-BORD-01',
    icon: <><rect x="7" y="7" width="4" height="4"/><rect x="13" y="7" width="4" height="4"/><rect x="7" y="13" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/></> },
  { label: 'Timeline',  bg: C.coral,    textDark: false, code: 'FG-TMLN-02',
    icon: <><rect x="6" y="8" width="12" height="2.5"/><rect x="6" y="12.5" width="9" height="2.5"/><rect x="6" y="17" width="6" height="2.5"/></> },
  { label: 'Analytics', bg: C.tealCard, textDark: false, code: 'FG-ANLT-03',
    icon: <><rect x="6" y="14" width="3" height="6"/><rect x="11" y="10" width="3" height="10"/><rect x="16" y="6" width="3" height="14"/></> },
  { label: 'Real-time', bg: C.blush,    textDark: true,  code: 'FG-RLTM-04',
    icon: <polyline points="5,16 9,10 13,14 17,6 19,10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/> },
]

const PROCESS_STEPS = [
  { num: '01', title: 'Planning',
    body: <>Create a <strong style={{color: C.teal}}>CLEAR STRUCTURE</strong> for every project with drag-and-drop boards, lists, and customisable card fields.</> },
  { num: '02', title: 'Collaborate',
    body: <>Work together with <strong style={{color: C.teal}}>INSTANT REAL-TIME SYNC</strong> — see every cursor, comment, and change appear across all teammates simultaneously.</> },
  { num: '03', title: 'Automate',
    body: <>Remove repetitive work using our smart <strong style={{color: C.teal}}>AUTOMATION ENGINE</strong> — trigger actions, send alerts, and keep pipelines moving without manual effort.</> },
  { num: '04', title: 'Deliver',
    body: <>Export reports and velocity maps to ensure your team <strong style={{color: C.teal}}>SHIPS ON TIME</strong>, every sprint, with full visibility into blockers before they hit.</> },
]

const FEATURES = [
  { num: '01', bg: C.coral,    textLight: true,  title: 'Grid Management',
    desc: 'Visualize your entire pipeline in a high-density grid. See more while doing more.',
    list: ['Kanban & list views', 'Drag-and-drop', 'Custom fields', 'Card templates', 'Bulk actions', 'Priority flags', 'Subtask nesting', 'Due date tracking'] },
  { num: '02', bg: C.cream,    textLight: false, title: 'Atomic Tasks',
    desc: 'Break down complex features into atomic units of work easy to track and assign.',
    list: ['Sub-tasks', 'Dependencies', 'Story points', 'Time tracking', 'Assignments', 'Deadlines', 'Status workflows', 'Labels & tags'] },
  { num: '03', bg: C.tealCard, textLight: true,  title: 'Neural Connect',
    desc: 'Automatically link related tasks across departments using our semantic engine.',
    list: ['Auto-linking', 'Relationship graph', 'Cross-board refs', 'Semantic search', 'Dependency maps', 'Smart suggestions', 'Mention threading', 'Context awareness'] },
  { num: '04', bg: C.blush,    textLight: false, title: 'Velocity Maps',
    desc: "Real-time visualisation of your team's velocity and bottlenecks before they happen.",
    list: ['Sprint burndown', 'Team velocity', 'Cycle time', 'Throughput charts', 'Bottleneck alerts', 'Cumulative flow', 'Lead time', 'Forecast engine'] },
]

const FAQ_ITEMS = [
  { q: 'How is FlowGrid different from Trello?',
    a: "FlowGrid adds multi-dimensional grid views, semantic task linking, real-time presence, and built-in analytics — all missing from Trello's simple list approach. It's built for teams that have outgrown basic kanban." },
  { q: 'Is collaboration really real-time?',
    a: 'Yes. FlowGrid uses WebSocket-based sync that pushes every change in under 50 ms. Cursors, edits, comments, and status changes appear live for everyone on the board.' },
  { q: 'Can we migrate from other tools?',
    a: 'One-click importers cover Trello, Jira, Linear, and Asana. Your cards, attachments, comments, and history migrate intact — no manual re-entry.' },
  { q: 'What is the typical setup time?',
    a: 'Most teams are running their first board in under 10 minutes. Onboarding guides you through workspace creation, board setup, and your first team invite.' },
  { q: 'What happens after we sign up?',
    a: 'You\'ll walk through a 3-step setup to create your workspace and first board. Enterprise customers get a dedicated success manager and custom onboarding session.' },
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

/* ─── word-by-word animated text ────────────────────────────────────────────── */
function AnimatedParagraph({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  const words = text.split(' ')
  return (
    <p ref={ref} style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(24px,3.2vw,48px)', fontWeight: 400, lineHeight: 1.15, opacity: 0.35, maxWidth: '75%' }} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} style={{ display: 'inline-block', marginRight: '0.25em',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
          transition: `opacity 0.4s ${i * 18}ms, transform 0.4s ${i * 18}ms` }}>
          {word}
        </span>
      ))}
    </p>
  )
}

/* ─── NAV ───────────────────────────────────────────────────────────────────── */
function LandingNav({ scrolled }: { scrolled: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header style={{
      position: 'fixed', inset: '0 0 auto 0', zIndex: 50,
      background: scrolled ? 'rgba(245,240,235,0.95)' : C.bg,
      backdropFilter: scrolled ? 'blur(8px)' : 'none',
      borderBottom: scrolled ? `1px solid ${C.border}` : '1px solid transparent',
      transition: 'background 0.3s, border-color 0.3s',
    }}>
      <div style={{ maxWidth: '100rem', margin: '0 auto', padding: '20px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
           className="px-6 md:px-16">
        <a href="/" aria-label="FlowGrid home" style={{ fontFamily: "'Anton', sans-serif", fontSize: 22, letterSpacing: '0.02em', color: C.text, textDecoration: 'none', flexShrink: 0 }}>
          FlowGrid
        </a>

        {/* Desktop nav */}
        <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }} className="hidden md:flex">
          {['Features', 'How it Works', 'Pricing', 'Blog'].map(link => (
            <a key={link} href="#" style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.muted, textDecoration: 'none', borderBottom: '2px solid transparent', transition: 'color 0.2s' }}
               onMouseEnter={e => (e.currentTarget.style.color = C.text)}
               onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
              {link}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 12, fontWeight: 600, color: C.muted }} className="hidden md:inline">EN</span>
          <a href="/login" className="lp-btn" style={{ fontSize: 12, padding: '10px 22px' }}>Get Started Free</a>
          {/* Mobile hamburger */}
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Open menu" className="md:hidden" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              {menuOpen
                ? <><path d="M6 18L18 6" stroke={C.text} strokeWidth="1.8" strokeLinecap="round"/><path d="M6 6L18 18" stroke={C.text} strokeWidth="1.8" strokeLinecap="round"/></>
                : <><path d="M4 7H20" stroke={C.text} strokeWidth="1.8" strokeLinecap="round"/><path d="M4 12H20" stroke={C.text} strokeWidth="1.8" strokeLinecap="round"/><path d="M4 17H20" stroke={C.text} strokeWidth="1.8" strokeLinecap="round"/></>}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: '16px 24px 24px' }} className="md:hidden">
          {['Features', 'How it Works', 'Pricing', 'Blog'].map(link => (
            <a key={link} href="#" style={{ display: 'block', padding: '12px 0', fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text, textDecoration: 'none', borderBottom: `1px solid ${C.border}` }}>
              {link}
            </a>
          ))}
        </div>
      )}
    </header>
  )
}

/* ─── HERO ──────────────────────────────────────────────────────────────────── */
function HeroSection({ time }: { time: string }) {
  return (
    <section style={{ minHeight: '100svh', paddingTop: 80, paddingBottom: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: C.bg }}
             className="px-6 md:px-16">
      {/* headline */}
      <div className="lp-hero-anim lp-hero-d0" style={{ paddingTop: 40 }}>
        <h1 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(44px,7.5vw,128px)', fontWeight: 400, lineHeight: 0.9, letterSpacing: '-0.01em', textTransform: 'none', maxWidth: '14em' }}>
          Organize work.<br />
          <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(50px,8.5vw,140px)', lineHeight: 0.84 }}>Collaborate faster.</span><br />
          Stay in sync.
        </h1>
      </div>

      {/* hero cards */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginTop: 40 }} className="justify-center">
        {HERO_CARDS.map((card, i) => {
          const tc = card.textDark ? 'rgba(28,27,27,0.72)' : 'rgba(255,255,255,0.9)'
          return (
            <div key={card.label} className={`lp-hero-anim lp-hero-d${i + 1} lp-hard-card`}
                 style={{ backgroundColor: card.bg, position: 'relative', overflow: 'hidden', cursor: 'pointer',
                   width: 'clamp(130px, 18vw, 178px)', aspectRatio: '89/128',
                   flexShrink: 0, transition: 'transform 0.3s' }}
                 onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-6px)')}
                 onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
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
              {/* code bottom */}
              <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: tc }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, background: card.textDark ? 'rgba(28,27,27,0.7)' : 'rgba(255,255,255,0.7)', display: 'inline-block' }} />
                  <span style={{ fontFamily: 'monospace' }}>{card.code}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* bottom bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, borderTop: `1px solid ${C.border}`, marginTop: 24 }}>
        <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.muted }}>
          ↓ SCROLL DOWN
        </span>
        <span id="lp-clock" style={{ fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 600, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>
          {time}
        </span>
      </div>
    </section>
  )
}

/* ─── WHAT IS FLOWGRID ──────────────────────────────────────────────────────── */
function WhatIsFlowGrid() {
  return (
    <section style={{ padding: 'clamp(80px, 10vw, 144px) clamp(24px, 5vw, 64px)', background: C.bg, maxWidth: '100rem', margin: '0 auto' }}>
      <p className="lp-label lp-reveal" style={{ marginBottom: 20 }}>What is FlowGrid</p>
      <div className="lp-reveal lp-d1" style={{ maxWidth: '75%' }}>
        <AnimatedParagraph text="FlowGrid is where your team's work lives. We stripped away the noise to build a platform that prioritises clarity over complexity. Designed for high-performance teams who need to move from ideation to delivery without the typical friction of legacy tools." />
      </div>
    </section>
  )
}

/* ─── PROCESS ───────────────────────────────────────────────────────────────── */
function ProcessSection() {
  const [activeStep, setActiveStep] = useState(0)
  const [mobileOpen, setMobileOpen] = useState<number | null>(0)
  const articleRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = articleRefs.current.indexOf(e.target as HTMLElement)
            if (idx !== -1) setActiveStep(idx)
          }
        })
      },
      { threshold: 0.5, rootMargin: '-15% 0px -15% 0px' }
    )
    articleRefs.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const progress = ((activeStep + 1) / PROCESS_STEPS.length) * 100

  return (
    <section style={{ padding: '0 clamp(24px,5vw,64px) clamp(80px,10vw,144px)', background: C.bg }}>
      {/* Mobile: accordion */}
      <div className="lg:hidden">
        <p className="lp-label" style={{ marginBottom: 12 }}>From idea to shipped product</p>
        {PROCESS_STEPS.map((step, i) => (
          <div key={step.num} style={{ borderBottom: `1px solid ${C.border}`, paddingTop: 24, paddingBottom: 24 }}>
            <button style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}
                    aria-expanded={mobileOpen === i}
                    onClick={() => setMobileOpen(mobileOpen === i ? null : i)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 14, fontWeight: 700, marginTop: 2, color: i === mobileOpen ? C.coral : C.muted }}>{step.num}</span>
                <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 30, lineHeight: 1, color: i === mobileOpen ? C.coral : C.text }}>{step.title}</span>
              </div>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" style={{ flexShrink: 0, transform: mobileOpen === i ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.25s', color: i === mobileOpen ? C.coral : C.text }}>
                <path d="M6 18L18 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
                <path d="M11 6H18V13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
              </svg>
            </button>
            {mobileOpen === i && (
              <p style={{ marginTop: 16, fontFamily: "'Hanken Grotesk'", fontSize: 16, lineHeight: 1.7, fontWeight: 500, maxWidth: '82ch', color: 'rgba(28,27,27,0.82)' }}>
                {step.body}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: sticky left + scrolling right */}
      <div className="hidden lg:grid" style={{ gridTemplateColumns: '0.78fr 1.22fr', gap: 80, alignItems: 'start' }}>
        {/* Sticky left */}
        <div style={{ position: 'sticky', top: 80 }}>
          {/* Step counter + progress */}
          <div style={{ marginBottom: 32, maxWidth: '25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: C.muted }}>
              {PROCESS_STEPS.map((s, i) => (
                <span key={s.num} style={{ transition: 'color 0.3s', color: i === activeStep ? C.teal : undefined }}>{s.num}</span>
              ))}
            </div>
            <div style={{ marginTop: 10, height: 8, background: 'rgba(28,27,27,0.1)', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: C.teal, transform: `scaleX(${progress / 100})`, transformOrigin: 'left', transition: 'transform 0.4s ease' }} />
            </div>
          </div>
          <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(58px,7vw,92px)', lineHeight: 0.88, color: C.coral, maxWidth: '11ch' }}>
            From idea to shipped product
          </h2>
        </div>

        {/* Right: articles */}
        <div>
          {PROCESS_STEPS.map((step, i) => {
            const isActive = i === activeStep
            return (
              <article
                key={step.num}
                ref={el => { articleRefs.current[i] = el }}
                style={{
                  borderBottom: `1px solid ${isActive ? 'rgba(26,114,121,0.7)' : C.border}`,
                  padding: '48px 0',
                  transition: 'border-color 0.3s',
                }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                  <span style={{ fontFamily: "'Anton', sans-serif", fontSize: 24, fontWeight: 400, minWidth: 48, color: isActive ? C.coral : C.teal, transition: 'color 0.3s' }}>
                    {step.num}
                  </span>
                  <div>
                    <h3 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(42px,4.5vw,68px)', lineHeight: 0.9, color: isActive ? C.coral : '#0A2729', transition: 'color 0.3s' }}>
                      {step.title}
                    </h3>
                    <p style={{ marginTop: 24, maxWidth: '78ch', fontSize: 20, lineHeight: 1.7, fontWeight: 500, color: 'rgba(28,27,27,0.82)', fontFamily: "'Hanken Grotesk', sans-serif" }}>
                      {step.body}
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
        barRef.current.style.width = `${Math.min(100, Math.max(0, progress * 150))}%`
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <section ref={sectionRef} style={{ background: C.dark, padding: 'clamp(80px,10vw,140px) clamp(24px,5vw,64px)', position: 'relative', overflow: 'hidden' }}>
      <div className="lp-reveal" style={{ maxWidth: '100rem', margin: '0 auto' }}>
        <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(48px,7.5vw,120px)', fontWeight: 400, lineHeight: 0.9, color: '#fff', textTransform: 'uppercase', textAlign: 'center' }}>
          From idea to<br />shipped product.
        </h2>
      </div>
      {/* progress bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.1)' }}>
        <div ref={barRef} style={{ height: '100%', background: C.coral, width: '0%', transition: 'width 0.1s ease-out' }} />
      </div>
    </section>
  )
}

/* ─── FEATURES (flip cards) ─────────────────────────────────────────────────── */
function FeaturesSection() {
  return (
    <section style={{ padding: 'clamp(80px,10vw,144px) clamp(24px,5vw,64px)', background: C.bg, maxWidth: '100rem', margin: '0 auto' }}>
      <p className="lp-label lp-reveal" style={{ marginBottom: 24 }}>Features</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }} className="grid-cols-1 sm:grid-cols-2">
        {FEATURES.map((feat, i) => {
          const tc = feat.textLight ? '#fff' : C.text
          const mutedTc = feat.textLight ? 'rgba(255,255,255,0.86)' : 'rgba(28,27,27,0.72)'
          return (
            <div key={feat.num} className={`lp-flip-card lp-reveal lp-d${i + 1}`}
                 style={{ position: 'relative', aspectRatio: '89/128', maxHeight: 480, cursor: 'pointer' }}>
              <div className="lp-flip-inner">
                {/* Front */}
                <div className="lp-flip-face lp-hard-card" style={{ background: feat.bg, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 24 }}>
                  {/* ghost number */}
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
                    <span>CE</span>
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
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: feat.bg, padding: '14px 24px', fontFamily: "'Hanken Grotesk'", fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#030303' }}>
                    <span>Explore feature</span>
                    <span>→</span>
                  </div>
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

/* ─── FAQ ────────────────────────────────────────────────────────────────────── */
function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)

  return (
    <section style={{ padding: 'clamp(80px,10vw,144px) clamp(24px,5vw,64px)', background: C.bg, borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: '100rem', margin: '0 auto', display: 'grid', gap: 64 }} className="lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
        {/* Sticky left */}
        <div className="lp-reveal lg:sticky lg:top-20 lg:self-start">
          <p className="lp-label" style={{ marginBottom: 16 }}>Frequently asked questions</p>
          <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(44px,7vw,68px)', lineHeight: 0.9, maxWidth: '12ch' }}>
            What teams ask before switching to FlowGrid.
          </h2>
          <p style={{ marginTop: 20, maxWidth: '48ch', fontFamily: "'Hanken Grotesk'", fontSize: 16, lineHeight: 1.7, color: C.muted }}>
            Short answers on collaboration, migration, setup, and what happens after you sign up.
          </p>
        </div>

        {/* Accordion */}
        <div className="lp-reveal lp-d1" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIdx === i
            return (
              <div key={i} style={{ borderBottom: `1px solid ${isOpen ? 'rgba(26,114,121,0.65)' : C.border}`, transition: 'border-color 0.3s' }}>
                <button
                  onClick={() => setOpenIdx(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, padding: '24px 0', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
                    <span style={{ marginTop: 2, width: 12, height: 12, background: isOpen ? C.coral : 'rgba(28,27,27,0.18)', flexShrink: 0, display: 'inline-block', transition: 'background 0.2s' }} />
                    <span style={{ fontFamily: "'Hanken Grotesk'", fontSize: 18, fontWeight: 700, lineHeight: 1.25, color: isOpen ? C.coral : C.text, transition: 'color 0.2s' }}>
                      {item.q}
                    </span>
                  </span>
                  <span style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isOpen ? C.coral : 'rgba(28,27,27,0.8)', transition: 'color 0.2s' }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                      {isOpen
                        ? <rect x="5" y="11" width="14" height="2" rx="1" />
                        : <><rect x="5" y="11" width="14" height="2" rx="1"/><rect x="11" y="5" width="2" height="14" rx="1"/></>}
                    </svg>
                  </span>
                </button>
                <div style={{ overflow: 'hidden', maxHeight: isOpen ? 200 : 0, opacity: isOpen ? 1 : 0, transition: 'max-height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s' }}>
                  <p style={{ paddingBottom: 24, fontFamily: "'Hanken Grotesk'", fontSize: 16, lineHeight: 1.7, color: 'rgba(28,27,27,0.76)', maxWidth: '78ch' }}>
                    {item.a}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ─── CTA ────────────────────────────────────────────────────────────────────── */
function CTASection() {
  const [email, setEmail] = useState('')
  return (
    <section style={{ padding: 'clamp(80px,10vw,144px) clamp(24px,5vw,64px)', background: C.bg, textAlign: 'center' }}>
      <div className="lp-reveal">
        <h2 style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(48px,7.5vw,120px)', fontWeight: 400, lineHeight: 0.9, textTransform: 'uppercase' }}>
          Ready to ship faster?
        </h2>
        <p style={{ marginTop: 20, fontFamily: "'Hanken Grotesk'", fontSize: 18, color: C.muted }}>
          Start free. No credit card required.
        </p>
        <div style={{ marginTop: 32, display: 'flex', gap: 0, maxWidth: 480, margin: '32px auto 0' }}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@company.com"
            style={{ flex: 1, padding: '14px 18px', fontFamily: "'Hanken Grotesk'", fontSize: 15, border: `1px solid rgba(28,27,27,0.25)`, borderRight: 'none', background: '#fff', outline: 'none', borderRadius: 0, minWidth: 0 }}
            onFocus={e => (e.currentTarget.style.borderColor = C.coral)}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(28,27,27,0.25)')}
          />
          <a href="/login" className="lp-btn" style={{ flexShrink: 0 }}>Get Started</a>
        </div>
      </div>
    </section>
  )
}

/* ─── DARK FOOTER REVEAL ────────────────────────────────────────────────────── */
const PANEL_H = 860

function DarkReveal({ children }: { children: React.ReactNode }) {
  const spacerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const onScroll = useCallback(() => {
    if (!spacerRef.current || !panelRef.current) return
    const rect = spacerRef.current.getBoundingClientRect()
    const wh = window.innerHeight
    if (rect.bottom <= 0) {
      panelRef.current.style.transform = 'translateY(0%)'
      panelRef.current.style.pointerEvents = 'auto'
      return
    }
    if (rect.top >= wh) {
      panelRef.current.style.transform = 'translateY(100%)'
      panelRef.current.style.pointerEvents = 'none'
      return
    }
    const scrolled = wh - rect.top
    const total = wh + PANEL_H
    const pct = Math.max(0, Math.min(1, scrolled / total))
    const ty = (1 - pct) * 100
    panelRef.current.style.transform = `translateY(${ty}%)`
    panelRef.current.style.pointerEvents = ty > 99 ? 'none' : 'auto'
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [onScroll])

  return (
    <>
      <div ref={spacerRef} style={{ height: PANEL_H, background: 'transparent' }} aria-hidden="true" />
      <div ref={panelRef} className="lp-dark-panel" style={{ position: 'fixed', inset: `auto 0 0 0`, height: PANEL_H, overflow: 'hidden', zIndex: 20, pointerEvents: 'none', transform: 'translateY(100%)' }}>
        {children}
      </div>
    </>
  )
}

function DarkFooter() {
  return (
    <div style={{ background: C.dark, height: PANEL_H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      {/* Contact section */}
      <section style={{ padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,64px)', maxWidth: '100rem', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gap: 48 }} className="lg:grid-cols-2 lg:gap-16">
          <div>
            <p style={{ fontFamily: "'Hanken Grotesk'", fontSize: 22, lineHeight: 1.4, color: C.coral, marginBottom: 24 }}>
              Have a project to kick off?
            </p>
            <a href="mailto:hello@flowgrid.app" style={{ textDecoration: 'none', display: 'inline-block' }}>
              <div style={{ fontFamily: "'Anton', sans-serif", fontSize: 'clamp(32px,5vw,64px)', color: C.coral, lineHeight: 1, letterSpacing: '-0.01em' }}>
                hello@flowgrid.app
              </div>
            </a>
            <p style={{ marginTop: 24, fontFamily: "'Hanken Grotesk'", fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: '38ch' }}>
              Or just say hi. We read every email and reply within one business day.
            </p>
          </div>
          {/* Quick links */}
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
            {[
              { heading: 'Product', links: ['Features', 'How it Works', 'Pricing', 'Changelog'] },
              { heading: 'Company', links: ['Blog', 'About', 'Careers'] },
              { heading: 'Legal', links: ['Privacy', 'Terms'] },
            ].map(col => (
              <div key={col.heading}>
                <p style={{ fontFamily: "'Hanken Grotesk'", fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
                  {col.heading}
                </p>
                {col.links.map(link => (
                  <a key={link} href="#" style={{ display: 'block', fontFamily: "'Hanken Grotesk'", fontSize: 13, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', marginBottom: 8, transition: 'color 0.15s' }}
                     onMouseEnter={e => (e.currentTarget.style.color = C.coral)}
                     onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}>
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer bar */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '20px clamp(24px,5vw,64px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <a href="/" style={{ fontFamily: "'Anton', sans-serif", fontSize: 20, color: '#fff', textDecoration: 'none', letterSpacing: '0.02em' }}>FlowGrid</a>
        <p style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          {new Date().getFullYear()} / FlowGrid — Built for clarity.
        </p>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: 'GitHub', href: '#' },
            { label: 'X', href: '#' },
            { label: 'LinkedIn', href: '#' },
          ].map(s => (
            <a key={s.label} href={s.href} style={{ fontFamily: "'Hanken Grotesk'", fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', transition: 'color 0.15s' }}
               onMouseEnter={e => (e.currentTarget.style.color = C.coral)}
               onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}>
              {s.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  )
}

/* ─── PAGE ───────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const time = useClock()
  const [scrolled, setScrolled] = useState(false)
  useReveal()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div style={{ background: C.bg, color: C.text, overflowX: 'hidden' }}>
      <LandingNav scrolled={scrolled} />
      <HeroSection time={time} />
      <WhatIsFlowGrid />
      <ProcessSection />
      <BoldStatement />
      <FeaturesSection />
      <FAQSection />
      <CTASection />
      <DarkReveal>
        <DarkFooter />
      </DarkReveal>
    </div>
  )
}
