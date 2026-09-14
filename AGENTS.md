# AGENTS.md

Construí una aplicación completa de fútbol amateur utilizando EXCLUSIVAMENTE Next.js + React + TypeScript.

## REGLA PRINCIPAL

Toda la interfaz de la aplicación debe estar contenida en UN SOLO ARCHIVO:

app/page.tsx

Ese archivo debe contener:

- componentes
- tipos
- constantes
- estilos
- lógica de UI
- cálculos
- algoritmo de equipos

Usar:

"use client"

## PERMITIDO

- APIs
- route handlers en `app/api/**`
- backend
- MongoDB y su driver oficial
- variables de entorno (`.env.local`)

Mantener la cantidad de archivos al mínimo necesario para que el backend funcione.

## NO CREAR

- componentes separados de UI
- archivos CSS
- Prisma
- FastAPI

## PERSISTENCIA

Persistir los datos en MongoDB a través de route handlers de Next.js.

La UI consume esos endpoints con `fetch`.

---

# OBJETIVO

Crear una aplicación donde un grupo de jugadores de fútbol pueda:

1. Elegir quién está usando la aplicación.
2. Puntuar a otros jugadores.
3. Evaluar 10 skills con estrellas de 1 a 5.
4. Guardar las evaluaciones.
5. Modificar evaluaciones existentes.
6. Calcular automáticamente el rating de cada jugador.
7. Mostrar ranking.
8. Ver el perfil y skills de cada jugador.
9. Seleccionar quién juega hoy.
10. Generar dos equipos lo más equilibrados posible.
11. Mostrar 3 alternativas de equipos.

---

# JUGADORES INICIALES

Inicializar automáticamente estos jugadores:

POTE
ROCHO
MANU
BRIAN
LUCAS V
MONJA
MARTINCITO
LAGAR
GUSTAVO
NACHO
DODI
BURNE

Cada jugador debe tener:

```ts
type Player = {
  id: string
  name: string
  position?: "ARQ" | "DEF" | "MED" | "DEL"
  active: boolean
}
