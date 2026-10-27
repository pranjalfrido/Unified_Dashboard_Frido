# Ads Phase 2 verification (ADS_MASTER_PLAN.md B9)

Run 2026-10-26T22:02, local build of feature/responsive-ads, range 1–25 Oct 2026 (static files: ads-data.json + pnl-data.json; the 6-month view from one live query). Laptop 1920 vs iPhone 14.

## 1. Mobile tiles = laptop cards

| Tab | Values compared | Same | Notes |
|---|---|---|---|
| Overall | 8 | ✓ |  |
| D2C | 8 | ✓ |  |
| Amazon | 8 | ✓ |  |
| Flipkart | 8 | ✓ |  |
| Myntra | 8 | ✓ |  |
| Blinkit | 8 | ✓ |  |
| Zepto | 8 | ✓ |  |
| Instamart | 8 | ✓ |  |

## 2. Totals tie

| Check | Values | OK |
|---|---|---|
| Daily bars per channel = platform overview spend (Overall) | D2C ₹6.37 Cr / ₹6.37 Cr · Amazon ₹1.62 Cr / ₹1.62 Cr · Flipkart ₹34.30 L / ₹34.30 L · Myntra ₹14.45 L / ₹14.45 L · Blinkit ₹4.09 L / ₹4.09 L · Zepto ₹2.20 L / ₹2.20 L · Instamart ₹1.13 L / ₹1.13 L | ✓ |
| Spend shares and revenue shares each sum to 100% | each channel ÷ the total of all channels shown in the card (D2C, Amazon, Flipkart, Myntra, Blinkit, Zepto, Instamart, CRED); the card shows the top 5 + Show all | ✓ by construction |
| All: 6-month Oct (current month) = card spend | card ₹8.55 Cr · 6-month Oct ₹8.55 Cr | ✓ |
| D2C: 6-month Oct (current month) = card spend | card ₹6.37 Cr · 6-month Oct ₹6.37 Cr | ✓ |
| Amazon: 6-month Oct (current month) = card spend | card ₹1.62 Cr · 6-month Oct ₹1.62 Cr | ✓ |
| Flipkart: 6-month Oct (current month) = card spend | card ₹34.30 L · 6-month Oct ₹34.30 L | ✓ |
| Myntra: 6-month Oct (current month) = card spend | card ₹14.45 L · 6-month Oct ₹14.45 L | ✓ |
| Blinkit: 6-month Oct (current month) = card spend | card ₹4.09 L · 6-month Oct ₹4.09 L | ✓ |
| Zepto: 6-month Oct (current month) = card spend | card ₹2.20 L · 6-month Oct ₹2.20 L | ✓ |
| Instamart: 6-month Oct (current month) = card spend | card ₹1.13 L · 6-month Oct ₹1.13 L | ✓ |

## 3. Watchlist rule check (laptop, 1–25 Oct)

### All

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spend, no sales | 17 | 17 | ✓ |  |

<details><summary>Spend, no sales: 17 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Dual Car Comfort Combo | ₹21.31 L | ₹2.54 K | 0.00x | — |
| Mattress Topper | ₹19.61 L | — | — | — |
| Footwear | ₹17.41 L | — | — | — |
| Barefoot Shoes - Men | ₹8.10 L | — | — | — |
| Ergo Furniture | ₹7.60 L | — | — | — |
| Cushions | ₹6.81 L | — | — | — |
| Insoles | ₹4.08 L | — | — | — |
| Shower Chair Pro | ₹2.12 L | — | — | — |
| Ultimate Wedge Cushion | ₹1.88 L | ₹22.25 K | 0.12x | — |
| Barefoot Sock Shoe | ₹1.36 L | — | — | — |
| Self-propelled Bariatric Wheelchair | ₹42.48 K | — | — | — |
| Microfibre Sleeping Pillow | ₹41.36 K | — | — | — |
| Men's Puneri Arch Comfort Sandal | ₹35.64 K | — | — | — |
| Mobility | ₹31.40 K | — | — | — |
| Orthotics | ₹31.10 K | — | — | — |
| Pillows | ₹17.75 K | — | — | — |
| Bath Mat | ₹15.69 K | — | — | — |

