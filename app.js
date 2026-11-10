// ============================================================
// app.js — Lógica principal del POS
// ============================================================

let tickets = [{ id: 1, items: [], cliente: null }]; // cada ticket: { id, items:[{codigo,nombre,precio,cantidad,sinInventario}], cliente }
let ticketActivoId = 1;
let productoEditando = null;
let metodoPagoActual = "efectivo"; // efectivo | tarjeta | credito
let clienteSeleccionadoVenta = null; // { id, nombre } cuando el método es crédito

function ticketActivo() {
  return tickets.find((t) => t.id === ticketActivoId);
}

// Reutiliza el número más bajo que esté libre (si borras el 2 sin usarlo, el próximo tícket vuelve a ser el 2)
function siguienteIdTicketDisponible() {
  let n = 1;
  while (tickets.some((t) => t.id === n)) n++;
  return n;
}

// ---------- INICIO ----------

window.addEventListener("DOMContentLoaded", async () => {
  await abrirDB();
  actualizarIndicadorConexion();
  await descargaInicialSiHaceFalta();
  await sincronizarConFirebase();

  configurarNavegacion();
  configurarVentas();
  configurarInventario();

  await refrescarVistaVentas();
  await refrescarVistaInventario();
  await refrescarVistaHistorial();
  if (typeof refrescarVistaClientes === "function") await refrescarVistaClientes();
  if (typeof refrescarVistaCompras === "function") await refrescarVistaCompras();
  if (typeof refrescarVistaCaja === "function") await refrescarVistaCaja();
});

// ---------- NAVEGACIÓN ----------

function configurarNavegacion() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("activo"));
      document.querySelectorAll(".vista").forEach((v) => v.classList.remove("activa"));
      btn.classList.add("activo");
      document.getElementById(btn.dataset.vista).classList.add("activa");

      if (btn.dataset.vista === "vista-historial") refrescarVistaHistorial();
      if (btn.dataset.vista === "vista-ventas") document.getElementById("input-scan").focus();
      if (btn.dataset.vista === "vista-clientes") refrescarVistaClientes();
      if (btn.dataset.vista === "vista-compras") refrescarVistaCompras();
      if (btn.dataset.vista === "vista-caja") refrescarVistaCaja();
    });
  });
}

// ============================================================
// VENTAS
// ============================================================

function configurarVentas() {
  const inputScan = document.getElementById("input-scan");

  inputScan.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const valor = inputScan.value.trim();
      inputScan.value = "";
      if (!valor) return;
      await agregarPorCodigoOBusqueda(valor);
    }
  });

  document.getElementById("btn-cobrar").addEventListener("click", abrirModalCobro);
  document.getElementById("btn-cancelar-venta").addEventListener("click", () => {
    if (ticketActivo().items.length === 0) return;
    if (!confirm("¿Vaciar los productos de este tícket?")) return;
    ticketActivo().items = [];
    renderCarrito();
  });

  document.getElementById("modal-cobro-cerrar").addEventListener("click", cerrarModalCobro);
  document.getElementById("input-recibido").addEventListener("input", calcularCambio);
  document.getElementById("btn-confirmar-cobro").addEventListener("click", confirmarVenta);

  document.querySelectorAll(".metodo-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".metodo-btn").forEach((b) => b.classList.remove("activo"));
      btn.classList.add("activo");
      metodoPagoActual = btn.dataset.metodo;
      document.getElementById("panel-efectivo").style.display = metodoPagoActual === "efectivo" ? "block" : "none";
      document.getElementById("panel-credito").style.display = metodoPagoActual === "credito" ? "block" : "none";
    });
  });

  document.getElementById("input-cliente-buscar").addEventListener("input", async (e) => {
    await buscarClientesParaCobro(e.target.value);
  });

  // ---- Controles de tícket ----
  document.getElementById("btn-cambiar-ticket").addEventListener("click", cambiarTicketPrompt);
  document.getElementById("btn-pendiente-ticket").addEventListener("click", dejarTicketPendiente);
  document.getElementById("btn-eliminar-ticket").addEventListener("click", eliminarTicketActivo);
  document.getElementById("btn-asignar-cliente-ticket").addEventListener("click", asignarClienteATicket);

  // ---- Atajos ----
  document.getElementById("atajo-varios").addEventListener("click", atajoVarios);
  document.getElementById("atajo-comun").addEventListener("click", atajoComun);
  document.getElementById("atajo-buscar").addEventListener("click", atajoBuscar);
  document.getElementById("atajo-mayoreo").addEventListener("click", atajoMayoreo);
  document.getElementById("atajo-entrada").addEventListener("click", () => registrarMovimiento("entrada"));
  document.getElementById("atajo-salida").addEventListener("click", () => registrarMovimiento("salida"));
  document.getElementById("atajo-borrar").addEventListener("click", atajoBorrarArticulo);
  document.getElementById("atajo-verificador").addEventListener("click", atajoVerificador);

  document.getElementById("btn-reimprimir").addEventListener("click", reimprimirUltimoTicket);
  document.getElementById("btn-ventas-dia").addEventListener("click", abrirVentasDelDia);
  document.getElementById("modal-ventas-dia-cerrar").addEventListener("click", () => {
    document.getElementById("modal-ventas-dia").classList.remove("visible");
  });
}

