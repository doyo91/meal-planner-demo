import { registerHooks } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith("./")) return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const { mealAssessment, variantsOf, ingredientsForMeal, matchesExclusion } =
  await import("../src/lib/household.ts");
const home = {
  id: "home",
  equipment: ["Placa de cocina", "Freidora de aire"],
  configured: true,
  exclusions: [],
};
const people = [
  { id: "single", name: "Yo", exclusions: [] },
  { id: "partner", name: "Pareja", exclusions: [] },
];
const portions = [
  { dinerId: "single", servings: 1 },
  { dinerId: "partner", servings: 2 },
];
const ingredients = [
  { name: "Patata", amount: 200, unit: "g", component: "side", optional: true },
  {
    name: "Salsa de pistacho",
    amount: 40,
    unit: "g",
    component: "shared",
    allergens: ["Pistacho", "Frutos secos"],
  },
];
const variant = {
  id: "air",
  name: "En freidora de aire",
  minutes: 20,
  servings: 2,
  equipment: ["Freidora de aire"],
  ingredients,
  steps: [{ order: 1, instruction: "Preparar." }],
};
const recipe = {
  id: "r",
  name: "Receta",
  cuisine: "Casera",
  minutes: 20,
  servings: 2,
  ingredients,
  variants: [
    variant,
    { ...variant, id: "oven", equipment: ["Horno"], name: "Al horno" },
  ],
};
const allergy = { id: "a", ingredient: "pistacho", kind: "allergy" };
test("equipment applies to the selected variant, all required devices must exist", () => {
  assert.equal(
    mealAssessment(recipe, "air", portions, people, home).automatic,
    true,
  );
  assert.ok(
    mealAssessment(recipe, "oven", portions, people, home).errors.some((e) =>
      e.includes("Horno"),
    ),
  );
  assert.equal(
    mealAssessment(recipe, "air", portions, people, {
      ...home,
      configured: false,
    }).automatic,
    false,
  );
});
test("shared sauce allergy blocks the common preparation for all participants", () => {
  const diners = [people[0], { ...people[1], exclusions: [allergy] }];
  const result = mealAssessment(recipe, "air", portions, diners, home);
  assert.equal(result.automatic, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Pareja/);
  assert.equal(result.portions[1].omitted.length, 0);
});
test("absent diner restrictions do not affect the meal", () => {
  assert.equal(
    mealAssessment(
      recipe,
      "air",
      [portions[0]],
      [people[0], { ...people[1], exclusions: [allergy] }],
      home,
    ).automatic,
    true,
  );
});
test("optional topping is omitted individually but never automatically approved for allergy", () => {
  const topping = {
    ...recipe,
    variants: [
      {
        ...variant,
        ingredients: [
          {
            name: "Pistacho",
            amount: 20,
            unit: "g",
            component: "topping",
            optional: true,
          },
        ],
      },
    ],
  };
  const result = mealAssessment(
    topping,
    "air",
    portions,
    [people[0], { ...people[1], exclusions: [allergy] }],
    home,
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.needsContactReview, true);
  assert.equal(result.automatic, false);
  assert.deepEqual(result.portions[0].omitted, []);
  assert.deepEqual(result.portions[1].omitted, ["Pistacho"]);
  assert.equal(
    ingredientsForMeal(topping, {
      servings: 3,
      variantId: "air",
      portions: result.portions,
    })[0].amount,
    10,
  );
});
test("disliked side is removed from only that diner and shopping uses individual quantities", () => {
  const diners = [
    {
      ...people[0],
      exclusions: [{ ...allergy, ingredient: "patata", kind: "dislike" }],
    },
    people[1],
  ];
  const result = mealAssessment(recipe, "air", portions, diners, home);
  assert.equal(result.automatic, true);
  const items = ingredientsForMeal(recipe, {
    servings: 3,
    variantId: "air",
    portions: result.portions,
  });
  assert.equal(items.find((i) => i.name === "Patata").amount, 200);
  assert.equal(items.find((i) => i.name === "Salsa de pistacho").amount, 60);
});
test("unknown component and nonoptional sides cannot be silently omitted", () => {
  for (const component of [undefined, "side"]) {
    const r = {
      ...recipe,
      variants: [
        {
          ...variant,
          ingredients: [{ name: "Pistacho", amount: 20, unit: "g", component }],
        },
      ],
    };
    assert.ok(
      mealAssessment(
        r,
        "air",
        portions,
        [{ ...people[0], exclusions: [allergy] }, people[1]],
        home,
      ).errors.length,
    );
  }
});
test("household exclusions apply to guests and names match declared allergens without fuzzy guesses", () => {
  assert.equal(
    mealAssessment(
      recipe,
      "air",
      [{ dinerId: "guest-x", servings: 1 }],
      people,
      { ...home, exclusions: [allergy] },
    ).automatic,
    false,
  );
  assert.equal(
    matchesExclusion(ingredients[1], {
      ...allergy,
      ingredient: "FRUTOS SÉCOS",
    }),
    true,
  );
  assert.equal(
    matchesExclusion({ name: "Pesto", amount: 10, unit: "g" }, allergy),
    false,
  );
});
test("legacy equipment ignores small tools and preserves original quantities", () => {
  const r = {
    ...recipe,
    variants: undefined,
    equipment: ["Horno", "Cuchillo", "Bandeja de horno"],
  };
  assert.deepEqual(variantsOf(r)[0].equipment, ["Horno"]);
  assert.equal(ingredientsForMeal(r, { servings: 1 })[0].amount, 100);
});
test("equipment requirements accumulate and unknown legacy equipment requires editing", () => {
  const legacy = {
    ...recipe,
    variants: undefined,
    equipment: ["Horno", "Olla", "Cuchillo"],
  };
  assert.deepEqual(variantsOf(legacy)[0].equipment, [
    "Horno",
    "Placa de cocina",
  ]);
  assert.ok(
    mealAssessment(
      { ...legacy, equipment: undefined },
      undefined,
      portions,
      people,
      home,
    ).errors.some((e) => e.includes("receta antigua")),
  );
});
test("changing to a shared variant clears stale individual omissions and still blocks allergy", () => {
  const result = mealAssessment(
    recipe,
    "air",
    [{ ...portions[0], omitted: ["Salsa de pistacho"] }],
    [{ ...people[0], exclusions: [allergy] }],
    home,
  );
  assert.equal(result.portions[0].omitted.length, 0);
  assert.equal(result.errors.length, 1);
});
