"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "motion/react";

// Three.js needs the browser, so skip server rendering for the scene.
const Ocean = dynamic(() => import("./Ocean"), { ssr: false });

const reveal = {
  initial: { opacity: 0, y: 50 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.8, ease: "easeOut" as const },
};

const rise: Variants = {
  hide: { opacity: 0, y: 30 },
  show: (delay: number) => ({ opacity: 1, y: 0, transition: { duration: 0.9, delay } }),
};

const letter: Variants = {
  hide: { opacity: 0, y: 70, filter: "blur(14px)" },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 1.1, delay: 0.2 + i * 0.08, ease: [0.2, 0.7, 0.2, 1] },
  }),
};

const words = ["Coral", "Tide", "Kelp", "Abyss", "Current", "Reef", "Plankton", "Trench", "Lagoon", "Storm"];

const stats = [
  { to: 71, suffix: "%", label: "of Earth is ocean" },
  { to: 50, suffix: "%", label: "of our oxygen" },
  { to: 80, suffix: "%", label: "still unexplored" },
];

const zones = [
  { name: "Sunlight Zone", depth: "0 – 200 m", pct: 8, text: "Warm, bright and crowded. Reefs, turtles and schools of fish live here." },
  { name: "Twilight Zone", depth: "200 – 1,000 m", pct: 25, text: "Light fades to blue gloom. Squid and silver fish rise at night to feed." },
  { name: "Midnight Zone", depth: "1,000 – 4,000 m", pct: 55, text: "Total darkness. Life makes its own light with glowing bodies." },
  { name: "The Abyss", depth: "4,000 – 11,000 m", pct: 100, text: "Crushing pressure and near-freezing water, yet life still finds a way." },
];

const creatures = [
  { icon: "🐢", name: "Sea Turtle", tag: "Ancient wanderer", text: "Crosses entire oceans to return to the beach where it was born." },
  { icon: "🦈", name: "Reef Shark", tag: "Guardian of the reef", text: "Keeps the reef healthy by balancing the fish below it." },
  { icon: "🐋", name: "Humpback Whale", tag: "Singer of the deep", text: "Its songs travel for kilometres through open water." },
  { icon: "🐙", name: "Octopus", tag: "Master of disguise", text: "Changes color and shape in a blink to vanish from sight." },
];

/* ------------------------------ small helpers ----------------------------- */

/** Glow that follows the mouse. */
function Cursor() {
  const x = useMotionValue(-300);
  const y = useMotionValue(-300);
  const sx = useSpring(x, { stiffness: 250, damping: 30 });
  const sy = useSpring(y, { stiffness: 250, damping: 30 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [x, y]);

  return <motion.div className="cursor" style={{ x: sx, y: sy }} />;
}

/** Button that is pulled toward the mouse. */
function Magnetic({ children }: { children: React.ReactNode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 15 });
  const sy = useSpring(y, { stiffness: 200, damping: 15 });

  return (
    <motion.div
      style={{ x: sx, y: sy, display: "inline-block" }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.3);
        y.set((e.clientY - r.top - r.height / 2) * 0.4);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Card that tilts in 3D toward the mouse. */
function Tilt({ children, className }: { children: React.ReactNode; className?: string }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const sx = useSpring(rx, { stiffness: 200, damping: 20 });
  const sy = useSpring(ry, { stiffness: 200, damping: 20 });

  return (
    <motion.article
      className={className}
      style={{ rotateX: sx, rotateY: sy, transformPerspective: 900 }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 16);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 16);
      }}
      onMouseLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      {children}
    </motion.article>
  );
}

/** Number that counts up when it scrolls into view. */
function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, { duration: 2, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => controls.stop();
  }, [inView, to]);

  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}

/* --------------------------------- page ---------------------------------- */

