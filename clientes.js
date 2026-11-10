// ============================================================
// clientes.js — Fiado: clientes, saldos y abonos
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-nuevo-cliente").addEventListener("click", crearClientePrompt);
  document.getElementById("input-buscar-cliente").addEventListener("input", refrescarVistaClientes);
});

async function crearClientePrompt() {
  const nombre = prompt("Nombre del nuevo cliente:");
  if (!nombre || !nombre.trim()) return;
  await guardarCliente({ nombre: nombre.trim(), saldo: 0 });
  await refrescarVistaClientes();
}

async function refrescarVistaClientes() {
  const filtro = (document.getElementById("input-buscar-cliente")?.value || "").toLowerCase();
  const clientes = await listarClientes();
  const cont = document.getElementById("clientes-lista");
  if (!cont) return;
  cont.innerHTML = "";

  const filtrados = clientes
    .filter((c) => c.nombre.toLowerCase().includes(filtro))
    .sort((a, b) => (b.saldo || 0) - (a.saldo || 0));

  if (filtrados.length === 0) {
    cont.innerHTML = "<p class='vacio'>No hay clientes registrados todavía.</p>";
    return;
  }

  filtrados.forEach((c) => {
    const div = document.createElement("div");
    div.className = "venta-card";
    div.innerHTML = `
      <div class="venta-card-header">
        <span>${c.nombre}</span>
        <strong style="color:${c.saldo > 0 ? 'var(--rojo)' : 'var(--verde-oscuro)'}">$${(c.saldo || 0).toFixed(2)}</strong>
      </div>
      <div class="venta-card-items">
        <button class="btn-mini" onclick="abonarClientePrompt(${c.id})">Registrar abono</button>
      </div>
    `;
    cont.appendChild(div);
  });
}

async function abonarClientePrompt(id) {
  const cliente = await obtenerCliente(id);
  if (!cliente) return;
  const monto = parseFloat(prompt(`¿Cuánto abona ${cliente.nombre}? (debe $${(cliente.saldo || 0).toFixed(2)})`));
  if (!monto || monto <= 0) return;
  await abonarCliente(id, monto);
  await encolarSync({ tipo: "cliente", codigo: id, datos: await obtenerCliente(id) });
  await refrescarVistaClientes();
}

// ---------- Selector de cliente dentro del modal de cobro (venta a crédito) ----------

async function buscarClientesParaCobro(valor) {
  const cont = document.getElementById("sugerencias-clientes");
  cont.innerHTML = "";
  if (!valor || !valor.trim()) return;

  const clientes = await listarClientes();
  const encontrados = clientes.filter((c) => c.nombre.toLowerCase().includes(valor.toLowerCase()));

  encontrados.slice(0, 6).forEach((c) => {
    const div = document.createElement("div");
    div.className = "sugerencia-item";
    div.textContent = `${c.nombre} (debe $${(c.saldo || 0).toFixed(2)})`;
    div.addEventListener("click", () => elegirClienteParaVenta(c));
    cont.appendChild(div);
  });

  // Opción de crear cliente nuevo con ese nombre
  const divNuevo = document.createElement("div");
  divNuevo.className = "sugerencia-item sugerencia-nueva";
  divNuevo.textContent = `+ Crear cliente "${valor.trim()}"`;
  divNuevo.addEventListener("click", async () => {
    const nuevo = await guardarCliente({ nombre: valor.trim(), saldo: 0 });
    elegirClienteParaVenta(nuevo);
  });
  cont.appendChild(divNuevo);
}