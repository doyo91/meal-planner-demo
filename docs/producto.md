# Reglas de producto

Este documento describe las decisiones vigentes. Debe actualizarse en cada PR que cambie reglas o flujos. El código y las pruebas concretan su implementación; este documento explica su alcance y lo pendiente.

## Implementado

### Hogar, navegación y datos

- Una instalación mantiene un menú compartido. No hay cuentas independientes ni menús personales paralelos.
- Pestañas: Hoy, Planificar, Recetas, Compra y Perfil. Perfil y hogar incluye equipamiento, comensales, exclusiones y ayuda.
- Datos locales en IndexedDB, sin backend ni sincronización. Restaurar la demo borra los cambios locales. La versión 7 añade hogar y comensales conservando los datos anteriores; el perfil principal usa el identificador `single`.
- Hoy muestra comida y cena, raciones, estado, acceso a la receta y valoración personal única por receta. Estados: pendiente, realizada y no realizada.

### Comensales y raciones

- El perfil principal participa por defecto con una ración. Se pueden crear comensales habituales y seleccionarlos por comida o cena.
- Cada participante tiene sus raciones ajustables. Los invitados puntuales tienen raciones, pero sus restricciones deben registrarse creando un comensal habitual o usando una exclusión del hogar.
- Al menos un participante por plato. El total de raciones es la suma de sus cantidades; no se calculan todavía necesidades nutricionales individuales.
- Los planes antiguos sin participantes explícitos conservan sus cantidades y se interpretan como raciones del perfil principal. Los controles generales escalan las cantidades individuales proporcionalmente.
- No se elimina un comensal referenciado en un plan. Primero debe retirarse del menú.

### Equipamiento y variantes

- Equipamiento: horno, placa de cocina (vitrocerámica, inducción o gas), microondas, freidora de aire, vaporera, batidora/trituradora, robot de cocina y olla a presión.
- No se filtran cuchillos, boles, ollas, sartenes ni otros utensilios menores.
- Cada receta puede tener preparaciones explícitas con identificador estable, nombre, tiempo, ingredientes y cantidades, raciones base, pasos y todos los aparatos imprescindibles.
- Una preparación requiere todos sus aparatos. Las alternativas de método se modelan como variantes diferentes, nunca como aparatos intercambiables de una misma lista.
- Solo se excluye una receta de las propuestas si ninguna variante cumple las condiciones de ese plato. Las variantes se pueden consultar aunque no sean compatibles; la elección manual muestra los impedimentos.
- El equipamiento debe confirmarse antes de generar propuestas. Las recetas antiguas conservan una preparación original: horno si figuraba Horno y placa si figuraba Olla/Sartén (se conservan ambos si figuraban los dos); no se inventan métodos alternativos.
- Las recetas antiguas sin información de equipamiento requieren revisión en el editor antes de usarse automáticamente.
- La variante elegida queda guardada en el plan y determina la compra. No se permite eliminar una variante que figure en un plan.
- Las cantidades de ingredientes corresponden a las raciones base de cada variante y se escalan por las raciones realmente servidas.

### Componentes, gustos y restricciones

Cada ingrediente se clasifica como:

1. Base o preparación compartida.
2. Guarnición separada por comensal.
3. Añadido al servir.

Además se declara si puede omitirse y qué alérgenos/derivados contiene. Sin clasificación se considera compartido. La base compartida no es omisible por persona.

