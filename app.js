// app.js - Main client front-end logic (uses Firebase CDN modules)
// Important: this file must be loaded with type="module" after firebase-init.js

import { db, auth, storage } from "./firebase-init.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  ref as sRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";

/* ===========================
   Configuration & constants
   =========================== */
const WHATSAPP_NUMBER = "15813419686"; // +1 (581) 341-9686
const ADMIN_PASSWORD = "242777Aa#";     // In-browser admin gate (not secure for real prod)
const PRODUCTS_COLLECTION = "products";
const USERS_COLLECTION = "nh_users";
const CARTS_COLLECTION = "nh_carts";

/* ===========================
   Helper DOM selectors
   =========================== */
const $ = (sel) => document.querySelector(sel);
const qs = (sel) => Array.from(document.querySelectorAll(sel));

const menuBtn = $("#menuBtn");
const sideMenu = $("#sideMenu");
const createAccountBtn = $("#createAccountBtn");
const loginBtn = $("#loginBtn");
const logoutBtn = $("#logoutBtn");
const settingsBtn = $("#settingsBtn");
const footerSettings = $("#footerSettings");
const profilePicEl = $("#profilePic");
const menuProfilePic = $("#menuProfilePic");
const menuUserName = $("#menuUserName");
const flagBtn = $("#flagBtn");
const searchInput = $("#searchInput");
const searchBtn = $("#searchBtn");
const productsGrid = $("#productsGrid");
const cartCount = $("#cartCount");
const cartBtn = $("#cartBtn");
const cartModal = $("#cartModal");
const cartItemsEl = $("#cartItems");
const closeCart = $("#closeCart");
const productModal = $("#productModal");
const productDetail = $("#productDetail");
const closeProduct = $("#closeProduct");

/* ===========================
   Local state
   =========================== */
let products = [];          // cached product list
let localCart = [];         // cart for anonymous users (in-memory & localStorage)
let currentUser = null;     // firebase auth current user object
let userDoc = null;         // firestore user doc (nh_users)
let unsubscribeProducts = null; // realtime listener

/* ===========================
   Utilities
   =========================== */
function show(el){ el.classList.remove("hidden"); el.setAttribute("aria-hidden","false"); }
function hide(el){ el.classList.add("hidden"); el.setAttribute("aria-hidden","true"); }

/* Persistent local cart for not logged-in users */
function loadLocalCart(){
  try {
    const raw = localStorage.getItem("nh_local_cart");
    localCart = raw ? JSON.parse(raw) : [];
  } catch(e){ localCart = []; }
  updateCartUI();
}
function saveLocalCart(){ localStorage.setItem("nh_local_cart", JSON.stringify(localCart)); }

/* Theme */
function initTheme(){
  const t = localStorage.getItem("nh_theme") || "light";
  if (t === "dark") document.documentElement.setAttribute("data-theme","dark");
  else document.documentElement.removeAttribute("data-theme");
}
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const next = cur === "light" ? "dark" : "light";
  if (next === "dark") document.documentElement.setAttribute("data-theme","dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("nh_theme", next);
}

/* ===========================
   Render functions
   =========================== */
function renderProducts(list){
  productsGrid.innerHTML = "";
  if (!list || list.length === 0) {
    productsGrid.innerHTML = `<div class="note">No products found.</div>`;
    return;
  }
  list.forEach(p => {
    const div = document.createElement("div");
    div.className = "product-card";
    div.innerHTML = `
      <img src="${p.img || 'https://via.placeholder.com/600x400?text=Ebook+Cover'}" alt="${p.name}" data-id="${p.id}" />
      <div class="product-name">${escapeHtml(p.name)}</div>
      <div class="product-price">$${escapeHtml(p.price)}</div>
      <div class="btn-row">
        <button class="btn buy-btn" data-id="${p.id}">Buy Now</button>
        <button class="btn add-btn" data-id="${p.id}">Add to Cart</button>
      </div>
    `;
    productsGrid.appendChild(div);
  });
  attachProductEvents();
}

function attachProductEvents(){
  qs(".add-btn").forEach(b => b.onclick = (e)=> {
    const id = e.currentTarget.dataset.id;
    handleAddToCartById(id);
  });
  qs(".buy-btn").forEach(b => b.onclick = (e)=> {
    const id = e.currentTarget.dataset.id;
    handleBuyNowById(id);
  });
  qs(".product-card img").forEach(img => img.onclick = (e)=> {
    const id = e.currentTarget.dataset.id;
    showProductDetail(id);
  });
}