// Llamado desde clientes.js cuando se elige un cliente en el modal de cobro
function elegirClienteParaVenta(cliente) {
  clienteSeleccionadoVenta = cliente;
  document.getElementById("input-cliente-buscar").value = "";
  document.getElementById("sugerencias-clientes").innerHTML = "";
  const chip = document.getElementById("cliente-seleccionado");
  chip.style.display = "block";
  chip.textContent = `Cliente: ${cliente.nombre} (debe $${(cliente.saldo || 0).toFixed(2)})`;
}

// ---------- TICKETS (pestañas de venta) ----------

function renderTabsTickets() {
  const cont = document.getElementById("tickets-tabs");
  cont.innerHTML = "";

  tickets.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "ticket-tab" + (t.id === ticketActivoId ? " activo" : "");
    btn.textContent = `Tícket ${t.id}` + (t.items.length ? ` (${t.items.length})` : "");
    btn.addEventListener("click", () => {
      ticketActivoId = t.id;
      renderCarrito();
    });
    cont.appendChild(btn);
  });

  const btnNuevo = document.createElement("button");
  btnNuevo.className = "ticket-tab ticket-tab-nuevo";
  btnNuevo.textContent = "+";
  btnNuevo.addEventListener("click", () => {
    const nuevo = { id: siguienteIdTicketDisponible(), items: [], cliente: null };
    tickets.push(nuevo);
    ticketActivoId = nuevo.id;
    renderCarrito();
  });
  cont.appendChild(btnNuevo);
}

function cambiarTicketPrompt() {
  if (tickets.length <= 1) {
    alert("No hay otros tickets abiertos.");
    return;
  }
  const lista = tickets.map((t) => `${t.id}`).join(", ");
  const idElegido = parseInt(prompt(`Tickets abiertos: ${lista}\n¿A cuál cambiar?`));
  if (!idElegido) return;
  if (!tickets.find((t) => t.id === idElegido)) {
    alert("Ese tícket no existe.");
    return;
  }
  ticketActivoId = idElegido;
  renderCarrito();
}

function dejarTicketPendiente() {
  // El tícket actual se queda guardado en su pestaña (pendiente) y se abre uno nuevo.
  const nuevo = { id: siguienteIdTicketDisponible(), items: [], cliente: null };
  tickets.push(nuevo);
  ticketActivoId = nuevo.id;
  renderCarrito();
}

function eliminarTicketActivo() {
  if (ticketActivo().items.length > 0 && !confirm("Este tícket tiene productos. ¿Eliminarlo de todas formas?")) {
    return;
  }
  tickets = tickets.filter((t) => t.id !== ticketActivoId);
  if (tickets.length === 0) {
    tickets.push({ id: siguienteIdTicketDisponible(), items: [], cliente: null });
  }
  ticketActivoId = tickets[tickets.length - 1].id;
  renderCarrito();
}

