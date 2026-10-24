/* =====================================================================
   CANASTA ESCOLAR · TECNO RIVAS
   ===================================================================== */

/* ---------------------------------------------------------------------
   ► CONFIGURACIÓN: PEGA AQUÍ LA URL DE TU APLICACIÓN WEB DE GOOGLE APPS SCRIPT
   Ejemplo: "https://script.google.com/macros/s/AKfycb.../exec"
   --------------------------------------------------------------------- */
const GAS_ENDPOINT = ""; // <<< COLOCA AQUÍ LA URL DEL ENDPOINT >>>

const MIN_TOTAL = 1500;
const STORAGE_KEY = "tecnorivas_pendientes_v1";
const INTRO_FALLBACK_MS = 2500;   // Si el video no arranca, se oculta tras este tiempo
const INTRO_MAX_MS = 60000;       // Tope absoluto de seguridad
const SUBMIT_TIMEOUT_MS = 12000;  // Espera máxima de respuesta del iframe

/* =========================== INTRO OVERLAY =========================== */
(function initIntro() {
  const overlay = document.getElementById("intro-overlay");
  const video = document.getElementById("intro-video");
  const skipBtn = document.getElementById("skip-intro");
  let closed = false;
  let started = false;

  function closeIntro() {
    if (closed) return;
    closed = true;
    clearTimeout(fallbackTimer);
    clearTimeout(maxTimer);
    try { video.pause(); } catch (e) {}
    overlay.classList.add("fade-out");
    setTimeout(() => overlay.classList.add("hidden"), 900);
    document.body.style.overflow = "";
  }

  document.body.style.overflow = "hidden";

  // Fallback: si no empieza a reproducirse en pocos segundos, se oculta.
  const fallbackTimer = setTimeout(() => { if (!started) closeIntro(); }, INTRO_FALLBACK_MS);
  // Tope máximo por si el video se congela a mitad.
  const maxTimer = setTimeout(closeIntro, INTRO_MAX_MS);

  video.addEventListener("playing", () => { started = true; });
  video.addEventListener("timeupdate", () => { if (video.currentTime > 0) started = true; });
  video.addEventListener("ended", closeIntro);
  video.addEventListener("error", closeIntro);
  video.addEventListener("stalled", () => setTimeout(() => { if (!started) closeIntro(); }, 1500));
  video.querySelectorAll("source").forEach(s => s.addEventListener("error", closeIntro));
  skipBtn.addEventListener("click", closeIntro);

  document.addEventListener("keydown", (e) => {
    if (!closed && (e.key === "Escape" || e.key === "Enter")) closeIntro();
  });

  // Intento explícito de reproducción (algunos navegadores ignoran autoplay).
  video.muted = true;
  const p = video.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => closeIntro()); // Autoplay bloqueado → no atrapar al usuario
  }
})();

/* ============================ UTILIDADES ============================= */
const $ = (id) => document.getElementById(id);

const form = $("invoice-form");
const fields = {
  cedula: $("cedula"),
  telefono: $("telefono"),
  factura: $("factura"),
  total: $("total"),
};
const alertMin = $("alert-min");
const submitBtn = $("submit-btn");
const offlineBadge = $("offline-badge");

$("year").textContent = new Date().getFullYear();

function setError(name, msg) {
  const el = $("err-" + name);
  el.textContent = msg || "";
  fields[name].classList.toggle("invalid", !!msg);
}

function parseAmount(str) {
  if (!str) return NaN;
  const clean = String(str).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  return parseFloat(clean);
}

function formatAmount(n) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ===================== MÁSCARAS DE ENTRADA EN VIVO ==================== */
// Cédula nicaragüense: 000-000000-0000A
fields.cedula.addEventListener("input", (e) => {
  let v = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "");
  let digits = v.slice(0, 13).replace(/[^0-9]/g, "");
  const letter = v.slice(13, 14).replace(/[^A-Z]/g, "");
  let out = digits.slice(0, 3);
  if (digits.length > 3) out += "-" + digits.slice(3, 9);
  if (digits.length > 9) out += "-" + digits.slice(9, 13);
  if (digits.length === 13 && letter) out += letter;
  e.target.value = out;
});