export default function Landing() {
  const [ready, setReady] = useState(false);
  const [sent, setSent] = useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const heroShift = useTransform(scrollY, [0, 500], [0, -80]);
  const depth = useTransform(scrollYProgress, (v) => `${Math.round(v * 11000).toLocaleString()} m`);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1900);
    return () => clearTimeout(t);
  }, []);

  return (
    <main>
      {/* loading curtain */}
      <AnimatePresence>
        {!ready && (
          <motion.div className="loader" exit={{ opacity: 0, transition: { duration: 0.9 } }}>
            <div className="loader-text">THALASSA</div>
            <div className="loader-bar">
              <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="progress" style={{ scaleX: scrollYProgress }} />
      <Cursor />

      <div className="bg">
        <Ocean />
      </div>

      {/* top bar */}
      <header className="topbar">
        <nav className="links">
          <a href="#world">World</a>
          <a href="#zones">Zones</a>
          <a href="#life">Creatures</a>
        </nav>
        <a href="#top" className="logo">
          THALASSA
        </a>
        <a href="#join" className="btn small">
          Join the voyage
        </a>
      </header>

      {/* depth gauge */}
      <aside className="gauge" aria-hidden>
        <span>DEPTH</span>
        <motion.strong>{depth}</motion.strong>
        <i />
      </aside>

      {/* hero */}
      <section id="top" className="hero">
        <motion.div style={{ opacity: heroOpacity, y: heroShift }} className="hero-inner">
          <motion.p className="eyebrow" variants={rise} custom={0.1} initial="hide" animate={ready ? "show" : "hide"}>
            A voyage into the blue
          </motion.p>

          <h1 aria-label="Thalassa">
            {"THALASSA".split("").map((c, i) => (
              <motion.span key={i} className="ch" custom={i} variants={letter} initial="hide" animate={ready ? "show" : "hide"}>
                {c}
              </motion.span>
            ))}
          </h1>

          <motion.p className="tagline" variants={rise} custom={1} initial="hide" animate={ready ? "show" : "hide"}>
            Where the tides whisper, the deep keeps its secrets.
          </motion.p>

          <motion.div className="cta" variants={rise} custom={1.3} initial="hide" animate={ready ? "show" : "hide"}>
            <Magnetic>
              <a href="#world" className="btn">
                Begin the dive
              </a>
            </Magnetic>
            <Magnetic>
              <a href="#life" className="btn ghost">
                Meet the creatures
              </a>
            </Magnetic>
          </motion.div>
        </motion.div>

        <div className="scroll-hint">
          <span>Scroll to descend</span>
          <motion.i animate={{ y: [0, 10, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />
        </div>
      </section>

      {/* marquee */}
      <div className="marquee" aria-hidden>
        <div className="track">
          {[...words, ...words].map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      </div>

      {/* world */}
      <section id="world" className="panel left">
        <motion.div className="text" {...reveal}>
          <p className="eyebrow">Chapter I</p>
          <h2>The Living Sea</h2>
          <p>
            Beneath the waves lies a world older than any city and larger than every continent combined. It feeds us, cools the planet and
            holds mysteries we have only begun to map.
          </p>
          <div className="stats">
            {stats.map((s) => (
              <div key={s.label}>
                <strong>
                  <CountUp to={s.to} suffix={s.suffix} />
                </strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* zones */}
      <section id="zones" className="panel right">
        <div className="text wide">
          <motion.div {...reveal}>
            <p className="eyebrow">Chapter II</p>
            <h2>Five Thousand Fathoms</h2>
          </motion.div>
          <div className="zones">
            {zones.map((z, i) => (
              <motion.div
                key={z.name}
                className="zone"
                initial={{ opacity: 0, x: 60 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                whileHover={{ x: -10 }}
              >
                <span className="depth">{z.depth}</span>
                <h3>{z.name}</h3>
                <p>{z.text}</p>
                <motion.i
                  className="bar"
                  style={{ width: `${z.pct}%` }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: 0.3 + i * 0.1, ease: "easeOut" }}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* creatures */}
      <section id="life" className="panel center">
        <motion.div className="text wide" {...reveal}>
          <p className="eyebrow">Chapter III</p>
          <h2>Those Who Dwell Below</h2>
        </motion.div>
        <div className="cards">
          {creatures.map((c, i) => (
            <motion.div
              key={c.name}
              className="card-wrap"
              initial={{ opacity: 0, y: 60 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.12 }}
              whileHover={{ y: -12 }}
            >
              <Tilt className="card">
                <div className="icon">{c.icon}</div>
                <span className="tag">{c.tag}</span>
                <h3>{c.name}</h3>
                <p>{c.text}</p>
              </Tilt>
            </motion.div>
          ))}
        </div>
      </section>

      {/* join */}
      <section id="join" className="panel center">
        <motion.div className="text join" {...reveal}>
          <p className="eyebrow">Final chapter</p>
          <h2>Protect the Blue</h2>
          <p>Leave your email and we will send news of the ocean, and how you can help keep it alive.</p>
          {sent ? (
            <p className="thanks">Thank you. See you beneath the waves. 🌊</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <input type="email" required placeholder="you@example.com" aria-label="Email" />
              <button className="btn" type="submit">
                Join the voyage
              </button>
            </form>
          )}
        </motion.div>
      </section>

      <footer>© Thalassa. Protect our oceans.</footer>
    </main>
  );
}