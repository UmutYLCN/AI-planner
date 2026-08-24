# AI Planner — Ücretsiz Kurulum Rehberi (Claude Cloud Tasks)

Bu doküman, Claude.ai'daki ders öğretmeni skill'lerinin oluşturduğu görevlerin
AI Planner'a uçtan uca akmasını tamamen ücretsiz servislerle kurmanı anlatır. İlk kez bu
servisleri kuruyorsan (öğrenci projesi, kişisel proje) adım adım takip edebilirsin.

Mevcut roadmap özelliği (PDF/YouTube → yapay zekâ ile roadmap, Dexie/IndexedDB'de
saklanır) bu kurulumdan etkilenmez ve hiçbir veri taşıma gerekmez — Firestore yalnızca
Claude'un oluşturduğu görevler için kullanılır.

---

## 1. Mimari özeti

```
Claude teacher skills (Claude.ai web)
        │  kullanır
        ▼
planner-organizer skill
        │  add_tasks / list_tasks çağırır
        ▼
Claude.ai Connector  ──(OAuth: GitHub, izinli tek hesap)──▶  Cloudflare Worker (mcp-worker)
                                                                      │
                                                                      │ Firestore REST
                                                                      │ (service account)
                                                                      ▼
                                                          Firestore: users/{OWNER_UID}/tasks
                                                                      ▲
                                                                      │ Firestore Web SDK
                                                                      │ (Firebase Auth: Google,
                                                                      │  yalnızca owner UID)
                                                                      │
                                                          Next.js planner (Vercel)
                                                          ─ Dashboard: "Claude Görevleri"
                                                          ─ /tasks sayfası
                                                          ─ Mevcut roadmap (Dexie, değişmedi)
                                                                      │
                                                                      │ /api/plan (roadmap üretimi)
                                                                      ▼
                                                          FastAPI backend (Render)
```

Bu aşamada veri akışı **tek yönlüdür**: Claude görev ekleyebilir ve listeleyebilir;
görevi tamamlama işareti yalnızca planner web arayüzünde, kullanıcı tarafından yapılır.
Tamamlanma bilgisi Claude'a geri gönderilmez (bu aşamanın kapsamı dışında).

Kullanılan servisler ve ücretsiz katmanları:

| Servis | Rol | Plan |
|---|---|---|
| Firebase Authentication | Google ile tek kullanıcı girişi | Spark (ücretsiz) |
| Firebase Firestore | Claude görevlerinin veritabanı | Spark (ücretsiz) |
| Cloudflare Workers | Remote MCP sunucusu (`mcp-worker`) | Workers Free |
| Cloudflare Workers KV | OAuth client/grant/token saklama | Workers Free |
| Vercel | Next.js frontend hosting | Hobby |
| Render | FastAPI backend hosting | Free |
| GitHub OAuth App | MCP erişim kontrolü | Ücretsiz |

---

## 2. Firebase kurulumu

### 2.1 Firebase projesi oluşturma

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Bir isim ver (ör. `ai-planner`). Google Analytics'i istersen kapatabilirsin, gerekli değil.
3. Proje oluşturulunca **Spark (ücretsiz) planda** kalacaksın — hiçbir adımda kart bilgisi
   istenmez. Herhangi bir noktada "Upgrade to Blaze" istemi çıkarsa **iptal et**; bu kurulum
   Blaze gerektirmez.

### 2.2 Firestore Database oluşturma

1. Sol menüden **Build → Firestore Database → Create database**.
2. Bir bölge seç (sana yakın olan; sonradan değiştirilemez).
3. **Production mode** seçebilirsin — güvenlik kuralları zaten aşağıda deploy edeceğin
   `firestore.rules` dosyasıyla değiştirilecek.

### 2.3 Spark planda kalma

Bu proje Cloud Functions, Cloud Run veya Blaze gerektiren hiçbir özellik kullanmaz.
Firestore'un Spark planında günlük okuma/yazma/silme sayısı için bir ücretsiz kota vardır;
güncel rakamlar için §9'daki resmi fiyatlandırma sayfasını kontrol et. Tek kullanıcılı,
düşük hacimli bir planner için bu kota normal şartlarda fazlasıyla yeterlidir.

### 2.4 Google Authentication provider'ı etkinleştirme

