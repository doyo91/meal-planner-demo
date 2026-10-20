<script lang="ts">
import { onMount } from 'svelte';
import { db, seed, weekDates, shoppingFor, type Recipe, type PlannedMeal, type Person, type Absence, type Meal } from '$lib/db';
type Tab = 'plan'|'recipes'|'shopping'|'settings';
let tab = $state<Tab>('plan');
let recipes = $state<Recipe[]>([]);
let plans = $state<PlannedMeal[]>([]);
let people = $state<Person[]>([]);
let absences = $state<Absence[]>([]);
let checked = $state<string[]>([]);
let ready = $state(false);
let search = $state('');
let week = $state(weekDates());
let newPerson = $state('');
const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
let filteredRecipes = $derived(recipes.filter(r=>`${r.name} ${r.cuisine}`.toLowerCase().includes(search.toLowerCase())));
let shopping = $derived(shoppingFor(plans.filter(p=>week.includes(p.date)),recipes));
const label = (date:string) => new Date(`${date}T12:00:00`).toLocaleDateString('es-ES',{day:'numeric',month:'short'});
const mealFor = (date:string,meal:Meal) => plans.find(p=>p.date===date&&p.meal===meal);
const present = (date:string) => people.filter(p=>!absences.some(a=>a.personId===p.id&&a.date===date)).length;
async function refresh() {
 [recipes,plans,people,absences] = await Promise.all([db.recipes.toArray(),db.plans.toArray(),db.people.toArray(),db.absences.toArray()]);
 checked=(await db.checks.filter(c=>c.checked).toArray()).map(c=>c.id);
}
onMount(()=>{void (async()=>{await seed();await refresh();ready=true;})()});
async function choose(date:string,meal:Meal,recipeId:string) {
 const existing=mealFor(date,meal);
 if (!recipeId) { if(existing) await db.plans.delete(existing.id); }
 else await db.plans.put({id:existing?.id??crypto.randomUUID(),date,meal,recipeId,servings:existing?.servings??Math.max(1,present(date))});
 await refresh();
}
async function changeServings(date:string,meal:Meal,value:number) {
 const p=mealFor(date,meal);if(p){await db.plans.update(p.id,{servings:Math.max(1,value)});await refresh();}
}
async function generate() {
 const used=new Set(plans.filter(p=>week.includes(p.date)).map(p=>p.recipeId));
 for(const date of week) for(const meal of ['comida','cena'] as Meal[]) {
  if(mealFor(date,meal)||!present(date))continue;
  const pool=recipes.filter(r=>!used.has(r.id));
  const options=pool.length?pool:recipes;
  const selected=options[Math.floor(Math.random()*options.length)];
  if(selected){await db.plans.put({id:crypto.randomUUID(),date,meal,recipeId:selected.id,servings:present(date)});used.add(selected.id);}
 }
 await refresh();
}
async function reset() {if(!confirm('¿Restaurar los datos de prueba?'))return;await db.delete();await db.open();await seed();await refresh();}
async function toggleCheck(id:string) {await db.checks.put({id,checked:!checked.includes(id)});await refresh();}
async function addPerson() {const name=newPerson.trim();if(!name)return;await db.people.add({id:crypto.randomUUID(),name});newPerson='';await refresh();}
async function toggleAbsence(personId:string,date:string) {
 const current=absences.find(a=>a.personId===personId&&a.date===date);
 if(current)await db.absences.delete(current.id);else await db.absences.add({id:crypto.randomUUID(),personId,date});
 await refresh();
}
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
<div class="days">{#each week as date,i}<article class="day"><div class="dayhead"><strong>{days[i]} <span>{label(date)}</span></strong><small>{present(date)} en casa</small></div><div class="meals">{#each ['comida','cena'] as meal}<div class="meal"><label for={`${date}-${meal}`}>{meal==='comida'?'Comida':'Cena'}</label><select id={`${date}-${meal}`} value={mealFor(date,meal as Meal)?.recipeId??''} onchange={e=>choose(date,meal as Meal,e.currentTarget.value)}><option value="">Sin planificar</option>{#each recipes as recipe}<option value={recipe.id}>{recipe.name}</option>{/each}</select>{#if mealFor(date,meal as Meal)}<div class="servings"><span>Raciones</span><button onclick={()=>changeServings(date,meal as Meal,(mealFor(date,meal as Meal)?.servings??1)-1)}>−</button><b>{mealFor(date,meal as Meal)?.servings}</b><button onclick={()=>changeServings(date,meal as Meal,(mealFor(date,meal as Meal)?.servings??1)+1)}>+</button></div>{/if}</div>{/each}</div></article>{/each}</div>
{:else if tab==='recipes'}
<section class="topline"><div><h2>Recetario</h2><p>{recipes.length} recetas de ejemplo</p></div></section><input class="search" placeholder="Buscar receta o cocina…" bind:value={search}/><div class="recipegrid">{#each filteredRecipes as r}<article class="recipecard"><div class="recipeicon">◈</div><div><small>{r.cuisine} · {r.minutes} min</small><h3>{r.name}</h3><p>{r.ingredients.map(i=>i.name).join(' · ')}</p><span class="servingtag">{r.servings} raciones</span></div></article>{/each}</div>
{:else if tab==='shopping'}
<section class="topline"><div><h2>Lista de compra</h2><p>Calculada desde el menú de esta semana</p></div></section><div class="summary"><strong>{shopping.length} ingredientes</strong><span>{shopping.filter(i=>checked.includes(i.id)).length} completados</span></div>{#if !shopping.length}<div class="empty">Planifica alguna comida para generar la lista.</div>{:else}<div class="shoppinglist">{#each shopping as item}<label class:done={checked.includes(item.id)} class="shoppingitem"><input type="checkbox" checked={checked.includes(item.id)} onchange={()=>toggleCheck(item.id)}/><span>{item.name}</span><strong>{Number(item.amount.toFixed(1))} {item.unit}</strong></label>{/each}</div>{/if}<p class="hint">Las cantidades se agrupan por ingrediente y unidad. La lista queda guardada en este dispositivo.</p>
{:else}
<section class="topline"><div><h2>Hogar y preferencias</h2><p>Personas y ausencias puntuales</p></div></section>
<div class="panel"><h3>Personas del hogar</h3>{#each people as p}<div class="person"><span>{p.name}</span><button class="muted" onclick={async()=>{await db.people.delete(p.id);await refresh();}}>Eliminar</button></div>{/each}<div class="addrow"><input placeholder="Nombre" bind:value={newPerson}/><button class="primary" onclick={addPerson}>Añadir</button></div></div>
<div class="panel"><h3>¿Quién come en casa esta semana?</h3><p class="hint">Pulsa un día para marcar una ausencia. Las raciones planificadas se ajustan desde el menú.</p><div class="absence"><div></div>{#each week as date,i}<strong>{days[i]}</strong>{/each}{#each people as p}<span>{p.name}</span>{#each week as date}<button class:away={absences.some(a=>a.personId===p.id&&a.date===date)} aria-label={`${p.name} ${date}`} onclick={()=>toggleAbsence(p.id,date)}>{absences.some(a=>a.personId===p.id&&a.date===date)?'–':'✓'}</button>{/each}{/each}</div></div>
<div class="panel"><h3>Datos de la demo</h3><p class="hint">Todo se guarda en IndexedDB. No se envía información a un servidor.</p><button class="danger" onclick={reset}>Restaurar datos de prueba</button></div>
{/if}
</main><nav aria-label="Navegación principal"><button class:active={tab==='plan'} onclick={()=>tab='plan'}><span>▦</span>Menú</button><button class:active={tab==='recipes'} onclick={()=>tab='recipes'}><span>▤</span>Recetas</button><button class:active={tab==='shopping'} onclick={()=>tab='shopping'}><span>☑</span>Compra</button><button class:active={tab==='settings'} onclick={()=>tab='settings'}><span>⚙</span>Ajustes</button></nav></div>
<style>
:global(*){box-sizing:border-box}:global(body){margin:0;background:#f6f7f3;color:#24342a;font-family:Inter,system-ui,-apple-system,sans-serif}:global(button),:global(input),:global(select){font:inherit}button{cursor:pointer}.app{max-width:1000px;margin:auto;padding-bottom:92px}header{display:flex;justify-content:space-between;align-items:center;padding:30px 20px 16px}h1{font-size:clamp(25px,5vw,36px);letter-spacing:-1.2px;margin:3px 0}header p,.topline p{color:#7b877c;margin:4px 0;font-size:14px}.eyebrow{font-size:10px;letter-spacing:2px;color:#61806a;font-weight:800}.pill{background:#e4eee2;color:#52765a;border-radius:30px;padding:8px 11px;font-size:12px;font-weight:700}main{padding:0 20px}.topline{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:20px 0}h2{font-size:23px;letter-spacing:-.7px;margin:0}.primary{border:0;background:#315f46;color:white;border-radius:13px;padding:12px 14px;font-weight:700;font-size:13px}.weeknav{display:flex;align-items:center;justify-content:center;gap:22px;background:white;border:1px solid #e8ece6;border-radius:16px;padding:9px;margin:16px 0}.weeknav button{background:#f1f5ef;border:0;border-radius:10px;width:34px;height:34px;font-size:24px;color:#315f46}.weeknav strong{font-size:14px}.days{display:grid;gap:12px}.day,.panel,.recipecard{background:white;border:1px solid #e7ece6;border-radius:18px;padding:16px}.dayhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:13px}.dayhead span,.dayhead small{font-size:12px;color:#839084}.dayhead small{background:#f1f5ef;padding:6px 9px;border-radius:20px}.meals{display:grid;grid-template-columns:1fr 1fr;gap:12px}.meal{min-width:0}.meal label{display:block;font-size:11px;font-weight:800;color:#7b887b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.meal select{width:100%;border:1px solid #e2e9e0;background:#fafbf9;border-radius:10px;padding:10px 7px;font-size:13px;color:#2a4031}.servings{display:flex;align-items:center;gap:7px;margin-top:8px;font-size:12px;color:#718071}.servings span{margin-right:auto}.servings button{border:0;border-radius:7px;background:#eaf2e9;width:25px;height:25px}.search,.addrow input{width:100%;border:1px solid #dfe6df;border-radius:13px;padding:14px;background:white}.recipegrid{display:grid;gap:12px}.recipecard{display:flex;gap:14px;align-items:flex-start}.recipeicon{display:grid;place-items:center;background:#eff5eb;border-radius:14px;font-size:26px;width:64px;height:64px;flex-shrink:0}.recipecard small{color:#66806a;font-size:12px}.recipecard h3{font-size:16px;margin:5px 0}.recipecard p{color:#7a867b;font-size:12px;margin:5px 0 10px}.servingtag{font-size:11px;background:#f1f5ef;padding:5px 8px;border-radius:9px}.summary{display:flex;justify-content:space-between;color:#637a65;padding:14px 4px;font-size:13px}.shoppinglist{background:white;border-radius:16px;overflow:hidden;border:1px solid #e7ece6}.shoppingitem{display:flex;align-items:center;gap:13px;padding:15px;border-bottom:1px solid #edf0ec}.shoppingitem:last-child{border:0}.shoppingitem input{accent-color:#315f46;width:19px;height:19px}.shoppingitem span{flex:1}.shoppingitem strong{font-size:13px}.shoppingitem.done span{text-decoration:line-through;color:#9ba69c}.hint{color:#7c887d;font-size:12px;line-height:1.6}.empty{padding:35px;text-align:center;color:#7b877c;background:white;border-radius:16px}.panel{margin:14px 0}.panel h3{margin:0 0 12px;font-size:16px}.person{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eef0ec;padding:10px 0}.muted{background:none;border:0;color:#9b6262}.addrow{display:flex;gap:8px;margin-top:14px}.absence{display:grid;grid-template-columns:minmax(65px,1.5fr) repeat(7,minmax(25px,1fr));gap:6px;align-items:center;font-size:11px;overflow-x:auto}.absence strong{text-align:center}.absence button{border:0;border-radius:8px;padding:9px 0;background:#e5f2e5;color:#2e6543}.absence button.away{background:#fae8e2;color:#a25a43}.danger{background:#fff2ee;border:1px solid #f2d5cc;color:#a64d37;padding:10px;border-radius:10px}nav{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-around;background:#fff;border-top:1px solid #e8ece6;padding:10px 8px max(12px,env(safe-area-inset-bottom));z-index:3}nav button{display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:none;color:#91a094;font-size:11px;font-weight:700;padding:4px 12px}nav button span{font-size:22px}nav button.active{color:#315f46}@media(min-width:760px){.days{grid-template-columns:repeat(2,1fr)}.recipegrid{grid-template-columns:repeat(2,1fr)}nav{left:50%;transform:translateX(-50%);max-width:1000px;border-left:1px solid #e8ece6;border-right:1px solid #e8ece6}}
</style>
