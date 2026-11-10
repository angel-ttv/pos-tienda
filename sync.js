// ============================================================
// sync.js — Manda a Firebase lo que se guardó offline
// No bloquea nunca la operación de la tienda: si falla, se
// reintenta después, la venta ya quedó segura en IndexedDB.
// ============================================================

let sincronizando = false;

async function sincronizarConFirebase() {
  if (sincronizando) return;
  if (!navigator.onLine) return;

  sincronizando = true;
  actualizarIndicadorConexion();

  try {
    const cola = await obtenerColaSync();
    if (cola.length === 0) {
      sincronizando = false;
      return;
    }

    const idsCompletados = [];

    for (const item of cola) {
      try {
        if (item.tipo === "producto") {
          await firestore.collection("productos").doc(String(item.codigo)).set(item.datos, { merge: true });
        } else if (item.tipo === "venta") {
          await firestore.collection("ventas").add(item.datos);
        } else if (item.tipo === "cliente") {
          await firestore.collection("clientes").doc(String(item.codigo)).set(item.datos, { merge: true });
        } else if (item.tipo === "compra") {
          await firestore.collection("compras").add(item.datos);
        } else if (item.tipo === "corte") {
          await firestore.collection("cortes").add(item.datos);
        } else if (item.tipo === "movimiento_caja") {
          await firestore.collection("movimientos_caja").add(item.datos);
        }
        idsCompletados.push(item.id);
      } catch (err) {
        console.warn("No se pudo sincronizar un elemento, se reintentará:", err);
      }
    }

    if (idsCompletados.length > 0) {
      await limpiarColaSync(idsCompletados);
    }
  } finally {
    sincronizando = false;
    actualizarIndicadorConexion();
  }
}

// Al iniciar la app: si hay productos en Firebase y la tienda local está
// vacía (primera vez en este dispositivo), se descargan una sola vez.
async function descargaInicialSiHaceFalta() {
  if (!navigator.onLine) return;
  const productosLocales = await listarProductos();
  if (productosLocales.length > 0) return;

  try {
    const snap = await firestore.collection("productos").get();
    for (const doc of snap.docs) {
      await guardarProducto(doc.data());
    }
    if (typeof refrescarVistaInventario === "function") refrescarVistaInventario();
    if (typeof refrescarVistaVentas === "function") refrescarVistaVentas();
  } catch (err) {
    console.warn("No se pudo hacer la descarga inicial desde Firebase:", err);
  }
}

function actualizarIndicadorConexion() {
  const el = document.getElementById("estado-conexion");
  if (!el) return;
  if (!navigator.onLine) {
    el.textContent = "Sin conexión — trabajando local";
    el.className = "estado offline";
  } else if (sincronizando) {
    el.textContent = "Sincronizando...";
    el.className = "estado sync";
  } else {
    el.textContent = "En línea";
    el.className = "estado online";
  }
}

window.addEventListener("online", sincronizarConFirebase);
window.addEventListener("offline", actualizarIndicadorConexion);

// Reintenta cada 30 segundos por si algo quedó pendiente
setInterval(sincronizarConFirebase, 30000);