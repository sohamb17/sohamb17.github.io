import { useEffect, useState, type ReactNode } from 'react';
import content from './content.json';

const { profile, projects, experience, education, skills, publications } = content;
const links = [{ href: '#work', label: 'Work' }, { href: '#experience', label: 'Experience' }, { href: '#about', label: 'About' }, { href: '#research', label: 'Research' }];

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{diagonal ? <path d="M6 18 18 6M6 6h12v12" /> : <path d="M4 12h16m-6-6 6 6-6 6" />}</svg>;
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === 'dark'); setReady(true); }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next ? '#101827' : '#ffffff');
    try { localStorage.setItem('soham-theme', next ? 'dark' : 'light'); } catch { /* Theme still works if storage is unavailable. */ }
  }
  return <button className="theme-toggle" type="button" onClick={toggle} aria-label="Dark theme" aria-pressed={dark} hidden={!ready} title={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.8 14.7A9 9 0 0 1 9.3 3.2 9 9 0 1 0 20.8 14.7Z" />}</svg>
  </button>;
}

function SectionTitle({ number, eyebrow, title, children }: { number: string; eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="section-heading"><div><p className="eyebrow"><span className="section-number">{number}</span>{eyebrow}</p><h2>{title}</h2></div>{children}</div>;
}

function FrameSeekDiagram() {
  return <figure className="system-diagram frame-diagram" aria-labelledby="frame-caption">
    <div className="diagram-header"><span className="mono">FRAMESEEK / RETRIEVAL FLOW</span><span className="diagram-badge">3 modalities</span></div>
    <div className="frame-flow">
      <div className="source-stack"><div><span className="source-icon">Aa</span>Transcripts</div><div><span className="source-icon">T<span className="scan-corners" /></span>On-screen text</div><div><span className="source-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 6-6 5 5 3-3 4 4"/></svg></span>Visual embeddings</div></div>
      <div className="flow-connector" aria-hidden="true"><span /><Arrow /></div>
      <div className="retrieval-core"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><strong>Retrieve<br />& rank</strong><span>Relevance scoring</span></div>
    </div>
    <div className="result-line"><span className="mono">OUTPUT</span><div className="result-track" aria-hidden="true"><i /><i /><i /></div><span>Timestamped moments <Arrow /></span></div>
    <figcaption id="frame-caption">Multiple signals. One relevant moment.</figcaption>
  </figure>;
}

function StreamForgeDiagram() {
  return <figure className="system-diagram stream-diagram" aria-labelledby="stream-caption">
    <div className="diagram-header"><span className="mono">STREAMFORGE / FEATURE PIPELINE</span><span className="diagram-badge">Event-driven</span></div>
    <div className="stream-flow"><div className="pipeline-node"><span className="node-icon" aria-hidden="true">≋</span><strong>Kafka</strong><span>Event stream</span></div><Arrow /><div className="pipeline-node emphasis"><span className="node-icon mono" aria-hidden="true">Go</span><strong>Compute</strong><span>Feature vectors</span></div><Arrow /><div className="pipeline-node"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></svg><strong>Serve</strong><span>Redis + gRPC</span></div></div>
    <div className="replication"><div className="replication-nodes" aria-hidden="true">{[0, 1, 2, 3, 4].map(n => <span key={n} className={n === 0 ? 'leader' : ''} />)}</div><span><strong>5-node Raft cluster</strong><small>Replicated state</small></span></div>
    <figcaption id="stream-caption">Fresh features, with fault-tolerant state.</figcaption>
  </figure>;
}

export default function App() {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <a href="#home" className="wordmark" aria-label="Soham Belurgikar, home">sb<span>.</span></a>
      <nav className="desktop-nav" aria-label="Main navigation">{links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <div className="header-actions"><ThemeToggle /><a href="#contact" className="header-contact">Let’s talk <Arrow diagonal /></a>
        <details className="mobile-menu"><summary aria-label="Navigation menu"><span /><span /></summary><nav aria-label="Mobile navigation">{[...links, { href: '#contact', label: 'Contact' }].map(link => <a key={link.href} href={link.href} onClick={e => e.currentTarget.closest('details')?.removeAttribute('open')}>{link.label}</a>)}</nav></details>
      </div>
    </div></header>

    <main id="main">
      <section className="hero container" id="home" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="hero-identity">
            <div className="portrait-frame"><img src={profile.portrait.src} alt={profile.portrait.alt} width="3120" height="4160" fetchPriority="high" /></div>
            <div><p className="eyebrow"><span className="orange-rule" />{profile.role}</p><p className="portrait-location">{profile.location}</p></div>
          </div>
          <h1 id="hero-title">Soham<br />Belurgikar<span className="accent">.</span></h1>
          <p className="hero-specialty">{profile.specialty}</p>
          <p className="hero-intro">{profile.intro}</p>
          <p className="hero-availability">{profile.availability}</p>
          <div className="hero-actions"><a className="button button-primary" href="#work">View projects <Arrow /></a><a className="button button-outline" href="./soham-belurgikar-resume.pdf" download>Download résumé <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4" /></svg></a></div>
          <div className="hero-socials"><a href={profile.github}>GitHub <Arrow diagonal /></a><a href={profile.linkedin}>LinkedIn <Arrow diagonal /></a><a href={`mailto:${profile.email}`}>Email <Arrow diagonal /></a></div>
        </div>
        <aside className="journey-card" aria-label="Education and career at a glance">
          <div className="journey-top"><span className="mono">AT A GLANCE</span><span className="journey-mark" aria-hidden="true">[ sb ]</span></div>
          <p className="journey-title">Built on experience.<br /><span>Driven by curiosity.</span></p>
          <div className="journey-line">
            <div className="journey-item current"><span className="journey-node" /><div><span className="mono">2026 — 2028</span><h2>University of Illinois</h2><p>Master of Computer Science</p><span className="journey-note">Urbana-Champaign · Expected May 2028</span></div></div>
            <div className="journey-item"><span className="journey-node" /><div><span className="mono">2023 — 2026</span><h2>Barclays</h2><p>Software Engineer · BA3 → BA4</p><span className="journey-note">Pune, India</span></div></div>
            <div className="journey-item"><span className="journey-node" /><div><span className="mono">2019 — 2023</span><h2>Sardar Patel Institute</h2><p>B.Tech in Computer Engineering</p><span className="journey-note">Mumbai, India</span></div></div>
          </div>
          <div className="location"><svg width="15" height="18" viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M18 9c0 6-8 13-8 13S2 15 2 9a8 8 0 1 1 16 0Z"/><circle cx="10" cy="9" r="2.5"/></svg>{profile.location}</div>
        </aside>
      </section>

      <section className="section container" id="work" aria-label="Selected work">
        <SectionTitle number="01" eyebrow="SELECTED WORK" title="Ideas, put into systems."><p>From multimodal search to real-time data.<br />Two projects at the intersection of systems and ML.</p></SectionTitle>
        <div className="projects">{projects.map((project, index) => <article className="project" key={project.id}>
          <div className="project-topline"><span className="mono">PROJECT / 0{index + 1}</span><span className="project-category mono">{project.category}</span></div>
          <div className="project-grid"><div className="project-copy"><h3>{project.name}</h3><p className="project-tagline">{project.title}</p><p className="project-description">{project.description}</p><ul className="tech-tags" aria-label={`${project.name} technologies`}>{project.technologies.map(tech => <li key={tech}>{tech}</li>)}</ul></div>{index === 0 ? <FrameSeekDiagram /> : <StreamForgeDiagram />}</div>
          <div className="project-results"><div className="metrics">{project.metrics.map(metric => <div key={metric.unit}><strong>{metric.value}</strong><span>{metric.unit}</span></div>)}</div><p className="project-detail">{project.detail}</p></div>
        </article>)}</div>
      </section>

      <section className="experience-band" id="experience"><div className="section container">
        <SectionTitle number="02" eyebrow="EXPERIENCE" title="Engineering in the real world."><div className="company-label"><strong>Barclays</strong><span>Pune, India</span></div></SectionTitle>
        <div className="experience-list">{experience.map((role, index) => <article className="role" key={role.dates}><div className="role-period"><span className="timeline-pin" aria-hidden="true" /><span className="mono">{role.dates}</span><span className="role-order">0{index + 1}</span></div><div className="role-content"><div className="role-heading"><h3>{role.title}</h3><span className="role-level mono">{role.level}</span></div><p className="role-summary">{role.summary}</p><ul>{role.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}</ul></div></article>)}</div>
      </div></section>

      <section className="section container" id="about">
        <SectionTitle number="03" eyebrow="BACKGROUND & TOOLKIT" title="A foundation to build on." />
        <div className="about-grid"><div className="education"><h3 className="subheading">Education</h3>{education.map((school, i) => <article key={school.shortName} className="school"><div className={`school-monogram ${i === 0 ? 'illinois' : ''}`} aria-hidden="true">{school.shortName}</div><div><h4>{school.school}</h4><p>{school.degree}</p><span className="school-dates">{school.dates}</span><span className="school-detail mono">{school.detail}</span></div></article>)}</div><div className="skills"><h3 className="subheading">Tools I work with</h3>{skills.map(group => <div className="skill-group" key={group.name}><h4>{group.name}</h4><p>{group.items.join(' · ')}</p></div>)}</div></div>
      </section>

      <section className="section research-section container" id="research">
        <SectionTitle number="04" eyebrow="PUBLICATIONS" title="Research, applied."><a className="text-link" href={profile.scholar}>Google Scholar <Arrow diagonal /></a></SectionTitle>
        <div className="publications">{publications.map((paper, i) => <a className="publication" key={paper.url} href={paper.url}><span className="paper-year mono">2023 <span>0{i + 1}</span></span><div><h3>{paper.title}</h3><p>{paper.role} <span aria-hidden="true">/</span> {paper.venue}</p></div><span className="paper-arrow"><Arrow diagonal /></span></a>)}</div>
      </section>

      <section id="contact" className="contact-section"><div className="container contact-inner"><div><p className="eyebrow"><span className="section-number">05</span>LET’S CONNECT</p><h2>Have something<br />in mind<span>?</span></h2><p>I’m looking for Summer 2027 internships in software engineering,<br className="desktop-break" /> distributed systems, and ML infrastructure. Let’s talk.</p><a className="contact-email" href={`mailto:${profile.email}`}>{profile.email}<Arrow diagonal /></a></div><div className="contact-links"><a href={profile.linkedin}>LinkedIn <Arrow diagonal /></a><a href={profile.github}>GitHub <Arrow diagonal /></a><a href="./soham-belurgikar-resume.pdf" download>Résumé <Arrow diagonal /></a></div></div></section>
    </main>
    <footer className="site-footer container"><a href="#home" className="wordmark" aria-label="Back to top">sb<span>.</span></a><p>© {new Date().getFullYear()} {profile.name}</p><a href="#home" className="back-top">Back to top <span aria-hidden="true">↑</span></a></footer>
  </>;
}
