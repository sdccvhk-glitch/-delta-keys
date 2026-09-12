const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      products: [
        { id: "delta-basic", name: "DELTA Basic Key", price: 99, description: "Instant digital access key after admin verification.", badge: "POPULAR" },
        { id: "delta-pro", name: "DELTA Pro Key", price: 199, description: "Premium digital access key with priority verification.", badge: "PRO" },
        { id: "delta-ultra", name: "DELTA Ultra Key", price: 299, description: "Ultimate digital access key for advanced users.", badge: "ULTRA" }
      ],
      orders: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}
ensureStore();

function readStore() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function publicOrder(order) {
  return {
    id: order.id,
    productId: order.productId,
    productName: order.productName,
    amount: order.amount,
    customerName: order.customerName,
    customerContact: order.customerContact,
    paymentReference: order.paymentReference,
    status: order.status,
    key: order.status === "approved" ? order.key : "",
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}
function adminAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return res.status(401).json({ error: "Admin login required." });
  let decoded = "";
  try { decoded = Buffer.from(auth.slice(6), "base64").toString("utf8"); } catch {}
  const split = decoded.indexOf(":");
  const user = split >= 0 ? decoded.slice(0, split) : "";
  const pass = split >= 0 ? decoded.slice(split + 1) : "";
  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASSWORD || "change-this-password";
  if (user !== expectedUser || pass !== expectedPass) {
    return res.status(401).json({ error: "Invalid admin username or password." });
  }
  next();
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/products", (req, res) => res.sendFile(path.join(__dirname, "public", "products.html")));
app.get("/payment", (req, res) => res.sendFile(path.join(__dirname, "public", "payment.html")));
app.get("/status", (req, res) => res.sendFile(path.join(__dirname, "public", "status.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.get("/api/health", (req, res) => res.json({ ok: true, app: "DELTA.KEYS", paymentMode: "manual-admin-approval" }));
app.get("/api/products", (req, res) => res.json(readStore().products));

app.get("/api/payment-info", (req, res) => {
  res.json({
    upiId: process.env.PAYMENT_UPI_ID || "8590887093@fam",
    payeeName: process.env.PAYMENT_PAYEE_NAME || "DELTA.KEYS",
    note: process.env.PAYMENT_NOTE || "DELTA.KEYS order payment"
  });
});

app.post("/api/orders", (req, res) => {
  const { productId, customerName, customerContact, paymentReference } = req.body || {};
  const store = readStore();
  const product = store.products.find(p => p.id === productId);

  if (!product) return res.status(400).json({ error: "Product not found." });
  if (!String(customerName || "").trim() || !String(customerContact || "").trim() || !String(paymentReference || "").trim()) {
    return res.status(400).json({ error: "Please complete all required fields." });
  }

  const now = new Date().toISOString();
  const order = {
    id: "DK-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
    productId: product.id,
    productName: product.name,
    amount: product.price,
    customerName: String(customerName).trim(),
    customerContact: String(customerContact).trim(),
    paymentReference: String(paymentReference).trim(),
    status: "pending",
    key: "",
    createdAt: now,
    updatedAt: now
  };

  store.orders.unshift(order);
  writeStore(store);
  res.status(201).json({ order: publicOrder(order) });
});

app.get("/api/orders/:id", (req, res) => {
  const order = readStore().orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({ order: publicOrder(order) });
});

app.get("/api/admin/data", adminAuth, (req, res) => {
  const store = readStore();
  res.json({
    products: store.products,
    orders: store.orders.map(o => ({ ...o }))
  });
});

app.put("/api/admin/orders/:id", adminAuth, (req, res) => {
  const store = readStore();
  const order = store.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });

  const { status, key, customerName, customerContact } = req.body || {};
  if (status && !["pending", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  if (typeof key === "string") order.key = key.trim();
  if (typeof customerName === "string") order.customerName = customerName.trim();
  if (typeof customerContact === "string") order.customerContact = customerContact.trim();

  if (status) {
    if (status === "approved" && !String(order.key || "").trim()) {
      return res.status(400).json({ error: "Add/edit the customer key before approving." });
    }
    order.status = status;
  }
  order.updatedAt = new Date().toISOString();
  writeStore(store);
  res.json({ order: publicOrder(order) });
});

app.put("/api/admin/products/:id", adminAuth, (req, res) => {
  const store = readStore();
  const product = store.products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  const { name, price, description, badge } = req.body || {};
  if (typeof name === "string" && name.trim()) product.name = name.trim();
  if (Number.isFinite(Number(price)) && Number(price) >= 0) product.price = Number(price);
  if (typeof description === "string") product.description = description.trim();
  if (typeof badge === "string") product.badge = badge.trim();
  writeStore(store);
  res.json({ product });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`DELTA.KEYS running on port ${PORT} — manual admin approval mode`);
});