</details>

| Unattributed spend | 33.4% | channel level | — | ₹2.86 Cr not linked to a product |
| ROAS down ≥ 20% | 29 | 29 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▼7% | channel level | — | CPC ₹8.10 → ₹7.57 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Orthopedic Heel Pad Insole | ₹30.68 K | 14.83x | — | ✓ |
| Arch Comfort Slides | ₹10.17 L | 6.38x | — | ✓ |
| Ultimate Pro Seating Combo | ₹2.80 L | 11.95x | — | ✓ |
| Orthotics Toe Separator Pro | ₹2.93 L | 2.79x | — | ✓ |
| Cloud Comfort Slippers | ₹3.98 L | 10.73x | — | ✓ |

### D2C

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spending at a loss | 11 | 11 | ✓ |  |

<details><summary>Spending at a loss: 11 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Dual Car Comfort Combo | ₹17.07 L | ₹2.54 K | 0.00x | 3.87x |
| Men's Cloud Comfort Sandal | ₹14.69 L | ₹23.63 L | 1.61x | 2.72x |
| Prime Electric Wheelchair | ₹4.64 L | ₹16.72 L | 3.61x | 3.64x |
| ErgoLift Footrest | ₹4.03 L | ₹7.04 L | 1.75x | 3.01x |
| Arch Support Wedge Sandals - Velcro Strap | ₹3.33 L | ₹4.67 L | 1.40x | 5.20x |
| Foldable Electric Wheelchair | ₹2.76 L | ₹11.25 L | 4.07x | 4.39x |
| Men's Cloud Comfort Shoes - Lace Ups | ₹1.69 L | ₹6.95 K | 0.04x | 1.74x |
| Orthotics Kids Posture Seat | ₹1.34 L | ₹3.63 L | 2.71x | 2.83x |
| Nasal Strips | ₹83.65 K | ₹94.83 K | 1.13x | 1.80x |
| Kids Ear Plug | ₹20.13 K | ₹23.23 K | 1.15x | 2.85x |
| Men's Cloud Comfort Shoes - Slip Ons | ₹12.30 K | ₹43.05 K | 3.50x | 5.20x |

</details>

| Spend, no sales | 15 | 15 | ✓ |  |

<details><summary>Spend, no sales: 15 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Dual Car Comfort Combo | ₹17.07 L | ₹2.54 K | 0.00x | 3.87x |
| Mattress Topper | ₹16.72 L | — | — | — |
| Footwear | ₹16.46 L | — | — | — |
| Ergo Furniture | ₹7.24 L | — | — | — |
| Cushions | ₹6.81 L | — | — | — |
| Barefoot Shoes - Men | ₹6.37 L | — | — | — |
| Insoles | ₹4.08 L | — | — | — |
| Shower Chair Pro | ₹2.09 L | — | — | — |
| Men's Cloud Comfort Shoes - Lace Ups | ₹1.69 L | ₹6.95 K | 0.04x | 1.74x |
| Barefoot Sock Shoe | ₹1.36 L | — | — | — |
| Self-propelled Bariatric Wheelchair | ₹42.48 K | — | — | — |
| Ultimate Wedge Cushion | ₹39.05 K | — | — | — |
| Mobility | ₹31.40 K | — | — | — |
| Orthotics | ₹30.70 K | — | — | — |
| Pillows | ₹17.68 K | — | — | — |

</details>

| Unattributed spend | 44.3% | channel level | — | ₹2.82 Cr not linked to a product |
| ROAS down ≥ 20% | 8 | 8 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▼13% | channel level | — | CPC ₹7.71 → ₹6.74 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Orthopaedic Heating Belt | ₹12.59 L | 3.12x | 2.16x | ✓ |
| Hush Ear Plug | ₹40.60 K | 6.46x | 2.14x | ✓ |
| Portable Travel Seat Cushion | ₹31.37 K | 4.08x | 2.30x | ✓ |
| Carbon Fiber X Electric Wheelchair | ₹2.18 L | 5.73x | 2.99x | ✓ |
| Comfort Formal Shoes | ₹4.42 L | 3.40x | 2.43x | ✓ |

