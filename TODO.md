# TODO: Improvement Plan

> Catatan: Dokumen ini berisi task improvement yang harus dieksekusi satu per satu. Setiap task memiliki konteks, langkah teknis, dan acceptance criteria yang jelas.

---

## Task 1: Fix Sales Invoice Date Picker — Allow Single Day Selection

**Priority:** Tinggi (quick win)  
**Effort:** Kecil  
**Dependency:** Tidak ada

### Konteks
Saat ini, date picker pada halaman Sales Invoice tidak mengizinkan user memilih rentang 1 hari (misal 30 Maret - 30 Maret). User harus bisa filter transaksi untuk satu hari tertentu saja.

### Langkah Teknis
1. **Backend/API:** Pastikan query filter tanggal mendukung `start_date == end_date`. Gunakan `WHERE date >= start_date AND date < start_date + 1 day` atau `BETWEEN start_date 00:00:00 AND end_date 23:59:59`.
2. **Frontend:** Hapus validasi yang menghalangi `start_date == end_date` pada date picker component. Pastikan user bisa klik tanggal yang sama untuk start dan end.

### Acceptance Criteria
- [ ] User bisa memilih tanggal yang sama untuk start date dan end date
- [ ] Hasil filter menampilkan semua transaksi pada hari tersebut
- [ ] Tidak ada error atau validasi yang menghalangi

---

## Task 2: Customer Harus Terhubung dengan Warehouse

**Priority:** Tinggi  
**Effort:** Sedang  
**Dependency:** Tidak ada

### Konteks
Setiap Customer harus memiliki relasi ke satu Warehouse. Ini diperlukan agar saat membuat Sales Order, sistem tahu warehouse mana yang dipakai.

### Langkah Teknis
1. **Database Migration:** Tambahkan kolom `warehouse_id` (foreign key ke tabel warehouse) pada tabel `customers`. Bisa nullable dulu untuk backward compatibility.
2. **Backend/API:**
   - Update endpoint create/update Customer untuk menerima dan menyimpan `warehouse_id`.
   - Tambahkan validasi: `warehouse_id` harus merujuk ke warehouse yang valid.
   - Update endpoint GET Customer untuk menyertakan data warehouse (join/include).
3. **Frontend:**
   - Tambahkan dropdown/select "Warehouse" pada form Create/Edit Customer.
   - Tampilkan nama warehouse pada list dan detail Customer.
4. **Data Migration:** Untuk customer yang sudah ada, assign warehouse default atau biarkan null lalu minta user mengisi manual.

### Acceptance Criteria
- [ ] Tabel customer memiliki kolom `warehouse_id` (FK)
- [ ] Form Customer memiliki field untuk memilih warehouse
- [ ] API create/update Customer menyimpan `warehouse_id`
- [ ] Detail/list Customer menampilkan warehouse terkait

---

## Task 3: Sales Order Harus Menampilkan dan Menyimpan Warehouse

**Priority:** Tinggi  
**Effort:** Sedang  
**Dependency:** Task 2 harus selesai terlebih dahulu

### Konteks
Saat membuat Sales Order, sistem harus tahu warehouse mana yang digunakan. Warehouse ini bisa di-auto-fill dari Customer yang dipilih (hasil dari Task 2), tapi juga bisa di-override manual jika diperlukan.

### Langkah Teknis
1. **Database Migration:** Tambahkan kolom `warehouse_id` (FK ke tabel warehouse) pada tabel `sales_orders`.
2. **Backend/API:**
   - Update endpoint create Sales Order untuk menerima `warehouse_id`.
   - Saat customer dipilih, auto-suggest warehouse dari data customer (GET customer → warehouse_id).
   - Validasi: `warehouse_id` wajib diisi.
   - Stok yang dikurangi harus dari warehouse yang sesuai dengan `warehouse_id` pada Sales Order.
3. **Frontend:**
   - Tambahkan field "Warehouse" pada form Sales Order.
   - Auto-fill warehouse saat customer dipilih (fetch dari relasi customer → warehouse).
   - Izinkan user override warehouse secara manual.
   - Tampilkan warehouse pada list dan detail Sales Order.

### Acceptance Criteria
- [ ] Tabel sales_orders memiliki kolom `warehouse_id` (FK)
- [ ] Form Sales Order memiliki field warehouse, auto-filled dari customer
- [ ] Stok berkurang dari warehouse yang benar
- [ ] Detail/list Sales Order menampilkan warehouse

---

## Task 4: Bundling — Stok Produk Satuan Harus Ikut Berkurang

**Priority:** Tinggi  
**Effort:** Besar (paling kompleks)  
**Dependency:** Tidak ada (tapi kerjakan terakhir karena kompleksitas)

### Konteks
Saat ini, jika ada order untuk produk bundling, hanya stok bundle yang berkurang. Seharusnya, produk-produk satuan yang menjadi komponen bundle juga ikut berkurang.

**Contoh:**
- Bundle "Paket A" terdiri dari: 1x Cherry + 1x Blossom
- Order 3x "Paket A" → Cherry harus berkurang 3, Blossom harus berkurang 3
- Jika Cherry atau Blossom stoknya tidak cukup, order harus ditolak

### Langkah Teknis
1. **Pastikan Data Model Bundle:** Pastikan ada tabel `bundle_items` (atau sejenisnya) yang menyimpan relasi:
   - `bundle_id` → produk bundle
   - `product_id` → produk satuan (komponen)
   - `quantity` → jumlah produk satuan per 1 bundle
2. **Backend — Logika Pengurangan Stok:**
   Saat Sales Order dengan item bertipe bundle diproses/dikonfirmasi:
   ```
   for each order_item where product.type == 'bundle':
     bundle_qty = order_item.quantity
     bundle_components = get_bundle_items(order_item.product_id)
     for each component in bundle_components:
       reduce_stock(component.product_id, component.quantity * bundle_qty)
   ```
3. **Validasi Sebelum Approve:**
   Sebelum mengkonfirmasi order, cek stok SEMUA komponen bundle:
   ```
   for each component in bundle_components:
     if stock(component.product_id) < component.quantity * bundle_qty:
       reject order with message "Stok {component.name} tidak cukup"
   ```
4. **Handle Pembatalan/Return:**
   Jika order dibatalkan, kembalikan stok bundle + semua komponen satuan.
5. **Frontend:** Tampilkan informasi komponen bundle pada detail order (opsional tapi disarankan).

### Acceptance Criteria
- [ ] Saat order bundle, stok produk satuan (komponen) ikut berkurang sesuai qty
- [ ] Validasi stok komponen sebelum order dikonfirmasi
- [ ] Jika stok komponen tidak cukup, order ditolak dengan pesan yang jelas
- [ ] Pembatalan order mengembalikan stok bundle + stok komponen
- [ ] (Opsional) Detail order menampilkan breakdown komponen bundle

---

## Urutan Pengerjaan

```
Task 1 (Date Picker Fix) → bisa langsung dikerjakan
Task 2 (Customer ↔ Warehouse) → bisa langsung dikerjakan
Task 3 (Warehouse di Sales Order) → setelah Task 2 selesai
Task 4 (Bundling Stok Deduction) → bisa kapan saja, tapi kerjakan terakhir karena paling kompleks
```