- Exclusiones por persona o por todo el hogar: no gusta, alergia o intolerancia. Solo cuentan las personas que participan en ese plato, además de las exclusiones del hogar.
- **No gusta y es opcional/separable:** omitir únicamente en la parte de la persona afectada. Ejemplo: patata como guarnición de una persona, conservada para otra.
- **No gusta y forma parte de la base:** advertir y evitar en propuestas automáticas; la elección manual permanece disponible para revisar el plato.
- **Alergia/intolerancia en la base:** bloquear la compatibilidad de la preparación compartida. Ejemplo: salsa común con pistacho afecta al plato compartido aunque solo una persona tenga la restricción.
- **Alergia/intolerancia en añadido opcional/separable:** omitir en la parte afectada y pedir revisión explícita del contacto cruzado. No se incluye automáticamente; una omisión no certifica seguridad.
- Las preparaciones incompatibles o con revisión de contacto pendiente no se pueden marcar como realizadas. Se pueden conservar en el borrador para corregirlas.
- Se compara de forma exacta el nombre normalizado del ingrediente y los alérgenos declarados. Se ignoran mayúsculas y tildes. No se infieren sinónimos, derivados no declarados, trazas, marcas comerciales ni grupos de alimentos.
- El cambio de restricciones o de receta recalcula las omisiones de planes pendientes y anula la revisión previa del contacto. No se cambian automáticamente las recetas ni los registros de comidas ya realizadas.
- Elegir otra variante o cambiar participantes/raciones vuelve a dejar el plato pendiente y obliga a revisar el contacto cuando corresponda.

### Planificación

- Manual por día y comida/cena, o completar automáticamente los huecos. No se sobrescriben platos existentes.
- «Generar menú» abre un diálogo previo: días de la semana, comidas/cenas e ingredientes opcionales que se quieren gastar. El bloque de ingredientes no permanece en la pantalla de planificación.
- Los ingredientes se recuerdan entre generaciones; solo se guardan al confirmar. Cancelar o cerrar con Escape descarta los cambios del diálogo y no modifica el menú. La generación se limita a los días y momentos elegidos.
- Las propuestas respetan momento de comida, equipamiento confirmado, participantes y exclusiones. Evitan preparaciones con impedimentos o advertencias pendientes.
- Productos que quiero gastar priorizan recetas por coincidencia explícita de ingrediente. No equivalen a existencias confirmadas ni descuentan cantidades de compra.
- Los platos se pueden fijar; las propuestas de sustitución respetan platos fijados y realizados.
- Las comidas no realizadas de semanas anteriores se ofrecen para reaprovechar. No se asume que sigan disponibles sus ingredientes.
- La generación de huecos usa por defecto el perfil principal. Los participantes se ajustan en cada plato. No hay aún una agenda semanal de comensales.

### Compra y existencias

- Agrupar por ingrediente y unidad. Sumar las cantidades de cada variante y descontar las omisiones individuales.
- Las comidas no realizadas se excluyen de la demanda semanal. Las realizadas permanecen en el total semanal; no es un inventario con consumo automático.
- Existencias y compras se revisan por semana. Datos: necesario, tengo, comprado, pendiente y no conseguido.
- «Tengo suficiente» registra la cantidad necesaria en ese momento, sin crear existencias infinitas. Aumentar raciones vuelve a calcular los faltantes.
- Las compras parciales se descuentan. Las cantidades pendientes nunca son negativas. No se trasladan existencias entre semanas.
- Las marcas antiguas de compra se conservan, pero no se convierten en cantidades confirmadas.
- Un producto no conseguido señala los platos afectados. Se proponen cambios de receta o variante que reduzcan faltantes sin aumentar otros productos no conseguidos, respetando equipo y restricciones.
- Las propuestas se muestran antes de aplicar. Son una heurística: pueden quedar faltantes; no se promete encontrar todas las combinaciones posibles.

## Acordado, pendiente

- Datos corporales opcionales, objetivo/tipo de dieta y estimaciones orientativas de energía y macros por comensal. No se han añadido formularios ni cálculos todavía.
- Distribución temporal del menú según caducidad/prioridad y disponibilidad. Hoy hay prioridad por ingredientes y sustituciones; no hay optimizador de fechas.
- Sustituciones explícitas de un componente por comensal: actualmente se implementan omisiones y cambio de receta/variante, no una segunda guarnición con ingredientes propios.

## Por definir

- Datos y criterios necesarios para nutrición individual, con tratamiento específico de menores, sin extrapolar objetivos de adultos.
- Catálogo fiable de ingredientes/alérgenos, equivalencias y derivados. Las coincidencias actuales dependen de la información declarada.
- Caducidades, reservas de ingredientes entre semanas y consumo real de inventario.
- Cómo mantener el historial cuando se edita el contenido de una variante usada en una comida pasada: hoy se referencia la receta viva, sin copia histórica completa.
