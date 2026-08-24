# ai-study-plan-tracker (Vue) ↔ AI Planner (Firestore/MCP) Entegrasyon Planı

**Amaç:** `~/Desktop/ai-study-plan-tracker` (Vue 3 + Three.js, masaüstündeki 3D tasarım) sitesinin
**tasarımına hiç dokunmadan**, Claude'un MCP üzerinden oluşturduğu görevleri (`add_tasks`) o sitede de
görüp tamamlanabilir hale getirmek. İki site de **aynı Firebase projesine** bağlanacak; hiçbiri
diğerinin sahibi olmayacak, ikisi de eşit birer "insan arayüzü" olacak.

Bu belge bir **tasarım/plan dokümanıdır** — hiçbir kod henüz yazılmadı. Onay verince adım adım
uygulanır.

---

## 1. Bugünkü durum (iki proje de incelendi)

### AI-planner (Next.js) — zaten çalışıyor
- Firebase Auth (Google, tek sahip UID kontrolü) → `OwnerGate`
- Firestore `users/{ownerUid}/tasks` koleksiyonu → `CloudTask` tipi
- Cloudflare Worker (MCP) → Claude buraya yazıyor, siteler buradan okuyor
- Görev alanları: `id, title, subject, source_skill, description, due_date (YYYY-MM-DD), status (todo|done), idempotency_key, created_at, updated_at, completed_at`
- Kurallar (`firestore.rules`): sadece `ownerUid()` ile eşleşen `request.auth.uid` okuyup yazabilir — **hangi web sitesinin çağırdığıyla ilgilenmez**. Bu, ikinci bir sitenin aynı kurallarla, hiç değiştirmeden çalışabileceği anlamına geliyor.

### ai-study-plan-tracker (Vue) — masaüstünde, tasarımı hazır
- **Router yok, Pinia yok.** State: her feature kendi `reactive()`/`ref()` singleton'ı (`store.ts` dosyaları).
- **Kalıcılık:** her store kendi `localStorage` anahtarına yazıyor (`akilli-calisma-alani-vue-v2`, `...-pomodoro-v1`, `...-theme`), 400ms debounce.
- **Cihazlar arası senkron (opsiyonel):** `src/utils/remoteSync.ts` → Vercel Blob (`api/sync.ts`), tek paylaşılan `SYNC_SECRET` ile korunuyor. Kullanıcı kavramı yok — sır bilen herkes aynı veriyi görür/yazar.
- **`workspace` feature'ı zaten dolu dolu var** (README'nin aksine): `PlanView`, `TimelineView` (takvim), `ChecklistView`, `SourcesView`, `PomodoroView` — hepsi `WorkspacePanel.vue` içinde sekmeler halinde, 3D sahnedeki bir nesneye tıklayınca açılan bir overlay panel.
  - Ama bunlar **kullanıcının yapıştırdığı Markdown'dan parse edilen** bir model üzerinde çalışıyor (`Source`, `Schedule`, `ChecklistItem`, `Milestone`, `RuleItem` — `src/features/workspace/types.ts`). Firestore/CloudTask ile **hiçbir ortak veri modeli yok**.
- **Auth yok.** Google girişi, kullanıcı UID'si, hiçbir kimlik doğrulama kavramı mevcut değil.
- **Env değişkenleri:** Next.js'teki `NEXT_PUBLIC_*` yerine Vite'ta **`VITE_*`** öneki kullanılıyor (istemciye açık olması için zorunlu). Şu an sadece `VITE_SHOW_ATTRIBUTION` var; sunucu tarafında (`api/*.ts`, Vercel serverless fn) `YOUTUBE_API_KEY` ve `SYNC_SECRET` var.
- **Deploy hedefi:** Vercel (zero-config, `api/` klasörü Vercel serverless fonksiyon konvansiyonuyla).

**Önemli çıkarım:** Vue tarafındaki mevcut "workspace" (markdown-plan) sistemi ile Firestore
"CloudTask" sistemi birbirinden tamamen ayrı iki veri modeli. Next.js tarafında Dexie roadmap'i
Firestore görevlerine hiç karışmadığı gibi, Vue tarafında da markdown-workspace'e hiç
dokunmayacağız — CloudTask'lar **yeni, ek bir sekme/panel** olarak eklenecek.

