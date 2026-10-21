import "fake-indexeddb/auto";
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
const { db, shoppingFor } = await import("../src/lib/db.ts");
const { shoppingReview, reviewId } = await import("../src/lib/shopping.ts");
const week = "2026-10-19";
const recipes = [
  {
    id: "r",
    name: "Arroz",
    cuisine: "Casera",
    minutes: 20,
    servings: 2,
    ingredients: [{ name: "Arroz", amount: 200, unit: "g" }],
  },
];
const plans = [
  {
    id: "p",
    date: week,
    meal: "comida",
    recipeId: "r",
    servings: 3,
    status: "pendiente",
  },
];
const review = {
  id: reviewId(week, "arroz|g"),
  week,
  ingredientId: "arroz|g",
  stock: 100,
  purchased: 50,
  unavailable: true,
};
test("scales recipe quantities and subtracts stock and partial purchases", () => {
  const [item] = shoppingReview(plans, recipes, [review], week);
  assert.equal(item.amount, 300);
  assert.equal(item.missing, 150);
  assert.equal(item.unavailable, true);
});
test("reviews never carry into another week or another unit", () => {
  assert.equal(
    shoppingReview(plans, recipes, [review], "2026-10-26")[0].missing,
    300,
  );
  assert.equal(
    shoppingReview(
      plans,
      [
        {
          ...recipes[0],
          ingredients: [{ name: "Arroz", amount: 200, unit: "ud" }],
        },
      ],
      [review],
      week,
    )[0].missing,
    300,
  );
});
test("sufficient stock is finite when servings increase", () => {
  const [item] = shoppingReview(
    plans,
    recipes,
    [{ ...review, sufficient: true, stock: 200, purchased: 0 }],
    week,
  );
  assert.equal(item.missing, 100);
});
test("omitted meals are excluded; overbuying never produces negative amounts", () => {
  assert.deepEqual(
    shoppingReview(
      [{ ...plans[0], status: "no_realizada" }],
      recipes,
      [],
      week,
    ),
    [],
  );
  assert.equal(
    shoppingReview(plans, recipes, [{ ...review, purchased: 500 }], week)[0]
      .missing,
    0,
  );
});
test("migration to version 7 preserves recipes and plans and initializes the main diner", async () => {
  const { default: Dexie } = await import("dexie");
  await db.delete();
  const legacy = new Dexie("meal-planner-demo");
  legacy.version(5).stores({
    recipes: "id, name, cuisine, *seasons, *mealTypes, *tags",
    plans: "id, date, meal, status",
    checks: "id, checked",
    ratings: "id, recipeId, personId, [recipeId+personId]",
    priorities: "id, name",
  });
  await legacy.open();
  await legacy.table("recipes").put(recipes[0]);
  await legacy.table("plans").put(plans[0]);
  legacy.close();
  await db.open();
  assert.equal((await db.recipes.get("r")).name, "Arroz");
  assert.equal((await db.plans.get("p")).servings, 3);
  await db.ingredientReviews.put(review);
  assert.equal(await db.ingredientReviews.count(), 1);
  const { seed } = await import("../src/lib/db.ts");
  await seed();
  assert.equal(db.verno, 7);
  assert.equal((await db.diners.get("single")).name, "Yo");
  assert.equal((await db.recipes.get("r")).name, "Arroz");
  await db.household.put({
    id: "home",
    equipment: ["Horno"],
    configured: true,
    exclusions: [],
  });
  assert.equal((await db.household.get("home")).configured, true);
  db.close();
  await db.delete();
});
test("substitutions reduce shared shortages without changing locked or completed meals", async () => {
  const { proposeSubstitutions } = await import("../src/lib/shopping.ts");
  const alternatives = [
    ...recipes,
    {
      ...recipes[0],
      id: "other",
      name: "Patata",
      ingredients: [{ name: "Patata", amount: 200, unit: "g" }],
    },
  ];
  const menu = [
    ...plans,
    { ...plans[0], id: "p2", meal: "cena" },
    { ...plans[0], id: "fixed", locked: true },
    { ...plans[0], id: "done", status: "realizada" },
  ];
  const changes = proposeSubstitutions(
    menu,
    alternatives,
    [{ ...review, stock: 0, purchased: 0 }],
    week,
  );
  assert.deepEqual(
    changes.map((c) => c.planId),
    ["p", "p2"],
  );
  assert.ok(changes.every((c) => c.recipeId === "other"));
  assert.equal(menu[0].recipeId, "r");
});
test("substitutions respect equipment and diner restrictions, including alternate variants", async () => {
  const { proposeSubstitutions } = await import("../src/lib/shopping.ts");
  const base = { ...recipes[0], equipment: ["Olla"] };
  const deviceVariant = (id, equipment) => ({
    id,
    name: id,
    minutes: 20,
    servings: 2,
    equipment,
    ingredients: [
      { name: "Patata", amount: 200, unit: "g", component: "shared" },
    ],
    steps: [{ order: 1, instruction: "Preparar." }],
  });
  const alternate = {
    ...recipes[0],
    id: "other",
    variants: [
      deviceVariant("oven", ["Horno"]),
      deviceVariant("hob", ["Placa de cocina"]),
    ],
  };
  const home = {
    id: "home",
    equipment: ["Placa de cocina"],
    configured: true,
    exclusions: [],
  };
  const diners = [{ id: "single", name: "Yo", exclusions: [] }];
  const changes = proposeSubstitutions(
    plans,
    [base, alternate],
    [{ ...review, stock: 0, purchased: 0 }],
    week,
    [],
    home,
    diners,
  );
  assert.deepEqual(changes, [
    { planId: "p", recipeId: "other", variantId: "hob" },
  ]);
  assert.deepEqual(
    proposeSubstitutions(
      plans,
      [base, alternate],
      [{ ...review, stock: 0, purchased: 0 }],
      week,
      [],
      home,
      [
        {
          ...diners[0],
          exclusions: [{ id: "a", ingredient: "Patata", kind: "allergy" }],
        },
      ],
    ),
    [],
  );
});
test("shopping guide starts unreviewed and shows only explicitly requested products to buy", async () => {
  const { shoppingGuide } = await import("../src/lib/shopping.ts");
  assert.equal(shoppingGuide(plans, recipes, [], week)[0].intent, undefined);
  const confirmed = {
    ...review,
    intent: "buy",
    checked: false,
    confirmedAmount: 300,
  };
  let item = shoppingGuide(plans, recipes, [confirmed], week)[0];
  assert.equal(item.intent, "buy");
  assert.equal(item.checked, false);
  item = shoppingGuide(
    plans,
    recipes,
    [{ ...confirmed, checked: true }],
    week,
  )[0];
  assert.equal(item.checked, true);
  assert.equal(
    shoppingGuide(plans, recipes, [{ ...confirmed, intent: "home" }], week)[0]
      .intent,
    "home",
  );
});
test("shopping decisions need review after increased demand and are isolated by week", async () => {
  const { shoppingGuide } = await import("../src/lib/shopping.ts");
  const confirmed = {
    ...review,
    intent: "buy",
    checked: true,
    confirmedAmount: 300,
  };
  assert.equal(
    shoppingGuide([{ ...plans[0], servings: 4 }], recipes, [confirmed], week)[0]
      .intent,
    undefined,
  );
  assert.equal(
    shoppingGuide([{ ...plans[0], servings: 2 }], recipes, [confirmed], week)[0]
      .checked,
    true,
  );
  assert.equal(
    shoppingGuide(plans, recipes, [confirmed], "2026-10-26")[0].intent,
    undefined,
  );
  assert.deepEqual(shoppingGuide([], recipes, [confirmed], week), []);
});
test("same ingredient across units has one row and every unit must be reviewed", async () => {
  const { shoppingGuide } = await import("../src/lib/shopping.ts");
  const mixed = [
    {
      ...recipes[0],
      ingredients: [
        ...recipes[0].ingredients,
        { name: "Arroz", amount: 1, unit: "ud" },
      ],
    },
  ];
  const confirmed = { ...review, intent: "home", confirmedAmount: 300 };
  const groups = shoppingGuide(plans, mixed, [confirmed], week);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].intent, undefined);
});
test("legacy quantities remain readable without inventing availability", async () => {
  const { shoppingGuide } = await import("../src/lib/shopping.ts");
  assert.equal(shoppingGuide(plans, recipes, [review], week)[0].intent, "buy");
  assert.equal(
    shoppingGuide(plans, recipes, [{ ...review, stock: 300 }], week)[0].intent,
    "home",
  );
});
