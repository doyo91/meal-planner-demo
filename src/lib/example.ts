import type { Recipe } from "./db";
// An explicit demo recipe: no variants are inferred for users' existing recipes.
export const variantExample: Recipe = {
  id: "demo-potato-variants",
  name: "Patatas con pistacho · ejemplo de variantes",
  cuisine: "Demo",
  description:
    "Ejemplo para probar equipamiento, ingredientes compartidos y añadidos individuales. Tiempos orientativos.",
  minutes: 35,
  servings: 2,
  ingredients: [],
  mealTypes: ["comida", "cena"],
  variants: [
    {
      id: "oven",
      name: "Al horno con añadido individual",
      minutes: 35,
      servings: 2,
      equipment: ["Horno"],
      ingredients: [
        { name: "Patata", amount: 400, unit: "g", component: "shared" },
        {
          name: "Aceite de oliva",
          amount: 15,
          unit: "ml",
          component: "shared",
        },
        {
          name: "Pistacho",
          amount: 20,
          unit: "g",
          component: "topping",
          optional: true,
          allergens: ["Pistacho", "Frutos secos"],
        },
      ],
      steps: [
        {
          order: 1,
          instruction:
            "Corta las patatas, mézclalas con el aceite y hornéalas a 200 °C hasta que estén tiernas y doradas. Ajusta el tiempo al tamaño de los trozos y al horno.",
        },
        {
          order: 2,
          instruction:
            "Sirve las patatas. El pistacho es un añadido opcional por comensal; aplica las omisiones registradas y revisa la separación durante la preparación.",
        },
      ],
    },
    {
      id: "air",
      name: "En freidora de aire con añadido individual",
      minutes: 25,
      servings: 2,
      equipment: ["Freidora de aire"],
      ingredients: [
        { name: "Patata", amount: 400, unit: "g", component: "shared" },
        { name: "Aceite de oliva", amount: 5, unit: "ml", component: "shared" },
        {
          name: "Pistacho",
          amount: 20,
          unit: "g",
          component: "topping",
          optional: true,
          allergens: ["Pistacho", "Frutos secos"],
        },
      ],
      steps: [
        {
          order: 1,
          instruction:
            "Corta las patatas, mezcla con el aceite y cocina en la freidora de aire a 190 °C, removiendo a mitad, hasta que estén tiernas. Ajusta tiempo y carga a tu aparato.",
        },
        {
          order: 2,
          instruction:
            "Sirve y añade el pistacho únicamente a las raciones que lo lleven, según las omisiones registradas.",
        },
      ],
    },
    {
      id: "boiled-sauce",
      name: "Cocidas con salsa compartida de pistacho",
      minutes: 30,
      servings: 2,
      equipment: ["Placa de cocina", "Batidora / trituradora"],
      ingredients: [
        { name: "Patata", amount: 400, unit: "g", component: "shared" },
        {
          name: "Aceite de oliva",
          amount: 10,
          unit: "ml",
          component: "shared",
        },
        {
          name: "Pistacho",
          amount: 20,
          unit: "g",
          component: "shared",
          allergens: ["Pistacho", "Frutos secos"],
        },
      ],
      steps: [
        {
          order: 1,
          instruction:
            "Cuece las patatas troceadas en agua hasta que estén tiernas y escúrrelas.",
        },
        {
          order: 2,
          instruction:
            "Tritura el pistacho con el aceite y un poco del agua de cocción hasta obtener una salsa. Mezcla con todas las patatas: el pistacho queda integrado en la preparación común.",
        },
      ],
    },
  ],
};
