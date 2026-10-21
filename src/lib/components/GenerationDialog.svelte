<script lang="ts" module>
  import type { Meal } from "$lib/db";
  export interface GenerationOptions {
    ingredients: string[];
    dates: string[];
    meals: Meal[];
  }
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  let {
    week,
    ingredients,
    configured,
    close,
    submit,
    openProfile,
  }: {
    week: string[];
    ingredients: string[];
    configured: boolean;
    close: () => void;
    submit: (options: GenerationOptions) => Promise<void>;
    openProfile: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let names = $state<string[]>(untrack(() => [...ingredients]));
  let input = $state("");
  let dates = $state<string[]>(untrack(() => [...week]));
  let meals = $state<Meal[]>(["comida", "cena"]);
  const days = ["L", "M", "X", "J", "V", "S", "D"];
  function add() {
    for (const name of input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean))
      if (
        !names.some(
          (n) => n.toLocaleLowerCase("es") === name.toLocaleLowerCase("es"),
        )
      )
        names.push(name);
    input = "";
  }
  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  });
</script>

<dialog bind:this={dialog} oncancel={close} aria-labelledby="generation-title">
  <form
    onsubmit={(e) => {
      e.preventDefault();
      add();
      if (dates.length && meals.length && configured)
        submit({
          ingredients: [...names],
          dates: [...dates],
          meals: [...meals],
        });
    }}
  >
    <header>
      <div>
        <small>PLANIFICACIÓN SEMANAL</small>
        <h2 id="generation-title">Vamos a preparar tu semana</h2>
        <p>Elige qué completar y qué ingredientes te gustaría aprovechar.</p>
      </div>
      <button
        type="button"
        class="close"
        aria-label="Cerrar configuración del menú"
        onclick={close}>×</button
      >
    </header>
    <section>
      <h3>¿Qué días comemos en casa?</h3>
      <p>Solo se completarán los huecos libres de los días elegidos.</p>
      <div class="days">
        {#each week as date, i}<label class:selected={dates.includes(date)}
            ><input
              type="checkbox"
              checked={dates.includes(date)}
              onchange={(e) =>
                (dates = e.currentTarget.checked
                  ? [...dates, date]
                  : dates.filter((d) => d !== date))}
            /><span>{days[i]}</span><strong
              >{new Date(`${date}T12:00:00`).getDate()}</strong
            ></label
          >{/each}
      </div>
      <div class="meals">
        {#each ["comida", "cena"] as meal}<label
            ><input
              type="checkbox"
              checked={meals.includes(meal as Meal)}
              onchange={(e) =>
                (meals = e.currentTarget.checked
                  ? [...meals, meal as Meal]
                  : meals.filter((m) => m !== meal))}
            />{meal === "comida" ? "Comidas" : "Cenas"}</label
          >{/each}
      </div>
    </section>
    <section>
      <h3>¿Qué quieres gastar?</h3>
      <p>Opcional. Priorizaremos recetas con estos ingredientes.</p>
      <div class="entry">
        <input
          aria-label="Ingredientes que quiero aprovechar"
          placeholder="Ej. calabacín, huevos, arroz"
          bind:value={input}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        /><button type="button" onclick={add}>Añadir</button>
      </div>
      <div class="chips">
        {#each names as name}<span
            >{name}<button
              type="button"
              aria-label={`Quitar ${name}`}
              onclick={() => (names = names.filter((n) => n !== name))}
              >×</button
            ></span
          >{/each}
      </div>
      <p class="hint">
        Revisarás las cantidades que tienes al preparar la compra.
      </p>
    </section>
    {#if !configured}<p class="notice">
        Antes de generar el menú, confirma los aparatos disponibles en tu
        cocina. <button type="button" onclick={openProfile}
          >Ir a Perfil y hogar →</button
        >
      </p>{:else}<p class="notice">
        Se respetan tu equipamiento y las restricciones registradas. Los platos
        que ya has elegido se conservan.
      </p>{/if}
    <footer>
      <button type="button" onclick={close}>Cancelar</button><button
        class="primary"
        disabled={!dates.length || !meals.length || !configured}
        >Generar planificación</button
      >
    </footer>
  </form>
</dialog>

<style>
  dialog {
    box-sizing: border-box;
    width: min(580px, calc(100% - 28px));
    max-height: calc(100dvh - 32px);
    padding: 0;
    border: 1px solid #dce6d9;
    border-radius: 24px;
    color: #24342a;
    box-shadow: 0 24px 90px #162b3030;
    overflow: auto;
    background: #fff;
  }
  dialog::backdrop {
    background: #15271bb3;
    backdrop-filter: blur(4px);
  }
  form {
    padding: 26px;
  }
  header {
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }
  small {
    font-size: 10px;
    letter-spacing: 1.8px;
    font-weight: 800;
    color: #698269;
  }
  h2 {
    font-size: 25px;
    line-height: 1.2;
    margin: 9px 0;
    letter-spacing: -0.7px;
  }
  h3 {
    font-size: 15px;
    margin: 0 0 6px;
  }
  p {
    font-size: 13px;
    color: #68786b;
    line-height: 1.55;
    margin: 0 0 14px;
  }
  section {
    padding: 22px 0 0;
  }
  button,
  input {
    font: inherit;
  }
  button {
    cursor: pointer;
    border: 1px solid #dce6d9;
    border-radius: 11px;
    background: #f5f8f2;
    color: #315f46;
    padding: 10px 13px;
    font-weight: 650;
    font-size: 13px;
  }
  .close {
    padding: 0;
    width: 32px;
    height: 32px;
    font-size: 23px;
    flex-shrink: 0;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .days label {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 0;
    background: #f5f7f2;
    border: 1px solid #e3e9de;
    border-radius: 12px;
    cursor: pointer;
    font-size: 12px;
  }
  .days input {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    inset: 0;
    margin: 0;
    cursor: pointer;
  }
  .days .selected {
    background: #e8f1e3;
    border-color: #89a77b;
    color: #315f46;
  }
  .days label:has(input:focus-visible) {
    outline: 2px solid #315f46;
    outline-offset: 2px;
  }
  .days strong {
    font-size: 17px;
  }
  .meals {
    display: flex;
    gap: 22px;
    margin-top: 16px;
    font-size: 14px;
  }
  .meals label {
    display: flex;
    gap: 7px;
    align-items: center;
  }
  input {
    accent-color: #315f46;
  }
  .entry {
    display: flex;
    gap: 8px;
  }
  .entry input {
    min-width: 0;
    flex: 1;
    border: 1px solid #dce6d9;
    border-radius: 11px;
    padding: 12px;
    font-size: 13px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 12px;
  }
  .chips > span {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px 5px 12px;
    background: #edf4e7;
    border-radius: 30px;
    font-size: 12px;
  }
  .chips button {
    padding: 0;
    border: 0;
    background: none;
    font-size: 19px;
    line-height: 1.2;
  }
  .hint {
    font-size: 11px;
    margin: 10px 0;
  }
  .notice {
    background: #f5f8f2;
    padding: 13px;
    border-radius: 12px;
    margin-top: 18px;
    font-size: 12px;
  }
  .notice button {
    border: 0;
    background: none;
    padding: 6px 0;
    text-align: left;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 22px;
    border-top: 1px solid #e7ece3;
    padding-top: 18px;
  }
  .primary {
    background: #315f46;
    color: #fff;
    border-color: #315f46;
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  @media (max-width: 430px) {
    form {
      padding: 20px;
    }
    h2 {
      font-size: 22px;
    }
    footer button {
      flex: 1;
      padding: 12px 8px;
    }
  }
</style>
