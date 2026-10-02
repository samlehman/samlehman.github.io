#!/usr/bin/env node
/**
 * Current moon phase emoji.
 *
 * Uses the mean synodic month (29.530588853 days) anchored to the
 * new moon of 6 January 2000 18:14 UTC. Accurate to about a day for
 * emoji purposes; not an ephemeris.
 */

const PHASES = [
  { emoji: "🌑", name: "New Moon" },
  { emoji: "🌒", name: "Waxing Crescent" },
  { emoji: "🌓", name: "First Quarter" },
  { emoji: "🌔", name: "Waxing Gibbous" },
  { emoji: "🌕", name: "Full Moon" },
  { emoji: "🌖", name: "Waning Gibbous" },
  { emoji: "🌗", name: "Last Quarter" },
  { emoji: "🌘", name: "Waning Crescent" },
];

// Mean length of a lunation, in milliseconds.
const SYNODIC_MONTH_MS = 29.530588853 * 24 * 60 * 60 * 1000;
// Reference new moon: 2000-01-06 18:14 UTC.
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/**
 * @param {Date} [date]
 * @returns {{ emoji: string, name: string, age: number, illumination: number }}
 */
function getMoonPhase(date = new Date()) {
  const cycles = (date.getTime() - KNOWN_NEW_MOON_MS) / SYNODIC_MONTH_MS;
  // Fractional age of the current lunation, 0 = new, 0.5 = full.
  const age = ((cycles % 1) + 1) % 1;
  // Shift by half a bin so named phases sit in the middle of their window.
  const index = Math.floor((age + 1 / 16) * 8) % 8;
  // Simple cosine illumination model (0 at new, 1 at full).
  const illumination = (1 - Math.cos(age * 2 * Math.PI)) / 2;

  return {
    emoji: PHASES[index].emoji,
    name: PHASES[index].name,
    age, // 0..1 through the cycle
    illumination, // 0..1
  };
}

function format(date = new Date()) {
  const phase = getMoonPhase(date);
  const pct = Math.round(phase.illumination * 100);
  const when = date.toLocaleString(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  });
  return `${phase.emoji}  ${phase.name}  (~${pct}% lit)\n${when}`;
}

// Run as a CLI under Node; skipped when loaded with <script> in a browser.
if (typeof require !== "undefined" && require.main === module) {
  const arg = process.argv[2];
  const date = arg ? new Date(arg) : new Date();
  if (Number.isNaN(date.getTime())) {
    console.error("Usage: node moon-phase.js [ISO-date]");
    process.exit(1);
  }
  console.log(format(date));
}

if (typeof module !== "undefined") {
  module.exports = { getMoonPhase, format, PHASES };
}
