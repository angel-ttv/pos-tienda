# POS — Tienda (rescatado 6 nov 2026)

Punto de venta para tienda (probablemente la tienda de su mamá), local-first con sincronización a Firebase.

## Archivos
- `index.html` — "POS — Tienda": Ventas (con pestañas de tickets), Inventario, Clientes, Compras, Caja, Historial. Indicador En línea / sin conexión.
- `app.js` (814 líneas) — lógica principal.
- `db.js` — IndexedDB local (`tienda_pos_db` v2): productos, ventas, cola_sync. Todo trabaja contra la base local primero, así funciona sin internet.
- `sync.js` — sincroniza la cola con Firebase cuando vuelve la conexión.
- `caja.js`, `clientes.js`, `compras.js` — módulos por vista.
- `firebase-config.js` — proyecto Firebase `pos-ab`.
- `style.css`.

## Nota
Distinto del POS Papelería (ese es Flask + SQLite para la papelería; este es JS + IndexedDB + Firebase para tienda).
