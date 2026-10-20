<script lang="ts">
  import {
    shoppingReview,
    proposeSubstitutions,
    reviewId,
    type IngredientReview,
  } from "$lib/shopping";
  import { variantExample } from "$lib/example";
  import HouseholdSettings from "$lib/components/HouseholdSettings.svelte";
  import MealOptions from "$lib/components/MealOptions.svelte";
  import RecipeEditor from "$lib/components/RecipeEditor.svelte";
  import {
    defaultHousehold,
    mealAssessment,
    variantsOf,
    ingredientsForMeal,
    type Household,
    type Diner,
  } from "$lib/household";
  import { onMount } from "svelte";
  import {
    db,
    seed,
    weekDates,
    type Recipe,
    type PlannedMeal,
    type Meal,
    type MealStatus,
    type PantryPriority,
    type RecipeRating,
  } from "$lib/db";
  type Tab = "home" | "plan" | "recipes" | "shopping" | "settings";
  let tab = $state<Tab>("home");
  let recipes = $state<Recipe[]>([]);
  let plans = $state<PlannedMeal[]>([]);
  let reviews = $state<IngredientReview[]>([]);
  let creating = $state(false);
  let household = $state<Household>({ ...defaultHousehold });
  let diners = $state<Diner[]>([]);
  let editing = $state(false);
  let detailVariantId = $state("");
  let message = $state("");
  let generating = $state(false);
  let alternatives = $state<
    { planId: string; recipeId: string; variantId?: string }[]
  >([]);
  let proposalMessage = $state("");

  let ready = $state(false);
  let search = $state("");
  let week = $state(weekDates());
  let selectedDay = $state<string | null>(null);
  let priorities = $state<PantryPriority[]>([]);
  let newPriority = $state("");
  let ratings = $state<RecipeRating[]>([]);
  let selectedRecipe = $state<string | null>(null);
  let cuisineFilter = $state("");
  let mealFilter = $state("");
  let seasonFilter = $state("");
  let tagFilter = $state("");
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  let filteredRecipes = $derived(
    recipes.filter(
      (r) =>
        `${r.name} ${r.cuisine} ${(r.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!cuisineFilter || r.cuisine === cuisineFilter) &&
        (!mealFilter || r.mealTypes?.includes(mealFilter as Meal)) &&
        (!seasonFilter || r.seasons?.includes(seasonFilter as "verano")) &&
        (!tagFilter || r.tags?.includes(tagFilter)),
    ),
  );
  let detail = $derived(recipes.find((r) => r.id === selectedRecipe));
  let detailVariant = $derived(
    detail
      ? (variantsOf(detail).find((v) => v.id === detailVariantId) ??
          variantsOf(detail)[0])
      : undefined,
  );
  let issues = $derived(
    plans
      .filter(
        (p) =>
          week.includes(p.date) && (p.status ?? "pendiente") === "pendiente",
      )
      .flatMap((p) => {
        const r = recipes.find((r) => r.id === p.recipeId);
        if (!r) return [];
        const a = assess(r, p);
        return [...a.errors, ...a.warnings].map((text) => ({ plan: p, text }));
      }),
  );
  let cuisines = $derived([...new Set(recipes.map((r) => r.cuisine))].sort());
  let tags = $derived(
    [...new Set(recipes.flatMap((r) => r.tags ?? []))].sort(),
  );
  let shopping = $derived(
    shoppingReview(
      plans.filter((p) => week.includes(p.date)),
      recipes,
      reviews,
      week[0],
    ),
  );
  let affected = $derived(
    plans.filter(
      (p) =>
        week.includes(p.date) &&
        p.status === "pendiente" &&
        ingredientsForMeal(
          recipes.find((r) => r.id === p.recipeId)!,
          p,
        ).some((i) =>
          shopping.some(
            (s) =>
              s.id === `${i.name.toLowerCase()}|${i.unit}` &&
              s.unavailable &&
              s.missing > 0,
          ),
        ),
    ),
  );
  let leftovers = $derived(
    plans
      .filter((p) => p.status === "no_realizada" && p.date < week[0])
      .sort((a, b) => b.date.localeCompare(a.date)),
  );
  const recipeName = (id: string) =>
    recipes.find((r) => r.id === id)?.name ?? "Receta";
  const label = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
    });
  const mealFor = (date: string, meal: Meal) =>
    plans.find((p) => p.date === date && p.meal === meal);

  async function refresh() {
    alternatives = [];
    proposalMessage = "";
    [recipes, plans] = await Promise.all([
      db.recipes.toArray(),
      db.plans.toArray(),
    ]);
    reviews = await db.ingredientReviews.toArray();
    ratings = await db.ratings.toArray();
    priorities = await db.priorities.toArray();
    household = (await db.household.get("home")) ?? { ...defaultHousehold };
    diners = await db.diners.toArray();
  }
  onMount(() => {
    void (async () => {
      await seed();
      await refresh();
      ready = true;
    })();
  });
  function assess(recipe: Recipe, plan: PlannedMeal) {
    return mealAssessment(
      recipe,
      plan.variantId,
      plan.portions ?? [{ dinerId: "single", servings: plan.servings }],
      diners,
      household,
    );
  }
  function compatibleVariant(recipe: Recipe, plan: PlannedMeal) {
    return variantsOf(recipe).find(
      (v) =>
        mealAssessment(
          recipe,
          v.id,
          plan.portions ?? [{ dinerId: "single", servings: plan.servings }],
          diners,
          household,
        ).automatic,
    );
  }
  async function reconcilePending() {
    const home = (await db.household.get("home")) ?? defaultHousehold;
    const people = await db.diners.toArray();
    const pending = await db.plans.toArray();
    for (const plan of pending) {
      if ((plan.status ?? "pendiente") !== "pendiente") continue;
      const recipe = await db.recipes.get(plan.recipeId);
      if (!recipe) continue;
      const portions = plan.portions?.map((p) => ({ ...p, omitted: [] })) ?? [
        { dinerId: "single", servings: plan.servings },
      ];
      await db.plans.update(plan.id, {
        portions: mealAssessment(recipe, plan.variantId, portions, people, home)
          .portions,
        contactReviewed: false,
      });
    }
  }
  async function saveHousehold(value: Household) {
    await db.household.put($state.snapshot(value));
    await reconcilePending();
    await refresh();
  }
  async function saveDiner(value: Diner) {
    await db.diners.put($state.snapshot(value));
    await reconcilePending();
    await refresh();
  }
  async function removeDiner(id: string) {
    if (plans.some((p) => p.portions?.some((x) => x.dinerId === id))) {
      message =
        "Este comensal participa en el menú. Retíralo de los platos antes de eliminarlo.";
      return;
    }
    await db.diners.delete(id);
    await refresh();
  }
  async function savePlan(plan: PlannedMeal) {
    await db.plans.put($state.snapshot(plan));
    await refresh();
  }
  async function choose(date: string, meal: Meal, recipeId: string) {
    const existing = mealFor(date, meal);
    if (!recipeId) {
      if (existing) await db.plans.delete(existing.id);
    } else {
      const recipe = recipes.find((r) => r.id === recipeId)!;
      const plan: PlannedMeal = {
        id: existing?.id ?? crypto.randomUUID(),
        date,
        meal,
        recipeId,
        servings: existing?.servings ?? 1,
        locked: existing?.locked,
        portions: existing?.portions?.map((p) => ({ ...p, omitted: [] })) ?? [
          { dinerId: "single", servings: existing?.servings ?? 1 },
        ],
        status:
          existing?.recipeId === recipeId
            ? (existing.status ?? "pendiente")
            : "pendiente",
      };
      plan.variantId =
        compatibleVariant(recipe, plan)?.id ?? variantsOf(recipe)[0].id;
      plan.portions = assess(recipe, plan).portions;
      await db.plans.put($state.snapshot(plan));
    }
    await refresh();
  }
  async function changeServings(date: string, meal: Meal, value: number) {
    const p = mealFor(date, meal);
    if (p) {
      const servings = Math.max(1, value);
      await db.plans.update(
        p.id,
        $state.snapshot({
          servings,
          portions: p.portions?.map((x) => ({
            ...x,
            servings: (x.servings * servings) / p.servings,
          })),
          contactReviewed: false,
          status: "pendiente" as const,
        }),
      );
      await refresh();
    }
  }
  const normalize = (name: string) => name.trim().toLocaleLowerCase("es");
  const matchingPriorities = (recipe: Recipe) =>
    priorities.filter((p) =>
      recipe.ingredients.some((i) => normalize(i.name) === normalize(p.name)),
    );
  async function addPriority() {
    const name = newPriority.trim();
    if (!name) return;
    if (!priorities.some((p) => normalize(p.name) === normalize(name)))
      await db.priorities.add({
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
      });
    newPriority = "";
    await refresh();
  }
  async function removePriority(id: string) {
    await db.priorities.delete(id);
    await refresh();
  }
  async function generate() {
    if (generating) return;
    generating = true;
    message = "";
    if (!household.configured) {
      message =
        "Confirma el equipamiento en Perfil y hogar antes de generar el menú.";
      generating = false;
      return;
    }
    try {
      const used = new Set(
        plans.filter((p) => week.includes(p.date)).map((p) => p.recipeId),
      );
      for (const date of week)
        for (const meal of ["comida", "cena"] as Meal[]) {
          if (mealFor(date, meal)) continue;
          const draft: PlannedMeal = {
            id: "draft",
            date,
            meal,
            recipeId: "",
            servings: 1,
            portions: [{ dinerId: "single", servings: 1 }],
          };
          const eligible = recipes.filter(
            (r) =>
              (!r.mealTypes?.length || r.mealTypes.includes(meal)) &&
              variantsOf(r).some(
                (v) =>
                  mealAssessment(r, v.id, draft.portions!, diners, household)
                    .automatic &&
                  !v.ingredients.some((i) =>
                    shopping.some(
                      (s) =>
                        s.id === `${i.name.toLowerCase()}|${i.unit}` &&
                        s.unavailable &&
                        s.missing > 0,
                    ),
                  ),
              ),
          );
          const pool = eligible.filter((r) => !used.has(r.id));
          const options = pool.length ? pool : eligible;
          const ranked = [...options].sort(
            (a, b) =>
              matchingPriorities(b).length - matchingPriorities(a).length,
          );
          const top = ranked.length ? matchingPriorities(ranked[0]).length : 0;
          const candidates = top
            ? ranked.filter((r) => matchingPriorities(r).length === top)
            : options;
          const selected =
            candidates[Math.floor(Math.random() * candidates.length)];
          if (selected) {
            const variant = variantsOf(selected).find(
              (v) =>
                mealAssessment(
                  selected,
                  v.id,
                  draft.portions!,
                  diners,
                  household,
                ).automatic &&
                !v.ingredients.some((i) =>
                  shopping.some(
                    (s) =>
                      s.id === `${i.name.toLowerCase()}|${i.unit}` &&
                      s.unavailable &&
                      s.missing > 0,
                  ),
                ),
            )!;
            await db.plans.put({
              ...draft,
              id: crypto.randomUUID(),
              recipeId: selected.id,
              variantId: variant.id,
              portions: mealAssessment(
                selected,
                variant.id,
                draft.portions!,
                diners,
                household,
              ).portions,
              status: "pendiente",
            });
            used.add(selected.id);
          }
        }
      await refresh();
      message =
        "Menú completado con preparaciones compatibles. Si quedan huecos, revisa equipo, restricciones o añade recetas.";
    } finally {
      generating = false;
    }
  }
  async function setStatus(date: string, meal: Meal, status: MealStatus) {
    const p = mealFor(date, meal);
    if (p) {
      const r = recipes.find((r) => r.id === p.recipeId);
      if (r && status === "realizada") {
        const a = assess(r, p);
        if (a.errors.length || (a.needsContactReview && !p.contactReviewed)) {
          message =
            "Revisa el equipamiento y las restricciones desde Editar día antes de registrar la comida.";
          return;
        }
      }
      await db.plans.update(p.id, { status });
      await refresh();
    }
  }
  async function reuse(plan: PlannedMeal) {
    const free = week
      .flatMap((date) =>
        ["comida", "cena"].map((meal) => ({ date, meal: meal as Meal })),
      )
      .find((slot) => !mealFor(slot.date, slot.meal));
    if (!free) return;
    await db.plans.put(
      $state.snapshot({
        ...plan,
        id: crypto.randomUUID(),
        date: free.date,
        meal: free.meal,
        status: "pendiente" as const,
        contactReviewed: false,
        locked: false,
      }),
    );
    await reconcilePending();
    await refresh();
  }
  async function rate(recipeId: string, score: number) {
    await db.ratings.put({
      id: `${recipeId}:single`,
      recipeId,
      personId: "single",
      score,
      updatedAt: new Date().toISOString(),
    });
    await refresh();
  }
  async function reset() {
    if (!confirm("¿Restaurar los datos de prueba?")) return;
    await db.delete();
    await db.open();
    await seed();
    await refresh();
  }
  async function reviewIngredient(
    ingredientId: string,
    changes: Partial<IngredientReview>,
  ) {
    const id = reviewId(week[0], ingredientId);
    await db.ingredientReviews.put({
      id,
      week: week[0],
      ingredientId,
      purchased: 0,
      unavailable: false,
      ...reviews.find((r) => r.id === id),
      ...changes,
    });
    await refresh();
  }
  async function toggleLock(date: string, meal: Meal) {
    const p = mealFor(date, meal);
    if (p) {
      await db.plans.update(p.id, { locked: !p.locked });
      await refresh();
    }
  }
  function proposeAlternatives() {
    alternatives = proposeSubstitutions(
      plans.filter((p) => week.includes(p.date)),
      recipes,
      reviews,
      week[0],
      priorities.map((p) => p.name),
      household,
      diners,
    );
    proposalMessage = alternatives.length
      ? "Revisa los cambios antes de aplicarlos."
      : "No hay sustituciones que reduzcan los ingredientes pendientes. Revisa los platos manualmente o añade recetas.";
  }
  async function applyAlternatives() {
    await db.transaction("rw", db.plans, async () => {
      for (const change of alternatives)
        await db.plans.update(change.planId, {
          recipeId: change.recipeId,
          variantId: change.variantId,
          contactReviewed: false,
          portions: mealAssessment(
            recipes.find((r) => r.id === change.recipeId)!,
            change.variantId,
            plans
              .find((p) => p.id === change.planId)
              ?.portions?.map((p) => ({ ...p, omitted: [] })) ?? [
              {
                dinerId: "single",
                servings:
                  plans.find((p) => p.id === change.planId)?.servings ?? 1,
              },
            ],
            diners,
            household,
          ).portions,
        });
    });
    await refresh();
  }
  async function saveRecipe(recipe: Recipe) {
    if (
      plans.some(
        (p) =>
          p.recipeId === recipe.id &&
          !variantsOf(recipe).some((v) => v.id === (p.variantId ?? "original")),
      )
    ) {
      message =
        "Hay platos que usan una preparación eliminada. Cambia su preparación en el menú antes de quitarla.";
      return;
    }
    await db.recipes.put($state.snapshot(recipe));
    await reconcilePending();
    creating = false;
    editing = false;
    selectedRecipe = recipe.id;
    detailVariantId = "";
    await refresh();
  }

  function moveWeek(direction: number) {
    const d = new Date(`${week[0]}T12:00:00`);
    d.setDate(d.getDate() + 7 * direction);
    week = weekDates(d);
    selectedDay = null;
    alternatives = [];
    proposalMessage = "";
  }
</script>

<svelte:head
  ><title>Menú de casa · Demo</title><meta
    name="description"
    content="Planificador semanal local de comidas"
  /></svelte:head
>
<div class="app">
  <header>
    <div>
      <small class="eyebrow">PROTOTIPO LOCAL</small>
      <h1>Menú de casa <span>✳</span></h1>
      <p>Organiza la semana, cocina sin complicaciones.</p>
    </div>
    <span class="pill">Sin cuenta</span>
  </header>
  <main>
    {#if message}<div class="panel" role="status">
        {message}<button class="back" onclick={() => (message = "")}
          >Cerrar</button
        >
      </div>{/if}
    {#if !ready}<p>Cargando datos locales…</p>
    {:else if tab === "home"}
      <section class="topline">
        <div>
          <h2>Hoy</h2>
          <p>
            {new Date(`${today}T12:00:00`).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <button
          class="primary"
          onclick={() => {
            week = weekDates(new Date(`${today}T12:00:00`));
            selectedDay = today;
            tab = "plan";
          }}>Editar día</button
        >
      </section>
      <div class="today-grid">
        {#each ["comida", "cena"] as meal}
          <article class="panel today-meal">
            <small class="eyebrow"
              >{meal === "comida" ? "COMIDA" : "CENA"}</small
            >
            {#if mealFor(today, meal as Meal)}
              <h3>{recipeName(mealFor(today, meal as Meal)!.recipeId)}</h3>
              <p class="hint">
                {mealFor(today, meal as Meal)?.servings}
                {mealFor(today, meal as Meal)?.servings === 1
                  ? "ración"
                  : "raciones"} · {mealFor(today, meal as Meal)?.status ===
                "realizada"
                  ? "Realizada"
                  : mealFor(today, meal as Meal)?.status === "no_realizada"
                    ? "No realizada"
                    : "Pendiente"}
              </p>
              <div class="servings">
                <span>Raciones</span><button
                  onclick={() =>
                    changeServings(
                      today,
                      meal as Meal,
                      (mealFor(today, meal as Meal)?.servings ?? 1) - 1,
                    )}>−</button
                ><b>{mealFor(today, meal as Meal)?.servings}</b><button
                  onclick={() =>
                    changeServings(
                      today,
                      meal as Meal,
                      (mealFor(today, meal as Meal)?.servings ?? 1) + 1,
                    )}>+</button
                >
              </div>
              <div class="status-row">
                {#each [{ value: "pendiente", label: "Pendiente" }, { value: "realizada", label: "Realizada" }, { value: "no_realizada", label: "No realizada" }] as state}<button
                    class:status-active={(mealFor(today, meal as Meal)
                      ?.status ?? "pendiente") === state.value}
                    onclick={() =>
                      setStatus(today, meal as Meal, state.value as MealStatus)}
                    >{state.label}</button
                  >{/each}
              </div>
              {#each [...assess( recipes.find((r) => r.id === mealFor(today, meal as Meal)?.recipeId)!, mealFor(today, meal as Meal)! ).errors, ...assess( recipes.find((r) => r.id === mealFor(today, meal as Meal)?.recipeId)!, mealFor(today, meal as Meal)! ).warnings] as warning}<p
                  class="hint"
                >
                  {warning}
                </p>{/each}
              <button
                class="back"
                onclick={() => {
                  selectedRecipe = mealFor(today, meal as Meal)!.recipeId;
                  tab = "recipes";
                }}>Ver receta →</button
              >
              {#if mealFor(today, meal as Meal)?.status === "realizada"}<p>
                  Mi valoración: {ratings.find(
                    (r) =>
                      r.recipeId === mealFor(today, meal as Meal)?.recipeId,
                  )?.score ?? "Sin valorar"}
                </p>
                <div class="rate">
                  {#each [1, 2, 3, 4, 5] as score}<button
                      onclick={() =>
                        rate(mealFor(today, meal as Meal)!.recipeId, score)}
                      aria-label={`Valorar ${score} estrellas`}
                      >★ {score}</button
                    >{/each}
                </div>{/if}
            {:else}<h3>Sin planificar</h3>
              <p class="hint">
                Todavía no has elegido una receta para esta {meal}.
              </p>{/if}
            <button
              class="today-edit"
              onclick={() => {
                week = weekDates(new Date(`${today}T12:00:00`));
                selectedDay = today;
                tab = "plan";
              }}
              >{mealFor(today, meal as Meal)
                ? "Cambiar plato →"
                : "Planificar plato →"}</button
            >
          </article>{/each}
      </div>
      <button
        class="today-planning"
        onclick={() => {
          selectedDay = null;
          tab = "plan";
        }}>Ver planificación semanal →</button
      >
    {:else if tab === "plan"}
      <section class="topline">
        <div>
          <h2>Tu semana</h2>
          <p>Comidas y cenas para tu hogar</p>
        </div>
        <button class="primary" disabled={generating} onclick={generate}
          >{generating ? "Generando…" : "Completar menú"}</button
        >
      </section>
      <div class="panel priority-panel">
        <h3>Productos que quiero gastar</h3>
        <p class="hint">
          Añade ingredientes que ya tienes. Al completar el menú, se priorizarán
          las recetas que los utilicen. No se descuentan automáticamente de la
          compra.
        </p>
        <div class="priority-entry">
          <input
            aria-label="Ingrediente que quiero gastar"
            placeholder="Ej. calabacín, huevos, arroz…"
            bind:value={newPriority}
            onkeydown={(e) => {
              if (e.key === "Enter") addPriority();
            }}
          /><button class="primary" onclick={addPriority}>Añadir</button>
        </div>
        <div class="chiprow">
          {#each priorities as item}<span class="chip priority-chip"
              >{item.name}<button
                aria-label={`Quitar ${item.name}`}
                onclick={() => removePriority(item.id)}>×</button
              ></span
            >{/each}
        </div>
      </div>
      {#if issues.length}<div class="panel">
          <h3>Revisar compatibilidad del menú</h3>
          {#each issues as issue}<button
              class="back"
              onclick={() => (selectedDay = issue.plan.date)}
              >{label(issue.plan.date)} · {issue.plan.meal}: {issue.text}</button
            >{/each}
        </div>{/if}
      <button class="today-planning" onclick={() => (tab = "shopping")}
        >Revisar ingredientes y preparar compra →</button
      >
      <div class="weeknav">
        <button onclick={() => moveWeek(-1)} aria-label="Semana anterior"
          >‹</button
        ><strong>{label(week[0])} — {label(week[6])}</strong><button
          onclick={() => moveWeek(1)}
          aria-label="Semana siguiente">›</button
        >
      </div>
      {#if selectedDay}
        <div class="panel">
          <button class="back" onclick={() => (selectedDay = null)}
            >← Volver a la semana</button
          >
          <h2>
            {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h2>
          <p class="hint">
            Edita los platos, las raciones y lo que finalmente has cocinado.
          </p>
          {#each ["comida", "cena"] as meal}
            <div class="day-meal">
              <h3>{meal === "comida" ? "Comida" : "Cena"}</h3>
              <select
                aria-label={`Receta de ${meal}`}
                value={mealFor(selectedDay, meal as Meal)?.recipeId ?? ""}
                onchange={(e) =>
                  choose(selectedDay!, meal as Meal, e.currentTarget.value)}
                ><option value="">Sin planificar</option
                >{#each recipes as recipe}<option value={recipe.id}
                    >{recipe.name}</option
                  >{/each}</select
              >
              {#if mealFor(selectedDay, meal as Meal)}
                <MealOptions
                  plan={mealFor(selectedDay, meal as Meal)!}
                  recipe={recipes.find(
                    (r) =>
                      r.id === mealFor(selectedDay!, meal as Meal)?.recipeId,
                  )!}
                  {household}
                  {diners}
                  save={savePlan}
                />
                <button
                  class="back"
                  onclick={() => toggleLock(selectedDay!, meal as Meal)}
                  >{mealFor(selectedDay, meal as Meal)?.locked
                    ? "🔒 Plato fijado · liberar"
                    : "Fijar plato"}</button
                >
                <div class="servings">
                  <span>Raciones</span><button
                    onclick={() =>
                      changeServings(
                        selectedDay!,
                        meal as Meal,
                        (mealFor(selectedDay!, meal as Meal)?.servings ?? 1) -
                          1,
                      )}>−</button
                  ><b>{mealFor(selectedDay!, meal as Meal)?.servings}</b><button
                    onclick={() =>
                      changeServings(
                        selectedDay!,
                        meal as Meal,
                        (mealFor(selectedDay!, meal as Meal)?.servings ?? 1) +
                          1,
                      )}>+</button
                  >
                </div>
                <div class="status-row">
                  {#each [{ value: "pendiente", label: "Pendiente" }, { value: "realizada", label: "Realizada" }, { value: "no_realizada", label: "No realizada" }] as state}<button
                      class:status-active={(mealFor(selectedDay!, meal as Meal)
                        ?.status ?? "pendiente") === state.value}
                      onclick={() =>
                        setStatus(
                          selectedDay!,
                          meal as Meal,
                          state.value as MealStatus,
                        )}>{state.label}</button
                    >{/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="days">
          {#each week as date, i}<button
              class="day day-select"
              onclick={() => (selectedDay = date)}
              ><div class="dayhead">
                <strong>{days[i]} <span>{label(date)}</span></strong><small
                  >Editar día →</small
                >
              </div>
              <div class="meals">
                {#each ["comida", "cena"] as meal}<div class="meal">
                    <strong>{meal === "comida" ? "Comida" : "Cena"}</strong>
                    <p>
                      {mealFor(date, meal as Meal)
                        ? recipeName(mealFor(date, meal as Meal)!.recipeId)
                        : "Sin planificar"}
                    </p>
                    {#if mealFor(date, meal as Meal)}<small
                        >{mealFor(date, meal as Meal)?.locked
                          ? "🔒 "
                          : ""}{mealFor(date, meal as Meal)?.servings} ración(es)
                        · {mealFor(date, meal as Meal)?.status === "realizada"
                          ? "Realizada"
                          : mealFor(date, meal as Meal)?.status ===
                              "no_realizada"
                            ? "No realizada"
                            : "Pendiente"}</small
                      >{/if}
                  </div>{/each}
              </div></button
            >{/each}
        </div>
        {#if leftovers.length}<div class="panel">
            <h3>Recetas pendientes de aprovechar</h3>
            <p class="hint">
              Comidas anteriores marcadas como no realizadas. Se proponen para
              reutilizar, sin asumir que conservas todos sus ingredientes.
            </p>
            {#each leftovers as p}<div class="reuse-row">
                <span
                  >{recipeName(p.recipeId)}
                  <small>({label(p.date)})</small></span
                ><button
                  onclick={() => reuse(p)}
                  disabled={!week.some((d) =>
                    ["comida", "cena"].some((m) => !mealFor(d, m as Meal)),
                  )}>Añadir a hueco libre</button
                >
              </div>{/each}
          </div>{/if}
      {/if}
    {:else if tab === "recipes"}
      <section class="topline">
        <div>
          <h2>Recetario</h2>
          <p>{filteredRecipes.length} de {recipes.length} recetas</p>
        </div>
        <button
          class="primary"
          onclick={() => {
            creating = !creating;
            editing = false;
            selectedRecipe = null;
          }}>Nueva receta</button
        >
      </section>
      {#if creating || editing}{#key editing ? selectedRecipe : "new"}<RecipeEditor
            recipe={editing ? detail : undefined}
            save={saveRecipe}
            cancel={() => {
              creating = false;
              editing = false;
            }}
          />{/key}{/if}
      {#if !recipes.some((r) => r.id === variantExample.id)}<button
          class="back"
          onclick={async () => {
            const recipe = {
              ...variantExample,
              ingredients: variantExample.variants![0].ingredients,
            };
            await db.recipes.add($state.snapshot(recipe));
            await refresh();
            selectedRecipe = recipe.id;
          }}>Añadir ejemplo para probar variantes y alergias</button
        >{/if}
      <input
        class="search"
        placeholder="Buscar receta, cocina o etiqueta…"
        bind:value={search}
      />
      <div class="filters">
        <select aria-label="Cocina" bind:value={cuisineFilter}
          ><option value="">Todas las cocinas</option
          >{#each cuisines as cuisine}<option value={cuisine}>{cuisine}</option
            >{/each}</select
        >
        <select aria-label="Momento" bind:value={mealFilter}
          ><option value="">Comida o cena</option><option value="comida"
            >Comida</option
          ><option value="cena">Cena</option></select
        >
        <select aria-label="Estación" bind:value={seasonFilter}
          ><option value="">Todas las estaciones</option
          >{#each ["primavera", "verano", "otoño", "invierno"] as season}<option
              value={season}>{season}</option
            >{/each}</select
        >
        <select aria-label="Etiqueta" bind:value={tagFilter}
          ><option value="">Todas las etiquetas</option
          >{#each tags as tag}<option value={tag}>{tag}</option>{/each}</select
        >
      </div>
      {#if detail}
        <article class="panel recipe-detail">
          <button class="back" onclick={() => (selectedRecipe = null)}
            >← Volver a recetas</button
          ><small>{detail.cuisine} · {detail.minutes} min</small>
          <h2>{detail.name}</h2>
          <p>{detail.description}</p>
          <button
            class="back"
            onclick={() => {
              editing = true;
              creating = false;
            }}>Editar receta y preparaciones</button
          >
          <label
            >Preparación<select
              aria-label="Preparación de receta"
              value={detailVariant?.id}
              onchange={(e) => (detailVariantId = e.currentTarget.value)}
              >{#each variantsOf(detail) as v}<option value={v.id}
                  >{v.name} · {v.minutes} min</option
                >{/each}</select
            ></label
          >
          <div class="chiprow">
            {#each detail.tags ?? [] as tag}<span class="chip">{tag}</span
              >{/each}{#each detail.seasons ?? [] as season}<span class="chip"
                >{season}</span
              >{/each}
          </div>
          <h3>Ingredientes para una ración</h3>
          <p class="hint">
            Cantidades calculadas a partir de la receta base ({detailVariant?.servings}
            raciones).
          </p>
          <div class="ingredient-list">
            {#each detailVariant?.ingredients ?? [] as ingredient}<div>
                <span
                  >{ingredient.name}
                  <small
                    >· {ingredient.component === "side"
                      ? "Guarnición"
                      : ingredient.component === "topping"
                        ? "Añadido al servir"
                        : "Base compartida"}{ingredient.optional
                      ? " · Se puede omitir"
                      : ""}</small
                  ></span
                ><strong
                  >{Number(
                    (
                      ingredient.amount / (detailVariant?.servings ?? 1)
                    ).toFixed(1),
                  )}
                  {ingredient.unit}</strong
                >
              </div>{/each}
          </div>
          <h3>Preparación</h3>
          <ol class="steps">
            {#each detailVariant?.steps ?? [] as step}<li>
                {step.instruction}
              </li>{/each}
          </ol>
          <h3>Equipamiento imprescindible</h3>
          <div class="chiprow">
            {#each detailVariant?.equipment ?? [] as tool}<span class="chip"
                >{tool}</span
              >{/each}
          </div>
          <h3>Ingredientes de temporada</h3>
          <p>
            {detail.seasonalIngredients?.length
              ? detail.seasonalIngredients.join(", ")
              : "No se han identificado ingredientes estacionales relevantes."}
          </p>
          <h3>Mi valoración</h3>
          <p>
            {ratings.find(
              (r) => r.recipeId === detail.id && r.personId === "single",
            )?.score ?? "Sin valorar"} / 5
          </p>
          <div class="rate">
            {#each [1, 2, 3, 4, 5] as star}<button
                aria-label={`Valorar ${star} estrellas`}
                onclick={() => rate(detail.id, star)}>★ {star}</button
              >{/each}
          </div>
        </article>
      {:else}
        <div class="recipegrid">
          {#each filteredRecipes as r}<button
              class="recipecard recipe-button"
              onclick={() => {
                selectedRecipe = r.id;
                detailVariantId = "";
                editing = false;
              }}
              ><div class="recipeicon">◈</div>
              <div>
                <small>{r.cuisine} · {r.minutes} min</small>
                <h3>{r.name}</h3>
                <p>{r.description}</p>
                <div class="chiprow">
                  {#each (r.tags ?? []).slice(0, 3) as tag}<span class="chip"
                      >{tag}</span
                    >{/each}
                </div>
                <small
                  >★ {ratings.find(
                    (v) => v.recipeId === r.id && v.personId === "single",
                  )?.score ?? "—"}</small
                >
              </div></button
            >{/each}
        </div>
      {/if}
    {:else if tab === "shopping"}
      <section class="topline">
        <div>
          <h2>Ingredientes y compra</h2>
          <p>{label(week[0])} — {label(week[6])}</p>
        </div>
        <button class="back" onclick={() => (tab = "plan")}>Ver menú →</button>
      </section>
      <div class="weeknav">
        <button onclick={() => moveWeek(-1)} aria-label="Semana anterior"
          >‹</button
        ><strong>{label(week[0])} — {label(week[6])}</strong><button
          onclick={() => moveWeek(1)}
          aria-label="Semana siguiente">›</button
        >
      </div>
      <p class="hint">
        1. Revisa lo que tienes para esta semana. 2. Registra lo comprado. 3.
        Revisa los platos si falta algún producto. Las existencias se confirman
        por semana; no se trasladan ni consumen automáticamente.
      </p>
      <div class="summary">
        <strong
          >{shopping.filter((i) => i.missing > 0).length} productos pendientes</strong
        ><span>{shopping.filter((i) => !i.reviewed).length} sin revisar</span>
      </div>
      {#each shopping as item}
        <article class="panel ingredient-review">
          <h3>
            {item.name}
            <small
              >Necesario: {Number(item.amount.toFixed(2))} {item.unit}</small
            >
          </h3>
          <div class="status-row">
            <button
              onclick={() =>
                reviewIngredient(item.id, {
                  stock: item.amount,
                  sufficient: true,
                })}>Tengo suficiente</button
            ><button
              onclick={() =>
                reviewIngredient(item.id, { stock: 0, sufficient: false })}
              >No tengo</button
            ><button
              onclick={() =>
                reviewIngredient(item.id, {
                  stock: undefined,
                  sufficient: false,
                })}>Revisar después</button
            >
          </div>
          <div class="quantity-grid">
            <label
              >Tengo ({item.unit})<input
                aria-label={`Tengo ${item.name}`}
                type="number"
                min="0"
                step="any"
                value={item.reviewed ? item.stock : ""}
                onchange={(e) => {
                  const n = e.currentTarget.valueAsNumber;
                  if (Number.isFinite(n) && n >= 0)
                    reviewIngredient(item.id, { stock: n, sufficient: false });
                }}
              /></label
            ><label
              >Comprado ({item.unit})<input
                aria-label={`Comprado ${item.name}`}
                type="number"
                min="0"
                step="any"
                value={item.purchased}
                onchange={(e) => {
                  const n = e.currentTarget.valueAsNumber;
                  if (Number.isFinite(n) && n >= 0)
                    reviewIngredient(item.id, { purchased: n });
                }}
              /></label
            >
          </div>
          <p>
            <strong
              >{item.missing > 0
                ? `Falta: ${Number(item.missing.toFixed(2))} ${item.unit}`
                : "Cantidad cubierta"}</strong
            >
            · {item.reviewed
              ? "Existencias revisadas"
              : "Existencias sin revisar"}
          </p>
          <div class="status-row">
            <button
              onclick={() =>
                reviewIngredient(item.id, {
                  purchased: item.purchased + item.missing,
                  unavailable: false,
                })}
              disabled={!item.missing}>Comprado lo que falta</button
            ><button
              class:status-active={item.unavailable}
              onclick={() =>
                reviewIngredient(item.id, { unavailable: !item.unavailable })}
              >{item.unavailable
                ? "No conseguido · desmarcar"
                : "No lo he conseguido"}</button
            >
          </div>
        </article>
      {:else}<div class="empty">
          Planifica alguna comida para revisar ingredientes.
        </div>{/each}
      {#if affected.length}<div class="panel">
          <h3>Platos que necesitan revisión</h3>
          <button class="primary" onclick={proposeAlternatives}
            >Proponer sustituciones</button
          >
          <p class="hint">
            Faltan productos que no has conseguido. Puedes cambiar estos platos;
            completar el menú evitará esos ingredientes. Los platos fijados se
            conservan. No se modifica ningún plato sin que lo elijas.
          </p>
          {#each affected as p}<button
              class="today-planning"
              onclick={() => {
                selectedDay = p.date;
                tab = "plan";
              }}>{label(p.date)} · {p.meal}: {recipeName(p.recipeId)} →</button
            >{/each}{#if proposalMessage}<p role="status">
              {proposalMessage}
            </p>{/if}{#if alternatives.length}<ul>
              {#each alternatives as change}<li>
                  {recipeName(
                    plans.find((p) => p.id === change.planId)!.recipeId,
                  )} → {recipeName(change.recipeId)}
                </li>{/each}
            </ul>
            <button class="primary" onclick={applyAlternatives}
              >Aplicar cambios propuestos</button
            ><button
              class="back"
              onclick={() => {
                alternatives = [];
                proposalMessage = "";
              }}>Descartar</button
            >{/if}
        </div>{/if}
    {:else}
      <section class="topline">
        <div>
          <h2>Perfil y hogar</h2>
          <p>Tu cocina y las personas que comparten el menú</p>
        </div>
      </section>
      <HouseholdSettings
        {household}
        {diners}
        {saveHousehold}
        {saveDiner}
        {removeDiner}
      />
      <div class="panel">
        <h3>Cómo funcionan las raciones</h3>
        <p class="hint">
          Cada comida se planifica por defecto para 1 ración. Puedes subir o
          bajar las raciones de cualquier plato desde el menú; la lista de
          compra se recalcula automáticamente. Las valoraciones son personales y
          únicas por receta.
        </p>
      </div>
      <div class="panel">
        <h3>Datos de la demo</h3>
        <p class="hint">
          Todo se guarda en IndexedDB. No se envía información a un servidor.
        </p>
        <button class="danger" onclick={reset}>Restaurar datos de prueba</button
        >
      </div>
    {/if}
  </main>
  <nav aria-label="Navegación principal">
    <button class:active={tab === "home"} onclick={() => (tab = "home")}
      ><span>⌂</span>Hoy</button
    ><button
      class:active={tab === "plan"}
      onclick={() => {
        selectedDay = null;
        tab = "plan";
      }}><span>▦</span>Planificar</button
    ><button class:active={tab === "recipes"} onclick={() => (tab = "recipes")}
      ><span>▤</span>Recetas</button
    ><button
      class:active={tab === "shopping"}
      onclick={() => (tab = "shopping")}><span>☑</span>Compra</button
    ><button
      class:active={tab === "settings"}
      onclick={() => (tab = "settings")}><span>⚙</span>Perfil</button
    >
  </nav>
</div>

<style>
  .quantity-grid label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    margin: 12px 0;
  }
  .quantity-grid input {
    width: 100%;
    min-width: 0;
    padding: 11px;
    border: 1px solid #c8ddc7;
    border-radius: 9px;
    font: inherit;
  }
  .quantity-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .ingredient-review h3 small {
    display: block;
    margin-top: 6px;
    font-weight: 400;
  }
  .status-row button:disabled {
    opacity: 0.5;
  }
  .today-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
  }

  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: #f6f7f3;
    color: #24342a;
    font-family:
      Inter,
      system-ui,
      -apple-system,
      sans-serif;
  }
  :global(button),
  :global(input),
  :global(select) {
    font: inherit;
  }
  button {
    cursor: pointer;
  }
  .app {
    max-width: 1000px;
    margin: auto;
    padding-bottom: 92px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 30px 20px 16px;
  }
  h1 {
    font-size: clamp(25px, 5vw, 36px);
    letter-spacing: -1.2px;
    margin: 3px 0;
  }
  header p,
  .topline p {
    color: #7b877c;
    margin: 4px 0;
    font-size: 14px;
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 2px;
    color: #61806a;
    font-weight: 800;
  }
  .pill {
    background: #e4eee2;
    color: #52765a;
    border-radius: 30px;
    padding: 8px 11px;
    font-size: 12px;
    font-weight: 700;
  }
  main {
    padding: 0 20px;
  }
  .topline {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    margin: 20px 0;
  }
  h2 {
    font-size: 23px;
    letter-spacing: -0.7px;
    margin: 0;
  }
  .primary {
    border: 0;
    background: #315f46;
    color: white;
    border-radius: 13px;
    padding: 12px 14px;
    font-weight: 700;
    font-size: 13px;
  }
  .weeknav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
    background: white;
    border: 1px solid #e8ece6;
    border-radius: 16px;
    padding: 9px;
    margin: 16px 0;
  }
  .weeknav button {
    background: #f1f5ef;
    border: 0;
    border-radius: 10px;
    width: 34px;
    height: 34px;
    font-size: 24px;
    color: #315f46;
  }
  .weeknav strong {
    font-size: 14px;
  }
  .days {
    display: grid;
    gap: 12px;
  }
  .day,
  .panel,
  .recipecard {
    background: white;
    border: 1px solid #e7ece6;
    border-radius: 18px;
    padding: 16px;
  }
  .dayhead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 13px;
  }
  .dayhead span,
  .dayhead small {
    font-size: 12px;
    color: #839084;
  }
  .dayhead small {
    background: #f1f5ef;
    padding: 6px 9px;
    border-radius: 20px;
  }
  .meals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .meal {
    min-width: 0;
  }
  .servings {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 8px;
    font-size: 12px;
    color: #718071;
  }
  .servings span {
    margin-right: auto;
  }
  .servings button {
    border: 0;
    border-radius: 7px;
    background: #eaf2e9;
    width: 25px;
    height: 25px;
  }
  .search {
    width: 100%;
    border: 1px solid #dfe6df;
    border-radius: 13px;
    padding: 14px;
    background: white;
  }
  .recipegrid {
    display: grid;
    gap: 12px;
  }
  .recipecard {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }
  .recipeicon {
    display: grid;
    place-items: center;
    background: #eff5eb;
    border-radius: 14px;
    font-size: 26px;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
  }
  .recipecard small {
    color: #66806a;
    font-size: 12px;
  }
  .recipecard h3 {
    font-size: 16px;
    margin: 5px 0;
  }
  .recipecard p {
    color: #7a867b;
    font-size: 12px;
    margin: 5px 0 10px;
  }
  .summary {
    display: flex;
    justify-content: space-between;
    color: #637a65;
    padding: 14px 4px;
    font-size: 13px;
  }
  .hint {
    color: #7c887d;
    font-size: 12px;
    line-height: 1.6;
  }
  .empty {
    padding: 35px;
    text-align: center;
    color: #7b877c;
    background: white;
    border-radius: 16px;
  }
  .panel {
    margin: 14px 0;
  }
  .panel h3 {
    margin: 0 0 12px;
    font-size: 16px;
  }
  .danger {
    background: #fff2ee;
    border: 1px solid #f2d5cc;
    color: #a64d37;
    padding: 10px;
    border-radius: 10px;
  }
  nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-around;
    background: #fff;
    border-top: 1px solid #e8ece6;
    padding: 10px 8px max(12px, env(safe-area-inset-bottom));
    z-index: 3;
  }
  nav button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    border: 0;
    background: none;
    color: #91a094;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 12px;
  }
  nav button span {
    font-size: 22px;
  }
  nav button.active {
    color: #315f46;
  }
  @media (min-width: 760px) {
    .days {
      grid-template-columns: repeat(2, 1fr);
    }
    .recipegrid {
      grid-template-columns: repeat(2, 1fr);
    }
    nav {
      left: 50%;
      transform: translateX(-50%);
      max-width: 1000px;
      border-left: 1px solid #e8ece6;
      border-right: 1px solid #e8ece6;
    }
  }
  .filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 12px 0 18px;
  }
  .filters select {
    min-width: 0;
    width: 100%;
    padding: 10px;
    border: 1px solid #e1e8df;
    border-radius: 10px;
    background: white;
    color: #315f46;
    font-size: 12px;
  }
  .recipe-button {
    text-align: left;
    width: 100%;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .recipe-button:hover {
    border-color: #95b59a;
  }
  .chiprow {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
  }
  .chip {
    font-size: 11px;
    background: #edf4ea;
    color: #477252;
    border-radius: 30px;
    padding: 5px 9px;
  }
  .recipe-detail h2 {
    margin: 8px 0;
  }
  .recipe-detail h3 {
    margin: 22px 0 8px;
  }
  .recipe-detail > p {
    line-height: 1.6;
  }
  .back {
    border: 0;
    background: none;
    color: #315f46;
    font-weight: 700;
    padding: 8px 0;
  }
  .ingredient-list > div {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #edf0ec;
    padding: 10px 0;
  }
  .steps {
    padding-left: 22px;
    line-height: 1.65;
  }
  .steps li {
    padding: 6px 0;
  }
  .rate {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .rate button {
    border: 1px solid #dce7da;
    background: #f1f6ee;
    border-radius: 8px;
    padding: 8px;
    color: #315f46;
  }
  .day-select {
    display: block;
    width: 100%;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .day-select:hover {
    border-color: #91b397;
  }
  .day-select .meal p {
    margin: 5px 0;
  }
  .day-meal {
    padding: 14px 0;
    border-top: 1px solid #e5ece3;
  }
  .day-meal select {
    width: 100%;
    padding: 12px;
    border: 1px solid #d9e5d8;
    border-radius: 10px;
    background: white;
  }
  .status-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 12px 0;
  }
  .status-row button,
  .reuse-row button {
    border: 1px solid #d3e1d1;
    background: #fff;
    padding: 9px;
    border-radius: 9px;
    color: #365d40;
  }
  .status-row .status-active {
    background: #315f46;
    color: white;
  }
  .reuse-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid #e5ece3;
  }
  .reuse-row button:disabled {
    opacity: 0.4;
  }
  .priority-panel {
    margin-bottom: 14px;
  }
  .priority-entry {
    display: flex;
    gap: 8px;
  }
  .priority-entry input {
    min-width: 0;
    flex: 1;
    padding: 10px;
    border: 1px solid #d9e5d8;
    border-radius: 10px;
  }
  .priority-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .priority-chip button {
    border: 0;
    background: transparent;
    color: #315f46;
    font-size: 18px;
    line-height: 1;
  }
  .today-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr));
    gap: 14px;
  }
  .today-meal {
    min-width: 0;
  }
  .today-meal h3 {
    margin: 12px 0 4px;
  }
  .today-edit,
  .today-planning {
    border: 1px solid #c8ddc7;
    border-radius: 10px;
    background: #eaf3e7;
    color: #315f46;
    padding: 11px 14px;
    font-weight: 700;
  }
  .today-edit {
    margin-top: 12px;
  }
  .today-planning {
    width: 100%;
    margin-top: 16px;
  }
  nav button {
    min-width: 0;
    font-size: 12px;
  }
</style>