async function asignarClienteATicket() {
  const nombre = prompt("Nombre del cliente para este tícket:");
  if (!nombre || !nombre.trim()) return;

  const clientes = await listarClientes();
  let cliente = clientes.find((c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase());

  if (!cliente) {
    if (!confirm(`No existe "${nombre.trim()}" en Clientes. ¿Crearlo?`)) return;
    cliente = await guardarCliente({ nombre: nombre.trim(), saldo: 0 });
    if (typeof refrescarVistaClientes === "function") refrescarVistaClientes();
  }

  ticketActivo().cliente = { id: cliente.id, nombre: cliente.nombre };
  renderClienteChipTicket();
}

function renderClienteChipTicket() {
  const chip = document.getElementById("ticket-cliente-chip");
  const t = ticketActivo();
  if (t.cliente) {
    chip.style.display = "block";
    chip.textContent = `Cliente asignado: ${t.cliente.nombre}`;
  } else {
    chip.style.display = "none";
  }
}

// ---------- ATAJOS ----------

async function atajoVarios() {
  const codigoOnombre = prompt("Código o nombre del producto:");
  if (!codigoOnombre || !codigoOnombre.trim()) return;

  let producto = await obtenerProducto(codigoOnombre.trim());
  if (!producto) {
    const todos = await listarProductos();
    producto = todos.find((p) => p.nombre.toLowerCase().includes(codigoOnombre.trim().toLowerCase()));
  }
  if (!producto) {
    alert("No se encontró ese producto.");
    return;
  }

  const cantidad = parseInt(prompt(`Cantidad de "${producto.nombre}":`, "1"));
  if (!cantidad || cantidad <= 0) return;

  const items = ticketActivo().items;
  const existente = items.find((i) => i.codigo === producto.codigo);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    items.push({ codigo: producto.codigo, nombre: producto.nombre, precio: producto.precio, cantidad });
  }
  renderCarrito();
}

function atajoComun() {
  const nombre = prompt("Descripción del producto (no se agrega al inventario):");
  if (!nombre || !nombre.trim()) return;
  const precio = parseFloat(prompt("Precio de venta:"));
  if (isNaN(precio) || precio < 0) return;
  const cantidad = parseInt(prompt("Cantidad:", "1")) || 1;

  ticketActivo().items.push({
    codigo: `COMUN-${Date.now()}`,
    nombre: nombre.trim(),
    precio,
    cantidad,
    sinInventario: true,
  });
  renderCarrito();
}

async function atajoBuscar() {
  const todos = await listarProductos();
  mostrarSugerencias(todos);
  document.getElementById("input-scan").focus();
}

async function atajoMayoreo() {
  const codigoOnombre = prompt("Código o nombre del producto (mayoreo):");
  if (!codigoOnombre || !codigoOnombre.trim()) return;

  let producto = await obtenerProducto(codigoOnombre.trim());
  if (!producto) {
    const todos = await listarProductos();
    producto = todos.find((p) => p.nombre.toLowerCase().includes(codigoOnombre.trim().toLowerCase()));
  }
  if (!producto) {
    alert("No se encontró ese producto.");
    return;
  }

  const cantidad = parseInt(prompt(`Cantidad de "${producto.nombre}" (mayoreo, sin descuento):`, "12"));
  if (!cantidad || cantidad <= 0) return;

  const items = ticketActivo().items;
  const existente = items.find((i) => i.codigo === producto.codigo);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    items.push({ codigo: producto.codigo, nombre: producto.nombre, precio: producto.precio, cantidad });
  }
  renderCarrito();
}

function atajoBorrarArticulo() {
  const items = ticketActivo().items;
  if (items.length === 0) {
    alert("El tícket no tiene artículos.");
    return;
  }
  const lista = items.map((i, idx) => `${idx + 1}. ${i.nombre} (x${i.cantidad})`).join("\n");
  const num = parseInt(prompt(`¿Cuál artículo borrar?\n${lista}`));
  if (!num || num < 1 || num > items.length) return;
  items.splice(num - 1, 1);
  renderCarrito();
}

async function atajoVerificador() {
  const valor = prompt("Código o nombre del producto a verificar:");
  if (!valor || !valor.trim()) return;

  let producto = await obtenerProducto(valor.trim());
  if (!producto) {
    const todos = await listarProductos();
    producto = todos.find((p) => p.nombre.toLowerCase().includes(valor.trim().toLowerCase()));
  }
  if (!producto) {
    alert("No se encontró ese producto.");
    return;
  }
  alert(`${producto.nombre}\nPrecio: $${producto.precio.toFixed(2)}\nExistencia: ${producto.stock}`);
}

