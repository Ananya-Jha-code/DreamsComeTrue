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
  readingLevel: z.enum(["toddler", "early_reader", "grade_school", "advanced"]),
  tone: z.enum(["cozy", "adventurous", "whimsical", "mysterious", "tender"]),
});

export type StoryFilters = z.infer<typeof storyFiltersSchema>;

export const defaultFilters: StoryFilters = {
  visualStyle: "watercolor",
  readingLevel: "early_reader",
  tone: "cozy",
};
