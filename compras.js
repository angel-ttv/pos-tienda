// ============================================================
// compras.js — Registrar compras: aumenta stock y actualiza costo
// ============================================================

let compraActual = []; // { codigo, nombre, cantidad, costo }

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-agregar-item-compra").addEventListener("click", agregarItemCompra);
  document.getElementById("btn-guardar-compra").addEventListener("click", guardarCompraActual);

  document.getElementById("input-compra-codigo").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("input-compra-cantidad").focus();
    }
  });
});

async function agregarItemCompra() {
  const codigoInput = document.getElementById("input-compra-codigo");
  const codigo = codigoInput.value.trim();
  const cantidad = parseInt(document.getElementById("input-compra-cantidad").value) || 0;
  const costo = parseFloat(document.getElementById("input-compra-costo").value) || 0;

  if (!codigo || cantidad <= 0) {
    alert("Escribe el código del producto y una cantidad válida.");
    return;
  }

  let producto = await obtenerProducto(codigo);
  let nombre = producto ? producto.nombre : null;

  if (!producto) {
    nombre = prompt(`"${codigo}" no existe en el catálogo. ¿Nombre del producto nuevo?`);
    if (!nombre || !nombre.trim()) return;
  }

  compraActual.push({ codigo, nombre: nombre.trim(), cantidad, costo });
  renderCompraActual();

  codigoInput.value = "";
  document.getElementById("input-compra-cantidad").value = 1;
  document.getElementById("input-compra-costo").value = "";
  codigoInput.focus();
}

function renderCompraActual() {
  const tbody = document.getElementById("compra-body");
  tbody.innerHTML = "";
  let total = 0;

  compraActual.forEach((item, idx) => {
    const subtotal = item.cantidad * item.costo;
    total += subtotal;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.nombre}</td>
      <td>${item.cantidad}</td>
      <td>$${item.costo.toFixed(2)}</td>
      <td>$${subtotal.toFixed(2)}</td>
      <td><button class="btn-mini btn-quitar" onclick="quitarItemCompra(${idx})">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("compra-total").textContent = `$${total.toFixed(2)}`;
}

function quitarItemCompra(idx) {
  compraActual.splice(idx, 1);
  renderCompraActual();
}

async function guardarCompraActual() {
  if (compraActual.length === 0) {
    alert("Agrega al menos un producto a la compra.");
    return;
  }

  const proveedor = document.getElementById("input-proveedor").value.trim();
  const total = compraActual.reduce((sum, i) => sum + i.cantidad * i.costo, 0);

  const compra = {
    proveedor: proveedor || "Sin especificar",
    items: compraActual.map((i) => ({ ...i })),
    total,
    fecha: new Date().toISOString(),
  };

  for (const item of compraActual) {
    let producto = await obtenerProducto(item.codigo);
    if (!producto) {
      // Producto nuevo: se da de alta con precio de venta igual al costo temporalmente,
      // hay que ajustarlo luego desde Inventario.
      producto = await guardarProducto({
        codigo: item.codigo,
        nombre: item.nombre,
        categoria: "",
        costo: item.costo,
        precio: item.costo,
        stock: 0,
        stockMinimo: 0,
      });
    }
    await aplicarCompraAProducto(item.codigo, item.cantidad, item.costo);
  }

  await guardarCompra(compra);
  await encolarSync({ tipo: "compra", codigo: Date.now(), datos: compra });

  compraActual = [];
  renderCompraActual();
  document.getElementById("input-proveedor").value = "";

  await refrescarVistaCompras();
  await refrescarVistaInventario();
  sincronizarConFirebase();
}

async function refrescarVistaCompras() {
  const compras = await listarCompras();
  const cont = document.getElementById("compras-lista");
  if (!cont) return;
  cont.innerHTML = "";

  if (compras.length === 0) {
    cont.innerHTML = "<p class='vacio'>Todavía no hay compras registradas.</p>";
    return;
  }

  compras.slice(0, 30).forEach((c) => {
    const fecha = new Date(c.fecha);
    const div = document.createElement("div");
    div.className = "venta-card";
    div.innerHTML = `
      <div class="venta-card-header">
        <span>${fecha.toLocaleDateString()} · ${c.proveedor}</span>
        <strong>$${c.total.toFixed(2)}</strong>
      </div>
      <div class="venta-card-items">
        ${c.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(", ")}
      </div>
    `;
    cont.appendChild(div);
  });
}