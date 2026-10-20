import {
  variantsOf,
  mealAssessment,
  ingredientsForMeal,
  type Household,
  type Diner,
} from "./household";
import { shoppingFor, type PlannedMeal, type Recipe } from "./db";
export interface IngredientReview {
  id: string;
  week: string;
  ingredientId: string;
  stock?: number;
  sufficient?: boolean;
  purchased: number;
  unavailable: boolean;
}
export const reviewId = (week: string, ingredientId: string) =>
  `${week}:${ingredientId}`;
export function shoppingReview(
  plans: PlannedMeal[],
  recipes: Recipe[],
  reviews: IngredientReview[],
  week: string,
) {
  return shoppingFor(
    plans.filter((p) => p.status !== "no_realizada"),
    recipes,
  ).map((item) => {
    const review = reviews.find((r) => r.id === reviewId(week, item.id));
    const stock = review?.stock ?? 0;
    const purchased = review?.purchased ?? 0;
    return {
      ...item,
      stock,
      purchased,
      reviewed: review?.stock !== undefined || !!review?.sufficient,
      sufficient: !!review?.sufficient,
      unavailable: !!review?.unavailable,
      missing: Math.max(0, item.amount - stock - purchased),
    };
  });
}

// Only propose reductions in shortages; keep fixed and completed meals intact.
export function proposeSubstitutions(
  plans: PlannedMeal[],
  recipes: Recipe[],
  reviews: IngredientReview[],
  week: string,
  priorityNames: string[] = [],
  household?: Household,
  diners: Diner[] = [],
) {
  const draft = plans.map((p) => ({ ...p }));
  const original = shoppingReview(draft, recipes, reviews, week);
  const scarce = original.filter((s) => s.unavailable && s.missing > 0);
  const changes: { planId: string; recipeId: string; variantId?: string }[] =
    [];
  const priorityScore = (recipe: Recipe) =>
    recipe.ingredients.filter((i) =>
      priorityNames.some(
        (n) =>
          n.trim().toLocaleLowerCase("es") ===
          i.name.trim().toLocaleLowerCase("es"),
      ),
    ).length;
  for (const plan of draft) {
    if (plan.locked || (plan.status ?? "pendiente") !== "pendiente") continue;
    const current = recipes.find((r) => r.id === plan.recipeId);
    if (
      !current ||
      !ingredientsForMeal(current, plan).some((i) =>
        scarce.some((s) => s.id === `${i.name.toLowerCase()}|${i.unit}`),
      )
    )
      continue;
    const before = shoppingFor(
      draft.filter((p) => p.status !== "no_realizada"),
      recipes,
    );
    const candidates = recipes
      .filter((r) => !r.mealTypes?.length || r.mealTypes.includes(plan.meal))
      .flatMap((recipe) =>
        variantsOf(recipe)
          .filter(
            (variant) =>
              recipe.id !== plan.recipeId || variant.id !== plan.variantId,
          )
          .map((variant) => ({ recipe, variant })),
      )
      .filter(
        ({ recipe, variant }) =>
          !household ||
          mealAssessment(
            recipe,
            variant.id,
            plan.portions?.map((p) => ({ ...p, omitted: [] })) ?? [
              { dinerId: "single", servings: plan.servings },
            ],
            diners,
            household,
          ).automatic,
      )
      .sort((a, b) => priorityScore(b.recipe) - priorityScore(a.recipe));
    const selected = candidates.find(({ recipe, variant }) => {
      const needs = shoppingFor(
        draft
          .map((p) =>
            p.id === plan.id
              ? {
                  ...p,
                  recipeId: recipe.id,
                  variantId: variant.id,
                  portions: household
                    ? mealAssessment(
                        recipe,
                        variant.id,
                        p.portions?.map((x) => ({ ...x, omitted: [] })) ?? [
                          { dinerId: "single", servings: p.servings },
                        ],
                        diners,
                        household,
                      ).portions
                    : p.portions?.map((x) => ({ ...x, omitted: [] })),
                }
              : p,
          )
          .filter((p) => p.status !== "no_realizada"),
        recipes,
      );
      let improved = false;
      for (const s of original.filter((s) => s.unavailable)) {
        const previous = Math.max(
          0,
          (before.find((n) => n.id === s.id)?.amount ?? 0) -
            s.stock -
            s.purchased,
        );
        const next = Math.max(
          0,
          (needs.find((n) => n.id === s.id)?.amount ?? 0) -
            s.stock -
            s.purchased,
        );
        if (next > previous) return false;
        if (next < previous) improved = true;
      }
      return improved;
    });
    if (selected) {
      plan.recipeId = selected.recipe.id;
      plan.variantId = selected.variant.id;
      plan.portions = household
        ? mealAssessment(
            selected.recipe,
            selected.variant.id,
            plan.portions?.map((x) => ({ ...x, omitted: [] })) ?? [
              { dinerId: "single", servings: plan.servings },
            ],
            diners,
            household,
          ).portions
        : plan.portions?.map((x) => ({ ...x, omitted: [] }));
      changes.push({
        planId: plan.id,
        recipeId: selected.recipe.id,
        variantId: selected.variant.id,
      });
    }
  }
  return changes;
}
