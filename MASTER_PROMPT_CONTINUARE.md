# Master prompt — finalizarea PrettyLittleManager + integrarea Garmendi → eMAG

Folosește acest document ca prompt principal într-un task Codex nou. Nu porni proiectul de la zero și nu rescrie ce funcționează deja. Continuă din starea actuală a fișierelor și verifică fiecare afirmație prin cod, baze de date și teste.

## Stare la zi — sesiunea 22 iulie 2026

Citește această secțiune înainte de restul documentului; ea reflectă ultima stare verificată.

### Repo și verificări

- Repo-ul git a fost inițializat și publicat pe GitHub: `https://github.com/blueprint-pilif-01/PrettyLittleManager` (branch `main`). `.env` este exclus din git, iar parola DB a fost scoasă din acest document.
- `pnpm typecheck`, `pnpm test` (toate testele API trec, inclusiv testele noi de payload) și `pnpm build` trec integral.
- `prisma migrate status` este curat, fără drift.

### Bugfix-uri eMAG (rezolvate și testate)

- `apps/api/src/emag/emag.service.ts`: eliminat fallback-ul `sellerFamilyId ?? -1` — familia canonică fără ID numeric trimite acum `id: null` către builder, nu `-1`.
- Eliminat fallback-ul pe text liber (`input.sellerFamilyId`/`input.familyName`) când nu există familie canonică din `ProductFamilyMember`; la update, câmpurile de familie se golesc explicit pentru produse standalone.
- `apps/api/src/emag/emag-payload.builder.ts`: `family.id` acceptă `number | null`; cod nou de validare `EMAG_FAMILY_ID_MISSING` când familia există dar nu are ID numeric; familia fără ID nu mai este inclusă în payload.
- Test nou în `emag-payload.builder.test.ts` pentru familia canonică cu ID null.

### UI/UX (implementate)

