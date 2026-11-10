// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ============================================================
// 1. Ve a https://console.firebase.google.com
// 2. Crea un proyecto (o usa uno existente)
// 3. Agrega una app web y copia aquí sus datos
// 4. Activa Firestore Database (modo producción) en la consola
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCjk0KP0xgXg_0n5sP-IIuavF1Tef2xQt4",
  authDomain: "pos-ab.firebaseapp.com",
  projectId: "pos-ab",
  storageBucket: "pos-ab.firebasestorage.app",
  messagingSenderId: "860393643729",
  appId: "1:860393643729:web:195b60ec6941f62433eff0",
};
// Nota: se usa el SDK "compat" (via <script> en index.html) en vez del modular
// (el que trae "import { initializeApp } from ...") porque db.js y sync.js
// ya están escritos con la sintaxis firebase.firestore(). Analytics no se
// agregó porque un POS no lo necesita — si lo quieres después, se agrega aparte.

firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

// Firestore también funciona offline por su cuenta, pero aquí usamos
// IndexedDB propio (db.js) como fuente principal para tener control total
// de cómo se ve y se corrige el inventario sin depender de la consola de Firebase.