1. **Build → Authentication → Get started**.
2. **Sign-in method** sekmesinde **Google**'ı seç, **Enable** yap.
3. Bir destek e-postası seç, **Save**.
4. Başka bir provider (Email/Password vb.) **eklemene gerek yok** — bu planner yalnızca
   Google ile, tek kullanıcı için çalışır.

### 2.5 Authorized domains ayarlama

**Authentication → Settings → Authorized domains** altında şunlar olmalı:

- `localhost` (genelde varsayılan olarak zaten ekli — local geliştirme için)
- Vercel domain'in (§6'da deploy ettikten sonra ekleyeceksin, ör. `ai-planner.vercel.app`)

### 2.6 Firebase web app config alma

1. **Project settings** (dişli ikonu) → **Your apps** → **Web** (`</>`) ikonu.
2. Bir takma ad ver (ör. `ai-planner-web`), **Register app**.
3. Karşına çıkan `firebaseConfig` nesnesindeki değerleri not al — birazdan
   `frontend/.env.local` içine yazacaksın:

   ```
   apiKey            → NEXT_PUBLIC_FIREBASE_API_KEY
   authDomain        → NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
   projectId         → NEXT_PUBLIC_FIREBASE_PROJECT_ID
   storageBucket     → NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
   messagingSenderId → NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
   appId             → NEXT_PUBLIC_FIREBASE_APP_ID
   ```

Bu değerler **public** olabilir (istemci koduna gömülürler) — sorun değil. Asıl gizli olan
service-account private key'i hiçbir zaman buraya girmeyecek (§2.9).

### 2.7 Development bootstrap ile ilk Google girişini yapma

Owner UID'ini henüz bilmiyorsun — onu almanın yolu bir kere giriş yapmaktan geçiyor.

1. `frontend/.env.example` dosyasını `frontend/.env.local` olarak kopyala, §2.6'daki
   değerleri doldur. **`NEXT_PUBLIC_FIREBASE_OWNER_UID` alanını şimdilik boş bırak.**
2. `npm run dev` ile frontend'i çalıştır (repo kökünden `npm run install:all` sonrası
   `npm run dev`, ya da `cd frontend && npm run dev`).
3. `http://localhost:3000/dashboard` adresini aç. Owner UID tanımlı olmadığı için,
   **development modunda**, "Planner'ın kilidini aç" ekranından Google ile giriş yaptığında
   bir **"İlk kurulum"** ekranı göreceksin — bu ekran yalnızca `next dev` altında çıkar,
   production build'de hiçbir UID göstermez.
4. Bu ekranda görünen UID'i kopyala.

> Bu ekran kasıtlı olarak yalnızca development'ta çalışır: production'da owner UID eksikse
> uygulama hiçbir UID göstermeden açık bir "Yapılandırma hatası" gösterir ve Firestore'a
> hiç sorgu atmaz.

### 2.8 Firebase Console'dan owner UID alma (alternatif yol)

Adım 2.7'yi atlayıp doğrudan da alabilirsin: **Authentication → Users** sekmesinde, Google
ile bir kere giriş yaptıktan sonra hesabın orada listelenir; **User UID** sütunundaki
değeri kopyala.

### 2.9 FRONTEND ve Worker env değişkenlerine UID ekleme

