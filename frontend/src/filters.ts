import type { StoryFilters } from "./types/job";

type FilterOption = { value: string; label: string; subtitle?: string };

export const defaultFilters: StoryFilters = {
  visualStyle: "watercolor",
  narratorVoice: "warm_mother",
  readingLevel: "early_reader",
  tone: "cozy",
  pacing: "unhurried",
};

export const FILTER_CONFIG: Array<{
  key: keyof StoryFilters;
  title: string;
  options: FilterOption[];
}> = [
  {
    key: "visualStyle",
    title: "Visual Style",
    options: [
      { value: "watercolor", label: "Watercolor Storybook" },
      { value: "pixar", label: "Pixar / 3D Animation" },
      { value: "ghibli", label: "Studio Ghibli" },
      { value: "paper_cutout", label: "Paper Cutout" },
      { value: "charcoal", label: "Charcoal Sketch" },
      { value: "crayon", label: "Crayon Drawing" },
    ],
  },
  {
    key: "narratorVoice",
    title: "Narrator Voice",
    options: [
      { value: "warm_mother", label: "Warm Mother" },
      { value: "wise_grandfather", label: "Wise Grandfather" },
      { value: "playful_sister", label: "Playful Sister" },
      { value: "gentle_father", label: "Gentle Father" },
      { value: "mysterious_narrator", label: "Mysterious Narrator" },
      { value: "kid_narrator", label: "Kid Narrator" },
    ],
  },
  {
    key: "readingLevel",
    title: "Reading Level",
    options: [
      { value: "toddler", label: "Toddler (2-3)" },
      { value: "early_reader", label: "Early Reader (4-6)" },
      { value: "grade_school", label: "Grade School (7-10)" },
      { value: "advanced", label: "Advanced (11+)" },
    ],
  },
  {
    key: "tone",
    title: "Tone",
    options: [
      { value: "cozy", label: "Cozy" },
      { value: "adventurous", label: "Adventurous" },
      { value: "whimsical", label: "Whimsical" },
      { value: "mysterious", label: "Mysterious" },
      { value: "tender", label: "Tender" },
    ],
  },
  {
    key: "pacing",
    title: "Pacing",
    options: [
      { value: "unhurried", label: "Unhurried" },
      { value: "natural", label: "Natural" },
      { value: "brisk", label: "Brisk" },
    ],
  },
];

export function getFilterLabel(key: keyof StoryFilters, value: string): string {
  const axis = FILTER_CONFIG.find((f) => f.key === key);
  const option = axis?.options.find((o) => o.value === value);
  return option?.label ?? value;
}

