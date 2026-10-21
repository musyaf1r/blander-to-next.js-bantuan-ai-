"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useScroll,
  useTransform,
  type MotionValue,
  type Variants,
} from "motion/react";
import { MAX_DEPTH, MODELS, STATIONS, depthPct, depthStore, zoneOf, type Station } from "./data";

// Three.js needs the browser, so skip server rendering for the scene.
const Ocean = dynamic(() => import("./Ocean"), { ssr: false });
const Viewer = dynamic(() => import("./Viewer"), { ssr: false });

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

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

/* ------------------------------ depth meter ------------------------------ */
function DepthRail({ depth }: { depth: MotionValue<number> }) {
  const text = useTransform(depth, (d) => `${fmt(d)} m`);
  const zone = useTransform(depth, (d) => zoneOf(d));
  const top = useTransform(depth, (d) => `${depthPct(d) * 100}%`);

  return (
    <aside className="rail" aria-label="Depth meter">
      <div className="readout">
        <span>DEPTH</span>
        <motion.strong>{text}</motion.strong>
        <motion.em>{zone}</motion.em>
      </div>
      <div className="line">
        <motion.i className="marker" style={{ top }} />
        {STATIONS.map((s) => (
          <button
            key={s.id}
            className="dot"
            style={{ top: `${depthPct(s.depth) * 100}%`, background: s.accent }}
            title={`${s.name} · ${fmt(s.depth)} m`}
            aria-label={`${s.name}, ${fmt(s.depth)} meters`}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          />
        ))}
      </div>
    </aside>
  );
}

/* ------------------------------ animal section ---------------------------- */
/** The 3D model next to a card. Only mounted while it is on screen. */
function ViewerSlot({ model, accent }: { model: (typeof MODELS)[string]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: "150px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="viewer" aria-hidden>
      {on && <Viewer file={model.file} proc={model.proc} accent={accent} />}
    </div>
  );
}

function StationSection({ s, i }: { s: Station; i: number }) {
  const lo = depthPct(s.range[0]) * 100;
  const hi = depthPct(s.range[1]) * 100;
  const model = MODELS[s.id];

  return (
    <section
      id={s.id}
      data-depth={s.depth}
      className={`station ${i % 2 === 0 ? "left" : "right"}`}
      style={{ "--accent": s.accent } as React.CSSProperties}
    >
      <motion.article className="card" {...reveal}>
        <div className="chips">
          <span className="chip strong">{fmt(s.depth)} m</span>
          <span className="chip">{zoneOf(s.depth)}</span>
        </div>

        <h2>{s.name}</h2>
        <p className="latin">{s.latin}</p>
        <p className="lead">{s.tagline}</p>

        <div className="habitat">
          <div className="habitat-head">
            <span>Real habitat depth</span>
            <strong>{s.rangeLabel}</strong>
          </div>
          <div className="scale">
            <motion.i
              style={{ left: `${lo}%`, width: `${Math.max(1.5, hi - lo)}%` }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: 0.3 }}
            />
          </div>
          <div className="scale-ends">
            <span>0 m</span>
            <span>{fmt(MAX_DEPTH)} m</span>
          </div>
        </div>

        <h3 className="fun">Fun facts</h3>
        <ul className="facts">
          {s.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </motion.article>

      {model && <ViewerSlot model={model} accent={s.accent} />}
    </section>
  );
}

