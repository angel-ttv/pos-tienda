// ============================================================
// db.js — Capa de almacenamiento local (IndexedDB)
// Todo el POS trabaja contra esta base local primero.
// Así funciona aunque no haya internet en la tienda.
// ============================================================

const DB_NAME = "tienda_pos_db";
const DB_VERSION = 2;

let dbInstance = null;

function abrirDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains("productos")) {
        const store = db.createObjectStore("productos", { keyPath: "codigo" });
        store.createIndex("nombre", "nombre", { unique: false });
      }

      if (!db.objectStoreNames.contains("ventas")) {
        db.createObjectStore("ventas", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("cola_sync")) {
        db.createObjectStore("cola_sync", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("clientes")) {
        const store = db.createObjectStore("clientes", { keyPath: "id", autoIncrement: true });
        store.createIndex("nombre", "nombre", { unique: false });
      }

      if (!db.objectStoreNames.contains("movimientos_caja")) {
        db.createObjectStore("movimientos_caja", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("compras")) {
        db.createObjectStore("compras", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("cortes")) {
        db.createObjectStore("cortes", { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(nombreStore, modo = "readonly") {
  return abrirDB().then((db) => db.transaction(nombreStore, modo).objectStore(nombreStore));
}

// ---------- PRODUCTOS ----------

async function guardarProducto(producto) {
  const store = await tx("productos", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(producto);
    req.onsuccess = () => resolve(producto);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function obtenerProducto(codigo) {
  const store = await tx("productos");
  return new Promise((resolve, reject) => {
    const req = store.get(codigo);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function listarProductos() {
  const store = await tx("productos");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function eliminarProducto(codigo) {
  const store = await tx("productos", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(codigo);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// Descuenta stock de un producto (usado al cerrar una venta)
async function descontarStock(codigo, cantidad) {
  const producto = await obtenerProducto(codigo);
  if (!producto) return null;
  producto.stock = Math.max(0, (producto.stock || 0) - cantidad);
  producto.actualizadoLocal = Date.now();
  await guardarProducto(producto);
  await encolarSync({ tipo: "producto", codigo: producto.codigo, datos: producto });
  return producto;
}

// ---------- VENTAS ----------

async function guardarVenta(venta) {
  const store = await tx("ventas", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.add(venta);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function listarVentas() {
  const store = await tx("ventas");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).reverse());
    req.onerror = (e) => reject(e.target.error);
  });
}

async function actualizarVenta(venta) {
  const store = await tx("ventas", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(venta);
    req.onsuccess = () => resolve(venta);
    req.onerror = (e) => reject(e.target.error);
  });
}

// ---------- CLIENTES / FIADO ----------

async function guardarCliente(cliente) {
  const store = await tx("clientes", "readwrite");
  return new Promise((resolve, reject) => {
    const req = cliente.id ? store.put(cliente) : store.add(cliente);
    req.onsuccess = (e) => resolve({ ...cliente, id: cliente.id || e.target.result });
    req.onerror = (e) => reject(e.target.error);
  });
}

async function obtenerCliente(id) {
  const store = await tx("clientes");
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function listarClientes() {
  const store = await tx("clientes");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

// Suma al saldo que el cliente debe (venta a crédito)
async function aumentarSaldoCliente(id, monto) {
  const cliente = await obtenerCliente(id);
  if (!cliente) return null;
  cliente.saldo = (cliente.saldo || 0) + monto;
  await guardarCliente(cliente);
  await encolarSync({ tipo: "cliente", codigo: cliente.id, datos: cliente });
  return cliente;
}

// Registra un abono (pago) que reduce lo que debe el cliente
async function abonarCliente(id, monto) {
  const cliente = await obtenerCliente(id);
  if (!cliente) return null;
  cliente.saldo = Math.max(0, (cliente.saldo || 0) - monto);
  await guardarCliente(cliente);
  await encolarSync({ tipo: "cliente", codigo: cliente.id, datos: cliente });
  await guardarMovimientoCaja({ tipo: "entrada", monto, motivo: `Abono de ${cliente.nombre}`, fecha: new Date().toISOString() });
  return cliente;
}

// ---------- CAJA ----------

async function guardarMovimientoCaja(mov) {
  const store = await tx("movimientos_caja", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.add(mov);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function listarMovimientosCaja() {
  const store = await tx("movimientos_caja");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function guardarCorte(corte) {
  const store = await tx("cortes", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.add(corte);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function listarCortes() {
  const store = await tx("cortes");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).reverse());
    req.onerror = (e) => reject(e.target.error);
  });
}

async function obtenerUltimoCorte() {
  const cortes = await listarCortes();
  return cortes[0] || null;
}

// ---------- COMPRAS ----------

async function guardarCompra(compra) {
  const store = await tx("compras", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.add(compra);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function listarCompras() {
  const store = await tx("compras");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).reverse());
    req.onerror = (e) => reject(e.target.error);
  });
}

// Aumenta stock y actualiza el costo del producto (usado al registrar una compra)
async function aplicarCompraAProducto(codigo, cantidad, costoUnitario) {
  const producto = await obtenerProducto(codigo);
  if (!producto) return null;
  producto.stock = (producto.stock || 0) + cantidad;
  producto.costo = costoUnitario;
  producto.actualizadoLocal = Date.now();
  await guardarProducto(producto);
  await encolarSync({ tipo: "producto", codigo: producto.codigo, datos: producto });
  return producto;
}

// ---------- COLA DE SINCRONIZACIÓN ----------
// Cada cambio que se hace offline se guarda aquí. Cuando vuelve el
// internet, se manda todo a Firebase y se vacía la cola.

async function encolarSync(item) {
  item.creado = Date.now();
  const store = await tx("cola_sync", "readwrite");
  return new Promise((resolve, reject) => {
    const req = store.add(item);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function obtenerColaSync() {
  const store = await tx("cola_sync");
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function limpiarColaSync(ids) {
  const store = await tx("cola_sync", "readwrite");
  ids.forEach((id) => store.delete(id));
}