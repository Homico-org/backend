# Homico Marketplace Roadmap (A → B → C)

## End goal (the vision)

**Homico becomes the single place a person renovating a home does everything:**
find a pro, plan the project, AND buy every material/appliance for it - paid
through Homico, delivered by Homico, financeable via bank installment. The
renovation marketplace + the materials marketplace under one roof, which no
competitor combines.

The materials side is a **managed marketplace with Homico as merchant-of-record**
(the Buildy / Wolt model): the customer pays Homico, Homico is responsible for
the order, and Homico earns a margin/commission on every basket. Shops are the
supply; Homico owns the customer, the payment, and the delivery promise.

**Why this wins:** we already have the demand (people mid-renovation on Homico),
the pros who specify materials, the payment engine (Flitt), and a working
supplier-catalog. We're assembling parts we already own, not starting cold.

---

## Where we are today (already built)

- `supplier-catalog` module: `SupplierAdapter` interface, `sourceType:
  'scrape' | 'feed'` seam, sync cron. **14 shops wired** (CS-Cart, WooCommerce,
  headless, custom scrapers). A `WooCommerceStoreAdapter` already pulls clean
  JSON feeds with live stock - the template for any API partner.
- `product-orders` module: cart → checkout → delivery modes → order statuses →
  **platform charge via Flitt** (`PaymentEntityType 'product_order'`), manual
  ops fulfilment. This is the merchant-of-record MVP, already modeled.
- Payments engine: provider abstraction (Flitt live). New providers (bank
  installment) slot in the same way.

So ~70% of Phase A/C plumbing exists. The work is (1) real API partners,
(2) turning on checkout for them, (3) a self-serve seller portal, (4) real
delivery + finance ops.

---

## Phase A — Aggregation (supply in)

**Goal:** the best building-materials + home-goods catalog in Georgia, live
stock, browsable inside Homico, tied to projects (a pro specs materials → client
sees them in the project shopping tab).

- **A1. Kasco feed adapter** (first real API partner). Spec below. ~1 day once
  we have his endpoint. Deliverable: kasco products live in Homico shopping with
  real stock + price.
- **A2. Generalize the feed adapter** into a config-driven `GenericFeedAdapter`
  (JSON/CSV/XML + a field-mapping config) so onboarding shop #3, #4… is a config
  entry, not a new class. Kasco proves the shape; this makes it repeatable.
- **A3. Onboard 3-5 cooperating shops** via A2. Dedup + category-map their
  products into the Homico service catalog taxonomy so browse/search is coherent
  across shops (same "tiles" from different suppliers).
- **A4. Catalog quality**: unit normalization (m², piece, bag), image
  fallback, price-change history, out-of-stock hiding. Tie products to project
  scope items ("this step needs 40 m² tile → shop it").

**Exit criteria:** customers browse a multi-shop catalog with live stock; pros
attach real products to project steps.

---

## Phase B — Self-serve seller portal (scale supply)

**Goal:** any shop can onboard itself, upload/manage products + stock in Homico,
without us writing an adapter. This is how you go from 5 shops to 500.

- **B1. Seller account type** (`role: 'shop'` / a Shop entity) + shop profile
  (name, logo, legal details, payout bank account, delivery zones/fees).
- **B2. Seller dashboard**: add/edit products (name ka/en/ru, price, stock,
  images, category), bulk CSV import, low-stock alerts. Products flow into the
  SAME `supplier_products` collection with `sourceType: 'manual'`.
- **B3. Moderation**: admin approves new shops + flagged products (quality bar,
  no prohibited items). Mirrors the pro-verification pattern already in place.
- **B4. Inventory truth**: stock decremented on order, sync-back for shops that
  ALSO have a feed. Overselling guard.
- **B5. Per-shop analytics**: views, orders, revenue, payout statements.

**Exit criteria:** a shop with no tech team signs up, lists products, and sells -
zero engineering per shop.

> Build B only after A + a thin slice of C prove real orders exist. A seller
> portal with no buyers is wasted work.

---

## Phase C — Transactions, delivery, finance (monetize + own the promise)

**Goal:** customer pays Homico, gets the goods delivered, and can finance the
basket. Homico earns commission and owns the customer relationship.

- **C1. Checkout for one trusted partner (kasco)** using the existing
  `product-orders` + Flitt. Money → Homico. Delivery = kasco delivers, we pay
  them, we keep margin. Manual ops. **This is the single most important
  de-risking step - do it early, right after A1.**
- **C2. Payment split / payouts**: as shops multiply, money splits (shop's cut
  vs Homico commission), per-shop payout runs. Extends the escrow/payout engine
  already built for pros.
- **C3. Delivery**: start with shop-delivers (we pay them). Then integrate a
  courier (Wolt Drive / Glovo / own) for shops that can't. `deliveryMode` +
  `deliveryFeeMinor` already exist in the order schema.
- **C4. Bank installment ("განვადება")**: TBC / BoG installment API as a
  payment provider (same abstraction as Flitt). Bank pays us in full, takes the
  credit risk, customer repays the bank. Big conversion lever on large baskets.
- **C5. Responsibility ops**: returns, damaged/wrong items, refunds, support
  SLA. **This is operations, not code** - staffing + supplier agreements +
  return logistics. The real moat and the real cost.

**Exit criteria:** a customer buys a mixed-shop basket, pays via card or
installment, gets it delivered, and can return it - with Homico owning the
experience end-to-end.

---

## Recommended sequence (not strictly A→B→C)

The de-risking order interleaves them:

1. **A1** — Kasco feed adapter (catalog live). *[days]*
2. **C1** — Checkout for kasco only, manual ops (prove the money+delivery loop
   with ONE trusted partner). *[1-2 weeks]*
3. **A2 + A3** — Generalize the feed adapter, add 3-5 shops. *[weeks]*
4. **C4** — Bank installment at checkout (conversion lever). *[weeks, gated on
   bank merchant agreement]*
5. **B** — Self-serve seller portal (scale supply). *[the big build]*
6. **C2 + C3 + C5** — Split payouts, courier, returns ops (scale the operation).

Rationale: prove buyers exist (A1+C1) before building the seller portal (B);
prove unit economics on one partner before taking on delivery + finance for many.

---

## The make-or-break (not software)

The code is the easy 30%. Before scaling, validate the business:

- **Margin**: what % does Homico keep per basket? Is it enough after delivery +
  payment fees + returns?
- **Cash flow**: we collect from the customer, pay the shop later - working
  capital. Installment helps (bank pays us upfront).
- **Delivery unit economics**: who pays for delivery, what does it actually cost.
- **Returns rate**: the silent margin-killer for merchant-of-record.
- **Legal**: merchant-of-record obligations (consumer rights, invoicing, VAT),
  supplier agreements (who's liable for defects).

A `product_order` today already runs as merchant-of-record (platform charge, no
escrow), so the legal posture is decided - validate the economics before Phase B.

---

## Open questions to resolve

- Kasco: what feed format can he give us? (see spec)
- Commission model: flat %, per-category, or markup?
- Delivery: shop-delivers vs Homico courier vs hybrid, per shop?
- Which bank for installment first (TBC vs BoG), and the merchant terms?
