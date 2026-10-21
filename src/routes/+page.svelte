<script lang="ts">
  import {
    shoppingGuide,
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
  import GenerationDialog, {
    type GenerationOptions,
  } from "$lib/components/GenerationDialog.svelte";
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
  let shoppingMode = $state<"review" | "list">("review");

  let ready = $state(false);
  let search = $state("");
  let week = $state(weekDates());
  let selectedDay = $state<string | null>(null);
  let priorities = $state<PantryPriority[]>([]);
  let generationOpen = $state(false);
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
  let guide = $derived(
    shoppingGuide(
      plans.filter((p) => week.includes(p.date)),
      recipes,
      reviews,
      week[0],
    ),
  );
  const formatQuantities = (items: { amount: number; unit: string }[]) =>
    items.map((q) => `${(Math.ceil(q.amount * 100) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} ${q.unit}`.trim()).join(" + ");
  let reviewPending = $derived(guide.filter((item) => !item.intent).length);
  let groceryList = $derived(guide.filter((item) => item.intent === "buy"));
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
  async function startGeneration(options: GenerationOptions) {
    generationOpen = false;
    await db.transaction("rw", db.priorities, async () => {
      await db.priorities.clear();
      await db.priorities.bulkPut(
        options.ingredients.map((name) => ({
          id: crypto.randomUUID(),
          name,
          createdAt: new Date().toISOString(),
        })),
      );
    });
    await refresh();
    await generate(options);
  }
  async function generate(options: GenerationOptions) {
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
      for (const date of week.filter((d) => options.dates.includes(d)))
        for (const meal of options.meals) {
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
                    .automatic,
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
                ).automatic,
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
  async function setShoppingDecision(
    group: (typeof guide)[number],
    intent: "home" | "buy",
    checked = false,
    preserveCoverage = false,
  ) {
    await db.transaction("rw", db.ingredientReviews, async () => {
      for (const item of group.items)
        await db.ingredientReviews.put({
          id: reviewId(week[0], item.id),
          week: week[0],
          ingredientId: item.id,
          intent,
          checked,
          confirmedAmount: item.amount,
          stock: preserveCoverage ? item.amount - item.purchaseAmount : 0,
          purchased: 0,
          unavailable: false,
        });
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
  }
</script>

<svelte:head
  ><title>Menú de casa · Demo</title><meta
    name="description"
    content="Planificador semanal local de comidas"
  /></svelte:head
>
{#if generationOpen}<GenerationDialog
    {week}
    ingredients={priorities.map((p) => p.name)}
    configured={household.configured}
    close={() => (generationOpen = false)}
    submit={startGeneration}
    openProfile={() => {
      generationOpen = false;
      tab = "settings";
    }}
  />{/if}
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
          <small class="eyebrow">PLANIFICACIÓN</small>
          <h2>Tu semana</h2>
          <p>Un menú que encaja contigo.</p>
        </div>
        <button
          class="primary"
          disabled={generating}
          onclick={() => (generationOpen = true)}
          >{generating ? "Generando…" : "Generar menú"}</button
        >
      </section>
      <div class="plan-overview">
        <div>
          <strong
            >{plans.filter((p) => week.includes(p.date)).length}<span
              >/ 14 platos</span
            ></strong
          >
          <p>Tu semana, a tu ritmo</p>
        </div>
        <button class="back" onclick={() => (tab = "shopping")}
          >Preparar compra <span aria-hidden="true">↗</span></button
        >
      </div>
      {#if issues.length}<div class="panel">
          <h3>Revisar compatibilidad del menú</h3>
          {#each issues as issue}<button
              class="back"
              onclick={() => (selectedDay = issue.plan.date)}
              >{label(issue.plan.date)} · {issue.plan.meal}: {issue.text}</button
            >{/each}
        </div>{/if}
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
          <small class="eyebrow">COMPRA</small>
          <h2>
            {shoppingMode === "review"
              ? "Antes de salir"
              : "Tu lista del súper"}
          </h2>
          <p>
            {shoppingMode === "review"
              ? "Revisa lo que ya tienes en casa."
              : "Lo que necesitas, sin complicaciones."}
          </p>
        </div>
      </section>
      <div class="weeknav">
        <button onclick={() => moveWeek(-1)} aria-label="Semana anterior"
          >‹</button
        ><strong>{label(week[0])} — {label(week[6])}</strong><button
          onclick={() => moveWeek(1)}
          aria-label="Semana siguiente">›</button
        >
      </div>
      <div class="shopping-tabs" role="group" aria-label="Pasos de la compra">
        <button
          class:chosen={shoppingMode === "review"}
          onclick={() => (shoppingMode = "review")}>1. Revisar en casa</button
        ><button
          class:chosen={shoppingMode === "list"}
          onclick={() => (shoppingMode = "list")}
          >2. Lista del súper <span>{groceryList.length}</span></button
        >
      </div>
      {#if !guide.length}<div class="empty">
          <h3>Todavía no hay ingredientes</h3>
          <p>Añade platos a la semana para preparar tu compra.</p>
          <button class="back" onclick={() => (tab = "plan")}
            >Ir a Planificación →</button
          >
        </div>
      {:else if shoppingMode === "review"}
        <p class="hint">
          Cantidades necesarias para las recetas y los comensales de esta semana.
          Indica si tienes suficiente en casa o si necesitas comprar.
        </p>
        <div class="review-progress" class:complete={reviewPending === 0} role="status">
          <strong>{reviewPending ? `${reviewPending} por revisar` : "Todo revisado"}</strong>
          <span>{guide.length - reviewPending} de {guide.length} revisados</span>
        </div>
        <div class="shopping-review-list">
          {#each guide as item}<article class="review-row" class:pending={!item.intent} class:reviewed={!!item.intent}>
              <div>
                <h3>{item.name}</h3>
                <p class="required-quantity">
                  Necesario esta semana: {formatQuantities(item.items)}
                </p>
                <small class="review-badge"
                  >{item.intent === "home"
                    ? "✓ Revisado · Ya lo tienes"
                    : item.intent === "buy"
                      ? "✓ Revisado · En la lista de compra"
                      : "! Pendiente de revisar"}</small
                >
              </div>
              <div class="review-actions">
                <button
                  class:chosen={item.intent === "home"}
                  aria-pressed={item.intent === "home"}
                  onclick={() => setShoppingDecision(item, "home")}
                  >Tengo suficiente</button
                ><button
                  class:chosen={item.intent === "buy"}
                  aria-pressed={item.intent === "buy"}
                  onclick={() => setShoppingDecision(item, "buy")}
                  >Comprar</button
                >
              </div>
            </article>{/each}
        </div>
        <div class="shopping-next">
          <p>
            {guide.filter((i) => !i.intent).length
              ? `${guide.filter((i) => !i.intent).length} ingredientes por revisar`
              : "Todo revisado. Ya puedes preparar la compra."}
          </p>
          <button class="primary" onclick={() => (shoppingMode = "list")}
            >Ver lista del súper →</button
          >
        </div>
      {:else}
        <div class="summary">
          <strong>{groceryList.length} productos</strong><span
            >{groceryList.filter((i) => i.checked).length} comprados</span
          >
        </div>
        {#if groceryList.length}<div class="grocery-list">
            {#each groceryList as item}<label class:done={item.checked}
                ><input
                  type="checkbox"
                  checked={item.checked}
                  onchange={(e) =>
                    setShoppingDecision(item, "buy", e.currentTarget.checked, true)}
                /><span class="grocery-product"><span>{item.name}</span><small>
                  Mínimo a comprar: {formatQuantities(item.items.filter((q) => q.purchaseAmount > 0).map((q) => ({ amount: q.purchaseAmount, unit: q.unit })))}
                </small></span></label
              >{/each}
          </div>{:else}<div class="empty">
            <h3>
              {guide.some((i) => !i.intent)
                ? "Prepara tu lista"
                : "Tienes todo lo necesario"}
            </h3>
            <p>
              {guide.some((i) => !i.intent)
                ? "Marca «Comprar» en los ingredientes que te falten."
                : "No hay productos pendientes de añadir a la compra."}
            </p>
          </div>{/if}
        {#if guide.some((i) => !i.intent)}<button
            class="back"
            onclick={() => (shoppingMode = "review")}
            >Quedan ingredientes por revisar →</button
          >{/if}
      {/if}
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
  .shopping-tabs {
    display: flex;
    gap: 6px;
    padding: 5px;
    background: #eaf0e5;
    border-radius: 14px;
    margin: 20px 0;
  }
  .shopping-tabs button {
    flex: 1;
    border: 0;
    background: none;
    padding: 12px 8px;
    border-radius: 10px;
    color: #6a7c65;
    font-weight: 650;
    font-size: 13px;
  }
  .shopping-tabs button.chosen {
    background: white;
    color: #315f46;
    box-shadow: 0 2px 8px #24342a0a;
  }
  .shopping-tabs span {
    background: #eaf2e4;
    border-radius: 20px;
    padding: 2px 7px;
    font-size: 11px;
    margin-left: 4px;
  }
  .shopping-review-list,
  .grocery-list {
    background: white;
    border: 1px solid #e2e9dc;
    border-radius: 18px;
    overflow: hidden;
  }
  .review-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 18px;
    border-bottom: 1px solid #edf1e8;
  }
  .review-row:last-child {
    border: 0;
  }
  .review-row h3 {
    font-size: 14px;
    margin: 0 0 4px;
  }
  .review-progress {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 14px 16px;
    margin-bottom: 12px;
    border: 1px solid #e6c78c;
    border-radius: 12px;
    background: #fff5df;
    color: #79511b;
    font-size: 13px;
  }
  .review-progress.complete {
    background: #edf5e9;
    border-color: #c7dbc0;
    color: #315f46;
  }
  .review-row.pending {
    background: #fffbf2;
    border-left: 4px solid #c5943c;
  }
  .review-row.reviewed {
    background: #f4f8f0;
    border-left: 4px solid #84a779;
  }
  .review-row .review-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 6px;
    background: #e6efdf;
    color: #365d40;
    font-weight: 600;
  }
  .review-row.pending .review-badge {
    background: #f9e9c6;
    color: #79511b;
  }
  .grocery-product {
    display: grid;
    gap: 5px;
  }
  .grocery-product small {
    font-size: 12px;
    color: #58724e;
    line-height: 1.5;
  }
  .required-quantity {
    margin: 0 0 6px;
    color: #365d40;
    font-size: 13px;
    line-height: 1.5;
  }
  .review-row small {
    color: #7a8973;
    font-size: 11px;
  }
  .review-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .review-actions button {
    border: 1px solid #dae5d3;
    border-radius: 10px;
    background: white;
    color: #58724e;
    padding: 10px;
    font-size: 12px;
  }
  .review-actions .chosen {
    background: #eaf3e3;
    border-color: #91b27e;
    color: #315f46;
  }
  .shopping-next {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    margin-top: 20px;
  }
  .shopping-next p {
    color: #70816b;
    font-size: 12px;
  }
  .grocery-list label {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px;
    border-bottom: 1px solid #edf1e8;
    font-size: 15px;
    cursor: pointer;
  }
  .grocery-list label:last-child {
    border: 0;
  }
  .grocery-list input {
    width: 22px;
    height: 22px;
    accent-color: #315f46;
  }
  .grocery-list .done span {
    text-decoration: line-through;
    color: #94a08e;
  }
  .grocery-list .done {
    background: #fafcf7;
  }
  @media (max-width: 440px) {
    .review-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }
    .review-actions {
      width: 100%;
    }
    .review-actions button {
      flex: 1;
    }
    .shopping-next {
      align-items: stretch;
      flex-direction: column;
    }
    .shopping-tabs button {
      font-size: 12px;
    }
  }

  .plan-overview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    background: linear-gradient(120deg, #eaf2e4, #f1f5eb);
    border: 1px solid #dfe9d7;
    border-radius: 20px;
    padding: 20px 22px;
    margin: 20px 0;
  }
  .plan-overview strong {
    font-size: 28px;
    letter-spacing: -1px;
  }
  .plan-overview strong span {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0;
    color: #70816d;
    margin-left: 6px;
  }
  .plan-overview p {
    font-size: 12px;
    color: #70816d;
    margin: 4px 0 0;
  }
  .plan-overview .back {
    white-space: nowrap;
    font-size: 13px;
  }
  .today-grid .today-meal {
    margin: 0;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    box-shadow: 0 4px 20px #24342a04;
  }
  .today-meal .servings {
    width: 100%;
    padding: 12px 0;
    margin-top: 4px;
    border-top: 1px solid #edf1e8;
  }
  .today-meal .status-row {
    margin: 8px 0 12px;
    gap: 7px;
    width: 100%;
  }
  .today-meal .status-row button {
    flex: 1;
    padding: 10px 8px;
    font-size: 12px;
  }
  .today-meal .today-edit {
    align-self: stretch;
    margin-top: auto;
    text-align: left;
  }
  .today-meal .hint {
    margin: 6px 0 12px;
  }
  .today-meal .back {
    padding: 10px 0;
    margin-bottom: 8px;
  }
  .today-grid + .today-planning {
    margin-top: 20px;
    padding: 16px 18px;
    text-align: left;
    background: #fff;
    border-color: #e1e9da;
    border-radius: 16px;
  }
  .topline > div {
    min-width: 0;
  }
  .topline h2 {
    margin-top: 5px;
  }
  .days .day {
    padding: 20px;
    box-shadow: 0 3px 12px #24342a03;
  }
  .days .day:hover {
    border-color: #a9c19b;
    background: #fdfefb;
  }
  .days .meals {
    gap: 16px;
  }
  .weeknav {
    box-shadow: 0 2px 10px #24342a03;
  }
  :global(button:focus-visible) {
    outline: 2px solid #315f46;
    outline-offset: 3px;
  }
  @media (max-width: 480px) {
    .topline {
      gap: 12px;
      align-items: flex-start;
    }
    .topline > .primary {
      margin-top: 4px;
      padding: 12px;
      font-size: 12px;
      flex-shrink: 0;
    }
    .plan-overview {
      padding: 17px;
    }
    .today-grid .today-meal {
      padding: 20px;
    }
    .plan-overview .back {
      font-size: 12px;
    }
    header {
      padding-bottom: 12px;
    }
    main {
      padding: 0 16px;
    }
    .topline p {
      font-size: 13px;
    }
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
  @media (max-width: 480px) {
    main {
      padding: 0 16px;
    }
    .topline p {
      font-size: 13px;
    }
    header {
      padding-bottom: 12px;
    }
  }
</style>