---

## 2. Kurulacak mimari

```
Claude.ai ──MCP──▶ Cloudflare Worker ──▶ Firestore (users/{ownerUid}/tasks)
                                              ▲              ▲
                                              │              │
                          AI-planner (Next.js)│              │ai-study-plan-tracker (Vue)
                          localhost:3000 /    │              │Desktop → sonra Vercel
                          Vercel               (aynı proje, aynı kurallar, aynı UID)
```

- **Firestore, firestore.rules, firestore.indexes.json, Cloudflare Worker → HİÇBİRİ değişmiyor.**
  Kurallar zaten "hangi UID" diye bakıyor, "hangi site" diye bakmıyor.
- Vue tarafına **aynı Firebase Web App config değerleri** (apiKey, authDomain, projectId, vb.)
  girilecek — istersen Firebase Console'da ikinci bir "Web app" kaydı da açılabilir (sadece
  isimlendirme/analytics ayrımı için, zorunlu değil), ama en basiti: **aynı config'i, sadece
  `VITE_` önekiyle** kopyalamak.
- Vue tarafına eklenecek olan **tek sahiplik doğrulaması** (owner UID kontrolü) Next.js'teki
  `OwnerGate` ile birebir aynı mantık — Vue composable olarak yeniden yazılacak.

---

## 3. Vue tarafında eklenecek dosyalar (hepsi YENİ, mevcut hiçbir dosya değişmiyor)

| Next.js kaynağı | Vue karşılığı (yeni) | Not |
|---|---|---|
| `src/lib/firebase/client.ts` | `src/lib/firebase/client.ts` | Aynı mantık; `process.env.NEXT_PUBLIC_*` → `import.meta.env.VITE_*`, `process.env.NODE_ENV==="development"` → `import.meta.env.DEV` |
| `src/lib/firebase/tasks.ts` | `src/lib/firebase/tasks.ts` | Firestore SDK çağrıları (`fetchCloudTasks`, `setCloudTaskStatus`, `toCloudTask`, `describeCloudTaskError`) framework'ten bağımsız — **neredeyse birebir kopyalanabilir** |
| `src/lib/dates.ts` | `src/lib/dates.ts` | Saf TS, framework'ten bağımsız — **birebir kopyalanabilir** |
| `src/types/task.ts` | `src/features/workspace/cloudTask.ts` (adı çakışmasın diye) | `CloudTask` interface'i birebir |
| `src/components/auth/OwnerGate.tsx` | `src/features/workspace/useOwnerAuth.ts` (composable) + `OwnerGateModal.vue` (küçük bir giriş ekranı) | React context → Vue `reactive()` composable; durum makinesi aynı: loading/unconfigured/config-error/signed-out/bootstrap/denied/ready |
| `src/hooks/useCloudTasks.ts` | `src/features/workspace/useCloudTasks.ts` | React `useSyncExternalStore` → Vue `reactive()` + `watch`; pencere/cache mantığı aynı |
| (yok, yeni) | `CloudTasksView.vue` | `WorkspacePanel`'e **yeni bir sekme** ("Claude Görevleri") — mevcut `PlanView`/`ChecklistView` tasarım diline (clay-card, Urbanist font, mevcut `colors.scss` değişkenleri) uyularak, ama var olan hiçbir view değiştirilmeden |

