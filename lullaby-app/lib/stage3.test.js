// lib/stage3.test.js
// Run: node lib/stage3.test.js
//
// Requires:
//   K2_THINK_BASE_URL  — K2 Think V2 API base URL
//   K2_THINK_API_KEY   — API key

"use strict";

const { runStage3, assembleImagePrompt } = require("./stage3");

// ─── Test fixtures ─────────────────────────────────────────────────────────
//
// TEST 1 — Clean story, all defaults. Verifies the happy path.
//
// TEST 2 — Messy recording full of real-world spoken artifacts:
//   false starts, self-corrections, mid-sentence restarts, an aside to
//   someone in the room, filler words, and a repeated plot beat.
//   This is the core test of the "bridge" — can K2 Think recover the
//   creator's actual vision from the noise?
//
// TEST 3 — Two characters, charcoal, mysterious, brisk, advanced.
//   Verifies character consistency and that Gemini-facing prompts are
//   specific enough for a model to execute without interpretation.

const TESTS = [
  {
    label: "TEST 1 — Clean story, grade_school, cozy, watercolor",
    input: {
      cleaned_transcript:
        "Once there was a small rabbit named Pip who lived under a big oak tree. " +
        "Every morning Pip would hop to the river to drink fresh water and watch the fish swim by. " +
        "One day a fox appeared on the other bank and stared at Pip with cold yellow eyes. " +
        "Pip froze, then remembered what his mother had told him: the fox cannot cross the stepping stones. " +
        "So Pip sat very still, and eventually the fox turned and walked back into the forest. " +
        "That night Pip fell asleep safe and warm beneath the oak tree roots.",
      filters: {
        visual_style:   "watercolor",
        narrator_voice: "warm_mother",
        reading_level:  "grade_school",
        tone:           "cozy",
        pacing:         "natural",
      },
    },
  },
  {
    label: "TEST 2 — Messy recording with interruptions, toddler, whimsical, ghibli",
    input: {
      // Simulates a real spoken recording: false start, self-correction,
      // a repeated beat, an aside to someone in the room, filler words.
      // The actual story buried inside: a bear finds a jar of honey in the
      // woods, shares it with a small bird, and they become friends.
      cleaned_transcript:
        "okay so um there's this bear right — wait no let me start over. " +
        "there's a big brown bear named Bruno. he lives in the woods. " +
        "one day Bruno is walking and he finds — oh hold on sorry the window's open " +
        "can you close that? okay. so Bruno finds this jar of honey just sitting on a rock. " +
        "and he's really happy about it obviously. he picks it up. " +
        "he's really excited and he picks it up and starts walking home with it. " +
        "then a tiny little bird lands next to him. the bird is very small. " +
        "Bruno shares the honey with the bird even though he didn't have to. " +
        "and the bird just stays. it doesn't leave. they walk home together. the end.",
      filters: {
        visual_style:   "ghibli",
        narrator_voice: "playful_sister",
        reading_level:  "toddler",
        tone:           "whimsical",
        pacing:         "unhurried",
      },
    },
  },
  {
    label: "TEST 3 — Two characters, charcoal, mysterious, brisk, advanced",
    input: {
      cleaned_transcript:
        "The lighthouse keeper Maren had not spoken to anyone in eleven years when the stranger arrived. " +
        "He gave his name as Eirik and said he had been sailing a boat with no compass and no chart. " +
        "Maren studied his hands — calloused, salt-white — and decided he was telling the truth about the sea. " +
        "She showed him the logbook where she recorded every ship that had passed but never docked. " +
        "Eirik turned the pages until he found his own vessel listed there, three times, in three different years. " +
        "He looked up at Maren. She was already looking out the window at the black water below. " +
        "Neither of them spoke for a long time after that.",
      filters: {
        visual_style:   "charcoal",
        narrator_voice: "mysterious_narrator",
        reading_level:  "advanced",
        tone:           "mysterious",
        pacing:         "brisk",
      },
    },
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function hr(char = "─", width = 70) {
  return char.repeat(width);
}

function printResults(label, input, result) {
  console.log(`\n${hr("═")}`);
  console.log(` ${label}`);
  console.log(`${hr("═")}\n`);

  console.log("FULL OUTPUT JSON\n");
  console.log(JSON.stringify(result, null, 2));

  console.log(`\n${hr()}`);
  console.log("SUMMARY");
  console.log(hr());

  console.log(`Characters in character_sheet : ${result.character_sheet.length}`);
  result.character_sheet.forEach(c => {
    console.log(`  • ${c.name} — ${c.silhouette_hint}`);
  });

  console.log(`\nScene count : ${result.scenes.length}`);
  result.scenes.forEach(s => {
    console.log(`  Scene ${s.index}: "${s.beat}" (${s.duration_hint}s) — ${s.ambient_tag}`);
  });

  const origWC   = wordCount(input.cleaned_transcript);
  const scriptWC = wordCount(result.narration_script);
  console.log(`\nWord count — original transcript: ${origWC}  →  narration script: ${scriptWC}`);

  if (result.scenes.length > 0) {
    const first = result.scenes[0];
    const { positive, negative } = assembleImagePrompt(first);
    console.log(`\n${hr()}`);
    console.log("SCENE 1 — ASSEMBLED GEMINI PROMPT");
    console.log(hr());
    console.log("POSITIVE:");
    console.log(positive);
    console.log("\nNEGATIVE:");
    console.log(negative);
  }
}

// ─── Run ───────────────────────────────────────────────────────────────────

async function main() {
  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    process.stdout.write(`\nRunning: ${test.label} ... `);
    try {
      const result = await runStage3(test.input);
      console.log("OK");
      printResults(test.label, test.input, result);
      passed++;
    } catch (err) {
      console.log("FAILED");
      console.log(`\n${hr("═")}`);
      console.log(` FAILED: ${test.label}`);
      console.log(`${hr("═")}\n`);
      console.error(err.message);
      failed++;
    }
  }

  console.log(`\n${hr()}`);
  console.log(`Results: ${passed} passed  ${failed} failed`);
  console.log(hr());

  if (failed > 0) process.exit(1);
}

main();
