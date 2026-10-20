<script lang="ts">
import { onMount } from 'svelte';
import { db, seed, weekDates, shoppingFor, type Recipe, type PlannedMeal, type Meal, type RecipeRating } from '$lib/db';
type Tab = 'plan'|'recipes'|'shopping'|'settings';
let tab = $state<Tab>('plan');
let recipes = $state<Recipe[]>([]);
let plans = $state<PlannedMeal[]>([]);
let checked = $state<string[]>([]);
let ready = $state(false);
let search = $state('');
let week = $state(weekDates());
let ratings = $state<RecipeRating[]>([]);
let selectedRecipe = $state<string | null>(null);
let cuisineFilter = $state('');
let mealFilter = $state('');
let seasonFilter = $state('');
let tagFilter = $state('');
const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
let filteredRecipes = $derived(recipes.filter(r=>`${r.name} ${r.cuisine} ${(r.tags??[]).join(' ')}`.toLowerCase().includes(search.toLowerCase()) && (!cuisineFilter||r.cuisine===cuisineFilter) && (!mealFilter||r.mealTypes?.includes(mealFilter as Meal)) && (!seasonFilter||r.seasons?.includes(seasonFilter as 'verano')) && (!tagFilter||r.tags?.includes(tagFilter))));
let detail = $derived(recipes.find(r=>r.id===selectedRecipe));
let cuisines = $derived([...new Set(recipes.map(r=>r.cuisine))].sort());
let tags = $derived([...new Set(recipes.flatMap(r=>r.tags??[]))].sort());
let shopping = $derived(shoppingFor(plans.filter(p=>week.includes(p.date)),recipes));
const label = (date:string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-ES',{day:'numeric',month:'short'});
const mealFor = (date:string,meal:Meal) => plans.find(p=>p.date===date&&p.meal===meal);

async function refresh() {
 [recipes,plans] = await Promise.all([db.recipes.toArray(),db.plans.toArray()]);
 checked=(await db.checks.filter(c=>c.checked).toArray()).map(c=>c.id);
 ratings=await db.ratings.toArray();
}
onMount(()=>{void (async()=>{await seed();await refresh();ready=true;})()});
async function choose(date:string,meal:Meal,recipeId:string) {
 const existing=mealFor(date,meal);
 if (!recipeId) { if(existing) await db.plans.delete(existing.id); }
 else await db.plans.put({id:existing?.id??crypto.randomUUID(),date,meal,recipeId,servings:existing?.servings??2});
 await refresh();
}
async function changeServings(date:string,meal:Meal,value:number) {
 const p=mealFor(date,meal);if(p){await db.plans.update(p.id,{servings:Math.max(1,value)});await refresh();}
}
async function generate() {
 const used=new Set(plans.filter(p=>week.includes(p.date)).map(p=>p.recipeId));
 for(const date of week) for(const meal of ['comida','cena'] as Meal[]) {
  if(mealFor(date,meal))continue;
  const pool=recipes.filter(r=>!used.has(r.id));
  const options=pool.length?pool:recipes;
  const selected=options[Math.floor(Math.random()*options.length)];
  if(selected){await db.plans.put({id:crypto.randomUUID(),date,meal,recipeId:selected.id,servings:2});used.add(selected.id);}
 }
 await refresh();
}
async function rate(recipeId:string,score:number){await db.ratings.put({id:`${recipeId}:single`,recipeId,personId:'single',score,updatedAt:new Date().toISOString()});await refresh();}
async function reset() {if(!confirm('¿Restaurar los datos de prueba?'))return;await db.delete();await db.open();await seed();await refresh();}
async function toggleCheck(id:string) {await db.checks.put({id,checked:!checked.includes(id)});await refresh();}
function moveWeek(direction:number){const d=new Date(`${week[0]}T12:00:00`);d.setDate(d.getDate()+7*direction);week=weekDates(d);}
</script>
<svelte:head><title>Menú de casa · Demo</title><meta name="description" content="Planificador semanal local de comidas"/></svelte:head>
<div class="app">
<header><div><small class="eyebrow">PROTOTIPO LOCAL</small><h1>Menú de casa <span>✳</span></h1><p>Organiza la semana, cocina sin complicaciones.</p></div><span class="pill">Sin cuenta</span></header>
<main>
{#if !ready}<p>Cargando datos locales…</p>
{:else if tab==='plan'}
<section class="topline"><div><h2>Tu semana</h2><p>Comidas y cenas para tu hogar</p></div><button class="primary" onclick={generate}>Completar menú</button></section>
<div class="weeknav"><button onclick={()=>moveWeek(-1)} aria-label="Semana anterior">‹</button><strong>{label(week[0])} — {label(week[6])}</strong><button onclick={()=>moveWeek(1)} aria-label="Semana siguiente">›</button></div>
<div class="days">{#each week as date,i}<article class="day"><div class="dayhead"><strong>{days[i]} <span>{label(date)}</span></strong><small>Menú compartido</small></div><div class="meals">{#each ['comida','cena'] as meal}<div class="meal"><label for={`${date}-${meal}`}>{meal==='comida'?'Comida':'Cena'}</label><select id={`${date}-${meal}`} value={mealFor(date,meal as Meal)?.recipeId??''} onchange={e=>choose(date,meal as Meal,e.currentTarget.value)}><option value="">Sin planificar</option>{#each recipes as recipe}<option value={recipe.id}>{recipe.name}</option>{/each}</select>{#if mealFor(date,meal as Meal)}<div class="servings"><span>Raciones</span><button onclick={()=>changeServings(date,meal as Meal,(mealFor(date,meal as Meal)?.servings??1)-1)}>−</button><b>{mealFor(date,meal as Meal)?.servings}</b><button onclick={()=>changeServings(date,meal as Meal,(mealFor(date,meal as Meal)?.servings??1)+1)}>+</button></div>{/if}</div>{/each}</div></article>{/each}</div>
{:else if tab==='recipes'}
<section class="topline"><div><h2>Recetario</h2><p>{filteredRecipes.length} de {recipes.length} recetas</p></div></section>
<input class="search" placeholder="Buscar receta, cocina o etiqueta…" bind:value={search}/>
<div class="filters">
<select aria-label="Cocina" bind:value={cuisineFilter}><option value="">Todas las cocinas</option>{#each cuisines as cuisine}<option value={cuisine}>{cuisine}</option>{/each}</select>
<select aria-label="Momento" bind:value={mealFilter}><option value="">Comida o cena</option><option value="comida">Comida</option><option value="cena">Cena</option></select>
<select aria-label="Estación" bind:value={seasonFilter}><option value="">Todas las estaciones</option>{#each ['primavera','verano','otoño','invierno'] as season}<option value={season}>{season}</option>{/each}</select>
<select aria-label="Etiqueta" bind:value={tagFilter}><option value="">Todas las etiquetas</option>{#each tags as tag}<option value={tag}>{tag}</option>{/each}</select>
</div>
{#if detail}
<article class="panel recipe-detail"><button class="back" onclick={()=>selectedRecipe=null}>← Volver a recetas</button><small>{detail.cuisine} · {detail.minutes} min</small><h2>{detail.name}</h2><p>{detail.description}</p>
<div class="chiprow">{#each detail.tags??[] as tag}<span class="chip">{tag}</span>{/each}{#each detail.seasons??[] as season}<span class="chip">{season}</span>{/each}</div>
<h3>Ingredientes para una ración</h3><p class="hint">Cantidades calculadas a partir de la receta base ({detail.servings} raciones).</p>
<div class="ingredient-list">{#each detail.ingredients as ingredient}<div><span>{ingredient.name}</span><strong>{Number((ingredient.amount/detail.servings).toFixed(1))} {ingredient.unit}</strong></div>{/each}</div>
<h3>Preparación</h3><ol class="steps">{#each detail.steps??[] as step}<li>{step.instruction}</li>{/each}</ol>
<h3>Utensilios</h3><div class="chiprow">{#each detail.equipment??[] as tool}<span class="chip">{tool}</span>{/each}</div>
<h3>Ingredientes de temporada</h3><p>{detail.seasonalIngredients?.length?detail.seasonalIngredients.join(', '):'No se han identificado ingredientes estacionales relevantes.'}</p>
<h3>Mi valoración</h3><p>{ratings.find(r=>r.recipeId===detail.id&&r.personId==='single')?.score??'Sin valorar'} / 5</p>
<div class="rate">{#each [1,2,3,4,5] as star}<button aria-label={`Valorar ${star} estrellas`} onclick={()=>rate(detail.id,star)}>★ {star}</button>{/each}</div>
</article>
{:else}
<div class="recipegrid">{#each filteredRecipes as r}<button class="recipecard recipe-button" onclick={()=>selectedRecipe=r.id}><div class="recipeicon">◈</div><div><small>{r.cuisine} · {r.minutes} min</small><h3>{r.name}</h3><p>{r.description}</p><div class="chiprow">{#each (r.tags??[]).slice(0,3) as tag}<span class="chip">{tag}</span>{/each}</div><small>★ {ratings.find(v=>v.recipeId===r.id&&v.personId==='single')?.score??'—'}</small></div></button>{/each}</div>
{/if}
{:else if tab==='shopping'}
<section class="topline"><div><h2>Lista de compra</h2><p>Calculada desde el menú de esta semana</p></div></section><div class="summary"><strong>{shopping.length} ingredientes</strong><span>{shopping.filter(i=>checked.includes(i.id)).length} completados</span></div>{#if !shopping.length}<div class="empty">Planifica alguna comida para generar la lista.</div>{:else}<div class="shoppinglist">{#each shopping as item}<label class:done={checked.includes(item.id)} class="shoppingitem"><input type="checkbox" checked={checked.includes(item.id)} onchange={()=>toggleCheck(item.id)}/><span>{item.name}</span><strong>{Number(item.amount.toFixed(1))} {item.unit}</strong></label>{/each}</div>{/if}<p class="hint">Las cantidades se agrupan por ingrediente y unidad. La lista queda guardada en este dispositivo.</p>
{:else}
<section class="topline"><div><h2>Ajustes</h2><p>Un menú compartido, sin perfiles</p></div></section>
<div class="panel"><h3>Cómo funcionan las raciones</h3><p class="hint">Cada comida se planifica por defecto para 2 raciones. Puedes subir o bajar las raciones de cualquier plato desde el menú; la lista de compra se recalcula automáticamente. Las valoraciones son personales y únicas por receta.</p></div>
<div class="panel"><h3>Datos de la demo</h3><p class="hint">Todo se guarda en IndexedDB. No se envía información a un servidor.</p><button class="danger" onclick={reset}>Restaurar datos de prueba</button></div>
{/if}
</main><nav aria-label="Navegación principal"><button class:active={tab==='plan'} onclick={()=>tab='plan'}><span>▦</span>Menú</button><button class:active={tab==='recipes'} onclick={()=>tab='recipes'}><span>▤</span>Recetas</button><button class:active={tab==='shopping'} onclick={()=>tab='shopping'}><span>☑</span>Compra</button><button class:active={tab==='settings'} onclick={()=>tab='settings'}><span>⚙</span>Ajustes</button></nav></div>
<style>
:global(*){box-sizing:border-box}:global(body){margin:0;background:#f6f7f3;color:#24342a;font-family:Inter,system-ui,-apple-system,sans-serif}:global(button),:global(input),:global(select){font:inherit}button{cursor:pointer}.app{max-width:1000px;margin:auto;padding-bottom:92px}header{display:flex;justify-content:space-between;align-items:center;padding:30px 20px 16px}h1{font-size:clamp(25px,5vw,36px);letter-spacing:-1.2px;margin:3px 0}header p,.topline p{color:#7b877c;margin:4px 0;font-size:14px}.eyebrow{font-size:10px;letter-spacing:2px;color:#61806a;font-weight:800}.pill{background:#e4eee2;color:#52765a;border-radius:30px;padding:8px 11px;font-size:12px;font-weight:700}main{padding:0 20px}.topline{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:20px 0}h2{font-size:23px;letter-spacing:-.7px;margin:0}.primary{border:0;background:#315f46;color:white;border-radius:13px;padding:12px 14px;font-weight:700;font-size:13px}.weeknav{display:flex;align-items:center;justify-content:center;gap:22px;background:white;border:1px solid #e8ece6;border-radius:16px;padding:9px;margin:16px 0}.weeknav button{background:#f1f5ef;border:0;border-radius:10px;width:34px;height:34px;font-size:24px;color:#315f46}.weeknav strong{font-size:14px}.days{display:grid;gap:12px}.day,.panel,.recipecard{background:white;border:1px solid #e7ece6;border-radius:18px;padding:16px}.dayhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:13px}.dayhead span,.dayhead small{font-size:12px;color:#839084}.dayhead small{background:#f1f5ef;padding:6px 9px;border-radius:20px}.meals{display:grid;grid-template-columns:1fr 1fr;gap:12px}.meal{min-width:0}.meal label{display:block;font-size:11px;font-weight:800;color:#7b887b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.meal select{width:100%;border:1px solid #e2e9e0;background:#fafbf9;border-radius:10px;padding:10px 7px;font-size:13px;color:#2a4031}.servings{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:12px;color:#718071}.servings span{margin-right:auto}.servings button{border:0;border-radius:7px;background:#eaf2e9;width:25px;height:25px}.search,.addrow input{width:100%;border:1px solid #dfe6df;border-radius:13px;padding:14px;background:white}.recipegrid{display:grid;gap:12px}.recipecard{display:flex;gap:14px;align-items:flex-start}.recipeicon{display:grid;place-items:center;background:#eff5eb;border-radius:14px;font-size:26px;width:64px;height:64px;flex-shrink:0}.recipecard small{color:#66806a;font-size:12px}.recipecard h3{font-size:16px;margin:5px 0}.recipecard p{color:#7a867b;font-size:12px;margin:5px 0 10px}.servingtag{font-size:11px;background:#f1f5ef;padding:5px 8px;border-radius:9px}.summary{display:flex;justify-content:space-between;color:#637a65;padding:14px 4px;font-size:13px}.shoppinglist{background:white;border-radius:16px;overflow:hidden;border:1px solid #e7ece6}.shoppingitem{display:flex;align-items:center;gap:13px;padding:15px;border-bottom:1px solid #edf0ec}.shoppingitem:last-child{border:0}.shoppingitem input{accent-color:#315f46;width:19px;height:19px}.shoppingitem span{flex:1}.shoppingitem strong{font-size:13px}.shoppingitem.done span{text-decoration:line-through;color:#9ba69c}.hint{color:#7c887d;font-size:12px;line-height:1.6}.empty{padding:35px;text-align:center;color:#7b877c;background:white;border-radius:16px}.panel{margin:14px 0}.panel h3{margin:0 0 12px;font-size:16px}.person{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eef0ec;padding:10px 0}.muted{background:none;border:0;color:#9b6262}.addrow{display:flex;gap:8px;margin-top:14px}.absence{display:grid;grid-template-columns:minmax(65px,1.5fr) repeat(7,minmax(25px,1fr));gap:6px;align-items:center;font-size:11px;overflow-x:auto}.absence strong{text-align:center}.absence button{border:0;border-radius:8px;padding:9px 0;background:#e5f2e5;color:#2e6543}.absence button.away{background:#fae8e2;color:#a25a43}.danger{background:#fff2ee;border:1px solid #f2d5cc;color:#a64d37;padding:10px;border-radius:10px}nav{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-around;background:#fff;border-top:1px solid #e8ece6;padding:10px 8px max(12px,env(safe-area-inset-bottom));z-index:3}nav button{display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:none;color:#91a094;font-size:11px;font-weight:700;padding:4px 12px}nav button span{font-size:22px}nav button.active{color:#315f46}@media(min-width:760px){.days{grid-template-columns:repeat(2,1fr)}.recipegrid{grid-template-columns:repeat(2,1fr)}nav{left:50%;transform:translateX(-50%);max-width:1000px;border-left:1px solid #e8ece6;border-right:1px solid #e8ece6}}
 .filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0 18px}.filters select,.rate select{min-width:0;width:100%;padding:10px;border:1px solid #e1e8df;border-radius:10px;background:white;color:#315f46;font-size:12px}.recipe-button{text-align:left;width:100%;cursor:pointer;color:inherit;font:inherit}.recipe-button:hover{border-color:#95b59a}.chiprow{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.chip{font-size:11px;background:#edf4ea;color:#477252;border-radius:30px;padding:5px 9px}.recipe-detail h2{margin:8px 0}.recipe-detail h3{margin:22px 0 8px}.recipe-detail>p{line-height:1.6}.back{border:0;background:none;color:#315f46;font-weight:700;padding:8px 0}.ingredient-list>div{display:flex;justify-content:space-between;border-bottom:1px solid #edf0ec;padding:10px 0}.steps{padding-left:22px;line-height:1.65}.steps li{padding:6px 0}.rate{display:flex;flex-wrap:wrap;gap:6px}.rate select{max-width:170px}.rate button{border:1px solid #dce7da;background:#f1f6ee;border-radius:8px;padding:8px;color:#315f46} </style>
