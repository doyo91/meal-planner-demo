import type { Ingredient, PlannedMeal, Recipe, RecipeStep } from "./db";
export const equipmentOptions = [
  "Horno",
  "Placa de cocina",
  "Microondas",
  "Freidora de aire",
  "Vaporera",
  "Batidora / trituradora",
  "Robot de cocina",
  "Olla a presión",
] as const;
export type Equipment = (typeof equipmentOptions)[number];
export interface Exclusion {
  id: string;
  ingredient: string;
  kind: "dislike" | "allergy" | "intolerance";
}
export interface Diner {
  id: string;
  name: string;
  exclusions: Exclusion[];
}
export interface Household {
  id: string;
  equipment: Equipment[];
  configured: boolean;
  exclusions: Exclusion[];
}
export interface Portion {
  dinerId: string;
  servings: number;
  omitted?: string[];
}
export interface RecipeVariant {
  id: string;
  name: string;
  minutes: number;
  servings: number;
  equipment: Equipment[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
}
export const defaultHousehold: Household = {
  id: "home",
  equipment: [],
  configured: false,
  exclusions: [],
};
export const normalizeIngredient = (name: string) =>
  name
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
export function variantsOf(recipe: Recipe): RecipeVariant[] {
  if (recipe.variants?.length) return recipe.variants;
  const equipment: Equipment[] = [
    ...new Set<Equipment>(
      (recipe.equipment ?? []).flatMap((e) =>
        equipmentOptions.includes(e as Equipment)
          ? [e as Equipment]
          : ["Olla", "Sartén"].includes(e)
            ? ["Placa de cocina" as Equipment]
            : [],
      ),
    ),
  ];
  return [
    {
      id: "original",
      name: "Preparación original",
      minutes: recipe.minutes,
      servings: recipe.servings,
      equipment,
      ingredients: recipe.ingredients,
      steps: recipe.steps ?? [],
    },
  ];
}
export function variantFor(
  recipe: Recipe,
  plan?: Pick<PlannedMeal, "variantId">,
) {
  return (
    variantsOf(recipe).find((v) => v.id === plan?.variantId) ??
    variantsOf(recipe)[0]
  );
}
export function matchesExclusion(ingredient: Ingredient, exclusion: Exclusion) {
  const target = normalizeIngredient(exclusion.ingredient);
  return [ingredient.name, ...(ingredient.allergens ?? [])].some(
    (n) => normalizeIngredient(n) === target,
  );
}
export function mealAssessment(
  recipe: Recipe,
  variantId: string | undefined,
  portions: Portion[],
  diners: Diner[],
  household: Household,
) {
  const variant = variantFor(recipe, { variantId });
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!household.configured) errors.push("Confirma el equipamiento de casa.");
  if (!recipe.variants?.length && !recipe.equipment?.length)
    errors.push(
      "Revisa el equipamiento imprescindible de esta receta antigua en el editor.",
    );
  for (const device of variant.equipment)
    if (!household.equipment.includes(device))
      errors.push(`Necesitas: ${device}.`);
  const adapted = portions.map((p) => ({ ...p, omitted: [] as string[] }));
  for (const p of adapted) {
    const diner = diners.find((d) => d.id === p.dinerId);
    for (const exclusion of [
      ...household.exclusions,
      ...(diner?.exclusions ?? []),
    ])
      for (const ingredient of variant.ingredients) {
        if (!matchesExclusion(ingredient, exclusion)) continue;
        const separable =
          ingredient.optional &&
          ingredient.component !== "shared" &&
          !!ingredient.component;
        const who = diner?.name ?? "Invitado";
        if (exclusion.kind === "dislike") {
          if (separable) {
            if (!p.omitted!.includes(ingredient.name))
              p.omitted!.push(ingredient.name);
          } else
            warnings.push(
              `${who}: no gusta ${ingredient.name}, integrado en la preparación común.`,
            );
        } else if (separable) {
          if (!p.omitted!.includes(ingredient.name))
            p.omitted!.push(ingredient.name);
          warnings.push(
            `${who}: ${ingredient.name} debe omitirse. Revisa contacto cruzado antes de preparar.`,
          );
        } else
          errors.push(
            `${who}: ${ingredient.name} está en la preparación compartida y tiene una ${exclusion.kind === "allergy" ? "alergia" : "intolerancia"} registrada.`,
          );
      }
  }
  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    portions: adapted,
    automatic: errors.length === 0 && warnings.length === 0,
    needsContactReview: warnings.some((w) => w.includes("contacto cruzado")),
  };
}
export function ingredientsForMeal(
  recipe: Recipe,
  plan: PlannedMeal,
): Ingredient[] {
  const variant = variantFor(recipe, plan);
  return variant.ingredients
    .map((i) => ({
      ...i,
      amount:
        (i.amount *
          (plan.portions?.length
            ? plan.portions.reduce(
                (sum, p) =>
                  sum + (p.omitted?.includes(i.name) ? 0 : p.servings),
                0,
              )
            : plan.servings)) /
        variant.servings,
    }))
    .filter((i) => i.amount > 0);
}
