# Meal Planner Demo

- Read `docs/producto.md` before changing product behavior. It records agreed rules and separates implementation from pending work.
- Update that document in the same PR whenever a product rule changes. Do not infer that a pending feature is implemented.
- One shared household menu, with individual diners and portions. Nutrition estimates are pending.
- Recipe variants own their ingredients, quantities, required equipment, time and steps. Never invent an alternate method for an existing recipe.
- Treat unclassified ingredients as part of the shared preparation. Distinguish dislikes from allergies/intolerances, shared components from optional individual components, and omission from contact-cross-contamination review.
- Preserve existing IndexedDB data with versioned additive migrations.
- Run `npm test`, `npm run check` and `npm run build` for domain or schema changes. Add behavioral tests for quantities, restrictions, migrations and equipment compatibility as applicable.