// Teléfono: 8888-8888
fields.telefono.addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 8);
  e.target.value = d.length > 4 ? d.slice(0, 4) + "-" + d.slice(4) : d;
});

// Monto: solo números y un punto decimal
fields.total.addEventListener("input", (e) => {
  let v = e.target.value.replace(/[^\d.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  const [int, dec] = v.split(".");
  const intFmt = (int || "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  e.target.value = dec !== undefined ? intFmt + "." + dec.slice(0, 2) : intFmt;
  alertMin.hidden = true;
});

fields.total.addEventListener("blur", () => {
  const n = parseAmount(fields.total.value);
  if (!isNaN(n)) fields.total.value = formatAmount(n);
});

Object.keys(fields).forEach((k) =>
  fields[k].addEventListener("input", () => setError(k, ""))
);

/* ============================= VALIDACIÓN ============================= */
function validate() {
  let ok = true;
  alertMin.hidden = true;

  const cedula = fields.cedula.value.trim();
  if (!/^\d{3}-\d{6}-\d{4}[A-Z]$/.test(cedula)) {
    setError("cedula", "Ingresa una cédula válida (ej. 001-010190-0001A).");
    ok = false;
  }

  const tel = fields.telefono.value.replace(/\D/g, "");
  if (!/^[2578]\d{7}$/.test(tel)) {
    setError("telefono", "Ingresa un teléfono válido de 8 dígitos.");
    ok = false;
  }

  if (fields.factura.value.trim().length < 1) {
    setError("factura", "Ingresa el número de factura.");
    ok = false;
  }

  const total = parseAmount(fields.total.value);
  if (isNaN(total) || total <= 0) {
    setError("total", "Ingresa el total de la factura.");
    ok = false;
  } else if (total < MIN_TOTAL) {
    setError("total", "");
    fields.total.classList.add("invalid");
    alertMin.textContent =
      "El monto mínimo para participar es de C$ 1,500.00. Tu factura es de C$ " +
      formatAmount(total) + ".";
    alertMin.hidden = false;
    // Reinicia animación de shake
    alertMin.style.animation = "none"; void alertMin.offsetWidth; alertMin.style.animation = "";
    ok = false;
  }

  if (!ok) {
    const firstBad = form.querySelector("input.invalid");
    if (firstBad) firstBad.focus();
  }
  return ok;
}

/* ====================== COLA LOCAL (localStorage) ===================== */
function readQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch (e) { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); } catch (e) {}
}
function enqueue(record) {
  const q = readQueue();
  q.push(record);
  writeQueue(q);
}
function removeFromQueue(id) {
  writeQueue(readQueue().filter((r) => r.id !== id));
}

/* ================= ENVÍO SIN CORS: FORM + IFRAME OCULTO ================ */
// Devuelve una promesa que se resuelve cuando el iframe termina de cargar
// (la respuesta de Apps Script no es legible por CORS, pero la carga confirma el envío).
function sendViaIframe(record) {
  return new Promise((resolve, reject) => {
    if (!GAS_ENDPOINT) {
      reject(new Error("GAS_ENDPOINT no configurado"));
      return;
    }

    const iframeName = "gas_iframe_" + record.id;
    const iframe = document.createElement("iframe");
    iframe.name = iframeName;
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");

    const f = document.createElement("form");
    f.method = "POST";
    f.action = GAS_ENDPOINT;
    f.target = iframeName;
    f.style.display = "none";
    f.acceptCharset = "UTF-8";

    const data = {
      id: record.id,
      fechaRegistro: record.fechaRegistro,
      cedula: record.cedula,
      telefono: record.telefono,
      factura: record.factura,
      total: record.total,
    };
    Object.entries(data).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      f.appendChild(input);
    });

    let done = false;
    let loads = 0;
    const cleanup = () => {
      setTimeout(() => { iframe.remove(); f.remove(); }, 500);
    };
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      ok ? resolve() : reject(err);
    };

    // El iframe vacío dispara "load" al insertarse; la segunda carga es la respuesta real.
    iframe.addEventListener("load", () => {
      loads++;
      if (loads >= 2) finish(true);
    });
    iframe.addEventListener("error", () => finish(false, new Error("Error de red")));

    const timer = setTimeout(
      () => finish(false, new Error("Tiempo de espera agotado")),
      SUBMIT_TIMEOUT_MS
    );

    document.body.appendChild(iframe);
    document.body.appendChild(f);
    // Pequeño retardo para que el iframe registre su carga inicial antes del POST
    setTimeout(() => f.submit(), 50);
  });
}

