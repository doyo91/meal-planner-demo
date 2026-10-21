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

- Dos pasos: «Revisar en casa» y «Lista del súper». No se muestran gramos, unidades ni campos de cantidades en estas pantallas.
- Revisar muestra los ingredientes necesarios para el menú semanal. Cada ingrediente ofrece «Tengo suficiente» o «Comprar»; lo no elegido permanece por revisar.
- La lista del súper contiene únicamente ingredientes marcados «Comprar», con checks persistentes por semana. Desmarcar devuelve el producto a pendiente. Los ingredientes sin revisar no se añaden por defecto.
- Se muestra una sola fila por nombre de ingrediente, aunque varias recetas o unidades lo utilicen. Internamente se conservan las cantidades por unidad, variante y raciones individuales, descontando las omisiones.
- «Tengo suficiente» y el check de compra confirman internamente la demanda actual, sin crear existencias infinitas. Si aumenta la demanda por encima de lo confirmado, o aparece otra unidad para el mismo ingrediente, se pide revisar otra vez. Reducir la demanda conserva las decisiones que siguen cubriéndola.
- Los ingredientes dejan de aparecer cuando ya no son necesarios para ese menú. No se trasladan decisiones a otras semanas.
- Las comidas no realizadas se excluyen; las realizadas permanecen en el total semanal. No hay consumo automático de inventario.
- Los registros antiguos con cantidades se conservan: si cubren la demanda se interpretan como disponible; si tienen faltantes se propone comprar; sin revisión previa permanecen sin revisar. Los checks antiguos sin cantidades confirmadas no se convierten en existencias.
- La interfaz simplificada sustituye el registro de compras parciales, productos no conseguidos y propuestas de sustitución desde Compra. Los datos y funciones anteriores se conservan por compatibilidad; los estados antiguos de «no conseguido» ya no limitan la generación actual.

## Acordado, pendiente

- Datos corporales opcionales, objetivo/tipo de dieta y estimaciones orientativas de energía y macros por comensal. No se han añadido formularios ni cálculos todavía.
- Distribución temporal del menú según caducidad/prioridad y disponibilidad. Hoy hay prioridad por ingredientes y sustituciones; no hay optimizador de fechas.
- Sustituciones explícitas de un componente por comensal: actualmente se implementan omisiones y cambio de receta/variante, no una segunda guarnición con ingredientes propios.

## Por definir

- Datos y criterios necesarios para nutrición individual, con tratamiento específico de menores, sin extrapolar objetivos de adultos.
- Catálogo fiable de ingredientes/alérgenos, equivalencias y derivados. Las coincidencias actuales dependen de la información declarada.
- Caducidades, reservas de ingredientes entre semanas y consumo real de inventario.
- Cómo mantener el historial cuando se edita el contenido de una variante usada en una comida pasada: hoy se referencia la receta viva, sin copia histórica completa.
