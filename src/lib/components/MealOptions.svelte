<script lang="ts">
  import {
    mealAssessment,
    variantsOf,
    type Household,
    type Diner,
  } from "$lib/household";
  import type { PlannedMeal, Recipe } from "$lib/db";
  let {
    plan,
    recipe,
    diners,
    household,
    save,
  }: {
    plan: PlannedMeal;
    recipe: Recipe;
    diners: Diner[];
    household: Household;
    save: (p: PlannedMeal) => Promise<void>;
  } = $props();
  let portions = $derived(
    plan.portions ?? [{ dinerId: "single", servings: plan.servings }],
  );
  let assessment = $derived(
    mealAssessment(recipe, plan.variantId, portions, diners, household),
  );
  async function update(changes: Partial<PlannedMeal>) {
    const next = {
      ...plan,
      ...changes,
      contactReviewed: false,
      status: "pendiente" as const,
    };
    const result = mealAssessment(
      recipe,
      next.variantId,
      (next.portions ?? portions).map((p) => ({ ...p, omitted: [] })),
      diners,
      household,
    );
    await save({
      ...next,
      portions: result.portions,
      servings: result.portions.reduce((s, p) => s + p.servings, 0),
    });
  }
</script>

<div class="options">
  <label
    >Preparación<select
      value={plan.variantId ?? variantsOf(recipe)[0].id}
      onchange={(e) => update({ variantId: e.currentTarget.value })}
      >{#each variantsOf(recipe) as variant}<option value={variant.id}
          >{variant.name} · {variant.minutes} min{variant.equipment.some(
            (x) => !household.equipment.includes(x),
          )
            ? " · falta equipamiento"
            : ""}</option
        >{/each}</select
    ></label
  >
  <fieldset>
    <legend>Quién come</legend>{#each diners as diner}{@const portion =
        portions.find((p) => p.dinerId === diner.id)}
      <div class="person">
        <label
          ><input
            type="checkbox"
            disabled={!!portion && portions.length === 1}
            checked={!!portion}
            onchange={(e) => {
              const next = e.currentTarget.checked
                ? [...portions, { dinerId: diner.id, servings: 1 }]
                : portions.filter((p) => p.dinerId !== diner.id);
              if (next.length) update({ portions: next });
            }}
          />{diner.name}</label
        >{#if portion}<label
            >Raciones<input
              aria-label={`Raciones de ${diner.name}`}
              type="number"
              min="0.25"
              step="0.25"
              value={portion.servings}
              onchange={(e) => {
                const n = e.currentTarget.valueAsNumber;
                if (Number.isFinite(n) && n > 0)
                  update({
                    portions: portions.map((p) =>
                      p.dinerId === diner.id ? { ...p, servings: n } : p,
                    ),
                  });
              }}
            /></label
          >{/if}
      </div>{/each}{#each portions.filter( (p) => p.dinerId.startsWith("guest-") ) as portion}<div
        class="person"
      >
        <span>Invitado</span><label
          >Raciones<input
            type="number"
            min="0.25"
            step="0.25"
            value={portion.servings}
            onchange={(e) => {
              const n = e.currentTarget.valueAsNumber;
              if (Number.isFinite(n) && n > 0)
                update({
                  portions: portions.map((p) =>
                    p.dinerId === portion.dinerId ? { ...p, servings: n } : p,
                  ),
                });
            }}
          /></label
        ><button
          disabled={portions.length === 1}
          onclick={() =>
            update({
              portions: portions.filter((p) => p.dinerId !== portion.dinerId),
            })}>Quitar</button
        >
      </div>{/each}<button
      onclick={() =>
        update({
          portions: [
            ...portions,
            { dinerId: `guest-${crypto.randomUUID()}`, servings: 1 },
          ],
        })}>Añadir invitado puntual</button
    >
    <p class="hint">
      Para registrar restricciones de un invitado, añádelo como comensal en
      Perfil y hogar.
    </p>
  </fieldset>
  {#each assessment.errors as error}<p class="error">
      {error}
    </p>{/each}{#each assessment.warnings as warning}<p class="warning">
      {warning}
    </p>{/each}
  {#each assessment.portions.filter((p) => p.omitted?.length) as portion}<p
      class="hint"
    >
      {diners.find((d) => d.id === portion.dinerId)?.name ?? "Invitado"}: sin {portion.omitted?.join(
        ", ",
      )}.
    </p>{/each}
  {#if assessment.needsContactReview}<label class="review"
      ><input
        type="checkbox"
        checked={!!plan.contactReviewed}
        onchange={(e) =>
          save({ ...plan, contactReviewed: e.currentTarget.checked })}
      />He revisado la separación de ingredientes y el contacto cruzado para
      esta preparación. Esto no certifica su seguridad.</label
    >{/if}
  {#if assessment.errors.length || (assessment.needsContactReview && !plan.contactReviewed)}<p
      class="error"
    >
      Resuelve las restricciones antes de marcar este plato como realizado.
    </p>{/if}
</div>

<style>
  .options {
    margin: 14px 0;
  }
  label {
    display: grid;
    gap: 6px;
    margin: 8px 0;
    font-size: 13px;
  }
  select,
  input {
    font: inherit;
    min-width: 0;
    border: 1px solid #c8ddc7;
    border-radius: 9px;
    padding: 10px;
    background: white;
  }
  select {
    width: 100%;
  }
  fieldset {
    border: 1px solid #e2e9e0;
    border-radius: 12px;
    margin: 14px 0;
    padding: 12px;
  }
  legend {
    font-size: 13px;
    font-weight: 700;
  }
  .person {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .person label:first-child,
  .review {
    display: flex;
    align-items: center;
  }
  .person input[type="number"] {
    width: 80px;
  }
  .error {
    color: #9a352d;
    background: #fff0ed;
    padding: 10px;
    border-radius: 9px;
    font-size: 13px;
  }
  .warning {
    color: #73500d;
    background: #fff6df;
    padding: 10px;
    border-radius: 9px;
    font-size: 13px;
  }
  .hint {
    font-size: 12px;
    line-height: 1.5;
    color: #627565;
  }
  button {
    border: 1px solid #c8ddc7;
    border-radius: 9px;
    padding: 9px;
    background: #edf4ea;
    color: #315f46;
    cursor: pointer;
  }
</style>
