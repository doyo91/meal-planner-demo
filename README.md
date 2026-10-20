# Meal Planner Demo

Prototipo móvil con SvelteKit 2, Svelte 5, TypeScript e IndexedDB (Dexie).

```bash
npm install
npm run dev
```

Datos de prueba locales, menú de hoy, planificación semanal, recetario y compra con revisión de existencias. Sin backend ni sincronización. Los datos se guardan por navegador; se pueden restablecer desde Ajustes.

Para publicar: GitHub → Settings → Pages → Source: GitHub Actions. El workflow publica cada cambio en `main`.

## Flujo de la demo

- **Hoy**: comida y cena, raciones, estado, receta y valoración después de realizarla.
- **Planificar**: selección manual, completar huecos automáticamente, productos que gastar y platos fijados. Se conserva el menú existente.
- **Recetas**: búsqueda, filtros, detalle y creación con ingredientes y preparación.
- **Compra**: cantidades necesarias, existencias confirmadas, compras parciales y productos no conseguidos. Las revisiones se guardan por semana e ingrediente/unidad.
- **Sustituciones**: propuestas que reducen los ingredientes no conseguidos, respetan platos fijados y realizados, y se aplican tras revisar los cambios. Pueden quedar faltantes; no es un optimizador completo del menú.

Las existencias no se trasladan entre semanas ni se consumen automáticamente. «Tengo suficiente» registra la cantidad necesaria en ese momento: si aumentan las raciones, se vuelve a calcular lo que falta. Las marcas de compra antiguas se conservan en la base de datos, pero no se convierten en cantidades sin confirmar.

## Validación

Con Node.js 22.18 o posterior:

```bash
npm test
npm run check
npm run build
```

Las pruebas verifican cantidades, compras parciales, separación semanal, existencias finitas, migración de IndexedDB y sustituciones.

## Reglas del producto

Consultar [docs/producto.md](docs/producto.md) para el alcance implementado, las decisiones acordadas pendientes y las cuestiones por definir. Toda PR que cambie reglas debe actualizarlo.

Perfil y hogar permite confirmar equipamiento, gestionar comensales y registrar gustos, alergias e intolerancias. Las recetas se editan mediante preparaciones con ingredientes, aparatos y pasos propios. Desde Recetas se puede añadir un ejemplo explícito para probar variantes y pistacho compartido frente a añadido individual.
