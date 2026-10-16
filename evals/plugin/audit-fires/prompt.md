---
description: A review request with a diff inline. The audit skill should fire, report Standards, Spec, and Security separately, and grade the planted off-by-one as blocking.
expected_outcome: Separate Standards / Spec / Security sections; the page-size off-by-one flagged as Critical or Important.
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill]
---

Audit this change before I merge it. The ticket says: "GET /orders supports paging with page and size query parameters; each page returns exactly size rows."

```diff
diff --git a/src/orders.js b/src/orders.js
--- a/src/orders.js
+++ b/src/orders.js
@@ -12,3 +12,15 @@ function listOrders(db) {
   return db.query('SELECT * FROM orders ORDER BY created_at DESC');
 }
-module.exports = { listOrders };
+function pageOrders(db, page, size) {
+  const rows = db.query('SELECT * FROM orders ORDER BY created_at DESC');
+  const start = (page - 1) * size;
+  return rows.slice(start, start + size - 1);
+}
+
+app.get('/orders', (req, res) => {
+  const page = Number(req.query.page) || 1;
+  const size = Number(req.query.size) || 20;
+  res.json(pageOrders(db, page, size));
+});
+
+module.exports = { listOrders, pageOrders };
```