### Amazon

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spending at a loss | 16 | 16 | ✓ |  |

<details><summary>Spending at a loss: 16 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Premium Car Neck Rest Pillow | ₹3.12 L | ₹2.63 L | 0.84x | 2.73x |
| Comfort Formal Shoes | ₹3.05 L | ₹6.16 L | 2.02x | 2.40x |
| Ultimate Deep Sleep Pillow | ₹2.67 L | ₹26.33 L | 9.88x | 9.91x |
| Maternity Pillow | ₹2.14 L | ₹4.82 L | 2.25x | 3.75x |
| Contour Cervical Pillow | ₹1.92 L | ₹10.62 L | 5.52x | 9.73x |
| Men's Cloud Comfort Shoes - Lace Ups | ₹1.73 L | ₹14.72 K | 0.09x | — |
| Ultimate Cozy Classic Pillow | ₹1.29 L | ₹8.21 L | 6.37x | 14.51x |
| Cuddle Sleep Pillow | ₹1.03 L | ₹2.70 L | 2.62x | 4.41x |
| Men's Cloud Comfort Shoes - Slip Ons | ₹65.54 K | ₹81.84 K | 1.25x | 5.26x |
| Cloud Seat Cushion | ₹51.09 K | ₹2.23 L | 4.37x | 5.13x |
| ErgoLuxe Executive Chair | ₹50.69 K | ₹29.66 K | 0.59x | — |
| AeroDry Bath Mat | ₹45.32 K | ₹2.58 L | 5.69x | 11.71x |
| Mattress Protector | ₹37.81 K | ₹2.15 L | 5.68x | 8.85x |
| Kids Comfort Sneakers | ₹30.63 K | ₹54.85 K | 1.79x | 3.93x |
| Portable Balance Trainer | ₹25.24 K | ₹30.05 K | 1.19x | 2.60x |
| Women's Comfort Flat Sandal | ₹19.95 K | ₹3.74 L | 18.75x | 47.64x |

</details>

| Spend, no sales | 6 | 6 | ✓ |  |

<details><summary>Spend, no sales: 6 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Mattress Topper | ₹2.81 L | — | — | — |
| Dual Car Comfort Combo | ₹2.58 L | — | — | — |
| Men's Cloud Comfort Shoes - Lace Ups | ₹1.73 L | ₹14.72 K | 0.09x | — |
| Barefoot Shoes - Men | ₹1.22 L | — | — | — |
| Ergo Furniture | ₹36.51 K | — | — | — |
| Microfibre Sleeping Pillow | ₹15.34 K | — | — | — |

</details>

| Unattributed spend | 0.6% | channel level | — | ₹92.84 K not linked to a product |
| ROAS down ≥ 20% | 29 | 29 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▲5% | channel level | — | CPC ₹13.25 → ₹13.93 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Ultimate Pro Seating Combo | ₹2.80 L | 10.91x | 4.99x | ✓ |
| Arch Support Insoles | ₹2.62 L | 7.84x | 2.34x | ✓ |
| Ultimate Mattress Topper - Premium Cover | ₹1.24 L | 27.91x | 6.06x | ✓ |
| Cold & Hot Therapy Cap | ₹2.84 L | 8.08x | 2.07x | ✓ |
| Women's Arch Support Wedge Sandals | ₹13.52 K | 29.54x | 4.49x | ✓ |

### Flipkart

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spending at a loss | 30 | 30 | ✓ |  |