- `frontend/.env.local` → `NEXT_PUBLIC_FIREBASE_OWNER_UID=<UID>`
- `mcp-worker/.dev.vars` (local dev için, §3'te oluşturacaksın) → `FIREBASE_OWNER_UID=<UID>`
- Production'da: Vercel env değişkeni + `wrangler secret put FIREBASE_OWNER_UID` (§3, §6)

### 2.10 firestore.rules içindeki owner UID placeholder'ını değiştirme

Repo kökündeki [`firestore.rules`](firestore.rules) dosyasını aç, en üstteki
`ownerUid()` fonksiyonundaki placeholder'ı değiştir:

```js
function ownerUid() {
  return 'REPLACE_WITH_OWNER_UID';   // ← buraya kendi UID'ini yaz
}
```

### 2.11 Rules ve indexes deploy etme

```bash
npm install -g firebase-tools     # yoksa
firebase login
firebase use --add                # projeni seç, bir alias ver (ör. "default")
firebase deploy --only firestore:rules,firestore:indexes
```

[`firestore.indexes.json`](firestore.indexes.json) kasıtlı olarak boştur — hem Worker hem
frontend, `due_date` aralığını `due_date` alanına göre sıralayarak sorgular; bu, Firestore'un
otomatik tekil-alan indeksiyle çalışır ve composite index gerektirmez. `source_skill` /
`status` gibi opsiyonel filtreler sonuç kümesi üzerinde (Worker tarafında, sonuç limiti
içinde) uygulanır.

### 2.12 Service account key oluşturma

1. **Project settings → Service accounts** sekmesi.
2. **Generate new private key** → onayla → bir `.json` dosyası iner.
3. Bu dosyayı aç, üç alanı not al: `project_id`, `client_email`, `private_key`.

### 2.13 Private key'i güvenli biçimde Worker secret olarak ekleme

Bu üç değer **yalnızca** Cloudflare Worker secret'ı olarak kullanılacak (§3.4) — frontend'e
asla girmeyecek. `private_key` alanı `\n` kaçış karakterleri içeren tek satırlık bir string
olacak; Worker bunu (hem gerçek çok satırlı hem kaçışlı tek satırlık halini) doğru şekilde
işleyecek şekilde yazıldı (`mcp-worker/src/firestore.ts` → `decodePrivateKey`).

### 2.14 Service account JSON dosyasını repoya koymama

İndirdiğin `.json` dosyasını **projenin dışında bir yere** taşı veya sildiğinden emin ol.
Kök `.gitignore` şu desenleri zaten reddediyor: `*service-account*.json`,
`*serviceAccount*.json`, `*firebase-adminsdk*.json`, `.firebase/`, `*.key` — ama en güvenlisi
dosyayı hiç repo dizini içine kopyalamamak.

---

## 3. Cloudflare Worker kurulumu

Worker kodu `mcp-worker/` altında; ayrıntılı geliştirici notları için
[`mcp-worker/README.md`](mcp-worker/README.md)'ye bakabilirsin. Burada yalnızca kurulum
adımları var.

### 3.1 Cloudflare hesabı

[dash.cloudflare.com](https://dash.cloudflare.com/sign-up) üzerinden ücretsiz bir hesap
oluştur — kart bilgisi gerekmez.

### 3.2 Wrangler login

```bash
cd mcp-worker
npm install
npx wrangler login
```

Bir tarayıcı sekmesi açılır, Cloudflare hesabınla yetkilendir.

### 3.3 KV namespace oluşturma

OAuth client/grant/token'ları saklamak için bir Workers KV namespace gerekiyor:

```bash
npx wrangler kv namespace create OAUTH_KV
```

Komut bir `id` döndürür. [`mcp-worker/wrangler.jsonc`](mcp-worker/wrangler.jsonc) içindeki
`kv_namespaces[0].id` alanındaki `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` placeholder'ını bu id
ile değiştir.

### 3.4 Binding ayarlama / secret'lar

`wrangler.jsonc` içinde `OAUTH_KV` binding'i zaten tanımlı (yukarıdaki adımla id'sini
girdin). Kalan sekiz değer **secret** olduğu için `wrangler.jsonc`'a değil, ayrı ayrı
`wrangler secret put` ile eklenir (her komut değeri terminalde interaktif sorar):

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GITHUB_ALLOWED_USER_ID
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put FIREBASE_OWNER_UID
```

`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`/`GITHUB_ALLOWED_USER_ID` için §4'ü,
`FIREBASE_*` için §2.12-2.13'ü önce tamamla. `COOKIE_ENCRYPTION_KEY` rastgele üretilmiş,
en az 32 baytlık bir değer olmalı:

```bash
openssl rand -hex 32
```

### 3.5 Local development

```bash
cp .dev.vars.example .dev.vars     # git-ignored — gerçek değerleri buraya yaz
npm run dev                        # wrangler dev
```

`.dev.vars`, yukarıdaki sekiz secret'ın **local** karşılığıdır (production secret'ları
etkilemez). `.dev.vars.example` yalnızca boş placeholder içerir.

### 3.6 Test

```bash
npm run typecheck
npm test
```

Testler gerçek Firebase/GitHub'a bağlanmaz; `fetch` mock'lanır ve JWT imzalama için her
çalıştırmada geçici bir RSA anahtarı üretilir.

### 3.7 Deploy komutu

```bash
npm run deploy      # wrangler deploy
```

**Bu komutu senin çalıştırman gerekiyor** — otomatik deploy yapılmadı. Komut, Worker'ın
gerçek URL'sini yazdırır: `https://ai-planner-mcp.<senin-subdomain>.workers.dev`. Bu URL'yi
not al; §5 ve §4'te tekrar gerekecek.

---

## 4. GitHub OAuth App kurulumu

MCP endpoint'i, yalnızca tek bir GitHub hesabının bağlanmasına izin veren bir OAuth App ile
korunuyor.

### 4.1 GitHub OAuth App oluşturma

1. [github.com/settings/developers](https://github.com/settings/developers) →
   **OAuth Apps → New OAuth App**.
2. Alanları doldur:

   | Alan | Değer |
   |---|---|
   | Application name | `AI Planner MCP` (istediğin bir isim) |
   | **Homepage URL** | Worker'ının kök adresi, ör. `https://ai-planner-mcp.<subdomain>.workers.dev/` (bu route bilgilendirici bir HTML sayfası döndürür) |
   | **Authorization callback URL** | `https://ai-planner-mcp.<subdomain>.workers.dev/callback` |

   ⚠️ Callback URL'yi tahmin etme — yukarıdaki `/callback` yolu bu Worker'ın gerçek
   implementasyonunda kullanılan yoldur (`mcp-worker/src/auth.ts`). §3.7'de aldığın gerçek
   Worker URL'sini kullan.

3. **Register application**.

### 4.2 Client ID/secret

Uygulama sayfasında **Client ID** görünür. **Generate a new client secret** ile bir secret
üret ve hemen kopyala (bir daha tam olarak gösterilmez).

Bu iki değeri §3.4'te sırasıyla `GITHUB_CLIENT_ID` ve `GITHUB_CLIENT_SECRET` olarak Worker
secret'ı yap.

### 4.3 Numeric GitHub user ID'nin nasıl bulunacağı

GitHub kullanıcı adın **değil**, değişmeyen sayısal ID'in gerekiyor:

```bash
curl -s https://api.github.com/users/<KULLANICI_ADIN> | grep '"id"'
```

veya `gh` CLI kuruluysa:

```bash
gh api user --jq .id
```

### 4.4 GITHUB_ALLOWED_USER_ID ayarlama

Bu sayısal ID'yi §3.4'te `GITHUB_ALLOWED_USER_ID` Worker secret'ı olarak gir. Bu tam olarak
`dev.umutyalcin@gmail.com` adresine bağlı GitHub hesabının ID'si olmalı (ya da bu planner'ı
kullanacağın hangi GitHub hesabıysa onun).

---

## 5. Claude.ai connector kurulumu

### 5.1 Claude.ai web açılması

[claude.ai](https://claude.ai) üzerinde oturum aç.

### 5.2 Settings → Connectors

Sol alt köşedeki profil menüsünden **Settings → Connectors**'a git.

### 5.3 Add custom connector

**Add custom connector** (veya "Browse connectors" altındaki benzer buton) ile yeni bir
bağlantı ekle.

### 5.4 Worker MCP URL'sinin eklenmesi

Connector URL alanına, §3.7'de aldığın Worker URL'sinin **`/mcp`** ile bitmiş halini yaz:

```
https://ai-planner-mcp.<senin-subdomain>.workers.dev/mcp
```

### 5.5 GitHub OAuth tamamlanması

Claude seni GitHub'a yönlendirecek (Worker'ın `/authorize` sayfası üzerinden). §4.1'de
kaydettiğin OAuth App ile giriş yap. §4.4'te izin verdiğin hesap dışında biriyle giriş
yaparsan bağlantı reddedilir (403).

### 5.6 Tool'ların göründüğünün doğrulanması

Bağlantı başarılı olduktan sonra connector ayarlarında `add_tasks` ve `list_tasks`
tool'larının listelendiğini doğrula.

### 5.7 Test add_tasks çağrısı

Bir Claude sohbetinde, bu connector'ı etkinleştirip şunun gibi bir istekte bulun:

> "AI Planner'a şu görevi ekle: English dersi için 'Present perfect tekrar et', bugünün
> tarihiyle, 20 soru çöz açıklamasıyla."

Claude `add_tasks` tool'unu çağırmalı ve `inserted: 1` dönmelidir. Aynı isteği tekrar
gönderirsen (aynı başlık/ders/tarih), `skipped_duplicates: 1` görmelisin — bu idempotency
mekanizmasının çalıştığının kanıtıdır.

### 5.8 Test list_tasks çağrısı

> "AI Planner'daki bu haftaki görevlerimi listele."

Claude `list_tasks` tool'unu, uygun bir `from`/`to` tarih aralığıyla çağırmalı ve az önce
eklediğin görevi dönmelidir.

---

## 6. Vercel kurulumu

### 6.1 Frontend root directory

Vercel'de **New Project** → bu repo'yu seç → **Root Directory** alanını `frontend` olarak
ayarla (Vercel Next.js'i otomatik algılar).

### 6.2 Build ayarları

Varsayılan Next.js build ayarları (`next build`) değiştirmeden kullanılabilir.

### 6.3 NEXT_PUBLIC_ env değişkenleri

Project → Settings → Environment Variables altına, `frontend/.env.example`'daki tüm
değişkenleri gerçek değerleriyle ekle:

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_OWNER_UID
NEXT_PUBLIC_API_BASE_URL        ← Render backend URL'in (§7)
```

`NEXT_PUBLIC_API_BASE_URL`'i Render servisini deploy etmeden biliyorsan şimdiden, bilmiyorsan
§7'den sonra ekleyip yeniden deploy edebilirsin.

### 6.4 Firebase authorized domain'e Vercel domain ekleme

Deploy sonrası aldığın domain'i (ör. `ai-planner.vercel.app` ve varsa preview domain'lerini)
Firebase Console → **Authentication → Settings → Authorized domains**'e ekle. Eklenmezse
Google girişi `auth/unauthorized-domain` hatasıyla başarısız olur.

### 6.5 Production deploy sonrası doğrulama

- `/dashboard`'a git → Google ile giriş yap → owner hesabınla giriş yaptıysan dashboard
  açılmalı, "Claude Görevleri" bölümü görünmeli.
- `/tasks` sayfasına git → §5.7'de eklediğin görev listelenmeli.
- Mevcut roadmap oluşturma akışının (PDF/YouTube yükleme) hâlâ çalıştığını doğrula — bu
  akış Firebase'den tamamen bağımsızdır.

---

## 7. Render kurulumu

### 7.1 Backend deploy

[render.com](https://render.com) → **New → Web Service** → bu repo'yu bağla.

| Alan | Değer |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Plan | **Free** |

### 7.2 FRONTEND_ORIGINS

Environment sekmesine ekle:

```
FRONTEND_ORIGINS=https://ai-planner.vercel.app
```

Birden fazla origin'in varsa (ör. bir preview domain) virgülle ayır:

```
FRONTEND_ORIGINS=https://ai-planner.vercel.app,https://ai-planner-git-main-xxx.vercel.app
```

Backend bu listeyi ayrıştırırken boşlukları ve sondaki `/`'leri temizler, `*` değerini asla
kabul etmez (credentials açık olduğu için) ve boşsa yalnızca `localhost:3000` /
`127.0.0.1:3000`'e izin verir (bkz. `backend/main.py` → `parse_frontend_origins`).

Ayrıca mevcut `OPENAI_API_KEY` ve `YOUTUBE_API_KEY` değişkenlerini de (roadmap üretimi
için, önceden zaten gerekliydi) buraya eklemen gerekir.

### 7.3 Vercel domain

§7.2'deki `FRONTEND_ORIGINS` değerinin, Vercel'de deploy ettiğin gerçek domain'le birebir
eşleştiğinden emin ol (protokol dahil, sonda `/` olmadan).

### 7.4 NEXT_PUBLIC_API_BASE_URL

Render sana bir URL verir (ör. `https://ai-planner-api.onrender.com`). Bunu Vercel'deki
`NEXT_PUBLIC_API_BASE_URL` değişkenine yaz ve Vercel'i yeniden deploy et.

### 7.5 Render Free cold start beklentisi

Render Free plandaki servisler, bir süre istek almazsa uykuya geçer; ilk istek 30-60
saniye kadar sürebilir ("cold start"). Bu, `/api/plan` çağrısını ilk denemede yavaş
gösterebilir — normaldir, `CreateWizard` zaten "Bu genelde 15–40 saniye sürer" gibi bir
bekleme ekranı gösteriyor, cold start'ta bu süre uzayabilir.

### 7.6 Backend filesystem'ine veri yazılmaması

Render Free'nin dosya sistemi kalıcı değildir (her deploy/restart'ta sıfırlanır). Bu proje
zaten hiçbir görev veya kullanıcı verisini backend'e yazmıyor — roadmap/PDF/progress verisi
tarayıcıda (Dexie), Claude görevleri Firestore'da tutuluyor. `/api/plan` tamamen stateless
bir endpoint'tir.

---

## 8. Güvenlik kontrol listesi

Deploy öncesi/sonrası şunları doğrula:

- [ ] `firestore.rules` içindeki `ownerUid()` gerçek UID'ini döndürüyor mu (hâlâ
      `REPLACE_WITH_OWNER_UID` değil)?