function updateCartUI(){
  const total = currentUser ? (userDoc && userDoc.cart ? userDoc.cart.length : 0) : localCart.length;
  cartCount.textContent = total;
  if (total > 0) cartBtn.classList.add("pop-shadow");
  else cartBtn.classList.remove("pop-shadow");
}

/* ===========================
   Firestore product functions
   =========================== */
async function loadProductsRealtime(){
  // Listen to products collection and update UI
  if (unsubscribeProducts) unsubscribeProducts();
  const q = query(collection(db, PRODUCTS_COLLECTION), orderBy("createdAt","desc"));
  unsubscribeProducts = onSnapshot(q, snapshot => {
    products = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProducts(products);
  }, err => {
    console.error("Products listener error", err);
  });
}

async function addProductToFirestore({ name, price, img = "", desc = "" }){
  const col = collection(db, PRODUCTS_COLLECTION);
  const docRef = await addDoc(col, { name, price, img, desc, createdAt: serverTimestamp() });
  return docRef.id;
}

/* ===========================
   Product detail modal
   =========================== */
function showProductDetail(id){
  const p = products.find(x => x.id === id);
  if (!p) return;
  productDetail.innerHTML = `
    <h2>${escapeHtml(p.name)}</h2>
    <img src="${p.img || 'https://via.placeholder.com/800x450?text=Ebook+Cover'}" style="width:100%;max-height:320px;object-fit:cover;border-radius:10px;margin:8px 0"/>
    <p><strong>Price: </strong>$${escapeHtml(p.price)}</p>
    <p>${escapeHtml(p.desc || "No description provided.")}</p>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button id="detailBuy" class="btn buy-btn">Buy Now</button>
      <button id="detailAdd" class="btn add-btn">Add to Cart</button>
    </div>
  `;
  productModal.classList.remove("hidden");
  document.getElementById("detailAdd").onclick = ()=> { handleAddToCartById(p.id); productModal.classList.add("hidden"); };
  document.getElementById("detailBuy").onclick = ()=> { handleBuyNowById(p.id); productModal.classList.add("hidden"); };
}

/* ===========================
   Cart & Buy flows
   =========================== */
async function handleAddToCartById(id){
  const p = products.find(x => x.id === id);
  if (!p) return alert("Product not found.");
  if (currentUser && userDoc) {
    // Save cart to user's Firestore doc
    const userRef = doc(db, USERS_COLLECTION, currentUser.uid);
    const updatedCart = userDoc.cart ? [...userDoc.cart, { id: p.id, name: p.name, price: p.price, addedAt: Date.now() }] : [{ id: p.id, name: p.name, price: p.price, addedAt: Date.now() }];
    await setDoc(userRef, { ...userDoc, cart: updatedCart }, { merge: true });
    userDoc = { ...userDoc, cart: updatedCart };
    alert(`${p.name} added to cart.`);
    updateCartUI();
  } else {
    localCart.push({ id: p.id, name: p.name, price: p.price, addedAt: Date.now() });
    saveLocalCart();
    alert(`${p.name} added to cart.`);
    updateCartUI();
  }
}

