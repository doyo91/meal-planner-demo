<script lang="ts">
  import {
    equipmentOptions,
    type Household,
    type Diner,
    type Exclusion,
  } from "$lib/household";
  let { household, diners, saveHousehold, saveDiner, removeDiner }: Props =
    $props();
  type Props = {
    household: Household;
    diners: Diner[];
    saveHousehold: (h: Household) => Promise<void>;
    saveDiner: (d: Diner) => Promise<void>;
    removeDiner: (id: string) => Promise<void>;
  };
  let name = $state("");
  let target = $state("single");
  let ingredient = $state("");
  let kind = $state<Exclusion["kind"]>("dislike");
  async function addExclusion() {
    if (!ingredient.trim()) return;
    const entry: Exclusion = {
      id: crypto.randomUUID(),
      ingredient: ingredient.trim(),
      kind,
    };
    if (target === "home")
      await saveHousehold({
        ...household,
        exclusions: [...household.exclusions, entry],
      });
    else {
      const diner = diners.find((d) => d.id === target);
      if (diner)
        await saveDiner({ ...diner, exclusions: [...diner.exclusions, entry] });
    }
    ingredient = "";
  }
  async function removeExclusion(personId: string, id: string) {
    if (personId === "home")
      await saveHousehold({
        ...household,
        exclusions: household.exclusions.filter((e) => e.id !== id),
      });
    else {
      const d = diners.find((d) => d.id === personId);
      if (d)
        await saveDiner({
          ...d,
          exclusions: d.exclusions.filter((e) => e.id !== id),
        });
    }
  }
</script>