- [ ] Rules ve indexes deploy edildi mi (`firebase deploy --only firestore:rules,firestore:indexes`)?
- [ ] Firebase Authentication'da Google dışında bir provider açık değil mi?
- [ ] Owner olmayan bir Google hesabıyla giriş denendiğinde "Bu Google hesabı planner
      erişimine yetkili değil" mesajı çıkıp otomatik signOut oluyor mu?
- [ ] `GITHUB_ALLOWED_USER_ID` **sayısal** ID mi (kullanıcı adı değil)?
- [ ] Farklı bir GitHub hesabıyla connector bağlanmaya çalışıldığında 403 dönüyor mu?
- [ ] Service account credential'ları **yalnızca** Worker secret olarak mı duruyor (frontend
      bundle'ında, Vercel env'inde veya repo'da değil)?
- [ ] `git log -p -- '*.json' '*.pem' '*.key'` ile private key'in git geçmişine hiç
      girmediğini kontrol ettin mi?
- [ ] `curl -X POST https://<worker>/mcp -d '{}'` auth olmadan 401 dönüyor mu?
- [ ] Render'daki `FRONTEND_ORIGINS` içinde `*` yok mu?
- [ ] Worker/Backend loglarında (`wrangler tail`, Render logs) token, private key veya
      cookie değeri görünmüyor mu?