// ---------- Agregar productos al tícket ----------

async function agregarPorCodigoOBusqueda(valor) {
  // 1. Intenta como código de barras exacto
  let producto = await obtenerProducto(valor);

  // 2. Si no hay match exacto, busca por nombre (coincidencia parcial)
  if (!producto) {
    const todos = await listarProductos();
    const encontrados = todos.filter((p) =>
      p.nombre.toLowerCase().includes(valor.toLowerCase())
    );
    if (encontrados.length === 1) {
      producto = encontrados[0];
    } else if (encontrados.length > 1) {
      mostrarSugerencias(encontrados);
      return;
    }
  }

  if (!producto) {
    alert(`No se encontró ningún producto para "${valor}".`);
    return;
  }

  agregarAlCarrito(producto);
}

function mostrarSugerencias(lista) {
  const cont = document.getElementById("sugerencias");
  cont.innerHTML = "";
  lista.slice(0, 8).forEach((p) => {
    const div = document.createElement("div");
    div.className = "sugerencia-item";
    div.textContent = `${p.nombre} — $${p.precio.toFixed(2)} (stock: ${p.stock})`;
    div.addEventListener("click", () => {
      agregarAlCarrito(p);
      cont.innerHTML = "";
    });
    cont.appendChild(div);
  });
}

function agregarAlCarrito(producto) {
  document.getElementById("sugerencias").innerHTML = "";

  if (producto.stock <= 0) {
    if (!confirm(`"${producto.nombre}" no tiene stock registrado. ¿Agregar de todas formas?`)) {
      return;
    }
  }

  const items = ticketActivo().items;
  const existente = items.find((i) => i.codigo === producto.codigo);
  if (existente) {
    existente.cantidad += 1;
  } else {
    items.push({
      codigo: producto.codigo,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: 1,
    });
  }
  renderCarrito();
  document.getElementById("input-scan").focus();
}

function cambiarCantidad(codigo, delta) {
  const items = ticketActivo().items;
  const item = items.find((i) => i.codigo === codigo);
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) {
    ticketActivo().items = items.filter((i) => i.codigo !== codigo);
  }
  renderCarrito();
}

function quitarDelCarrito(codigo) {
  ticketActivo().items = ticketActivo().items.filter((i) => i.codigo !== codigo);
  renderCarrito();
}