<section class="panel">
  <h3>Equipamiento de cocina</h3>
  <p>
    Marca los aparatos disponibles. Las propuestas usarán únicamente variantes
    compatibles.
  </p>
  <div class="equipment">
    {#each equipmentOptions as device}<label
        ><input
          type="checkbox"
          checked={household.equipment.includes(device)}
          onchange={(e) =>
            saveHousehold({
              ...household,
              equipment: e.currentTarget.checked
                ? [...household.equipment, device]
                : household.equipment.filter((x) => x !== device),
            })}
        />{device}</label
      >{/each}
  </div>
  <button onclick={() => saveHousehold({ ...household, configured: true })}
    >{household.configured
      ? "Equipamiento confirmado · guardar"
      : "Confirmar equipamiento"}</button
  >{#if !household.configured}<p class="hint">
      Confirma también si no tienes ninguno de estos aparatos.
    </p>{/if}
</section>
<section class="panel">
  <h3>Mi perfil y comensales habituales</h3>
  <p>
    Un menú compartido. Selecciona quién come en cada plato; cada persona
    empieza con una ración ajustable.
  </p>
  {#each diners as diner}<div class="person">
      <label
        >{diner.id === "single" ? "Mi nombre" : "Nombre"}<input
          aria-label={`Nombre de ${diner.name}`}
          value={diner.name}
          onchange={(e) => {
            if (e.currentTarget.value.trim())
              saveDiner({ ...diner, name: e.currentTarget.value.trim() });
          }}
        /></label
      >{#if diner.id !== "single"}<button onclick={() => removeDiner(diner.id)}
          >Eliminar</button
        >{/if}
    </div>{/each}
  <form
    onsubmit={async (e) => {
      e.preventDefault();
      if (name.trim()) {
        await saveDiner({
          id: crypto.randomUUID(),
          name: name.trim(),
          exclusions: [],
        });
        name = "";
      }
    }}
  >
    <label
      >Nuevo comensal<input
        required
        bind:value={name}
        placeholder="Pareja, hijo…"
      /></label
    ><button>Añadir comensal</button>
  </form>
</section>
<section class="panel">
  <h3>Gustos, alergias e intolerancias</h3>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      addExclusion();
    }}
  >
    <label
      >Se aplica a<select bind:value={target}
        ><option value="home">Todo el hogar</option
        >{#each diners as diner}<option value={diner.id}>{diner.name}</option
          >{/each}</select
      ></label
    ><label
      >Ingrediente o alérgeno<input
        required
        bind:value={ingredient}
        placeholder="Ej. pistacho"
      /></label
    ><label
      >Motivo<select bind:value={kind}
        ><option value="dislike">No gusta</option><option value="allergy"
          >Alergia</option
        ><option value="intolerance">Intolerancia</option></select
      ></label
    ><button>Añadir exclusión</button>
  </form>
  {#each [{ id: "home", name: "Todo el hogar", exclusions: household.exclusions }, ...diners] as person}{#each person.exclusions as exclusion}<div
        class="exclusion"
      >
        <span
          >{person.name}: {exclusion.ingredient} · {exclusion.kind === "dislike"
            ? "No gusta"
            : exclusion.kind === "allergy"
              ? "Alergia"
              : "Intolerancia"}</span
        ><button
          aria-label={`Eliminar exclusión de ${exclusion.ingredient} para ${person.name}`}
          onclick={() => removeExclusion(person.id, exclusion.id)}
          >Quitar</button
        >
      </div>{/each}{/each}
  <p class="hint">
    Se compara el nombre del ingrediente y los alérgenos declarados en la
    receta. No se detectan automáticamente derivados, sinónimos, trazas ni
    ingredientes no declarados. Un añadido separable puede omitirse, pero
    requiere revisar el contacto cruzado.
  </p>
</section>
<section class="panel">
  <h3>Nutrición · más adelante</h3>
  <p>
    Quedan pendientes los datos corporales opcionales, objetivos de dieta y
    estimaciones de energía y macros por comensal. La demo todavía no realiza
    cálculos nutricionales.
  </p>
</section>
<section class="panel">
  <h3>Ayuda</h3>
  <details>
    <summary>Planificar y elegir variantes</summary>
    <p>
      Configura el equipamiento y completa los huecos de la semana o elige una
      receta en cada día. La preparación elegida determina aparatos, pasos,
      tiempo e ingredientes. Los platos fijados se conservan en las propuestas
      de sustitución.
    </p>
  </details>
  <details>
    <summary>Comensales y gustos</summary>
    <p>
      En cada plato puedes elegir personas habituales e invitados y ajustar sus
      raciones. Un ingrediente opcional y separable que no gusta se omite solo
      en su parte. Si forma parte de la preparación común, se muestra para
      revisión.
    </p>
  </details>
  <details>
    <summary>Alergias e intolerancias</summary>
    <p>
      Un ingrediente restringido en la base compartida bloquea esa preparación
      para los participantes afectados. Los añadidos opcionales separables se
      omiten en su parte y requieren revisión de contacto cruzado. Las
      propuestas automáticas no incluyen preparaciones que requieren esa
      revisión. La demo no certifica que una receta sea segura.
    </p>
  </details>
  <details>
    <summary>Existencias y compra</summary>
    <p>
      Revisa lo que tienes cada semana. Registra compras completas o parciales y
      productos no conseguidos. Las cantidades se ajustan a las variantes y
      raciones, incluidas las omisiones individuales. No se consume ni traslada
      inventario automáticamente.
    </p>
  </details>
  <details>
    <summary>Guardar y restaurar datos</summary>
    <p>
      Los datos permanecen en este navegador. No hay cuenta ni sincronización.
      Borrar datos del navegador o restaurar la demo elimina los cambios
      locales.
    </p>
  </details>
</section>

<style>
  .panel {
    background: white;
    border: 1px solid #e7ece6;
    border-radius: 18px;
    padding: 18px;
    margin: 14px 0;
  }
  h3 {
    margin: 0 0 12px;
  }
  p {
    font-size: 13px;
    line-height: 1.6;
  }
  label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    margin: 10px 0;
  }
  input,
  select {
    min-width: 0;
    width: 100%;
    padding: 10px;
    border: 1px solid #c8ddc7;
    border-radius: 9px;
    font: inherit;
  }
  .equipment {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 5px;
  }
  .equipment label {
    display: flex;
    align-items: center;
  }
  .equipment input {
    width: auto;
  }
  button {
    border: 1px solid #c8ddc7;
    border-radius: 9px;
    padding: 9px 12px;
    background: #edf4ea;
    color: #315f46;
    cursor: pointer;
  }
  .person,
  .exclusion {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    border-bottom: 1px solid #edf0ec;
    padding: 8px 0;
  }
  .person label {
    flex: 1;
  }
  .hint {
    color: #637164;
  }
  details {
    padding: 12px 0;
    border-bottom: 1px solid #edf0ec;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
  }
</style>
