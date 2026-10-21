export const MAX_DEPTH = 10935; // Challenger Deep, meters

/** Current depth in meters. Written by <Landing /> while you scroll, read by the 3D scene. */
export const depthStore = { m: 0 };

/** 0..1 position of a depth on the (log) depth ruler. */
export const depthPct = (d: number) => Math.log10(1 + d / 3) / Math.log10(1 + MAX_DEPTH / 3);

export function zoneOf(d: number) {
  if (d < 1) return "Surface";
  if (d < 200) return "Sunlight zone";
  if (d < 1000) return "Twilight zone";
  if (d < 4000) return "Midnight zone";
  if (d < 6000) return "Abyssal zone";
  return "Hadal zone";
}

/** Vertical distance between two stops, in world units. Bigger = deeper sea, animals further apart. */
export const SPACING = 16;

/** World Y where the animals of stop number `i` swim. */
const stopY = (i: number) => -1 - SPACING * (i + 1);
export const yOfStation = (id: string) => stopY(STATIONS.findIndex((s) => s.id === id));

/** Camera Y for a real depth `d`: glides from stop to stop (log scale, same as the depth meter). */
export function camY(d: number) {
  const pts = [{ d: 0, y: 1.5 }, ...STATIONS.map((s, i) => ({ d: s.depth, y: stopY(i) + 1.2 }))];
  if (d <= 0) return pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (d <= b.d) {
      const t = (Math.log(d + 10) - Math.log(a.d + 10)) / (Math.log(b.d + 10) - Math.log(a.d + 10));
      return a.y + (b.y - a.y) * t;
    }
  }
  return pts[pts.length - 1].y;
}

export type Station = {
  id: string;
  depth: number; // meters where this section is centered. MUST get bigger down the list.
  name: string;
  latin: string;
  tagline: string;
  range: [number, number]; // real habitat depth (meters)
  rangeLabel: string;
  accent: string;
  facts: string[];
};

