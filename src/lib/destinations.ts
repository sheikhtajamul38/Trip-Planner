/**
 * Structured destination data the planner (and the AI) build itineraries from.
 * Costs are indicative INR figures used only for the budget *estimate*;
 * operators set real prices in their quotes.
 */

export const INTERESTS = ["mountains", "snow", "culture", "food", "relaxation", "adventure"] as const;
export type Interest = (typeof INTERESTS)[number];

export const HOTEL_CATEGORIES = ["standard", "3-star", "4-star", "luxury"] as const;
export type HotelCategory = (typeof HOTEL_CATEGORIES)[number];

export const ACTIVITY_LEVELS = ["relaxed", "moderate", "active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export type DestinationId = "srinagar" | "gulmarg" | "pahalgam" | "sonamarg" | "doodhpathri" | "yusmarg";

export interface Activity {
  name: string;
  tags: Interest[];
  intensity: 1 | 2 | 3;
  /** Indicative per-person cost in INR, if it is a paid activity. */
  costPerPerson?: number;
  /** Months (1–12) the activity is available; all year if omitted. */
  months?: number[];
  family?: boolean;
}

export interface Destination {
  id: DestinationId;
  name: string;
  tagline: string;
  tags: Interest[];
  /** Approximate one-way drive from Srinagar. */
  driveFromSrinagar: string;
  driveHours: number;
  /** false → visited as a day trip from Srinagar. */
  overnight: boolean;
  /** Months it is practical to visit. */
  months: number[];
  seasonalNote?: string;
  /** Indicative room rate per night by hotel category. */
  roomRate: Record<HotelCategory, number>;
  activities: Activity[];
}

const ALL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const WINTER = [12, 1, 2, 3];
const NOT_DEEP_WINTER = [3, 4, 5, 6, 7, 8, 9, 10, 11];

export const DESTINATIONS: Record<DestinationId, Destination> = {
  srinagar: {
    id: "srinagar",
    name: "Srinagar",
    tagline: "Lakes, gardens and the old city — the base for every Kashmir trip",
    tags: ["culture", "food", "relaxation"],
    driveFromSrinagar: "—",
    driveHours: 0,
    overnight: true,
    months: ALL_YEAR,
    roomRate: { standard: 2500, "3-star": 4500, "4-star": 8000, luxury: 15000 },
    activities: [
      { name: "Shikara ride on Dal Lake", tags: ["relaxation"], intensity: 1, costPerPerson: 400, family: true },
      { name: "Nishat and Shalimar Mughal Gardens", tags: ["culture", "relaxation"], intensity: 1, costPerPerson: 50, family: true },
      { name: "Chashme Shahi and Pari Mahal", tags: ["culture"], intensity: 2, costPerPerson: 50, family: true },
      { name: "Old city walk: Jamia Masjid and Khanqah-e-Moula", tags: ["culture"], intensity: 2 },
      { name: "Wazwan dinner at a local restaurant", tags: ["food", "culture"], intensity: 1, costPerPerson: 1200, family: true },
      { name: "Early-morning floating vegetable market", tags: ["culture", "food"], intensity: 1, costPerPerson: 300 },
      { name: "Shankaracharya Temple viewpoint", tags: ["culture", "mountains"], intensity: 2, family: true },
      { name: "Hazratbal Shrine and lakeside walk", tags: ["culture"], intensity: 1, family: true },
      { name: "Indira Gandhi Tulip Garden", tags: ["relaxation"], intensity: 1, costPerPerson: 75, months: [3, 4], family: true },
      { name: "Kahwa and bakery trail in the old city", tags: ["food"], intensity: 1, costPerPerson: 300, family: true },
      { name: "Evening on a houseboat", tags: ["relaxation"], intensity: 1, family: true },
    ],
  },
  gulmarg: {
    id: "gulmarg",
    name: "Gulmarg",
    tagline: "Meadow of flowers in summer, ski slopes in winter",
    tags: ["snow", "mountains", "adventure"],
    driveFromSrinagar: "≈ 50 km, 1.5–2 h",
    driveHours: 2,
    overnight: true,
    months: ALL_YEAR,
    seasonalNote: "Reliable snow usually from late December to March.",
    roomRate: { standard: 3500, "3-star": 6000, "4-star": 11000, luxury: 22000 },
    activities: [
      { name: "Gondola Phase 1 to Kongdori", tags: ["mountains", "snow"], intensity: 1, costPerPerson: 800, family: true },
      { name: "Gondola Phase 2 to Apharwat (weather permitting)", tags: ["mountains", "snow", "adventure"], intensity: 2, costPerPerson: 1000 },
      { name: "Beginner ski or snowboard lesson", tags: ["snow", "adventure"], intensity: 3, costPerPerson: 2500, months: WINTER },
      { name: "Sledge ride on the snow slopes", tags: ["snow"], intensity: 1, costPerPerson: 600, months: WINTER, family: true },
      { name: "Snow-meadow walk around the Gulmarg bowl", tags: ["snow", "mountains"], intensity: 2, months: WINTER, family: true },
      { name: "St. Mary's Church and Maharani Temple", tags: ["culture"], intensity: 1, family: true },
      { name: "Pony ride to Khilanmarg", tags: ["mountains", "adventure"], intensity: 2, costPerPerson: 1200, months: NOT_DEEP_WINTER },
      { name: "Alpather Lake trek (summer, guided)", tags: ["adventure", "mountains"], intensity: 3, costPerPerson: 1500, months: [6, 7, 8, 9] },
      { name: "Strawberry Valley and meadow picnic", tags: ["relaxation", "mountains"], intensity: 1, months: [5, 6, 7, 8, 9, 10], family: true },
    ],
  },
  pahalgam: {
    id: "pahalgam",
    name: "Pahalgam",
    tagline: "River valleys, pine forests and easy meadow walks",
    tags: ["mountains", "relaxation", "adventure"],
    driveFromSrinagar: "≈ 95 km, 2.5–3 h",
    driveHours: 3,
    overnight: true,
    months: ALL_YEAR,
    seasonalNote: "Some valleys are snowbound in deep winter; check access with your operator.",
    roomRate: { standard: 3000, "3-star": 5000, "4-star": 9000, luxury: 18000 },
    activities: [
      { name: "Betaab Valley", tags: ["mountains", "relaxation"], intensity: 1, costPerPerson: 100, family: true },
      { name: "Aru Valley", tags: ["mountains"], intensity: 1, family: true },
      { name: "Chandanwari (snow point in spring)", tags: ["snow", "mountains"], intensity: 2, months: [3, 4, 5, 6], family: true },
      { name: "Riverside walk along the Lidder", tags: ["relaxation"], intensity: 1, family: true },
      { name: "Lidder river rafting (summer)", tags: ["adventure"], intensity: 3, costPerPerson: 1500, months: [5, 6, 7, 8, 9] },
      { name: "Saffron fields and Avantipora ruins en route", tags: ["culture"], intensity: 1, family: true },
      { name: "Trout lunch by the river", tags: ["food"], intensity: 1, costPerPerson: 600, family: true },
    ],
  },
  sonamarg: {
    id: "sonamarg",
    name: "Sonamarg",
    tagline: "Meadow of gold below the Thajiwas glacier",
    tags: ["mountains", "snow", "adventure"],
    driveFromSrinagar: "≈ 80 km, 2.5–3 h",
    driveHours: 3,
    overnight: true,
    months: ALL_YEAR,
    seasonalNote: "Winter road access depends on snowfall; confirm with your operator before booking.",
    roomRate: { standard: 3000, "3-star": 5000, "4-star": 8500, luxury: 15000 },
    activities: [
      { name: "Thajiwas Glacier (pony or walk)", tags: ["mountains", "snow", "adventure"], intensity: 2, costPerPerson: 1200, family: true },
      { name: "Sindh river viewpoints", tags: ["relaxation", "mountains"], intensity: 1, family: true },
      { name: "Snow play near the meadow", tags: ["snow"], intensity: 1, months: WINTER, family: true },
      { name: "Zojila viewpoint drive (road open season)", tags: ["mountains", "adventure"], intensity: 2, costPerPerson: 1000, months: [5, 6, 7, 8, 9, 10] },
      { name: "Vishansar–Krishansar lakes trek start (guided, summer)", tags: ["adventure"], intensity: 3, months: [7, 8, 9] },
    ],
  },
  doodhpathri: {
    id: "doodhpathri",
    name: "Doodhpathri",
    tagline: "Quiet meadows and streams, an easy day trip",
    tags: ["relaxation", "mountains"],
    driveFromSrinagar: "≈ 42 km, 1.5–2 h",
    driveHours: 2,
    overnight: false,
    months: [4, 5, 6, 7, 8, 9, 10],
    roomRate: { standard: 0, "3-star": 0, "4-star": 0, luxury: 0 },
    activities: [
      { name: "Meadow walk and picnic at Doodhpathri", tags: ["relaxation", "mountains"], intensity: 1, family: true },
      { name: "Pony ride along the Shaliganga stream", tags: ["adventure"], intensity: 2, costPerPerson: 800, family: true },
    ],
  },
  yusmarg: {
    id: "yusmarg",
    name: "Yusmarg",
    tagline: "Pine forests and the Nilnag lake, off the usual circuit",
    tags: ["relaxation", "mountains"],
    driveFromSrinagar: "≈ 47 km, 1.5–2 h",
    driveHours: 2,
    overnight: false,
    months: [4, 5, 6, 7, 8, 9, 10],
    roomRate: { standard: 0, "3-star": 0, "4-star": 0, luxury: 0 },
    activities: [
      { name: "Yusmarg meadows and pine forest walk", tags: ["relaxation", "mountains"], intensity: 1, family: true },
      { name: "Walk or pony ride to Nilnag lake", tags: ["adventure", "mountains"], intensity: 2, costPerPerson: 800 },
      { name: "Charar-e-Sharif shrine en route", tags: ["culture"], intensity: 1, family: true },
    ],
  },
};

export const DESTINATION_IDS = Object.keys(DESTINATIONS) as DestinationId[];

export function isDestinationId(v: string): v is DestinationId {
  return v in DESTINATIONS;
}

/** Find destination ids mentioned by name in free text. */
export function findDestinationsInText(text: string): DestinationId[] {
  const lower = text.toLowerCase();
  return DESTINATION_IDS.filter((id) => lower.includes(DESTINATIONS[id].name.toLowerCase())).sort(
    (a, b) => lower.indexOf(DESTINATIONS[a].name.toLowerCase()) - lower.indexOf(DESTINATIONS[b].name.toLowerCase()),
  );
}

export const BUDGET_OPTIONS = [
  { id: "under-50k", label: "Under ₹50k", min: 0, max: 50000 },
  { id: "50-75k", label: "₹50k–75k", min: 50000, max: 75000 },
  { id: "75k-1l", label: "₹75k–1L", min: 75000, max: 100000 },
  { id: "1l-plus", label: "₹1L+", min: 100000, max: null },
] as const;

/** Indicative cab rates per day by vehicle. */
export const VEHICLES = [
  { name: "Sedan (Dzire/Etios)", maxPax: 3, perDay: 3000 },
  { name: "SUV (Innova)", maxPax: 6, perDay: 4500 },
  { name: "Tempo Traveller", maxPax: 12, perDay: 7000 },
] as const;

export const MEALS_PER_PERSON_PER_DAY: Record<HotelCategory, number> = {
  standard: 800,
  "3-star": 1200,
  "4-star": 1800,
  luxury: 3000,
};
