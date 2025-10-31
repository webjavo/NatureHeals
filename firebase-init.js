// firebase-init.js
// This file uses Firebase CDN modules (v12.5.0) and exports app/db/auth/storage
// Keep this file in your project and import it in app.js and other pages

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDhnK7DGb9guxUSjkWWH6s7jT7-NU0oBdM",
  authDomain: "nature-heals-4f4db.firebaseapp.com",
  projectId: "nature-heals-4f4db",
  storageBucket: "nature-heals-4f4db.firebasestorage.app",
  messagingSenderId: "945050051317",
  appId: "1:945050051317:web:8da40b136b6e6b794c9bbc",
  measurementId: "G-FYJ6SBDQN7"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
