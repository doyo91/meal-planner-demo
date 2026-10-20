import Dexie, { type EntityTable } from 'dexie';
export type Meal = 'comida' | 'cena';
export interface Ingredient { name: string; amount: number; unit: 'g' | 'ml' | 'ud' }
export type Season = 'primavera' | 'verano' | 'otoño' | 'invierno';
export type MealType = 'comida' | 'cena';
export interface RecipeStep { order: number; instruction: string; minutes?: number }
export interface Recipe extends Record<string, unknown> {
  id: string; name: string; cuisine: string; minutes: number; servings: number;
  ingredients: Ingredient[]; description?: string; steps?: RecipeStep[];
  equipment?: string[]; seasons?: Season[]; mealTypes?: MealType[];
  tags?: string[]; seasonalIngredients?: string[];
  prepMinutes?: number; cookMinutes?: number; createdAt?: string; updatedAt?: string;
}
export interface RecipeRating { id: string; recipeId: string; personId: string; score: number; updatedAt: string }
export function ratingSummary(ratings: RecipeRating[], recipeId: string) {
  const votes = ratings.filter(r => r.recipeId === recipeId);
  return { count: votes.length, average: votes.length ? votes.reduce((sum,r)=>sum+r.score,0)/votes.length : null };
}
export interface PlannedMeal { id: string; date: string; meal: Meal; recipeId: string; servings: number }
export interface ShoppingCheck { id: string; checked: boolean }
export interface Person { id: string; name: string }
export interface Absence { id: string; personId: string; date: string }
class PlannerDatabase extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
  plans!: EntityTable<PlannedMeal, 'id'>;
  checks!: EntityTable<ShoppingCheck, 'id'>;
  ratings!: EntityTable<RecipeRating, 'id'>;
  constructor() {
    super('meal-planner-demo');
    this.version(1).stores({ recipes: 'id, name, cuisine', plans: 'id, date, meal', checks: 'id, checked', people: 'id', absences: 'id, personId, date' });
    this.version(2).stores({ recipes: 'id, name, cuisine, *seasons, *mealTypes, *tags', plans: 'id, date, meal', checks: 'id, checked', people: 'id', absences: 'id, personId, date', ratings: 'id, recipeId, personId, [recipeId+personId]' }).upgrade(async tx => { await tx.table('recipes').toCollection().modify(recipe => Object.assign(recipe, enrichRecipe(recipe))); });
    this.version(3).stores({ recipes: 'id, name, cuisine, *seasons, *mealTypes, *tags', plans: 'id, date, meal', checks: 'id, checked', people: null, absences: null, ratings: 'id, recipeId, personId, [recipeId+personId]' }).upgrade(async tx => {
      const existing = await tx.table('ratings').toArray() as RecipeRating[];
      const latest = new Map<string, RecipeRating>();
      for (const vote of existing) {
        const prev = latest.get(vote.recipeId);
        if (!prev || vote.updatedAt > prev.updatedAt) latest.set(vote.recipeId, vote);
      }
      await tx.table('ratings').clear();
      await tx.table('ratings').bulkPut([...latest.values()].map(vote => ({ ...vote, id: `${vote.recipeId}:single`, personId: 'single' })));
    });
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

// Ingredients in v1 were totals for the legacy 'servings' field.
// Normalize them to a one-serving basis without changing existing shopping quantities.
export function enrichRecipe(recipe: Recipe): Recipe {
  const descriptions: Record<string,string> = {
    r1:'Pasta rápida con salsa de tomate y albahaca fresca.',
    r2:'Pollo jugoso asado con guarnición de patatas.',
    r3:'Garbanzos cremosos con especias y leche de coco.',
    r4:'Ensalada fresca de quinoa y hortalizas.',
    r5:'Salmón al horno con verduras de temporada.',
    r6:'Arroz salteado con huevo y verduras.',
    r7:'Tortilla clásica de patata y cebolla.',
    r8:'Lentejas caseras con verduras.'
  };
  const configs: Record<string,{equipment:string[];seasons:Season[];mealTypes:MealType[];tags:string[];seasonalIngredients:string[];steps:string[]}> = {
    r1:{equipment:['Olla','Sartén'],seasons:['primavera','verano'],mealTypes:['comida','cena'],tags:['vegetariana','rápida'],seasonalIngredients:['Albahaca'],steps:['Hierve la pasta en agua con sal según el paquete.','Calienta el tomate triturado en una sartén durante 8 minutos.','Mezcla la pasta con la salsa y termina con albahaca fresca.']},
    r2:{equipment:['Horno','Bandeja de horno','Cuchillo'],seasons:['otoño','invierno'],mealTypes:['comida'],tags:['proteica','sin gluten'],seasonalIngredients:[],steps:['Precalienta el horno a 200 °C.','Corta las patatas y la cebolla; distribúyelas en una bandeja con el pollo.','Hornea 40–45 minutos hasta que el pollo esté bien cocinado.']},
    r3:{equipment:['Sartén','Cuchillo'],seasons:['otoño','invierno'],mealTypes:['comida','cena'],tags:['vegana','sin gluten'],seasonalIngredients:[],steps:['Pica y sofríe la cebolla.','Añade los garbanzos y las especias que prefieras.','Incorpora la leche de coco y cocina a fuego suave 15 minutos.']},
    r4:{equipment:['Olla','Colador','Cuchillo'],seasons:['primavera','verano'],mealTypes:['comida','cena'],tags:['vegetariana','fit','fresca'],seasonalIngredients:['Tomate','Pepino'],steps:['Lava la quinoa y cuécela según el envase.','Corta el tomate y el pepino.','Deja templar la quinoa y mezcla todos los ingredientes.']},
    r5:{equipment:['Horno','Bandeja de horno'],seasons:['primavera','verano'],mealTypes:['comida','cena'],tags:['proteica','fit','sin gluten'],seasonalIngredients:['Calabacín'],steps:['Precalienta el horno a 190 °C.','Trocea las verduras y colócalas junto al salmón.','Hornea 15–20 minutos, comprobando el punto del pescado.']},
    r6:{equipment:['Sartén','Olla'],seasons:['primavera','verano','otoño','invierno'],mealTypes:['comida','cena'],tags:['rápida','vegetariana'],seasonalIngredients:[],steps:['Cuece el arroz y escúrrelo.','Saltea la zanahoria cortada en dados.','Añade el huevo, remueve y mezcla con el arroz.']},
    r7:{equipment:['Sartén','Bol','Cuchillo'],seasons:['primavera','verano','otoño','invierno'],mealTypes:['comida','cena'],tags:['vegetariana','sin gluten'],seasonalIngredients:[],steps:['Pela y corta finas las patatas y la cebolla.','Cocínalas a fuego medio en una sartén hasta que estén tiernas.','Bate los huevos, mezcla y cuaja la tortilla por ambos lados.']},
    r8:{equipment:['Olla','Cuchillo'],seasons:['otoño','invierno'],mealTypes:['comida'],tags:['vegana','de cuchara'],seasonalIngredients:[],steps:['Pica la cebolla y la zanahoria.','Sofríe las verduras y añade las lentejas cocidas.','Cubre ligeramente con agua y cocina 15–20 minutos.']}
  };
  const cfg=configs[recipe.id];
  if (!cfg) return { ...recipe, description: recipe.description ?? '', steps: recipe.steps ?? [], equipment: recipe.equipment ?? [], seasons: recipe.seasons ?? [], mealTypes: recipe.mealTypes ?? ['comida','cena'], tags: recipe.tags ?? [], seasonalIngredients: recipe.seasonalIngredients ?? [] };
  return { ...recipe, description:recipe.description??descriptions[recipe.id], equipment:recipe.equipment??cfg.equipment, seasons:recipe.seasons??cfg.seasons, mealTypes:recipe.mealTypes??cfg.mealTypes, tags:recipe.tags??cfg.tags, seasonalIngredients:recipe.seasonalIngredients??cfg.seasonalIngredients, steps:recipe.steps??cfg.steps.map((instruction,i)=>({order:i+1,instruction})) };
}

export async function seed() {
  if (await db.recipes.count()) return;
  await db.recipes.bulkAdd(samples.map(enrichRecipe));
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
