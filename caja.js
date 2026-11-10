// ============================================================
// caja.js — Corte de caja: efectivo, tarjeta, crédito, entradas/salidas
// ============================================================

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-entrada-caja").addEventListener("click", () => registrarMovimiento("entrada"));
  document.getElementById("btn-salida-caja").addEventListener("click", () => registrarMovimiento("salida"));
  document.getElementById("btn-hacer-corte").addEventListener("click", hacerCorte);
});

async function registrarMovimiento(tipo) {
  const monto = parseFloat(prompt(tipo === "entrada" ? "Monto que entra a caja:" : "Monto que sale de caja:"));
  if (!monto || monto <= 0) return;

  let motivo = "";
  if (tipo === "salida") {
    motivo = prompt("¿Por qué sale este efectivo? (obligatorio):");
    if (!motivo || !motivo.trim()) {
      alert("Toda salida de efectivo necesita un motivo.");
      return;
    }
  } else {
    motivo = prompt("Motivo (opcional):") || "";
  }

  await guardarMovimientoCaja({ tipo, monto, motivo, fecha: new Date().toISOString() });
  await encolarSync({ tipo: "movimiento_caja", codigo: Date.now(), datos: { tipo, monto, motivo } });
  if (typeof refrescarVistaCaja === "function") await refrescarVistaCaja();
}

// Trae ventas y movimientos desde el último corte (o desde siempre si no hay cortes aún)
async function datosDesdeUltimoCorte() {
  const ultimoCorte = await obtenerUltimoCorte();
  const desde = ultimoCorte ? new Date(ultimoCorte.fecha).getTime() : 0;

  const ventas = (await listarVentas()).filter((v) => new Date(v.fecha).getTime() > desde);
  const movimientos = (await listarMovimientosCaja()).filter((m) => new Date(m.fecha).getTime() > desde);

  return { ultimoCorte, ventas, movimientos };
}

async function refrescarVistaCaja() {
  const cont = document.getElementById("caja-fondo");
  if (!cont) return;

  const { ultimoCorte, ventas, movimientos } = await datosDesdeUltimoCorte();

  const fondo = ultimoCorte ? ultimoCorte.fondoSiguiente || 0 : 0;
  const efectivo = ventas.filter((v) => v.metodoPago === "efectivo" || !v.metodoPago).reduce((s, v) => s + v.total, 0);
  const tarjeta = ventas.filter((v) => v.metodoPago === "tarjeta").reduce((s, v) => s + v.total, 0);
  const credito = ventas.filter((v) => v.metodoPago === "credito").reduce((s, v) => s + v.total, 0);
  const entradas = movimientos.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.monto, 0);
  const salidas = movimientos.filter((m) => m.tipo === "salida").reduce((s, m) => s + m.monto, 0);
  const esperado = fondo + efectivo + entradas - salidas;

  document.getElementById("caja-fondo").textContent = `$${fondo.toFixed(2)}`;
  document.getElementById("caja-efectivo").textContent = `$${efectivo.toFixed(2)}`;
  document.getElementById("caja-tarjeta").textContent = `$${tarjeta.toFixed(2)}`;
  document.getElementById("caja-credito").textContent = `$${credito.toFixed(2)}`;
  document.getElementById("caja-entradas").textContent = `$${entradas.toFixed(2)}`;
  document.getElementById("caja-salidas").textContent = `$${salidas.toFixed(2)}`;
  document.getElementById("caja-esperado").textContent = `$${esperado.toFixed(2)}`;

  await renderCortesAnteriores();
}

async function hacerCorte() {
  const { ultimoCorte, ventas, movimientos } = await datosDesdeUltimoCorte();

  const fondo = ultimoCorte ? ultimoCorte.fondoSiguiente || 0 : 0;
  const efectivo = ventas.filter((v) => v.metodoPago === "efectivo" || !v.metodoPago).reduce((s, v) => s + v.total, 0);
  const tarjeta = ventas.filter((v) => v.metodoPago === "tarjeta").reduce((s, v) => s + v.total, 0);
  const credito = ventas.filter((v) => v.metodoPago === "credito").reduce((s, v) => s + v.total, 0);
  const entradas = movimientos.filter((m) => m.tipo === "entrada").reduce((s, m) => s + m.monto, 0);
  const salidas = movimientos.filter((m) => m.tipo === "salida").reduce((s, m) => s + m.monto, 0);
  const esperado = fondo + efectivo + entradas - salidas;

  if (!confirm(`¿Cerrar corte? Efectivo esperado en caja: $${esperado.toFixed(2)}. Cuenta el dinero físico antes de confirmar.`)) {
    return;
  }

  const contado = parseFloat(prompt("¿Cuánto efectivo contaste físicamente en caja?", esperado.toFixed(2)));
  const fondoSiguiente = parseFloat(prompt("¿Cuánto dejas de fondo para el siguiente turno?", fondo.toFixed(2))) || 0;

  const corte = {
    fecha: new Date().toISOString(),
    fondoInicial: fondo,
    ventasEfectivo: efectivo,
    ventasTarjeta: tarjeta,
    ventasCredito: credito,
    entradas,
    salidas,
    esperado,
    contado: isNaN(contado) ? esperado : contado,
    diferencia: (isNaN(contado) ? esperado : contado) - esperado,
    fondoSiguiente,
  };

  await guardarCorte(corte);
  await encolarSync({ tipo: "corte", codigo: Date.now(), datos: corte });

  await refrescarVistaCaja();
  sincronizarConFirebase();
}

async function renderCortesAnteriores() {
  const cortes = await listarCortes();
  const cont = document.getElementById("cortes-lista");
  if (!cont) return;
  cont.innerHTML = "";

  if (cortes.length === 0) {
    cont.innerHTML = "<p class='vacio'>Todavía no se ha hecho ningún corte.</p>";
    return;
  }

  cortes.slice(0, 20).forEach((c) => {
    const fecha = new Date(c.fecha);
    const div = document.createElement("div");
    div.className = "venta-card";
    const difTxt = c.diferencia === 0 ? "cuadrado" : (c.diferencia > 0 ? `sobrante $${c.diferencia.toFixed(2)}` : `faltante $${Math.abs(c.diferencia).toFixed(2)}`);
    div.innerHTML = `
      <div class="venta-card-header">
        <span>${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        <strong>$${c.contado.toFixed(2)}</strong>
      </div>
      <div class="venta-card-items">
        Efectivo: $${c.ventasEfectivo.toFixed(2)} · Tarjeta: $${c.ventasTarjeta.toFixed(2)} · Crédito: $${c.ventasCredito.toFixed(2)} · ${difTxt}
      </div>
    `;
    cont.appendChild(div);
  });
}