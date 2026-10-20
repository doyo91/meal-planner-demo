<script lang="ts">
  import { untrack } from "svelte";
  import {
    equipmentOptions,
    variantsOf,
    type RecipeVariant,
  } from "$lib/household";
  import type { Recipe, Ingredient } from "$lib/db";
  let {
    recipe,
    save,
    cancel,
  }: {
    recipe?: Recipe;
    save: (r: Recipe) => Promise<void>;
    cancel: () => void;
  } = $props();
  const initial = untrack(() => recipe);
  let name = $state(initial?.name ?? "");
  let cuisine = $state(initial?.cuisine ?? "Casera");
  let description = $state(initial?.description ?? "");
  const emptyVariant = (): RecipeVariant => ({
    id: crypto.randomUUID(),
    name: "",
    minutes: 20,
    servings: 1,
    equipment: [],
    ingredients: [
      {
        name: "",
        amount: 1,
        unit: "g",
        component: "shared",
        optional: false,
        allergens: [],
      },
    ],
    steps: [{ order: 1, instruction: "" }],
  });
  let variants = $state<RecipeVariant[]>(
    initial
      ? JSON.parse(JSON.stringify(variantsOf(initial)))
      : [emptyVariant()],
  );
  let error = $state("");
  async function submit() {
    error = "";
    if (
      !name.trim() ||
      variants.some(
        (v) =>
          !v.name.trim() ||
          !Number.isFinite(v.minutes) ||
          v.minutes <= 0 ||
          !Number.isFinite(v.servings) ||
          v.servings <= 0 ||
          !v.ingredients.length ||
          v.ingredients.some(
            (i) =>
              !i.name.trim() || !Number.isFinite(i.amount) || i.amount <= 0,
          ) ||
          !v.steps.length ||
          v.steps.some((s) => !s.instruction.trim()),
      )
    ) {
      error =
        "Completa el nombre y cada preparación con tiempo, raciones, ingredientes y pasos válidos.";
      return;
    }
    const clean = variants.map((v) => ({
      ...v,
      name: v.name.trim(),
      ingredients: v.ingredients.map((i) => ({
        ...i,
        name: i.name.trim(),
        optional: i.component === "shared" ? false : !!i.optional,
      })),
      steps: v.steps.map((s, i) => ({
        ...s,
        order: i + 1,
        instruction: s.instruction.trim(),
      })),
    }));
    const first = clean[0];
    await save({
      ...initial,
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      cuisine: cuisine.trim() || "Casera",
      description,
      minutes: first.minutes,
      servings: first.servings,
      ingredients: first.ingredients,
      steps: first.steps,
      variants: clean,
      mealTypes: initial?.mealTypes ?? ["comida", "cena"],
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
</script>

<form
  class="editor"
  onsubmit={(e) => {
    e.preventDefault();
    submit();
  }}
>
  <h3>{initial ? "Editar receta y preparaciones" : "Nueva receta"}</h3>
  <label>Nombre<input required bind:value={name} /></label><label
    >Cocina<input bind:value={cuisine} /></label
  ><label>Descripción<textarea bind:value={description}></textarea></label>
  {#each variants as variant, vi (variant.id)}<section class="variant">
      <div class="heading">
        <h4>Preparación {vi + 1}</h4>
        <button
          type="button"
          disabled={variants.length === 1}
          onclick={() =>
            (variants = variants.filter((v) => v.id !== variant.id))}
          >Quitar preparación</button
        >
      </div>
      <label
        >Nombre de la preparación<input
          required
          placeholder="Al horno, cocida, en freidora de aire…"
          bind:value={variant.name}
        /></label
      >
      <div class="grid">
        <label
          >Tiempo total (min)<input
            type="number"
            min="1"
            required
            bind:value={variant.minutes}
          /></label
        ><label
          >Raciones de estas cantidades<input
            type="number"
            min="0.25"
            step="0.25"
            required
            bind:value={variant.servings}
          /></label
        >
      </div>
      <fieldset>
        <legend>Equipamiento imprescindible</legend>
        <p>
          Marca todos los aparatos necesarios para esta preparación. Cuchillos,
          ollas y sartenes no se filtran.
        </p>
        <div class="devices">
          {#each equipmentOptions as device}<label
              ><input
                type="checkbox"
                checked={variant.equipment.includes(device)}
                onchange={(e) =>
                  (variant.equipment = e.currentTarget.checked
                    ? [...variant.equipment, device]
                    : variant.equipment.filter((x) => x !== device))}
              />{device}</label
            >{/each}
        </div>
      </fieldset>
      <h4>Ingredientes de esta preparación</h4>
      {#each variant.ingredients as ingredient, ii}<div class="ingredient">
          <label
            >Ingrediente<input required bind:value={ingredient.name} /></label
          >
          <div class="grid">
            <label
              >Cantidad<input
                type="number"
                min="0.01"
                step="any"
                required
                bind:value={ingredient.amount}
              /></label
            ><label
              >Unidad<select bind:value={ingredient.unit}
                ><option value="g">g</option><option value="ml">ml</option
                ><option value="ud">ud</option></select
              ></label
            >
          </div>
          <label
            >Dónde se incorpora<select
              value={ingredient.component ?? "shared"}
              onchange={(e) => {
                ingredient.component = e.currentTarget
                  .value as Ingredient["component"];
                if (ingredient.component === "shared")
                  ingredient.optional = false;
              }}
              ><option value="shared">Base o preparación compartida</option
              ><option value="side">Guarnición separada por comensal</option
              ><option value="topping">Añadido al servir</option></select
            ></label
          >{#if ingredient.component && ingredient.component !== "shared"}<label
              class="check"
              ><input type="checkbox" bind:checked={ingredient.optional} />Se
              puede omitir sin cambiar la preparación común</label
            >{/if}<label
            >Alérgenos o derivados declarados (separados por comas)<input
              placeholder="Ej. pistacho, frutos secos"
              value={ingredient.allergens?.join(", ") ?? ""}
              onchange={(e) =>
                (ingredient.allergens = e.currentTarget.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean))}
            /></label
          ><button
            type="button"
            disabled={variant.ingredients.length === 1}
            onclick={() =>
              (variant.ingredients = variant.ingredients.filter(
                (_, i) => i !== ii,
              ))}>Quitar ingrediente</button
          >
        </div>{/each}<button
        type="button"
        onclick={() =>
          variant.ingredients.push({
            name: "",
            amount: 1,
            unit: "g",
            component: "shared",
            optional: false,
            allergens: [],
          })}>Añadir ingrediente</button
      >
      <h4>Pasos específicos</h4>
      {#each variant.steps as step, si}<label
          >Paso {si + 1}<textarea required bind:value={step.instruction}
          ></textarea><button
            type="button"
            disabled={variant.steps.length === 1}
            onclick={() =>
              (variant.steps = variant.steps.filter((_, i) => i !== si))}
            >Quitar paso</button
          ></label
        >{/each}<button
        type="button"
        onclick={() =>
          variant.steps.push({
            order: variant.steps.length + 1,
            instruction: "",
          })}>Añadir paso</button
      >
    </section>{/each}
  <button type="button" onclick={() => variants.push(emptyVariant())}
    >Añadir otra preparación</button
  >{#if error}<p role="alert">{error}</p>{/if}
  <div class="actions">
    <button class="primary" type="submit">Guardar receta</button><button
      type="button"
      onclick={cancel}>Cancelar</button
    >
  </div>
</form>

<style>
  .editor {
    background: white;
    border: 1px solid #e7ece6;
    border-radius: 18px;
    padding: 18px;
    margin: 14px 0;
  }
  h3,
  h4 {
    margin: 10px 0;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    margin: 10px 0;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    padding: 10px;
    border: 1px solid #c8ddc7;
    border-radius: 9px;
    font: inherit;
  }
  textarea {
    min-height: 70px;
  }
  .variant {
    border-top: 2px solid #dbe7d7;
    margin: 20px 0;
    padding-top: 14px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .devices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  .devices label,
  .check {
    display: flex;
    align-items: center;
  }
  .devices input,
  .check input {
    width: auto;
  }
  .ingredient {
    background: #f6f8f3;
    padding: 12px;
    border-radius: 12px;
    margin: 12px 0;
  }
  fieldset {
    border: 1px solid #dbe7d7;
    border-radius: 12px;
  }
  legend,
  p {
    font-size: 12px;
    line-height: 1.5;
  }
  button {
    cursor: pointer;
    border: 1px solid #c8ddc7;
    border-radius: 9px;
    padding: 9px;
    background: #edf4ea;
    color: #315f46;
  }
  button:disabled {
    opacity: 0.5;
  }
  .actions,
  .heading {
    display: flex;
    gap: 10px;
    justify-content: space-between;
    flex-wrap: wrap;
    margin-top: 16px;
  }
  .primary {
    background: #315f46;
    color: white;
  }
</style>