/** Ordered by depth. Each one is a stop on the way down. */
export const STATIONS: Station[] = [
  {
    id: "clownfish",
    depth: 8,
    name: "Clownfish",
    latin: "Amphiprioninae",
    tagline: "Tiny reef residents that live inside the tentacles of sea anemones.",
    range: [1, 15],
    rangeLabel: "1 – 15 m",
    accent: "#ff9a4a",
    facts: [
      "All clownfish are born male. When the female of the group dies, the biggest male changes sex and takes her place.",
      "A coat of special mucus protects it from the stinging tentacles of its home anemone.",
    ],
  },
  {
    id: "bluetang",
    depth: 25,
    name: "Blue Tang",
    latin: "Paracanthurus hepatus",
    tagline: "A bright blue reef grazer that feeds on plankton and travels in groups.",
    range: [2, 40],
    rangeLabel: "2 – 40 m",
    accent: "#4d8dff",
    facts: [
      "Near its tail it carries a razor-sharp, scalpel-like spine, which is why its family is called surgeonfish.",
      "When scared it can wedge itself into a crack and lie still, as if it were dead.",
    ],
  },
  {
    id: "tuna",
    depth: 40,
    name: "Yellowfin Tuna",
    latin: "Thunnus albacares",
    tagline: "A torpedo-shaped speedster of the open ocean.",
    range: [0, 250],
    rangeLabel: "0 – 250 m",
    accent: "#ffd166",
    facts: [
      "It never stops swimming: moving water over its gills is how it breathes.",
      "A yellowfin can sprint at up to roughly 75 km/h.",
    ],
  },
  {
    id: "manta",
    depth: 70,
    name: "Giant Manta Ray",
    latin: "Mobula birostris",
    tagline: "A gentle giant that glides through open water filtering plankton.",
    range: [0, 120],
    rangeLabel: "mostly 0 – 120 m",
    accent: "#7cc4ff",
    facts: [
      "With a wingspan of up to about 7 m, it is the largest ray on Earth.",
      "The pattern of spots on its belly is unique, so scientists can recognise each manta like a fingerprint.",
    ],
  },
  {
    id: "dolphin",
    depth: 120,
    name: "Bottlenose Dolphin",
    latin: "Tursiops truncatus",
    tagline: "A fast, clever hunter that works together with its pod.",
    range: [0, 300],
    rangeLabel: "0 – 300 m (dives)",
    accent: "#4fe3e0",
    facts: [
      "It sleeps with only half of its brain at a time, so it can keep coming up to breathe.",
      "Every dolphin develops its own signature whistle, a bit like a name.",
    ],
  },
  {
    id: "whale",
    depth: 230,
    name: "Humpback Whale",
    latin: "Megaptera novaeangliae",
    tagline: "A giant that sings, leaps and hunts with bubbles.",
    range: [0, 240],
    rangeLabel: "0 – 240 m (dives)",
    accent: "#9aa8ff",
    facts: [
      "Males sing long, complex songs, sometimes for up to 20 minutes, that can be heard many kilometres away.",
      "Groups hunt by blowing a spiral \"net\" of bubbles around fish, then lunging up through it.",
    ],
  },
  {
    id: "shark",
    depth: 1500,
    name: "Bluntnose Sixgill Shark",
    latin: "Hexanchus griseus",
    tagline: "An ancient shark of the dark twilight and midnight waters.",
    range: [90, 2500],
    rangeLabel: "90 – 2,500 m",
    accent: "#8fb4c9",
    facts: [
      "Most sharks have five pairs of gill slits; this one has six, and its family goes back to the age of dinosaurs.",
      "It hides in the dark deep by day and rises toward the surface at night to hunt.",
    ],
  },
  {
    id: "jellyfish",
    depth: 3500,
    name: "Alarm Jellyfish",
    latin: "Atolla",
    tagline: "A jellyfish that screams for help with light.",
    range: [1000, 4000],
    rangeLabel: "1,000 – 4,000 m",
    accent: "#c78bff",
    facts: [
      "When attacked it flashes a ring of blue light that can attract bigger predators to its attacker.",
      "In the open ocean most animals make their own light, a trick called bioluminescence.",
    ],
  },
  {
    id: "snailfish",
    depth: 7500,
    name: "Hadal Snailfish",
    latin: "Pseudoliparis",
    tagline: "A pale, jelly-soft fish that lives where almost nothing else can.",
    range: [6200, 8100],
    rangeLabel: "6,200 – 8,100 m",
    accent: "#ffb3c7",
    facts: [
      "A snailfish holds the record for the deepest fish ever filmed, at about 8,300 m.",
      "Its soft, gelatinous body helps it survive the crushing pressure.",
    ],
  },
  {
    id: "deep",
    depth: 10935,
    name: "Challenger Deep",
    latin: "Mariana Trench, the deepest point on Earth",
    tagline: "The bottom of the sea: cold, silent and dark.",
    range: [10900, 10935],
    rangeLabel: "10,935 m",
    accent: "#e0c28a",
    facts: [
      "The pressure here is more than 1,000 times what you feel at the surface.",
      "Tiny shrimp-like animals called amphipods live even here, in total darkness and near-freezing water.",
    ],
  },
];

/** Which 3D model shows which animal (sea AND the viewer next to each card). Swap files here if a fish is wrong. */
export const MODELS: Record<string, { file?: string; proc?: "snailfish" | "jelly" }> = {
  clownfish: { file: "/Fish2.glb" },
  bluetang: { file: "/Fish3.glb" },
  tuna: { file: "/Fish1.glb" },
  manta: { file: "/Manta.glb" },
  dolphin: { file: "/Dolphin.glb" },
  whale: { file: "/Whale.glb" },
  shark: { file: "/Shark.glb" },
  jellyfish: { proc: "jelly" },
  snailfish: { proc: "snailfish" },
};