function openWhatsAppWithMessage(message){
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

async function handleBuyNowById(id){
  const p = products.find(x => x.id === id);
  if (!p) return alert("Product not found.");
  let email = "no-email";
  if (currentUser && userDoc && userDoc.email) email = userDoc.email;
  else {
    const entered = prompt("Enter your email to proceeed with Buy Now (this will be included in the message):");
    if (entered) email = entered.trim();
  }
  const msg = `I want to buy "${p.name}" — Price: $${p.price}. My email: ${email}`;
  openWhatsAppWithMessage(msg);
}

/* ===========================
   Cart modal render
   =========================== */
function renderCartItems(){
  cartItemsEl.innerHTML = "";
  const items = currentUser && userDoc ? (userDoc.cart || []) : localCart;
  if (!items || items.length === 0) {
    cartItemsEl.innerHTML = `<div class="note">No product in the cart.</div>`;
    return;
  }
  items.forEach((it, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "cart-item";
    wrapper.innerHTML = `
      <div>
        <strong>${escapeHtml(it.name)}</strong>
        <div class="small">$${escapeHtml(it.price)}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button data-idx="${idx}" class="buy-now-cart btn buy-btn">Buy Now</button>
        <button data-idx="${idx}" class="remove-cart btn" style="background:#e2e8f0;color:#111">Remove</button>
      </div>
    `;
    cartItemsEl.appendChild(wrapper);
  });
  qs(".remove-cart").forEach(b => b.onclick = async (e)=> {
    const idx = Number(e.currentTarget.dataset.idx);
    if (currentUser && userDoc) {
      const updated = (userDoc.cart || []).filter((_,i)=>i!==idx);
      const ref = doc(db, USERS_COLLECTION, currentUser.uid);
      await setDoc(ref, { ...userDoc, cart: updated }, { merge: true });
      userDoc = { ...userDoc, cart: updated };
      renderCartItems();
      updateCartUI();
    } else {
      localCart.splice(idx,1);
      saveLocalCart();
      renderCartItems();
      updateCartUI();
    }
  });
  qs(".buy-now-cart").forEach(b => b.onclick = (e)=> {
    const idx = Number(e.currentTarget.dataset.idx);
    const it = (currentUser && userDoc ? (userDoc.cart||[]) : localCart)[idx];
    if (!it) return;
    handleBuyNowById(it.id);
  });
}

/* ===========================
   Auth & user flows
   =========================== */
async function createAccountFlow(){
  const username = prompt("Username:");
  const email = prompt("Email:");
  const password = prompt("Password (min 6 chars):");
  const pet = prompt("Pet name (recovery):");
  if (!username || !email || !password) return alert("Cancelled — username, email and password required.");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    // create user doc in Firestore (nh_users)
    const userRef = doc(db, USERS_COLLECTION, uid);
    const userData = { uid, username, email, pet, profile: "", cart: [] , disabled: false, createdAt: serverTimestamp() };
    await setDoc(userRef, userData);
    alert("Account created successfully. You are now logged in.");
    // onAuthStateChanged will take care of loading userDoc
  } catch (err) {
    console.error(err);
    alert("Error creating account: " + err.message);
  }
}

async function loginFlow(){
  const email = prompt("Email:");
  const password = prompt("Password:");
  if (!email || !password) return;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will trigger userDoc loading
  } catch (err) {
    console.error(err);
    alert("Login failed: " + err.message);
  }
}

async function logoutFlow(){
  try {
    await signOut(auth);
    alert("Logged out.");
  } catch (err) {
    console.error(err);
  }
}

/* Forgot password via pet name */ 
async function forgotPasswordFlow(){
  const email = prompt("Enter your account email for password recovery:");
  if (!email) return;
  // fetch user doc by email
  try {
    const usersQ = query(collection(db, USERS_COLLECTION), where("email","==", email));
    const snap = await getDocs(usersQ);
    if (snap.empty) return alert("No account found for that email.");
    const u = snap.docs[0].data();
    const pet = prompt("Enter your pet name (recovery):");
    if (pet && pet.trim() === (u.pet || "")) {
      // send password reset email
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email sent. Check your inbox.");
    } else {
      alert("Pet name did not match. Cannot reset via this method.");
    }
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
  }
}

/* When auth state changes */
onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    // load user doc
    const uref = doc(db, USERS_COLLECTION, user.uid);
    const snap = await getDoc(uref);
    if (snap.exists()) {
      userDoc = snap.data();
      // check disabled
      if (userDoc.disabled) {
        // auto signout
        alert("Your account is disabled. Contact admin.");
        await signOut(auth);
        currentUser = null;
        userDoc = null;
        refreshUserUI();
        return;
      }
    } else {
      // create minimal user doc
      userDoc = { uid: user.uid, email: user.email, username: user.email, profile: "", cart: [] };
      await setDoc(uref, userDoc, { merge: true });
    }
  } else {
    userDoc = null;
  }
  refreshUserUI();
});

/* Update UI for user */
function refreshUserUI(){
  if (currentUser && userDoc) {
    menuUserName.textContent = userDoc.username || currentUser.email;
    profilePicEl.src = userDoc.profile || "avatar-placeholder.png";
    menuProfilePic.src = userDoc.profile || "avatar-placeholder.png";
  } else {
    menuUserName.textContent = "Guest";
    profilePicEl.src = "avatar-placeholder.png";
    menuProfilePic.src = "avatar-placeholder.png";
  }
  updateCartUI();
}

/* ===========================
   Admin page utilities (client-side gate)
   =========================== */
async function openAdminPanel(){
  const pass = prompt("Enter admin password:");
  if (!pass) return;
  if (pass !== ADMIN_PASSWORD) return alert("Incorrect admin password.");
  // show admin UI in a new window or a modal; for simplicity open admin.html
  window.location.href = "admin.html";
}