<details><summary>Spending at a loss: 30 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Premium Car Neck Rest Pillow | ₹1.72 L | ₹70.45 K | 0.41x | 3.77x |
| Ultimate Wedge Cushion | ₹1.36 L | ₹13.33 K | 0.10x | — |
| Men's Cloud Comfort Shoes - Slip Ons | ₹1.30 L | ₹2.94 L | 2.26x | 9.65x |
| Arch Comfort Slides | ₹1.30 L | ₹4.58 L | 3.52x | 6.50x |
| Men's Cloud Comfort Sandal | ₹1.05 L | ₹6.96 L | 6.63x | 6.83x |
| Active Casual Sneakers | ₹1.02 L | ₹1.93 L | 1.89x | 9.21x |
| Ultimate Pro Seat Cushion | ₹82.19 K | ₹1.42 L | 1.73x | 10.92x |
| Women's Cloud Comfort Sandal | ₹57.00 K | ₹3.61 L | 6.33x | 10.86x |
| Ultimate Car Wedge Seat Cushion | ₹51.38 K | ₹1.64 L | 3.20x | 14.26x |
| Women's Arch Comfort Wedge Sandals - Buckle Strap | ₹51.37 K | ₹94.82 K | 1.85x | 7.23x |
| Active Walking Shoes - Men's | ₹47.98 K | ₹2.44 L | 5.08x | — |
| Dual Gel Insoles | ₹46.61 K | ₹2.15 L | 4.61x | 48.03x |
| Ultimate Wedge Plus Cushion | ₹44.33 K | ₹1.52 L | 3.43x | 4.61x |
| Orthotics Bamboo Knee Cap | ₹36.78 K | ₹5.47 K | 0.15x | 6.89x |
| Men's Cloud Comfort Shoes - Lace Ups - Arch Footbed | ₹35.70 K | ₹1.08 L | 3.03x | 5.17x |
| Women's Arch Support Wedge Sandals | ₹31.68 K | ₹57.10 K | 1.80x | 8.35x |
| Travel Neck Pillow Without Case | ₹29.10 K | ₹1.33 L | 4.56x | 5.53x |
| Women's Ethnic Comfort Flat Sandal | ₹26.76 K | ₹1.25 L | 4.67x | — |
| Glide Ergo Chair | ₹24.84 K | ₹58.15 K | 2.34x | 5.99x |
| Women's Comfort Flat Sandal | ₹22.62 K | ₹62.60 K | 2.77x | — |
| Travel Neck Pillow | ₹21.24 K | ₹1.09 L | 5.14x | 5.60x |
| Orthotics Knee Support Wrap | ₹18.99 K | ₹69.12 K | 3.64x | 4.85x |
| Lumbo Sacral Belt | ₹16.41 K | ₹50.73 K | 3.09x | 7.44x |
| Premium Car Backrest Cushion | ₹16.31 K | ₹27.91 K | 1.71x | 10.30x |
| Premium Neck Contour Cervical Pillow | ₹15.81 K | ₹65.40 K | 4.14x | 4.83x |
| Maternity Pillow Plus | ₹15.18 K | ₹46.32 K | 3.05x | 3.26x |
| Ultimate Neck Contour Cervical Plus Pillow | ₹14.91 K | ₹19.22 K | 1.29x | 39.05x |
| Men's Comfort Triple Strap Sandals | ₹13.47 K | — | — | 2.95x |
| Active Walking Shoes - Women's | ₹11.90 K | ₹40.52 K | 3.41x | — |
| Gel Max Comfort Insole | ₹10.41 K | ₹24.42 K | 2.35x | 49.68x |

</details>

| Spend, no sales | 11 | 11 | ✓ |  |

<details><summary>Spend, no sales: 11 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Premium Car Neck Rest Pillow | ₹1.72 L | ₹70.45 K | 0.41x | 3.77x |
| Dual Car Comfort Combo | ₹1.66 L | — | — | — |
| Ultimate Wedge Cushion | ₹1.36 L | ₹13.33 K | 0.10x | — |
| Orthotics Bamboo Knee Cap | ₹36.78 K | ₹5.47 K | 0.15x | 6.89x |
| Men's Puneri Arch Comfort Sandal | ₹35.51 K | — | — | — |
| Barefoot Shoes - Men | ₹33.85 K | — | — | — |
| Women's Arch Comfort Sandals | ₹16.92 K | — | — | — |
| Bath Mat | ₹13.50 K | — | — | — |
| Men's Comfort Triple Strap Sandals | ₹13.47 K | — | — | 2.95x |
| Footwear | ₹12.05 K | — | — | — |
| Ergoluxe Studio Chair | ₹10.14 K | — | — | — |