async function renderCarrito() {
  renderTabsTickets();
  renderClienteChipTicket();

  const tbody = document.getElementById("carrito-body");
  tbody.innerHTML = "";
  let total = 0;
  const items = ticketActivo().items;

  for (const item of items) {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;

    let existenciaTxt = "—";
    if (!item.sinInventario) {
      const producto = await obtenerProducto(item.codigo);
      existenciaTxt = producto ? producto.stock : "—";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.sinInventario ? "—" : item.codigo}</td>
      <td>${item.nombre}</td>
      <td>$${item.precio.toFixed(2)}</td>
      <td class="col-cant">
        <button class="btn-mini" onclick="cambiarCantidad('${item.codigo}', -1)">−</button>
        <span>${item.cantidad}</span>
        <button class="btn-mini" onclick="cambiarCantidad('${item.codigo}', 1)">+</button>
      </td>
      <td>$${subtotal.toFixed(2)}</td>
      <td>${existenciaTxt}</td>
      <td><button class="btn-mini btn-quitar" onclick="quitarDelCarrito('${item.codigo}')">×</button></td>
    `;
    tbody.appendChild(tr);
  }

  document.getElementById("carrito-total").textContent = `$${total.toFixed(2)}`;
  document.getElementById("btn-cobrar").disabled = items.length === 0;
}

function totalCarrito() {
  return ticketActivo().items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
}

function abrirModalCobro() {
  if (ticketActivo().items.length === 0) return;

  metodoPagoActual = "efectivo";
  clienteSeleccionadoVenta = ticketActivo().cliente || null;
  document.querySelectorAll(".metodo-btn").forEach((b) => b.classList.remove("activo"));
  document.querySelector('.metodo-btn[data-metodo="efectivo"]').classList.add("activo");
  document.getElementById("panel-efectivo").style.display = "block";
  document.getElementById("panel-credito").style.display = "none";
  document.getElementById("input-cliente-buscar").value = "";
  document.getElementById("sugerencias-clientes").innerHTML = "";

  const chip = document.getElementById("cliente-seleccionado");
  if (clienteSeleccionadoVenta) {
    chip.style.display = "block";
    chip.textContent = `Cliente: ${clienteSeleccionadoVenta.nombre}`;
  } else {
    chip.style.display = "none";
  }

  document.getElementById("modal-cobro-total").textContent = `$${totalCarrito().toFixed(2)}`;
  document.getElementById("input-recibido").value = "";
  document.getElementById("modal-cobro-cambio").textContent = "$0.00";
  document.getElementById("modal-cobro").classList.add("visible");
  document.getElementById("input-recibido").focus();
}

function cerrarModalCobro() {
  document.getElementById("modal-cobro").classList.remove("visible");
}

function calcularCambio() {
  const recibido = parseFloat(document.getElementById("input-recibido").value) || 0;
  const cambio = recibido - totalCarrito();
  document.getElementById("modal-cobro-cambio").textContent = `$${cambio >= 0 ? cambio.toFixed(2) : "0.00"}`;
}

async function confirmarVenta() {
  const total = totalCarrito();
  const items = ticketActivo().items;

  let recibido = total;
  let cambio = 0;

  if (metodoPagoActual === "efectivo") {
    recibido = parseFloat(document.getElementById("input-recibido").value) || 0;
    if (recibido < total) {
      alert("El monto recibido es menor al total.");
      return;
    }
    cambio = recibido - total;
  }

  if (metodoPagoActual === "credito" && !clienteSeleccionadoVenta) {
    alert("Selecciona o crea un cliente para la venta a crédito.");
    return;
  }

  const venta = {
    items: items.map((i) => ({ ...i })),
    total,
    metodoPago: metodoPagoActual,
    recibido: metodoPagoActual === "efectivo" ? recibido : total,
    cambio: metodoPagoActual === "efectivo" ? cambio : 0,
    clienteId: metodoPagoActual === "credito" ? clienteSeleccionadoVenta.id : null,
    clienteNombre: metodoPagoActual === "credito" ? clienteSeleccionadoVenta.nombre : (ticketActivo().cliente ? ticketActivo().cliente.nombre : null),
    fecha: new Date().toISOString(),
  };

  const idVenta = await guardarVenta(venta);
  venta.id = idVenta;
  await encolarSync({ tipo: "venta", datos: venta });

  if (metodoPagoActual === "credito") {
    await aumentarSaldoCliente(clienteSeleccionadoVenta.id, total);
  }

  // Descuenta stock de cada producto vendido (los ítems "Común" no afectan inventario)
  for (const item of items) {
    if (!item.sinInventario) {
      await descontarStock(item.codigo, item.cantidad);
    }
  }

  // Cierra este tícket y deja uno limpio activo
  eliminarTicketSilencioso(ticketActivoId);

  cerrarModalCobro();
  await refrescarVistaInventario();
  await refrescarVistaHistorial();
  if (typeof refrescarVistaClientes === "function") refrescarVistaClientes();
  if (typeof refrescarVistaCaja === "function") refrescarVistaCaja();
  sincronizarConFirebase();

  document.getElementById("input-scan").focus();
}

function eliminarTicketSilencioso(id) {
  tickets = tickets.filter((t) => t.id !== id);
  if (tickets.length === 0) {
    tickets.push({ id: siguienteIdTicketDisponible(), items: [], cliente: null });
  }
  ticketActivoId = tickets[tickets.length - 1].id;
  renderCarrito();
}

// ---------- Reimprimir / Ventas del día ----------

async function reimprimirUltimoTicket() {
  const ventas = await listarVentas();
  if (ventas.length === 0) {
    alert("Todavía no hay ninguna venta registrada.");
    return;
  }
  imprimirVenta(ventas[0]);
}

function imprimirVenta(venta) {
  const fecha = new Date(venta.fecha);
  const area = document.getElementById("area-imprimir");
  area.innerHTML = `
    <h2>Tienda</h2>
    <p>${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}</p>
    <hr>
    ${venta.items.map((i) => `<div>${i.cantidad} x ${i.nombre} — $${(i.precio * i.cantidad).toFixed(2)}</div>`).join("")}
    <hr>
    <p><strong>Total: $${venta.total.toFixed(2)}</strong></p>
    <p>Método: ${venta.metodoPago || "efectivo"}</p>
    ${venta.metodoPago === "efectivo" ? `<p>Pagó con: $${(venta.recibido || 0).toFixed(2)} — Cambio: $${(venta.cambio || 0).toFixed(2)}</p>` : ""}
    ${venta.clienteNombre ? `<p>Cliente: ${venta.clienteNombre}</p>` : ""}
  `;
  window.print();
}

async function abrirVentasDelDia() {
  const ventas = await listarVentas();
  const hoy = new Date().toDateString();
  const deHoy = ventas.filter((v) => new Date(v.fecha).toDateString() === hoy);

  const total = deHoy.filter((v) => !v.devuelta).reduce((s, v) => s + v.total, 0);
  document.getElementById("ventas-dia-total").innerHTML = `Total del día: <strong>$${total.toFixed(2)}</strong> (${deHoy.length} tickets)`;

  const cont = document.getElementById("ventas-dia-lista");
  cont.innerHTML = "";

  if (deHoy.length === 0) {
    cont.innerHTML = "<p class='vacio'>No hay ventas hoy todavía.</p>";
  } else {
    deHoy.forEach((v) => {
      const fecha = new Date(v.fecha);
      const div = document.createElement("div");
      div.className = "venta-card";
      div.innerHTML = `
        <div class="venta-card-header">
          <span>${fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${v.devuelta ? " (devuelta)" : ""}</span>
          <strong>$${v.total.toFixed(2)}</strong>
        </div>
        <div class="venta-card-items">${v.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(", ")}</div>
      `;
      if (!v.devuelta) {
        const btn = document.createElement("button");
        btn.className = "btn-mini btn-quitar";
        btn.textContent = "Devolver";
        btn.style.marginTop = "6px";
        btn.addEventListener("click", () => registrarDevolucion(v));
        div.appendChild(btn);
      }
      cont.appendChild(div);
    });
  }

  document.getElementById("modal-ventas-dia").classList.add("visible");
}

async function registrarDevolucion(venta) {
  if (venta.devuelta) return;
  if (!confirm(`¿Registrar devolución de $${venta.total.toFixed(2)}? Esto regresa el stock y ajusta la caja.`)) return;

  for (const item of venta.items) {
    if (!item.sinInventario) {
      const producto = await obtenerProducto(item.codigo);
      if (producto) {
        producto.stock = (producto.stock || 0) + item.cantidad;
        await guardarProducto(producto);
        await encolarSync({ tipo: "producto", codigo: producto.codigo, datos: producto });
      }
    }
  }

  if (venta.metodoPago === "efectivo" || !venta.metodoPago) {
    await guardarMovimientoCaja({ tipo: "salida", monto: venta.total, motivo: "Devolución de venta", fecha: new Date().toISOString() });
  } else if (venta.metodoPago === "credito" && venta.clienteId) {
    await aumentarSaldoCliente(venta.clienteId, -venta.total);
  }

  venta.devuelta = true;
  await actualizarVenta(venta);

  await refrescarVistaInventario();
  await refrescarVistaHistorial();
  if (typeof refrescarVistaCaja === "function") await refrescarVistaCaja();
  if (typeof refrescarVistaClientes === "function") await refrescarVistaClientes();
  sincronizarConFirebase();

  await abrirVentasDelDia();
}

async function refrescarVistaVentas() {
  await renderCarrito();
}

// ============================================================
// INVENTARIO
// ============================================================

function configurarInventario() {
  document.getElementById("btn-nuevo-producto").addEventListener("click", () => abrirFormularioProducto(null));
  document.getElementById("form-producto-cerrar").addEventListener("click", cerrarFormularioProducto);
  document.getElementById("form-producto").addEventListener("submit", guardarFormularioProducto);
  document.getElementById("input-buscar-inventario").addEventListener("input", refrescarVistaInventario);
}

async function refrescarVistaInventario() {
  const filtro = (document.getElementById("input-buscar-inventario")?.value || "").toLowerCase();
  const productos = await listarProductos();
  const tbody = document.getElementById("inventario-body");
  tbody.innerHTML = "";

  productos
    .filter((p) => p.nombre.toLowerCase().includes(filtro) || p.codigo.includes(filtro))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach((p) => {
      const margen = p.costo > 0 ? (((p.precio - p.costo) / p.precio) * 100).toFixed(0) : "—";
      const tr = document.createElement("tr");
      if (p.stock <= (p.stockMinimo || 0)) tr.classList.add("fila-alerta");
      tr.innerHTML = `
        <td>${p.codigo}</td>
        <td>${p.nombre}</td>
        <td>${p.categoria || "—"}</td>
        <td>$${(p.costo || 0).toFixed(2)}</td>
        <td>$${p.precio.toFixed(2)}</td>
        <td>${margen}%</td>
        <td>${p.stock}</td>
        <td>
          <button class="btn-mini" onclick="abrirFormularioProducto('${p.codigo}')">Editar</button>
          <button class="btn-mini btn-quitar" onclick="confirmarEliminarProducto('${p.codigo}')">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
}

async function abrirFormularioProducto(codigo) {
  productoEditando = codigo;
  const form = document.getElementById("form-producto");
  form.reset();

  document.getElementById("form-producto-titulo").textContent = codigo ? "Editar producto" : "Nuevo producto";
  document.getElementById("input-codigo").disabled = !!codigo;

  if (codigo) {
    const p = await obtenerProducto(codigo);
    if (p) {
      document.getElementById("input-codigo").value = p.codigo;
      document.getElementById("input-nombre").value = p.nombre;
      document.getElementById("input-categoria").value = p.categoria || "";
      document.getElementById("input-costo").value = p.costo || 0;
      document.getElementById("input-precio").value = p.precio;
      document.getElementById("input-stock").value = p.stock;
      document.getElementById("input-stock-minimo").value = p.stockMinimo || 0;
    }
  }

  document.getElementById("modal-producto").classList.add("visible");
  document.getElementById("input-codigo").focus();
}

function cerrarFormularioProducto() {
  document.getElementById("modal-producto").classList.remove("visible");
  productoEditando = null;
}

async function guardarFormularioProducto(e) {
  e.preventDefault();

  const codigo = document.getElementById("input-codigo").value.trim();
  if (!codigo) {
    alert("El código no puede estar vacío.");
    return;
  }

  const producto = {
    codigo,
    nombre: document.getElementById("input-nombre").value.trim(),
    categoria: document.getElementById("input-categoria").value.trim(),
    costo: parseFloat(document.getElementById("input-costo").value) || 0,
    precio: parseFloat(document.getElementById("input-precio").value) || 0,
    stock: parseInt(document.getElementById("input-stock").value) || 0,
    stockMinimo: parseInt(document.getElementById("input-stock-minimo").value) || 0,
    actualizadoLocal: Date.now(),
  };

  await guardarProducto(producto);
  await encolarSync({ tipo: "producto", codigo: producto.codigo, datos: producto });

  cerrarFormularioProducto();
  await refrescarVistaInventario();
  sincronizarConFirebase();
}

async function confirmarEliminarProducto(codigo) {
  if (!confirm("¿Eliminar este producto del catálogo? Esta acción no se puede deshacer.")) return;
  await eliminarProducto(codigo);
  await refrescarVistaInventario();
}

// ============================================================
// HISTORIAL
// ============================================================

async function refrescarVistaHistorial() {
  const ventas = await listarVentas();
  const cont = document.getElementById("historial-lista");
  cont.innerHTML = "";

  if (ventas.length === 0) {
    cont.innerHTML = "<p class='vacio'>Todavía no hay ventas registradas.</p>";
    return;
  }

  ventas.slice(0, 50).forEach((v) => {
    const fecha = new Date(v.fecha);
    const etiquetas = { efectivo: "Efectivo", tarjeta: "Tarjeta", credito: "Crédito" };
    const metodoTxt = etiquetas[v.metodoPago] || "Efectivo";
    const clienteTxt = v.clienteNombre ? ` · ${v.clienteNombre}` : "";

    const div = document.createElement("div");
    div.className = "venta-card";
    div.innerHTML = `
      <div class="venta-card-header">
        <span>${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${metodoTxt}${clienteTxt}</span>
        <strong>$${v.total.toFixed(2)}</strong>
      </div>
      <div class="venta-card-items">
        ${v.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(", ")}
      </div>
    `;
    cont.appendChild(div);
  });
}