---

## 9. Ücretsiz kota notları

Bu rehberdeki tüm servisler bu yazının yazıldığı tarihte ücretsiz katmanlarla
çalışacak şekilde tasarlandı (Firebase Spark, Cloudflare Workers Free, Vercel Hobby,
Render Free). **Ücretsiz katmanların kapsamı ve limitleri servis sağlayıcılar tarafından
değiştirilebilir** — kurulumdan önce ilgili servislerin güncel resmi fiyatlandırma
sayfalarını kontrol etmen önerilir:

- https://firebase.google.com/pricing
- https://developers.cloudflare.com/workers/platform/pricing/
- https://vercel.com/docs/plans/hobby
- https://render.com/pricing

Bu proje, kullanıcıyı ücretli bir plana geçmeye zorlayacak hiçbir özelliği otomatik
etkinleştirmez (Cloud Functions, Cloud Run, Durable Objects gibi).

---

## 10. Sorun giderme

**Firebase permission-denied**
`firestore.rules` içindeki UID'in, giriş yaptığın hesabın UID'iyle birebir aynı olduğunu
doğrula. Rules'ı deploy ettiğinden emin ol (`firebase deploy --only firestore:rules`).

**Owner UID mismatch**
Farklı bir Google hesabıyla giriş yaptıysan "Bu Google hesabı planner erişimine yetkili
değil" görürsün — bu beklenen davranıştır. Doğru hesapla tekrar dene ya da
`NEXT_PUBLIC_FIREBASE_OWNER_UID`'i güncelle.

