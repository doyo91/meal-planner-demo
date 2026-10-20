import Dexie, { type EntityTable } from 'dexie';
export type Meal = 'comida' | 'cena';
export interface Ingredient { name: string; amount: number; unit: 'g' | 'ml' | 'ud' }
export interface Recipe { id: string; name: string; cuisine: string; minutes: number; servings: number; ingredients: Ingredient[] }
export interface PlannedMeal { id: string; date: string; meal: Meal; recipeId: string; servings: number }
export interface ShoppingCheck { id: string; checked: boolean }
export interface Person { id: string; name: string }
export interface Absence { id: string; personId: string; date: string }
class PlannerDatabase extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
  plans!: EntityTable<PlannedMeal, 'id'>;
  checks!: EntityTable<ShoppingCheck, 'id'>;
  people!: EntityTable<Person, 'id'>;
  absences!: EntityTable<Absence, 'id'>;
  constructor() {
    super('meal-planner-demo');
    this.version(1).stores({ recipes: 'id, name, cuisine', plans: 'id, date, meal', checks: 'id, checked', people: 'id', absences: 'id, personId, date' });
  }
}
export const db = new PlannerDatabase();
export const samples: Recipe[] = [
  {id:'r1',name:'Pasta con tomate y albahaca',cuisine:'Mediterránea',minutes:20,servings:2,ingredients:[{name:'Pasta',amount:180,unit:'g'},{name:'Tomate triturado',amount:250,unit:'g'},{name:'Albahaca',amount:10,unit:'g'}]},
  {id:'r2',name:'Pollo al horno con patatas',cuisine:'Mediterránea',minutes:55,servings:2,ingredients:[{name:'Pollo',amount:400,unit:'g'},{name:'Patata',amount:350,unit:'g'},{name:'Cebolla',amount:1,unit:'ud'}]},
  {id:'r3',name:'Curry de garbanzos',cuisine:'India',minutes:30,servings:2,ingredients:[{name:'Garbanzos cocidos',amount:400,unit:'g'},{name:'Leche de coco',amount:200,unit:'ml'},{name:'Cebolla',amount:1,unit:'ud'}]},
  {id:'r4',name:'Ensalada de quinoa',cuisine:'Vegetariana',minutes:25,servings:2,ingredients:[{name:'Quinoa',amount:160,unit:'g'},{name:'Tomate',amount:2,unit:'ud'},{name:'Pepino',amount:1,unit:'ud'}]},
  {id:'r5',name:'Salmón con verduras',cuisine:'Mediterránea',minutes:25,servings:2,ingredients:[{name:'Salmón',amount:300,unit:'g'},{name:'Calabacín',amount:1,unit:'ud'},{name:'Zanahoria',amount:2,unit:'ud'}]},
  {id:'r6',name:'Arroz salteado con huevo',cuisine:'Asiática',minutes:20,servings:2,ingredients:[{name:'Arroz',amount:160,unit:'g'},{name:'Huevo',amount:2,unit:'ud'},{name:'Zanahoria',amount:2,unit:'ud'}]},
  {id:'r7',name:'Tortilla de patatas',cuisine:'Española',minutes:35,servings:2,ingredients:[{name:'Huevo',amount:4,unit:'ud'},{name:'Patata',amount:400,unit:'g'},{name:'Cebolla',amount:1,unit:'ud'}]},
  {id:'r8',name:'Lentejas con verduras',cuisine:'Casera',minutes:40,servings:2,ingredients:[{name:'Lentejas cocidas',amount:400,unit:'g'},{name:'Zanahoria',amount:2,unit:'ud'},{name:'Cebolla',amount:1,unit:'ud'}]}
];
export async function seed() {
  if (await db.recipes.count()) return;
  await db.transaction('rw', db.recipes, db.people, async () => {
    await db.recipes.bulkAdd(samples);
    if (!(await db.people.count())) await db.people.bulkAdd([{id:'p1',name:'Alex'},{id:'p2',name:'Sam'}]);
  });
}
export function weekDates(reference = new Date()): string[] {
  const d = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({length:7},(_,i)=>{ const x=new Date(d);x.setDate(d.getDate()+i);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; });
}
export function shoppingFor(plans: PlannedMeal[], recipes: Recipe[]) {
  const lookup = new Map(recipes.map(r=>[r.id,r]));
  const sums = new Map<string,{name:string;amount:number;unit:string}>();
  for(const plan of plans) {
    const recipe = lookup.get(plan.recipeId);if(!recipe) continue;
    for(const item of recipe.ingredients) {
      const id = `${item.name.toLowerCase()}|${item.unit}`;
      const current=sums.get(id) ?? {name:item.name,amount:0,unit:item.unit};
      current.amount += item.amount * plan.servings / recipe.servings;
      sums.set(id,current);
    }
  }
  return [...sums.entries()].map(([id,value])=>({id,...value})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
