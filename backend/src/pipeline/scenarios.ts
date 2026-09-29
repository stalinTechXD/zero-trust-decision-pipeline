import type { PipelineRequest } from "../types.js";

export interface Scenario {
  id: string;
  label: string;
  description: string;
  tag: "safe" | "risky";
  request: PipelineRequest;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "safe-order",
    label: "Safe team lunch",
    description: "A modest, allergen-free order that comfortably fits the budget. Sails through the pipeline.",
    tag: "safe",
    request: {
      employeeName: "Priya Sharma",
      teamBudget: 120,
      attendees: 5,
      note: "Sprint retro lunch for the platform team.",
      items: [
        { name: "Garden salad bowls", price: 40, allergens: [] },
        { name: "Grilled chicken wraps", price: 45, allergens: [] },
        { name: "Sparkling water (6-pack)", price: 12, allergens: [] },
      ],
    },
  },
  {
    id: "allergen-order",
    label: "High-risk: allergen alert",
    description: "Within budget, but contains peanuts and shellfish with no accommodation. HR flags high risk.",
    tag: "risky",
    request: {
      employeeName: "Marcus Lee",
      teamBudget: 150,
      attendees: 6,
      note: "Client celebration lunch.",
      items: [
        { name: "Pad thai (peanut sauce)", price: 55, allergens: ["peanuts"] },
        { name: "Shrimp spring rolls", price: 38, allergens: ["shellfish"] },
        { name: "Iced tea jugs", price: 18, allergens: [] },
      ],
    },
  },
  {
    id: "overbudget-order",
    label: "High-risk: budget overrun",
    description: "Allergen-free but blows past the team budget. Finance rejects the spend.",
    tag: "risky",
    request: {
      employeeName: "Dana Whitfield",
      teamBudget: 100,
      attendees: 4,
      note: "Offsite planning lunch.",
      items: [
        { name: "Catered steak platters", price: 140, allergens: [] },
        { name: "Artisan sides", price: 45, allergens: [] },
        { name: "Cold brew coffee", price: 22, allergens: [] },
      ],
    },
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
