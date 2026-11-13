/**
 * firebase-config.js — Vencendo o Divórcio Podcast
 * Configuração e inicialização centralizada do Firebase
 */
const firebaseConfig = {
  apiKey: "AIzaSyDV_RspQ36uxdW2-k2okW1sAjHYZjAv-2c",
  authDomain: "vencendodiv.firebaseapp.com",
  projectId: "vencendodiv",
  storageBucket: "vencendodiv.firebasestorage.app",
  messagingSenderId: "367756630081",
  appId: "1:367756630081:web:05c862f3f242b711288ec0"
};

// Inicialização segura
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Exportações globais para os scripts
window.db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
window.auth = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth() : null;