/* ===========================
   Profile image change (URL or file upload)
   =========================== */
async function changeProfileImageFlow(){
  if (!currentUser) return alert("Login or create account to change profile picture.");
  const choice = prompt("Type 'url' to enter image URL or 'file' to pick a local file upload (drag/drop not supported):", "url");
  if (!choice) return;
  if (choice.toLowerCase() === "url") {
    const url = prompt("Enter image URL:");
    if (!url) return;
    const ref = doc(db, USERS_COLLECTION, currentUser.uid);
    userDoc.profile = url;
    await setDoc(ref, userDoc, { merge: true });
    refreshUserUI();
    alert("Profile updated.");
  } else {
    // file upload: create a hidden input to accept file
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      // upload to storage under profiles/{uid}/{timestamp}.ext
      const path = `profiles/${currentUser.uid}/${Date.now()}_${file.name}`;
      const sreference = sRef(storage, path);
      try {
        const snap = await uploadBytes(sreference, file);
        const url = await getDownloadURL(sreference);
        const ref = doc(db, USERS_COLLECTION, currentUser.uid);
        userDoc.profile = url;
        await setDoc(ref, userDoc, { merge: true });
        refreshUserUI();
        alert("Profile picture uploaded.");
      } catch (err) {
        console.error(err);
        alert("Upload failed: " + err.message);
      }
    };
    input.click();
  }
}

/* ===========================
   Search (1 second simulated load)
   =========================== */
let searchTimeout = null;
function onSearch(){
  const q = searchInput.value.trim().toLowerCase();
  searchBtn.disabled = true;
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(()=> {
    const filtered = products.filter(p => p.name.toLowerCase().includes(q));
    renderProducts(filtered);
    searchBtn.disabled = false;
  }, 1000);
}

/* ===========================
   Utility helpers
   =========================== */
function escapeHtml(text){
  if (text === undefined || text === null) return "";
  return String(text).replace(/[&<>"']/g, s => {
    const map = { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
    return map[s];
  });
}

/* ===========================
   Top-level event wiring
   =========================== */
function wireUI(){
  menuBtn.onclick = ()=> {
    if (sideMenu.classList.contains("open")) {
      sideMenu.classList.remove("open");
      sideMenu.setAttribute("aria-hidden","true");
    } else {
      sideMenu.classList.add("open");
      sideMenu.setAttribute("aria-hidden","false");
    }
  };
  qs(".menu-link[data-go]").forEach(btn => btn.onclick = (e) => location.href = e.currentTarget.dataset.go);
  createAccountBtn.onclick = createAccountFlow;
  loginBtn.onclick = loginFlow;
  logoutBtn.onclick = logoutFlow;
  settingsBtn.onclick = toggleTheme;
  footerSettings.onclick = toggleTheme;
  flagBtn.onclick = () => {
    const f = prompt("Enter country flag emoji (e.g. 🇳🇬) or country code:");
    if (f) flagBtn.textContent = f;
  };
  profilePicEl.onclick = changeProfileImageFlow;
  searchBtn.onclick = onSearch;
  searchInput.onkeydown = (e)=> { if (e.key === "Enter") onSearch(); };
  cartBtn.onclick = () => {
    renderCartItems();
    cartModal.classList.remove("hidden");
  };
  closeCart.onclick = ()=> cartModal.classList.add("hidden");
  closeProduct.onclick = ()=> productModal.classList.add("hidden");
  qs(".footer-link").forEach(b => b.onclick = (e)=> {
    const go = e.currentTarget.dataset.go;
    if (go) location.href = go;
  });
  // side menu account go:
  qs(".menu-link").forEach(btn => {
    const g = btn.dataset.go;
    if (g) btn.onclick = ()=> location.href = g;
  });

  // admin quick-open (double click logo)
  document.querySelector(".logo").ondblclick = openAdminPanel;
}

/* ===========================
   Initialization
   =========================== */
function init(){
  initTheme();
  wireUI();
  loadLocalCart();
  loadProductsRealtime(); // realtime product listener
  // Try to keep UI updated if user is already logged in (onAuthStateChanged earlier handles it)
}

init();

/* Expose some helpers for admin.html & acc.html where needed */
window.NH = {
  addProductToFirestore,
  db,
  PRODUCTS_COLLECTION,
  USERS_COLLECTION,
  CARTS_COLLECTION,
  refreshUserUI,
  changeProfileImageFlow,
  openAdminPanel
};
