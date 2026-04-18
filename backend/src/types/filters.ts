import { z } from "zod";

/** Five PRD axes — one value each */
export const storyFiltersSchema = z.object({
  visualStyle: z.enum([
    "watercolor",
    "pixar",
    "ghibli",
    "paper_cutout",
    "charcoal",
    "crayon",
  ]),
  narratorVoice: z.enum([
    "warm_mother",
    "wise_grandfather",
    "playful_sister",
    "gentle_father",
    "mysterious_narrator",
    "kid_narrator",
  ]),
  readingLevel: z.enum(["toddler", "early_reader", "grade_school", "advanced"]),
  tone: z.enum(["cozy", "adventurous", "whimsical", "mysterious", "tender"]),
  pacing: z.enum(["unhurried", "natural", "brisk"]),
});

export type StoryFilters = z.infer<typeof storyFiltersSchema>;

export const defaultFilters: StoryFilters = {
  visualStyle: "watercolor",
  narratorVoice: "warm_mother",
  readingLevel: "early_reader",
  tone: "cozy",
  pacing: "unhurried",
};
