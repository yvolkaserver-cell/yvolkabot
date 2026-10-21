# Rangkuman & Konteks Masalah: Views Tracker & TikTok Scraper

Dokumen ini merangkum analisis lengkap mengenai batas sistem (*limits*), penyebab error `Scrape failed`, serta solusi yang telah diterapkan pada sistem Views Tracker bot clipping.

---

## 1. Apakah Ada Batas (Limit) di Views Tracker?

Secara desain aplikasi, **tidak ada batasan hard limit pada jumlah views yang bisa di-track**, namun terdapat batasan teknis berikut:

| Aspek | Batasan / Konfigurasi | Lokasi File |
|---|---|---|
| **Kapasitas Baris Sheet** | Maksimal baris 7–1000 (~994 baris per tab campaign) | [`viewsTracker.js`](file:///d:/version%20Bot/bot-clipping_1.2.2/handlers/viewsTracker.js) (`getSubmissionsFromTab`) |
| **Frekuensi Eksekusi** | Siklus berjalan otomatis setiap **1 jam** sekali | `TRACKER_INTERVAL_MS = 60 * 60 * 1000` |
| **Delay Antar Video** | Awalnya **2 detik**, ditingkatkan menjadi **5 detik** | `await delay(5000)` di `runViewsTrackerCycle` |
| **Proteksi Nilai Views** | `newViews >= oldViews` (mencegah angka views turun karena cache) | `viewsTracker.js` |

---

## 2. Kenapa Setelah Beberapa Hari Views Tidak Ngebaca / Muncul `Scrape failed`?

Pada screenshot terminal, semua submission menghasilkan log:
```text
⚠️ SUB-xxxxxx: Scrape failed (kept old: xxx views)
```

### Akar Penyebab:
1. **Rate Limit TikWM API (Penyedia Scraper Utama)**
   * Endpoint publik `tikwm.com` memiliki batas:
     ```json
     {"code": -1, "msg": "Free Api Limit: 1 request/second."}
     ```
   * Jika ada puluhan/ratusan baris link TikTok yang diproses berturut-turut tiap jam, TikWM menolak request dan bot sebelumnya langsung menganggap video tersebut gagal (*failed*).

2. **Direct Scraping TikTok Terkena Blokir IP (HTTP 429)**
   * Saat TikWM gagal, bot otomatis mencoba fallback kedua yaitu *direct scraping* langsung ke halaman TikTok.
   * TikTok mendeteksi request massal dari IP yang sama tanpa session browser nyata, sehingga mengembalikan status **HTTP 429 (`ratelimit triggered`)**.
   * Akibatnya kedua jalur scraper macet secara bersamaan.

3. **User-Agent Statis**
   * Sebelumnya kode menggunakan satu User-Agent browser usang yang sama terus-menerus (`Chrome/122.0.0.0`), mempermudah sistem proteksi mem-blacklist request bot.

---

## 3. Perubahan & Peningkatan yang Telah Diterapkan

File yang dimodifikasi:
- [`handlers/viewsTracker.js`](file:///d:/version%20Bot/bot-clipping_1.2.2/handlers/viewsTracker.js)
- [`utils/tiktokScraper.js`](file:///d:/version%20Bot/bot-clipping_1.2.2/utils/tiktokScraper.js)

### Rincian Perubahan:
1. **Menaikkan Jeda Scraping**:
   * Delay antar video dinaikkan dari **2 detik (2000ms)** menjadi **5 detik (5000ms)** untuk menjaga ritme request tetap aman.
2. **Rotasi User-Agent Dinamis**:
   * Ditambahkan daftar User-Agent modern (Chrome 128, Firefox 129, Safari macOS, Edge, dan Android) yang diacak pada setiap request.
3. **Realistic Browser Headers**:
   * Menambahkan header pelengkap seperti `Origin` dan `Referer` yang sesuai ke request TikWM.
4. **Sistem Multi-Host Fallback**:
   * Request pertama mencoba `www.tikwm.com`.
   * Jika gagal/nol, mencoba host cadangan `tikwm.com`.
   * Jika masih gagal, mencoba direct scraping HTML TikTok dengan regex fallback.
5. **Auto-Retry Cerdas saat Terkena Rate Limit**:
   * Jika TikWM merespon dengan pesan `Free Api Limit: 1 request/second`, bot tidak langsung menyerah atau skip video, melainkan **menunggu cooldown selama 3 detik lalu mencoba ulang (retry) secara otomatis**.

---

## 4. Rekomendasi Tindakan Pengguna

Jika IP server/komputer saat ini masih berstatus terblokir (HTTP 429 dari pengujian sebelumnya):
1. **Reset IP Publik**:
   * Jika bot dijalankan di komputer lokal/WiFi: *restart* router/modem WiFi atau gunakan tethering ponsel sebentar agar ISP memberikan IP publik baru yang bersih dari blacklist TikTok/TikWM.
2. **Jalankan Ulang Bot**:
   * Jalankan bot seperti biasa (`node index.js`).
   * Siklus tracker berikutnya akan berjalan dengan jeda 5 detik dan sistem auto-retry yang baru.