/* ========================= SINCRONIZACIÓN ============================= */
let syncing = false;
async function syncPending() {
  if (syncing || !navigator.onLine || !GAS_ENDPOINT) return;
  const queue = readQueue();
  if (!queue.length) return;
  syncing = true;
  for (const rec of queue) {
    try {
      await sendViaIframe(rec);
      removeFromQueue(rec.id);
    } catch (e) {
      break; // Reintenta en el próximo ciclo
    }
  }
  syncing = false;
}

function updateOnlineStatus() {
  offlineBadge.hidden = navigator.onLine;
  if (navigator.onLine) syncPending();
}
window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
setInterval(syncPending, 30000);
updateOnlineStatus();

/* ============================== ENVÍO ================================= */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validate()) return;

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    fechaRegistro: new Date().toISOString(),
    cedula: fields.cedula.value.trim(),
    telefono: fields.telefono.value.trim(),
    factura: fields.factura.value.trim(),
    total: parseAmount(fields.total.value).toFixed(2),
  };

  submitBtn.disabled = true;
  submitBtn.classList.add("loading");
  submitBtn.querySelector(".btn-label").textContent = "Enviando…";

  // Siempre se guarda primero localmente (respaldo seguro)
  enqueue(record);

  let sentOnline = false;
  if (navigator.onLine && GAS_ENDPOINT) {
    try {
      await sendViaIframe(record);
      removeFromQueue(record.id);
      sentOnline = true;
    } catch (err) {
      console.warn("Envío fallido, queda en cola local:", err.message);
    }
  }

  showSuccess(sentOnline);
});

/* ============================ PANTALLA ÉXITO ========================== */
function showSuccess(sentOnline) {
  $("form-view").hidden = true;
  $("success-view").hidden = false;

  $("success-text").innerHTML = sentOnline
    ? "Tu factura ha sido registrada y ya participas en el sorteo <strong>Canasta Escolar</strong>. ¡Mucha suerte!"
    : "Tu factura se guardó en este dispositivo y se enviará <strong>automáticamente</strong> cuando haya conexión. ¡Mucha suerte!";

  document.getElementById("form-card").scrollIntoView({ behavior: "smooth", block: "start" });
  launchConfetti();
}

function launchConfetti() {
  if (typeof confetti !== "function") return;
  const colors = ["#ffcc00", "#f59e0b", "#0052cc", "#002147", "#ffffff"];
  const end = Date.now() + 2200;
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 5, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 140, spread: 100, origin: { y: 0.55 }, colors });
}

$("new-entry").addEventListener("click", () => {
  form.reset();
  Object.keys(fields).forEach((k) => setError(k, ""));
  alertMin.hidden = true;
  submitBtn.disabled = false;
  submitBtn.classList.remove("loading");
  submitBtn.querySelector(".btn-label").textContent = "Registrar factura";
  $("success-view").hidden = true;
  $("form-view").hidden = false;
  fields.cedula.focus();
});

/* =====================================================================
   REFERENCIA: CÓDIGO PARA GOOGLE APPS SCRIPT (Code.gs)
   Despliega como "Aplicación web" → Ejecutar como: Yo → Acceso: Cualquier usuario

   function doPost(e) {
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Registros")
              || SpreadsheetApp.getActiveSpreadsheet().insertSheet("Registros");
     if (sheet.getLastRow() === 0) {
       sheet.appendRow(["ID","Fecha","Cédula","Teléfono","Factura","Total (C$)"]);
     }
     var p = e.parameter;
     var ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().flat();
     if (ids.indexOf(p.id) === -1) {            // evita duplicados al reintentar
       sheet.appendRow([p.id, p.fechaRegistro, "'" + p.cedula, "'" + p.telefono, "'" + p.factura, Number(p.total)]);
     }
     return HtmlService.createHtmlOutput("OK");
   }
   ===================================================================== */