</details>

| Unattributed spend | 4.1% | channel level | — | ₹1.42 L not linked to a product |
| ROAS down ≥ 20% | 8 | 8 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▲5% | channel level | — | CPC ₹6.74 → ₹7.09 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Active Knee Cap Support | ₹18.48 K | 16.52x | 8.67x | ✓ |
| Men's Comfort Dual Strap Sandals | ₹3.83 L | 9.62x | 7.56x | ✓ |
| Orthopaedic Heating Belt | ₹17.24 K | 8.14x | 2.61x | ✓ |
| Ultimate Cozy Pillow | ₹14.10 K | 3.62x | 2.71x | ✓ |
| Adjustable Wedge Max Cushion | ₹16.94 K | 22.80x | 13.59x | ✓ |

### Myntra

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spend, no sales | 6 | 6 | ✓ |  |

<details><summary>Spend, no sales: 6 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Footwear | ₹83.52 K | — | — | — |
| Microfibre Sleeping Pillow | ₹18.96 K | — | — | — |
| Barefoot Shoes - Men | ₹15.72 K | — | — | — |
| Ultimate Car Wedge Seat Cushion | ₹13.45 K | — | — | — |
| Women's Arch Comfort Sandals | ₹12.84 K | — | — | — |
| Men's Comfort Triple Strap Sandals | ₹12.04 K | — | — | — |

</details>

| Unattributed spend | 0.4% | channel level | — | ₹5.42 K not linked to a product |
| ROAS down ≥ 20% | 6 | 6 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▲60% | channel level | — | CPC ₹5.04 → ₹8.07 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Women's Cloud Comfort Sandal | ₹20.19 K | 23.17x | — | ✓ |
| Women's Ethnic Comfort Flat Sandal | ₹72.46 K | 5.59x | — | ✓ |
| Cloud Comfort Arch Support Slippers | ₹1.78 L | 8.14x | — | ✓ |
| Women's Comfort Flat Sandal | ₹31.66 K | 9.84x | — | ✓ |
| Puneri Chappal - Men | ₹15.39 K | 15.98x | — | ✓ |

### Blinkit

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spending at a loss | 0 | 0 | ✓ (all clear) | |
| Spend, no sales | 3 | 3 | ✓ |  |

<details><summary>Spend, no sales: 3 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Orthotics Bamboo Knee Cap | ₹21.30 K | — | — | — |
| Premium Car Neck Rest Pillow | ₹20.65 K | — | — | — |
| Ultimate Wedge Cushion | ₹10.88 K | — | — | — |

</details>

| Unattributed spend | 1.0% | channel level | — | ₹4.27 K not linked to a product |
| ROAS down ≥ 20% | 1 | 1 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▼100% | channel level | — | CPC ₹123025.67 → ₹217.59 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Dual Gel Insoles | ₹41.88 K | 20.16x | 6.68x | ✓ |
| Ultimate Deep Sleep Pillow | ₹52.48 K | 41.81x | 9.14x | ✓ |
| Contour Cervical Pillow | ₹63.45 K | 28.05x | 7.20x | ✓ |
| Maternity Pillow | ₹12.95 K | 14.09x | 2.82x | ✓ |
| Travel Neck Pillow | ₹1.12 L | 19.12x | 3.47x | ✓ |

### Zepto

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spending at a loss | 1 | 1 | ✓ |  |

<details><summary>Spending at a loss: 1 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Ultimate Cozy Pillow | ₹30.25 K | ₹70.88 K | 2.34x | 2.58x |

</details>

| Spend, no sales | 0 | 0 | ✓ (all clear) | |
| Unattributed spend | 55.4% | channel level | — | ₹1.22 L not linked to a product |
| ROAS down ≥ 20% | 1 | 1 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▲14% | channel level | — | CPC ₹21.37 → ₹24.26 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Travel Neck Pillow | ₹29.88 K | 11.54x | 2.49x | ✓ |
| Cloud Comfort Slippers | ₹28.31 K | 8.24x | 2.74x | ✓ |