`npm install firebase` — tek yeni bağımlılık (Next.js'te kullanılanla aynı paket/versiyon aralığı).

---

## 4. Env değişkenleri — Vue tarafına eklenecek (Next.js ile **aynı değerler**, farklı önek)

```
VITE_FIREBASE_API_KEY=<Next.js .env.local'daki NEXT_PUBLIC_FIREBASE_API_KEY ile aynı>
VITE_FIREBASE_AUTH_DOMAIN=<...>
VITE_FIREBASE_PROJECT_ID=<...>
VITE_FIREBASE_STORAGE_BUCKET=<...>
VITE_FIREBASE_MESSAGING_SENDER_ID=<...>
VITE_FIREBASE_APP_ID=<...>
VITE_FIREBASE_OWNER_UID=<aynı owner UID>
```

Yerelde `.env.local` (zaten `.gitignore`'da — kontrol edilecek), Vercel'e deploy edilince
Vercel proje ayarlarına aynı değerler girilecek.

**Firebase Console'da tek ek adım:** Authentication → Settings → Authorized domains'e Vue
sitesinin çalışacağı origin'i eklemek (yerelde Vite'ın portu, sonra Vercel domaini) —
Next.js için zaten yaptığımız adımın aynısı, ikinci bir origin için tekrar.

---

## 5. Davranış / kapsam netliği

- **Claude sadece MCP üzerinden, sadece Cloudflare Worker'a yazar.** Vue sitesi de, Next.js
  sitesi de görev **oluşturamaz** — sadece okur ve `todo`↔`done` değiştirir (mevcut
  tek-yönlü kısıtlama korunuyor: Claude oluşturur, insan tamamlar — hangi siteden olursa olsun).
- Vue sitesindeki mevcut markdown-workspace (plan/checklist/pomodoro) **tamamen ayrı** kalır;
  CloudTask'lar onunla birleştirilmez, sadece yanına yeni bir sekme olarak eklenir.
- Mevcut `remoteSync.ts` / `SYNC_SECRET` / Vercel Blob mekanizmasına **dokunulmaz** — o,
  markdown-workspace'in kendi senkron sistemi olarak kalır. Firestore/CloudTask kendi ayrı
  bağlantısını (Firebase Auth) kullanır, ikisi karışmaz.
- Görsel tasarım: yeni sekme, mevcut `colors.scss` / clay-card diline uyar; 3D sahne, mevcut
  hiçbir view, hiçbir route/URL değişmez.

---

## 6. Uygulama adımları (onay sonrası sırayla yapılacak)

1. `ai-study-plan-tracker`'a `firebase` paketini ekle.
2. `.env.local` oluştur, `VITE_FIREBASE_*` değerlerini gir (senden isteyeceğim ya da Next.js
   `.env.local`'den ben kopyalarım — sır değiller, public config).
3. `src/lib/firebase/client.ts`, `tasks.ts`, `dates.ts` dosyalarını Vite'a uyarlayarak ekle.
4. `useOwnerAuth` composable + küçük bir Google giriş ekranı (`OwnerGateModal.vue`) ekle.
5. `useCloudTasks` composable ekle.
6. `WorkspacePanel`'e yeni "Claude Görevleri" sekmesi + `CloudTasksView.vue` ekle.
7. Yerelde `npm run dev` ile test: Google ile giriş → aynı owner UID → Next.js tarafında
   Claude'un eklediği görev burada da görünmeli, tamamlanınca iki sitede de senkron olmalı
   (aynı Firestore dokümanı olduğu için otomatik).
8. Testler: mevcut `vitest` altyapısına `dates.ts` için birim testleri (Next.js'teki
   `dates.test.ts` ile aynı).
9. İstersen sonra Vercel'e deploy (ayrı adım, ayrı onay).

---

## 7. Riskler / dikkat edilecekler

- Firestore Spark (ücretsiz) plan okuma kotası **iki site tarafından paylaşılıyor** —
  ikisi de aynı koleksiyonu okuyacağı için toplam okuma sayısı artar, ama görev sayısı
  küçük olduğu sürece sorun teşkil etmez (mevcut cache/TTL mantığı zaten Next.js'te var,
  aynısı Vue'ya da taşınacak).
- İki sitenin de aynı anda açık olması durumunda "kim neyi ne zaman tamamladı" —
  Firestore tarafından otomatik senkron olur (real-time değil, ama her açılışta/refresh'te
  güncel veriyi çeker), çakışma riski yok çünkü `status` alanı basit bir overwrite.
- Vue tarafına **hiçbir yeni yazma yetkisi eklenmiyor** — Firestore kuralları zaten
  `isValidUpdate` ile sadece `status`/`completed_at`/`updated_at` değişebileceğini
  garanti ediyor, başka hiçbir alan (title, subject, due_date...) değiştirilemez.