- Terminologie: mesajele API din `product-families.service.ts` folosesc „anchor product" în loc de „parent product"; ramura fără SKU din `product-detail-page.tsx` afișează „Add sellable identity"/„Create sellable identity" cu explicația regulii un-SKU-per-produs.
- Accesibilitate: `aria-label` pe search-ul din Products, butoanele de paginare și butonul de închidere al dialogului de stoc; `htmlFor`/`id` pe toate label-urile din formularele eMAG; `aria-hidden` pe icoanele decorative.
- `emag-page.tsx` refăcut: panou EAN lookup (textarea + job în background + polling + rezultate cu produsele găsite), operații pe listing printr-un dropdown (publish/price/stock/status/reconcile) cu buton „Run", afișarea validation issues și `lastError` sub celula produsului, panou de readiness pentru conturile live când `canPublish` este false, badge-uri pentru status și mod cont.
- `app-shell.tsx`: command palette caută produse după nume/SKU/EAN (grup „Products"), clopoțelul de notificări are badge cu numărul nerezolvate din `workspace-summary`, Notifications este în sidebar.
- `notifications-page.tsx`: notificările deschise primele, secțiune „Recently resolved" (max 15), timpi relativi cu tooltip exact.
- `dashboard-page.tsx`: skeleton loaders în loc de „…", timpi relativi la joburile recente.
- `settings-page.tsx`: numele companiei este dinamic din workspace, nu hardcodat.
- `apps/web/src/lib/utils.ts`: utilitare noi `formatRelativeTime`/`formatExactTime`.
- `styles.css`: stiluri complete pentru notificări (lipseau — pagina era nestilată), palette results, bell badge, stat skeletons; fix anti-pattern side-stripe la `.concept-note` (border complet în loc de `border-left`).

### Servicii locale — fără Docker (constrângere explicită a utilizatorului)

Utilizatorul a cerut explicit să NU se folosească Docker (nu funcționează la el). Setup-ul local funcțional:

- PostgreSQL rulează nativ pe Windows pe portul 5432 (gestionat cu pgAdmin).
- Web dev server (Vite) pe `http://localhost:5173`.
- Redis rulează în WSL Ubuntu-24.04, pornit manual pe portul 6380:

```powershell
wsl -d Ubuntu-24.04 -- redis-server --port 6380 --bind 0.0.0.0 --protected-mode no --daemonize yes
```

  Este accesibil din Windows pe `127.0.0.1:6380` (verificat cu Test-NetConnection). Instanța implicită WSL pe 6379 NU este accesibilă din Windows — folosește portul 6380.
- `REDIS_URL` din `.env` trebuie să fie `redis://127.0.0.1:6380` pentru API și worker; repornește API-ul (port 3000) după modificare.

### Pașii următori actualizați (ordinea recomandată)

1. Pornire completă locală: setează `REDIS_URL=redis://127.0.0.1:6380` în `.env`, pornește API-ul și worker-ul, verifică health endpoints și login-ul în browser.
2. Teste lifecycle familie — pasul original „2. Verifică logica remove/re-anchor": remove member, re-anchor, familie goală + primul membru, combinație size/color duplicată, schimbare axe cu revalidare membri.
3. Migrare controlată legacy multi-SKU — pasul original 6 (operație idempotentă cu dry-run).
4. UX „Create another variation" cu duplicarea datelor comune — pasul original 5.
5. Password reset flow în UI (lipsește complet).
6. E2E real Garmendi → PLM — pasul original 7.
7. Verificare eMAG payload pe două SKU-uri — pasul original 8.
8. Browser QA final — pasul original 9.

Pasul original 1 (formatare/compilare) este făcut — totul trece. Pasul original 4 (terminologie PARENT/multi-SKU) este în mare parte făcut pe partea PLM; mai verifică repo-ul Garmendi.

## Rol și obiectiv

Ești Senior Software Architect, Senior Full-Stack Engineer, Database Architect și UX Engineer. Obiectivul activ este:

> Completează PrettyLittleManager ca workspace intern privat pentru compania Pretty Little Things, cu catalog, inventar, import/export, website-uri, pregătire eMAG, acces controlat și UX profesional complet funcțional; apoi adaptează `D:\JSprojects\Garmendi` cu toate câmpurile necesare și verifică integrarea reală PrettyLittleManager → Garmendi → eMAG.

Nu marca obiectivul drept complet până când nu sunt terminate și verificate toate punctele din secțiunea „Definition of done”.

## Context de business obligatoriu

- Aplicația este un instrument intern privat al companiei. Nu este SaaS public și nu are nevoie de workspaces pentru magazine diferite.
- Workspace-ul unic trebuie să se numească **Pretty Little Things**.
- Doar angajații invitați/autorizati au acces. Nu există înregistrare publică.
- Garmendi este magazinul/site-ul sursă pentru produse. Fluxul principal este:
  1. produsul este creat/editat în Garmendi;
  2. Garmendi îl proiectează în PrettyLittleManager;
  3. din PrettyLittleManager/Garmendi se pregătește și se trimite către eMAG.
- Nu există încă credențiale eMAG live. Implementarea trebuie să fie gata pentru ele, dar nu afirma că publicarea live a fost verificată.
- Specificația eMAG locală este `C:\Users\bulcf\Downloads\openapi.json` și este sursa de adevăr pentru payload-uri.

## Decizia arhitecturală finală — nu o inversa

Modelul „un produs cu mai multe SKU-uri/variante” a fost abandonat pentru fluxul de catalog/eMAG.

Invariante obligatorii:

1. **Un produs vandabil = exact un SKU + exact un EAN/GTIN propriu.**
2. Fiecare combinație de mărime/culoare este un **Product separat** în PrettyLittleManager.
3. Fiecare astfel de Product are un singur `ProductVariant` intern, păstrat pentru compatibilitatea inventarului și relațiilor existente.
4. Produsele separate sunt legate prin `ProductFamily`.
5. Familia deține:
   - `sellerFamilyId` numeric stabil;
   - `code` stabil;
   - `name` comun;
   - axe vizibile, de exemplu `size` și `color`.
6. Pentru eMAG, fiecare mărime/culoare este trimisă ca produs/ofertă separată, dar toate au exact aceeași familie:

```json
{
  "family": {
    "id": 120,
    "name": "Costum medical, Model Clasic, Bumbac",
    "family_type_id": 4140
  }
}
```

7. `family.id` și `family.name` provin din familia canonică server-side, nu din text liber diferit pe fiecare listing.
8. `family_type_id` este ales din tipurile permise de categoria eMAG și trebuie să fie același pentru toți membrii familiei din același cont/categorie.
9. Garmendi poate păstra selectorul său storefront de variante, dar fiecare variantă locală trebuie sincronizată către propriul `Product` PLM și propriul listing eMAG.

## Proiecte și baze de date

### PrettyLittleManager

- Repository: `D:\JSprojects\PrettyLittleManager`
- Web: `http://localhost:5173`
- API: `http://localhost:3000` (verifică portul din `.env`/config)
- PostgreSQL DB: `pretty_little_manager`
- Prisma: `packages/database/prisma/schema.prisma`
- Migrarea familiei cu ID numeric a fost creată și aplicată:
  `packages/database/prisma/migrations/20260721223000_product_family_seller_id/migration.sql`

### Garmendi

- Repository: `D:\JSprojects\Garmendi`
- Frontend: `http://localhost:5174`
- Backend: `http://localhost:4000`
- PostgreSQL DB: `garmedir_db`
- Prisma: `D:\JSprojects\Garmendi\backend\prisma\schema.prisma`
- Migrarea proiecției separate a produselor a fost creată și aplicată:
  `backend/prisma/migrations/20260721230000_sellable_product_family_projection/migration.sql`

Nu afișa parole, tokenuri, URL-uri DB complete sau credențiale în output. Citește-le numai din `.env` atunci când rulezi servicii/migrări.

## Reguli de lucru

- Worktree-urile sunt deja foarte murdare și conțin modificări ale utilizatorului. Nu șterge, nu reseta și nu suprascrie schimbări fără legătură.
- Folosește `apply_patch` pentru editări manuale.
- Nu folosi `git reset --hard`, `git checkout --` sau ștergeri recursive.
- Pentru că este un proiect UI important, folosește skill-urile deja instalate:
  - `design-taste-frontend`
  - `design-motion-principles`
  - `impeccable`
  - `ui-ux-pro-max` când este util
- Citește complet `SKILL.md` pentru skill-urile folosite înainte de acțiuni UI.
- Nu reinstala skill-urile decât dacă lipsesc efectiv.
- Păstrează UI-ul profesional, sobru, rapid și orientat pe operațiuni. Fără carduri decorative fără scop, mock badges sau meniuri false.
- Toate meniurile și CTA-urile vizibile trebuie să funcționeze real.
- Folosește copy clar și helper/whisper text sub fiecare câmp important, cu exemplu și explicație.
- Trimite update-uri scurte în română pe parcurs.

## Ce este deja implementat în PrettyLittleManager

### Editor produs nou

Fișiere principale:

- `apps/web/src/pages/new-product-page.tsx`
- `apps/web/src/components/product-editor-field.tsx`
- `apps/web/src/styles.css`

Stare curentă:

- editor full-page în stilul nou;
- helper text la câmpuri;
- secțiuni Identity, Content, Compliance, Commercial și Product family;
- moduri:
  - standalone product;
  - start a new family;
  - add to existing family;
- se trimite mereu `productType: "SIMPLE"`;
- se creează un singur SKU/default variant per Product;
- suport `?familyId=` pentru adăugarea unui produs separat într-o familie existentă.

### Editor produs existent

Fișier:

- `apps/web/src/pages/product-detail-page.tsx`

Stare curentă:

- stil nou și helper text;
- secțiuni complete de catalog, compliance, comercial, familie, identitate vandabilă, imagini și atribute;
- afișează/editează `sellerFamilyId`;
- CTA „Create another variation” duce către produs nou cu `familyId`;
- avertizează produsele legacy care au mai mult de un SKU;
- editorul deschide primul SKU ca identitate vandabilă.

Observație: în sursă mai există ramura legacy `addVariant` pentru un produs fără niciun SKU. Ea nu trebuie să permită al doilea SKU. API-ul a fost întărit să respingă al doilea SKU, dar copy-ul acestei ramuri poate fi clarificat ca „Add sellable identity”.

### Contracte și model DB

Fișiere:

- `packages/contracts/src/index.ts`
- `packages/database/prisma/schema.prisma`
- `apps/api/src/catalog/products.service.ts`
- `apps/api/src/catalog/product-families.service.ts`
- `apps/api/src/catalog/product-families.controller.ts`

Implementat:

- `ProductFamily.sellerFamilyId Int?` cu unicitate pe companie;
- create Product poate primi familie inline sau `existingFamilyId`;
- validare axe/valori/combinations duplicate;
- membrii unei familii pot veni din produse diferite;
- maxim un SKU/membru din fiecare Product;
- createVariant a fost modificat să respingă al doilea SKU activ cu codul `PRODUCT_ALREADY_HAS_SELLABLE_IDENTITY`;
- update family acceptă acum și `variationAxes`;
- endpoint de eliminare membru a fost adăugat:
  `DELETE /product-families/:id/members/:variantId`;
- la eliminarea anchor member-ului, familia încearcă să fie reancorată la următorul produs;
- când o familie goală primește primul membru, anchor-ul este mutat la acel produs.

Important: ultimele schimbări privind `variationAxes` și remove-member au fost scrise chiar înainte de acest handoff și **nu au fost încă formatate/typechecked/testate**. Începe cu ele.

### Pagina Families

Fișier:

- `apps/web/src/pages/catalog-ops-pages.tsx`

Implementat:

- familie între produse separate, nu parent product cu subvariante;
- ID numeric de familie;
- card/listă explică modelul separat.

### eMAG

Fișiere:

- `apps/api/src/emag/emag-payload.builder.ts`
- `apps/api/src/emag/emag-payload.builder.test.ts`
- `apps/api/src/emag/emag.service.ts`
- `apps/web/src/pages/emag-page.tsx`

Implementat:

- payload conform OpenAPI local: `family.id`, `family.name`, `family_type_id`;
- validare ID pozitiv, nume, tip familie obligatoriu și tip permis de categoria eMAG;
- familia canonică este rezolvată din `ProductFamilyMember`;
- ID-ul și numele familiei canonice suprascriu input-ul liber;
- selector family type în UI;
- family type-ul existent al unui sibling listing este reutilizat automat;
- conflict dacă se încearcă alt family type pentru aceeași familie/cont/categorie;
- teste payload adăugate pentru maparea exactă și tip lipsă/incompatibil.

Ultimul rezultat verificat înainte de handoff:

- API typecheck: pass;
- API tests: 31 pass, 1 integration skipped;
- aceste rezultate au fost înainte de ultimele schimbări remove-member/update axes, deci rulează din nou.

## Ce este deja implementat în Garmendi

### Model Prisma și UI produs

Fișiere:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260721230000_sellable_product_family_projection/migration.sql`
- `backend/src/services/product.service.ts`
- `src/pages/admin/ProductEdit.tsx`

Câmpuri adăugate pe Product:

- `familyName`
- `familyCode`
- `sellerFamilyId`
- `familyAxes`

Câmp adăugat pe ProductVariant:

- `plmProductId` — fiecare variantă locală ține ID-ul propriului Product PLM;
- `plmVariantId` rămâne pentru identitatea SKU internă PLM.

UI-ul Garmendi are secțiunea „Familie de produse”, cu:

- nume familie;
- cod familie;
- seller family ID;
- axe vizibile mărime/culoare;
- helper text.

### Client PLM

Fișier:

- `backend/src/integrations/plm/client.ts`

Implementat:

- get/update/create/archive product;
- get/create/update variant;
- atribute;
- list/get/create/update familii;
- add/remove family member;
- eMAG context/listings.

Ultimele metode `archiveProduct` și `removeProductFamilyMember` au fost adăugate înainte de handoff și nu au fost încă verificate prin build/test.

### Sincronizare Garmendi → PLM

Fișier:

- `backend/src/services/plm-sync.service.ts`

Implementat:

- fiecare variantă locală activă este proiectată ca Product PLM separat `SIMPLE`;
- fiecare primește propriul SKU/EAN, preț, stoc și ID-uri remote;
- numele și slug-ul produsului remote includ combinația și SKU-ul;
- alocă automat ID numeric stabil de familie dacă lipsește;
- deduce axe size/color dacă nu sunt configurate;
- validează că fiecare SKU are valori pentru toate axele familiei;
- creează/actualizează definițiile de atribute PLM;
- creează/actualizează familia și leagă membrii;
- imaginile sunt încărcate către fiecare Product PLM separat;
- produsele legacy cu mai multe SKU-uri sunt împărțite la sincronizare;
- testul unit a fost schimbat să confirme că mărimile S și M produc două payload-uri Product `SIMPLE` cu slug-uri distincte.

Ultimele modificări nevalidate încă:

- update-ul familiei trimite și `variationAxes`;
- membrii remote care nu mai sunt activi sunt eliminați din familie;
- produsele PLM pentru variante inactive sunt arhivate.

### eMAG în Garmendi

Fișiere:

- `backend/src/services/plm-emag.service.ts`
- `src/components/admin/EmagProductPanel.tsx`

Implementat:

- listing-ul este salvat pe `variant.plmProductId`, nu pe un singur product ID comun;
- contextul aduce familia canonică;
- UI explică faptul că fiecare SKU este produs publicat separat;
- afișează ID/nume familie read-only;
- selectează family type permis de categorie;
- trimite datele de familie către PLM/eMAG.

Ultimul rezultat verificat înainte de schimbările finale:

- Garmendi backend build: pass;
- Garmendi frontend build: pass;
- Garmendi backend tests: 169 pass;
- rulează-le din nou după schimbările remove/archive/update axes.

## Primii pași obligatorii în taskul următor

Execută în ordinea de mai jos.

### 1. Formatare și compilare imediată

PrettyLittleManager:

```powershell
cd D:\JSprojects\PrettyLittleManager
pnpm exec prettier --write packages/contracts/src/index.ts apps/api/src/catalog/product-families.controller.ts apps/api/src/catalog/product-families.service.ts apps/api/src/catalog/products.service.ts apps/api/src/emag/emag.service.ts
pnpm --filter @plm/contracts build
pnpm typecheck
pnpm test
pnpm build
```

Garmendi:

```powershell
cd D:\JSprojects\Garmendi\backend
npx prettier --write src/integrations/plm/client.ts src/services/plm-sync.service.ts src/services/plm-emag.service.ts src/__tests__/plm-sync.service.test.ts
npm run build
npm test

cd D:\JSprojects\Garmendi
npm run build
```

Corectează toate erorile reale înainte de următorul pas. Nu ascunde erori cu `any` inutil sau prin eliminarea validărilor.

### 2. Verifică logica remove/re-anchor

Testează explicit:

- familie cu doi membri din două produse;
- elimină membrul non-anchor;
- elimină anchor-ul și verifică reancorarea;
- familie goală primește un nou membru și se reancorează;
- nu poate exista mai mult de un SKU per Product;
- o combinație size/color duplicată este respinsă;
- schimbarea axelor familiei revalidează membrii existenți.

Adaugă teste unit/service dacă lipsesc.

### 3. Întărește lifecycle-ul variantelor inactive

În `plm-sync.service.ts`, verifică și repară dacă este necesar:

- remove remote member se execută înainte să apară conflictul de combinație cu un membru legacy;
- după remove-all + add-first, familia se reancorează corect;
- Product PLM al unei variante inactive este arhivat o singură dată/idempotent;
- un 404 la arhivare este tolerat;
- o variantă activată din nou poate fi recreată/reconectată corect;
- dacă toate variantele locale sunt inactive, sincronizarea trebuie să arhiveze toate produsele remote sau să ofere o operație explicită, nu să lase date active fără explicație.

### 4. Elimină ultimele presupuneri PARENT/multi-SKU

Caută în ambele repo-uri:

```powershell
rg -n "PARENT|parent product|Add variant|Create variant|variants as parent|multiple variants|variantIds" D:\JSprojects\PrettyLittleManager D:\JSprojects\Garmendi
```

Clasifică fiecare rezultat:

- legacy migration/compatibility justificată;
- text/UI de actualizat;
- logică de domeniu de eliminat.

Nu elimina relațiile de inventar care încă folosesc `ProductVariant`; păstrează SKU-ul intern 1:1.

### 5. Îmbunătățește UX-ul „Create another variation”

În prezent, linkul către produs nou trimite doar `familyId`. UX-ul final ar trebui să permită duplicarea datelor comune:

- CTA „Create another size/color”;
- deschide editorul full nou;
- preselectează familia;
- copiază datele comune: brand, categorie, descriere, compliance, VAT, greutate/dimensiuni implicite și imagini dacă este potrivit;
- lasă obligatoriu noi și goale: SKU, EAN, seller product ID și valorile axelor;
- generează slug unic pentru noua combinație;
- utilizatorul salvează direct noul Product separat.

Poți folosi `sourceProductId` în query sau un endpoint explicit „duplicate as family member”. Nu face o copie ascunsă înainte de confirmare.

### 6. Migrare controlată pentru produse legacy multi-SKU

Adaugă o operație sigură și idempotentă care:

- detectează Product-urile PLM cu mai mult de un SKU activ;
- creează câte un Product separat pentru fiecare SKU suplimentar;
- copiază câmpurile comune și imaginile;
- păstrează inventarul, listing-urile și audit trail-ul;
- creează sau reconstruiește familia;
- nu dublează date la rerulare;
- produce raport preview/dry-run înainte de mutație.

Nu presupune că baza actuală nu conține produse legacy.

### 7. Test E2E real local Garmendi → PLM

Pornește PostgreSQL/Redis și apoi serviciile. Folosește procese ascunse pe Windows.

PrettyLittleManager API/worker au fost oprite anterior pentru Prisma generate și trebuie repornite după build. Garmendi backend pe portul 4000 a fost de asemenea oprit înainte de migrare și trebuie repornit. Verifică porturile înainte de start pentru a evita procese duplicate.

Creează temporar un produs Garmendi de test cu minimum două combinații, de exemplu:

- `TEST-CMD-BURG-S` + EAN valid unic + size S + color Burgundy;
- `TEST-CMD-BURG-M` + EAN valid unic + size M + color Burgundy.

Rulează sincronizarea și verifică direct prin API/DB:

- cele două variante locale au `plmProductId` diferit;
- au `plmVariantId` diferit;
- în PLM există două Product-uri `SIMPLE` distincte;
- fiecare Product are exact un SKU;
- fiecare SKU păstrează EAN-ul propriu;
- ambele SKU-uri sunt membri ai aceleiași ProductFamily;
- familia are același `sellerFamilyId`, `name`, `code` și axe corecte;
- imaginile și stocul ajung la fiecare Product separat;
- rerularea sync nu creează duplicate;
- dezactivarea unei mărimi o scoate din familie și arhivează Product-ul ei PLM;
- reactivarea funcționează fără coliziuni.

Curăță datele temporare sau marchează-le clar ca test și arhivează-le recuperabil.

### 8. Verificare eMAG fără credențiale live

Folosește builder-ul și payload preview, nu pretinde request live.

Pentru fiecare dintre cele două SKU-uri verifică:

- seller product ID distinct;
- EAN distinct;
- SKU/part number distinct;
- același `family.id`;
- același `family.name`;
- același `family_type_id` permis de categorie;
- payload-ul are exact cheile din `openapi.json`;
- un family type diferit pe sibling este respins;
- lipsa family type produce validation error clar;
- categoria eMAG și caracteristicile obligatorii sunt respectate.

### 9. Browser QA și UX final

Testează în browser, nu doar prin typecheck:

PrettyLittleManager:

- login și workspace Pretty Little Things;
- Products list;
- New Product standalone;
- New Product first family member;
- New Product existing family member;
- editor existent;
- familie și membri;
- imagini;
- inventory per SKU;
- eMAG setup/listing;
- settings reale, utile, fără mock status cards.

Garmendi:

- admin ProductEdit;
- secțiune familie;
- două mărimi cu SKU/EAN separate;
- sync status și erori clare;
- panoul eMAG per SKU;
- selector family type.

Verifică desktop și viewport îngust. Corectează overflow, focus, keyboard navigation, label/help association, error states, loading states și empty states.

## Alte lucrări rămase din obiectivul mare

După arhitectura family/SKU, revino la auditul complet al aplicației. Utilizatorul a cerut toate meniurile funcționale și fără mock-uri. Verifică:

- Dashboard cu date reale;
- Products/Catalog;
- Families;
- Inventory și warehouses;
- stock movements/counts/transfers;
- Imports/Exports cu template-uri și rapoarte reale;
- Websites/channels;
- eMAG accounts/categories/characteristics/listings/jobs/logs;
- Users/roles/permissions/invitations;
- Settings utile: workspace profile, defaults, storage, email, queue/Redis readiness, integrations și security;
- audit log;
- search/filter/sort/pagination;
- empty/loading/error/success states;
- private access și route guards;
- health/readiness fără texte „mock mode” în UI-ul operațional atunci când nu ajută utilizatorul.

Orice meniu fără backend real trebuie fie implementat, fie eliminat din navigație până există funcționalitate. Nu lăsa CTA-uri decorative.

## Verificări finale obligatorii

Rulează și păstrează rezultatele:

```powershell
cd D:\JSprojects\PrettyLittleManager
pnpm typecheck
pnpm test
pnpm build

cd D:\JSprojects\Garmendi\backend
npm run build
npm test

cd D:\JSprojects\Garmendi
npm run build
```

Verifică migrațiile:

- `prisma migrate status` pentru ambele baze;
- nu crea drift;
- nu folosi `db push` ca substitut pentru migrare versionată.

Verifică manual că nu există secrete comise:

```powershell
rg -n "<parola-db-locala>|servicePassword|DATABASE_URL=.*postgres|BEGIN PRIVATE KEY|api[_-]?key" D:\JSprojects\PrettyLittleManager D:\JSprojects\Garmendi -g "!node_modules/**" -g "!dist/**"
```

Nu tipări valorile găsite; dacă există un secret real în fișiere urmărite, mută-l în `.env` și documentează doar numele variabilei.

## Definition of done

Taskul este complet numai dacă:

- fiecare mărime/culoare este Product separat cu SKU și EAN propriu;
- familia leagă produsele și păstrează combinații unice;
- modelul este implementat coerent în DB, API, UI și sync;
- Garmendi sincronizează idempotent fiecare variantă către Product PLM separat;
- inactive/remove/reactivate sunt gestionate corect;
- eMAG payload este exact și familia este consecventă între siblings;
- toate migrațiile sunt aplicate fără drift;
- toate typecheck-urile, testele și build-urile trec;
- E2E local cu două mărimi a fost verificat;
- browser QA este făcut;
- meniurile vizibile sunt funcționale și folosesc date reale;
- accesul rămâne privat, fără signup public;
- nu există credențiale hardcodate sau expuse;
- documentația explică ce credențiale eMAG vor trebui introduse când sunt primite;
- serverele locale sunt pornite la final și URL-urile corecte sunt comunicate utilizatorului.

## Raport final cerut

La final, răspunde în română și include concis:

- ce s-a implementat;
- schema exactă Garmendi variantă → PLM Product → PLM SKU → eMAG product;
- migrațiile aplicate;
- rezultatele test/typecheck/build;
- dovada E2E cu două SKU-uri/EAN-uri distincte și familie comună;
- ce nu a putut fi verificat fără credențiale eMAG live;
- URL-urile locale pornite;
- orice risc sau pas extern rămas.