/* --------------------------------- page ---------------------------------- */
export default function Landing() {
  const [ready, setReady] = useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const heroShift = useTransform(scrollY, [0, 500], [0, -80]);
  const depth = useMotionValue(0);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1900);
    return () => clearTimeout(t);
  }, []);

  // Depth in meters follows which section is in the middle of the screen.
  useEffect(() => {
    let anchors: { y: number; d: number }[] = [];

    const measure = () => {
      anchors = Array.from(document.querySelectorAll<HTMLElement>("[data-depth]"))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { y: r.top + window.scrollY + r.height / 2, d: Number(el.dataset.depth) };
        })
        .sort((a, b) => a.y - b.y);
    };

    const update = () => {
      if (!anchors.length) return;
      const y = window.scrollY + window.innerHeight / 2;
      const last = anchors[anchors.length - 1];
      let d = anchors[0].d;

      if (y >= last.y) d = last.d;
      else if (y > anchors[0].y) {
        for (let i = 0; i < anchors.length - 1; i++) {
          const a = anchors[i];
          const b = anchors[i + 1];
          if (y >= a.y && y <= b.y) {
            const t = (y - a.y) / (b.y - a.y);
            const la = Math.log(a.d + 10);
            const lb = Math.log(b.d + 10);
            d = Math.exp(la + (lb - la) * t) - 10; // smooth in log space
            break;
          }
        }
      }
      depthStore.m = d;
      depth.set(d);
    };

    const refresh = () => {
      measure();
      update();
    };

    refresh();
    const ro = new ResizeObserver(refresh);
    ro.observe(document.body);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", refresh);
    window.addEventListener("load", refresh);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("load", refresh);
    };
  }, [depth]);

  return (
    <main>
      <AnimatePresence>
        {!ready && (
          <motion.div className="loader" exit={{ opacity: 0, transition: { duration: 0.9 } }}>
            <div className="loader-text">Thalassa</div>
            <div className="loader-bar">
              <motion.i initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="progress" style={{ scaleX: scrollYProgress }} />

      <div className="bg">
        <Ocean />
      </div>

      <header className="topbar">
        <nav className="links">
          <a href="#about">About</a>
          <a href="#clownfish">Dive</a>
          <a href="#deep">Seabed</a>
        </nav>
        <a href="#top" className="logo">
          Thalassa
        </a>
        <a href="#clownfish" className="btn small">
          Start diving
        </a>
      </header>

      <DepthRail depth={depth} />

      {/* hero (0 m) */}
      <section id="top" data-depth={0} className="hero">
        <motion.div style={{ opacity: heroOpacity, y: heroShift }} className="hero-inner">
          <motion.p className="eyebrow" variants={rise} custom={0.1} initial="hide" animate={ready ? "show" : "hide"}>
            A field guide to ocean animals
          </motion.p>
          <motion.h1 variants={rise} custom={0.3} initial="hide" animate={ready ? "show" : "hide"}>
            Thalassa
          </motion.h1>
          <motion.p className="tagline" variants={rise} custom={0.7} initial="hide" animate={ready ? "show" : "hide"}>
            Dive from the sunlit surface to the deepest trench, and meet each animal at the depth where it really lives.
          </motion.p>
          <motion.div className="cta" variants={rise} custom={1} initial="hide" animate={ready ? "show" : "hide"}>
            <a href="#clownfish" className="btn">
              Start the dive
            </a>
            <a href="#about" className="btn ghost">
              What is Thalassa?
            </a>
          </motion.div>
        </motion.div>
        <div className="scroll-hint">
          <span>Scroll to descend</span>
          <motion.i animate={{ y: [0, 10, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />
        </div>
      </section>

      {/* about (0 m) */}
      <section id="about" data-depth={0} className="station center">
        <motion.article className="card wide" style={{ "--accent": "#5eead4" } as React.CSSProperties} {...reveal}>
          <div className="chips">
            <span className="chip strong">About</span>
          </div>
          <h2>What is Thalassa?</h2>
          <p className="latin">Thalassa (θάλασσα) is the Greek word for “the sea”.</p>
          <p className="lead">
            Thalassa is an interactive field guide to ocean animals. Instead of a list of fish, you swim down through the water
            yourself, and every animal appears at the depth where it truly lives, from reef fish in the first few metres to
            snailfish thousands of metres down in the dark.
          </p>
          <div className="how">
            <div>
              <b>1 · Scroll to dive</b>
              <span>The camera sinks as you scroll, and the light fades the deeper you go.</span>
            </div>
            <div>
              <b>2 · Real depth</b>
              <span>The meter on the right shows true depth in metres. Click a dot to jump to an animal.</span>
            </div>
            <div>
              <b>3 · Fun facts</b>
              <span>Every stop shows the animal’s real habitat range and a few things you may not know.</span>
            </div>
          </div>
        </motion.article>
      </section>

      {STATIONS.map((s, i) => (
        <StationSection key={s.id} s={s} i={i} />
      ))}

      <footer>
        <p>Thalassa · A field guide to ocean animals</p>
        <button className="btn small" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Back to the surface ↑
        </button>
      </footer>
    </main>
  );
}