**Unauthorized domain**
`auth/unauthorized-domain` hatası → Firebase Console → Authentication → Settings →
Authorized domains'e o domain'i (localhost, Vercel production/preview domain'i) ekle.

**Popup blocked**
Tarayıcı popup'ı engellerse uygulama otomatik olarak `signInWithRedirect`'e düşer; bu
normal bir davranıştır, sayfa GitHub/Google'a yönlenip geri döner.

**GitHub OAuth callback mismatch**
GitHub OAuth App'teki "Authorization callback URL" ile Worker'ın gerçek deploy URL'si +
`/callback` birebir aynı olmalı (§4.1). Uyuşmazsa GitHub "redirect_uri_mismatch" hatası
gösterir.

**Worker secret missing**
`/health` endpoint'i (`GET https://<worker>/health`) her secret grubunun **var olup
olmadığını** (değerini değil) `configured` alanında gösterir — hangi secret'ın eksik
olduğunu buradan teşhis edebilirsin.

**FIREBASE_PRIVATE_KEY newline problemi**
Worker hem gerçek çok satırlı PEM'i hem de kaçışlı (`\n`) tek satırlık halini kabul eder;
`wrangler secret put FIREBASE_PRIVATE_KEY` ile eklerken JSON dosyasındaki `private_key`
alanını olduğu gibi (tırnaklarıyla birlikte) yapıştırman yeterlidir.

**Firestore access token hatası**
`/health` `firebase: true` gösteriyor ama Worker yine de hata veriyorsa,
`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` çiftinin aynı service account'a ait
olduğundan ve service account'ın Firestore için gerekli izinlere sahip olduğundan emin ol
(varsayılan "Firebase Admin SDK" service account'ı zaten yeterli izne sahiptir).

**Claude connector tool'ları göremiyor**
Connector'ı kaldırıp yeniden eklemeyi dene; OAuth onayının tamamlandığından ve GitHub
hesabının `GITHUB_ALLOWED_USER_ID` ile eşleştiğinden emin ol. `/health` ve
`/.well-known/oauth-authorization-server` endpoint'lerinin çalıştığını doğrula.

**Render cold start**
İlk istek 30-60 saniye sürebilir — bu bir hata değil, Render Free'nin uyku davranışıdır
(§7.5).

**CORS hatası**
Backend `FRONTEND_ORIGINS`'in, tarayıcıdaki gerçek origin'le (protokol + domain, port dahil
eğer varsa) birebir eşleştiğinden emin ol. Development'ta varsayılan
`http://localhost:3000` zaten açıktır.

---

## 11. planner-organizer kullanım örneği

Ders öğretmeni skill'i (ör. `english-teacher`) bir konuyu bitirdiğinde, `planner-organizer`
skill'i bu görevi MCP üzerinden ekler.

**Örnek görev girişi:**

- Ders: English
- Kaynak skill: english-teacher
- Başlık: Present perfect tekrar et
- Tarih: 2026-08-24
- Açıklama: 20 soru çöz

**Örnek MCP çağrısı:**

```json
add_tasks({
  "tasks": [
    {
      "title": "Present perfect tense tekrar et",
      "subject": "English",
      "source_skill": "english-teacher",
      "description": "Konu notlarını gözden geçir ve 20 soru çöz.",
      "due_date": "2026-08-24",
      "idempotency_key": "english-teacher:2026-08-24:present-perfect-review"
    }
  ]
})
```

`planner-organizer` skill'i şu kurallara uymalı:

- **Kullanıcının açık onayı olmadan alakasız görev eklememeli.** Bu bir otomatik ödev
  atama sistemi değildir; yalnızca kullanıcının onayladığı çalışmaları planner'a yansıtır.
- **Tarihi kesinlikle `YYYY-MM-DD` formatında göndermeli** (`due_date`, Europe/Istanbul
  takvim günü olarak yorumlanır — saat/timestamp içermez).
- **Aynı görev için aynı `idempotency_key`'i tekrar kullanmalı.** Bir bağlantı hatası
  yüzünden aynı isteği tekrar göndermek zorunda kalırsa, Worker aynı görevi ikinci kez
  eklemek yerine `skipped_duplicates` içinde raporlar. `idempotency_key` verilmezse Worker
  `source_skill + subject + title + due_date`'den deterministik bir anahtar türetir — ama
  skill'in kendi kararlı anahtarını göndermesi (ör. `english-teacher:2026-08-24:present-perfect-review`)
  daha güvenlidir, çünkü başlıktaki küçük bir yeniden ifade ediş bile farklı bir görev
  sanılmaz.
- **Eklemeden önce gerekirse `list_tasks` ile ilgili tarih aralığını kontrol etmeli.**
  Böylece aynı haftaya art arda çok benzer görevler yığılmaz ve kullanıcıya "bu zaten planında
  var" gibi bir farkındalık sunulabilir.

---

## Ek: Environment dosyaları özeti

| Dosya | Kapsam | Commit edilir mi? |
|---|---|---|
| `frontend/.env.example` | Public Firebase config + API base URL şablonu | ✅ evet (placeholder) |
| `frontend/.env.local` | Gerçek değerler | ❌ hayır (`.gitignore`) |
| `backend/.env.example` | CORS origin şablonu | ✅ evet (placeholder) |
| `backend/.env` | Gerçek değerler | ❌ hayır |
| `mcp-worker/.dev.vars.example` | Worker secret şablonu | ✅ evet (placeholder) |
| `mcp-worker/.dev.vars` | Gerçek değerler (yalnızca local dev) | ❌ hayır |
| Production Worker secret'ları | `wrangler secret put` ile | Hiçbir dosyada yok |