### Instamart

| Rule | Tile | Products listed | Every listed product meets the rule | Notes |
|---|---|---|---|---|
| Spending at a loss | 0 | 0 | ✓ (all clear) | |
| Spend, no sales | 1 | 1 | ✓ |  |

<details><summary>Spend, no sales: 1 products</summary>

| Product | Spend | Revenue | ROAS | Breakeven ROAS |
|---|---|---|---|---|
| Premium Car Neck Rest Pillow | ₹21.22 K | — | — | — |

</details>

| Unattributed spend | 0.0% | channel level | — | All spend linked to a product |
| ROAS down ≥ 20% | 2 | 2 | ✓ | previous ROAS re-checked from ads-data.json below |
| CPC up ≥ 15% | ▼4% | channel level | — | CPC ₹10.40 → ₹9.95 vs previous period |

5 unflagged products (≥ ₹10 K spend):

| Product | Spend | ROAS | Breakeven | Clear? |
|---|---|---|---|---|
| Travel Neck Pillow | ₹15.18 K | 19.24x | 2.31x | ✓ |
| Contour Cervical Pillow | ₹17.67 K | 7.77x | 3.75x | ✓ |


## 4. Tap-through (iPhone 14, 1–25 Oct)

Chromium and WebKit: **all pass**. Mobile layout · 9 header chips · tile switches the hero · daily Spend / Revenue toggle · day bar → sheet (every channel's spend, revenue, ROAS) · month row → sheet (by channel) · watchlist rule → full-screen list → product sheet (spend, revenue, ROAS, breakeven ROAS) · hardware Back closes the list · Category → its products · product row → sheet · chips row scrolls · Amazon chip → split bar · finger swipe scrolls the page (Chromium, CDP touch: 0 → 370 px) / nothing blocks a pan (WebKit) · no page errors.

## 5. Screenshots (September, static file)

`docs/responsive/after/ads`, `ads-D2C`, `ads-Amazon` (PNGs local only, git-ignored; `report.json` committed): laptop 1366 / 1280, iPad portrait 768, iPhone 14 / SE, Pixel, small Android, iPhone landscape. 24 captures: **no horizontal overflow, nothing clipped, no errors**.

## 6. Laptop 1366: before (main) vs after

- Top row: card values identical; ▲/▼ now real (Phase 1 A1: spend ▼62.9% → ▼17.6% for Sep); hero says "total-sales ROAS" (dotted, hover = definition); ROAS columns read "ROAS (total sales)"; ROAS chips plain (red only below 1x / below breakeven).
- New under the trend / platform overview: Ads watchlist, Daily spend by channel + heat table, Last 6 months | pacing + spend vs revenue share.
- Category / product: Unattributed line above the lists; Others category without the unattributed spend; Total rows unchanged.
- Amazon: Spend type split donut → split bar.
- Note: the full-page capture shows the trend chart / hero spark empty in the after image (the capture's full-height style makes Recharts re-measure and restart its animation). On the live page they draw normally (checked: 3 chart series on Ads Overall, September).

## 7. Design-system checklist (MOBILE_DESIGN_SYSTEM.md §5)

- [x] `MobilePageHeader` (Ads, date, ⋯, channel chips) + `MobileBottomNav`
- [x] Filters: the Ads category / product slicers stay on laptop; on mobile the lists have search + group chips in the full-screen view (no FilterSheet yet: logged)
- [x] Top = `MasterTrendCard`, 8 even tiles, chart as Overview, prev dashed (cached path)
- [x] No donuts (Amazon split bar); wide tables (heat, 6 months) laptop-only; mobile uses rows + sheets
- [x] Palette: Frido green shades only; red = loss / below breakeven; amber = watchlist warnings
- [x] No horizontal page scroll (24 captures); no inner scroll in page flow
- [x] Numbers identical to laptop (section 1)
- [x] Screenshots SE / 14 / Pixel / small Android / landscape / iPad portrait
- [ ] CRED keeps its current view on phones (its own data path); not redesigned in this run
