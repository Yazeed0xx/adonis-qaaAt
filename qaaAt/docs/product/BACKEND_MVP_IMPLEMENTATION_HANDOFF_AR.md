# QaaAt Backend MVP — وثيقة تسليم تنفيذية للـAgent

> هذه الوثيقة هي المرجع التنفيذي المعتمد لتطوير باك إند الـMVP. اقرأ الكود والاختبارات الحالية قبل أي تعديل، واعتبر `start/routes.ts` والموديلات والمهاجرات والخدمات والاختبارات هي حقيقة الوضع الحالي. لا تعتمد على ملفات API القديمة المتكررة في جذر `docs/`؛ الوثائق canonical الحالية موجودة في `docs/mobile/`، ويجب تحديثها مع كل تغيير في العقد.

## 1. الهدف التجاري

QaaAt منصة سعودية لاكتشاف وحجز المساحات القابلة للتأجير. قاعات الزواج والمناسبات هي الفئة الرئيسية في هوية المنتج، لكن الـMVP يجب أن يدعم فعليًا:

- قاعات الزواج.
- قاعات المناسبات الخاصة.
- غرف الاجتماعات.
- غرف التدريب.
- غرف الورش.
- مساحات الندوات والمؤتمرات.
- قاعات التخرج.
- مساحات المعارض.
- المساحات متعددة الاستخدام.

الهدف التجاري للـMVP:

1. تسجل الشركة وترفع مستنداتها وتنتظر اعتماد الإدارة.
2. بعد الاعتماد، يستطيع المالك إضافة موظفين بحسابات وصلاحيات مستقلة.
3. تضيف الشركة مواقعها ومساحاتها وأسعارها وباقاتها وتوافرها.
4. تسجل الشركة الحجوزات الخارجية حتى لا يبيع النظام موعدًا محجوزًا خارج QaaAt.
5. يبحث العميل عن مساحة ويرسل طلب حجز أو طلب عرض سعر.
6. تؤكد الشركة التوافر أو ترسل عرضًا.
7. يحصل العميل على Hold قصير ويدفع كامل المبلغ أو العربون.
8. يصبح الحجز مؤكدًا، مع سياسة إلغاء واسترداد واضحة وسجل تدقيق كامل.

## 2. مبادئ غير قابلة للتفاوض

- لا تعامل كل الفئات كحجز قاعة بالساعة.
- لا تسمح بالحجز الفوري العام عند الإطلاق. `instant_book` يدخل في التصميم فقط ويظل feature-gated.
- لا تخصم من العميل في مسار `request_to_book` قبل تأكيد مقدم المساحة للتوافر.
- لا تجعل طلبًا غير مدفوع يحجب المخزون سبعة أيام.
- لا تعتمد على `is_available` كحقيقة التوافر؛ التوافر زمني ومبني على قواعد وحجوزات وحظر خارجي وHolds.
- لا تثق في سعر أو ضريبة أو خصم أو إجمالي أو حالة دفع يرسلها العميل.
- لا تحذف الحجوزات أو المدفوعات أو العروض التجارية؛ استخدم حالات واضحة وسجل تدقيق.
- كل عملية متعددة الكتابات تملك Transaction واحدة، وأي side effect موثوق يستخدم outbox بعد ثبات الكتابات.
- كل استعلام شركة يجب أن يكون tenant-scoped في الاستعلام نفسه؛ فحص permission وحده لا يكفي.
- حافظ على التطبيقين الحاليين أثناء الترحيل، وأدخل العقود الجديدة بتوافق خلفي وخطة إيقاف واضحة.
- لا تنشئ Microservices. استمر كـmodular monolith باستخدام AdonisJS v7 وPostgreSQL.

## 3. ما هو موجود حاليًا ويجب الحفاظ عليه

الباك إند الحالي يملك أساسًا جيدًا:

- AdonisJS v7 وTypeScript وPostgreSQL وLucid.
- Bearer access tokens لتطبيقات الجوال.
- أنواع حسابات حالية: `user`, `company`, `admin`.
- تسجيل شركة مع PDF للسجل التجاري، فحص توقيع/بنية/حجم/برمجيات خبيثة، وتخزين خاص.
- حالات شركة: `pending`, `approved`, `rejected`, `suspended`.
- CRUD للقاعات الحالية.
- بحث عام وتوافر ثابت حاليًا.
- طلبات حجز وقبول/رفض/إلغاء/انتهاء.
- PostgreSQL advisory transaction lock لمنع إنشاء طلبين متداخلين في نفس اليوم/القاعة.
- Row locks لاتخاذ قرار قبول/رفض واحد.
- Notification outbox، Queue، بريد، وExpo Push.
- سجلات تدقيق للإدارة والحجوزات.
- Rate limiting وانتهاء/إلغاء access tokens.
- Transformers وعقد أخطاء مركزي جزئيًا.
- اختبارات Japa أمنية ووظيفية، وكانت baseline الأخيرة 54 اختبارًا ناجحًا.

لا تُضعف أي حماية حالية أثناء الترحيل. أضف regression tests لأي عقد يتغير.

## 4. مشكلات الوضع الحالي التي يجب أن يراعيها التنفيذ

1. `companies.user_id` فريد ويمثل المستخدم الوحيد للشركة.
2. `CompanyAuthController` يفترض أن موظف تطبيق الشركات يملك `userType = company` وعلاقة Company مباشرة.
3. `company_middleware`, `approved_company_middleware`, `HallService`, `CompanyBookingController`, وPush eligibility تعتمد على user-to-company المباشر.
4. الإشعارات الحالية تُرسل إلى `company.user.id` وحده.
5. `halls` تجمع الموقع والمساحة في سجل واحد.
6. `amenities` غير منضبطة و`services` داخل Hall strings بينما يوجد أيضًا catalog خدمات مسعّر على مستوى الشركة.
7. `pricing` يفترض سعرًا بالساعة.
8. التوافر ثابت 08:00–22:00 بفترات ساعتين ويقوم باستعلام لكل slot.
9. `pending` يحجب المخزون حتى سبعة أيام.
10. `payment_status`, `payment_due_date`, و`confirmed` موجودة دون payment workflow حقيقي.
11. يوجد أكثر من شكل للاستجابات والأخطاء.
12. ملفات التوثيق القديمة في جذر `docs/` متعارضة مع الكود الحالي.

## 5. نطاق الـMVP

### ضمن الـMVP

- عضويات الشركات ودعوات الموظفين وصلاحيات بسيطة.
- Venue وSpace وتصنيفات المساحات.
- مراجعة ونشر المساحات.
- تقويم وتوافر حقيقي وحجوزات خارجية وHolds.
- `request_to_book` و`quote_required`.
- معاينات للمساحات التي تحتاجها.
- تسعير بالساعة/الفترة/نصف يوم/يوم/باقة/عرض مخصص.
- خدمات وباقات وline items محفوظة.
- دفع كامل أو عربون، Webhooks، استرداد، وسياسات إلغاء.
- إشعارات موجهة للأعضاء المخولين.
- Audit logs لكل عملية حساسة.
- بحث وفلاتر حسب الفئة والتاريخ/الوقت.
- دعم عقود تطبيق المستخدم وتطبيق الشركات ولوحة الإدارة الضرورية.

### خارج الـMVP

- إعلانات مدفوعة.
- تسعير ديناميكي.
- AI.
- نظام ولاء.
- أدوار مخصصة بالكامل يبنيها العميل.
- فرق وأقسام وسلاسل موافقات معقدة.
- تقويم Google/Outlook أو PMS integrations قبل استقرار التقويم الداخلي.
- اشتراكات شركات متقدمة.
- Microservices أو search engine منفصل دون قياس حاجة فعلية.

## 6. أنماط الحجز المعتمدة

### 6.1 `request_to_book`

مناسب افتراضيًا لغرف الاجتماعات والتدريب والورش والمساحات القصيرة.

```text
draft
→ awaiting_provider
→ approved_awaiting_payment
→ confirmed
→ completed
```

مسارات النهاية/الفشل:

```text
awaiting_provider → rejected | provider_response_expired | cancelled
approved_awaiting_payment → payment_expired | cancelled
confirmed → cancelled | partially_refunded | refunded
```

قواعد:

- الطلب الأولي لا يحجب المخزون طويلًا.
- عند قبول الشركة ينشأ Hold قصير ومحدد بوقت انتهاء للدفع.
- لا يصبح الحجز `confirmed` من redirect العميل؛ فقط من webhook موثوق أو confirmation موثوق من PSP.

### 6.2 `quote_required`

مناسب افتراضيًا لقاعات الزواج والتخرج والمعارض والمؤتمرات والفعاليات المعقدة.

```text
date_inquiry
→ optional_visit
→ requirements_collected
→ quote_sent
→ quote_accepted
→ payment_hold
→ deposit_paid
→ confirmed
→ completed
```

قواعد:

- الاستفسار لا يحجب التاريخ.
- العرض يملك expiry ونسخة ثابتة من line items والسياسة.
- عند قبول العرض ينشأ Hold قصير، مثل 24–48 ساعة حسب سياسة الفئة/الشركة.
- دفع العربون يؤكد الحجز ويغلق المخزون.
- يمكن أن يوجد مبلغ متبقٍ ومواعيد استحقاق، لكن لا تبنِ محرك أقساط عام؛ يكفي deposit + remaining balance في الـMVP.

### 6.3 `instant_book`

- موجود enum/schema فقط أو خلف feature flag.
- لا تسمح للشركة بتفعيله ذاتيًا في الإطلاق الأول.
- تفعيله مستقبلًا يتطلب انضباط تقويم وسجل تعارضات منخفض وسياسة منصة.

## 7. RBAC وعضويات الشركات — القرار المعتمد

### 7.1 تجربة المستخدم

- تطبيق الشركات يخدم المالك والموظفين.
- تستخدم QaaAt هوية شخص موحدة بين تطبيق المستخدم وتطبيق الشركات. الشخص المسجل مسبقًا في تطبيق المستخدم يعتبر User موجودًا عندما تصله دعوة موظف.
- توحيد الهوية لا يعني توحيد الصلاحيات. لكل تطبيق سياق وجلسات وتوكنات منفصلة.
- توكن تطبيق المستخدم لا يصرح لمسارات الشركات، وتوكن تطبيق الشركات لا يصرح لمسارات المستخدم لمجرد أن الهوية واحدة.
- دخول تطبيق الشركات يحتاج CompanyMembership فعالة؛ وجود حساب مستخدم عادي وحده لا يكفي.
- تسجل الشركة بحساب مالك واحد، وترفع المستندات، وتنتظر الاعتماد.
- بعد اعتماد الشركة، يستطيع المالك دعوة موظف بالاسم والجوال أو البريد والدور.
- النظام ينشئ `CompanyInvitation` بحالة `pending` فقط، ولا ينشئ User وهميًا ولا Membership فعالة.
- تصل للموظف رسالة تحتوي Universal/Deep Link.
- إذا لم يكن لديه حساب: يتحقق من وسيلة الدعوة، يضع كلمة مرور، يراجع الدور، يقبل، ثم يُنشأ User وMembership داخل Transaction.
- إذا كان لديه حساب: يسجل الدخول، يُتحقق من تطابق وسيلة الدعوة، ثم يقبل دون إنشاء حساب مكرر.
- إزالة الموظف تلغي عضويته ووصوله، ولا تحذف هويته أو سجل عملياته.

### 7.1.1 الهوية الموحدة وجلسات التطبيقين المنفصلة

النموذج المعتمد:

```text
User identity
├── customer-app capability/session
└── zero or more CompanyMemberships and company-app sessions
```

المتطلبات:

- يبقى الجوال والبريد هويات normalized على سجل User المشترك.
- الموظف المدعو بجوال/بريد مستخدم عميل موجود يعيد استخدام نفس User بعد المصادقة؛ لا تنشئ حسابًا ثانيًا لنفس الهوية.
- الموظف الجديد يتحقق من وسيلة الدعوة ويضع كلمة مرور أثناء القبول.
- المستخدم الموجود يسجل بكلمة مروره الحالية. الدعوة لا تغير كلمة مرور حساب موجود ولا تستبدلها.
- نسيان كلمة المرور يمر بمسار الاستعادة المعتاد، لا قبول الدعوة.
- يجب أن تحمل التوكنات أو تحل داخليًا سياقًا موثوقًا مثل `customer_app` أو `company_app`. لا تثق بهيدر يرسله العميل فقط؛ خزّن السياق مع التوكن أو استخدم guards/providers منفصلة بعد التحقق من API الحزمة المنصبة.
- دخول تطبيق الشركات يحتاج عضوية فعالة واحدة على الأقل، مع الحفاظ مؤقتًا على مسار مالك الشركة الحالي واستعادة حالة الاعتماد أثناء الترحيل.
- إلغاء عضوية شركة يلغي وصول المستخدم لتلك الشركة وجلسات تطبيق الشركات ذات الصلة وفق سياسة موثقة، ولا يلغي جلسات تطبيق المستخدم أو حجوزاته الشخصية.
- افصل Push Installations حسب التطبيق/السياق حتى لا تختلط إشعارات العميل والشركة.
- حافظ على `users.user_type` مؤقتًا للتوافق، لكن لا تستخدمه كمصدر صلاحية للموظفين الجدد. قد يبقى المستخدم `userType = user` ويدخل تطبيق الشركات من خلال Membership فعالة.

### 7.2 الأدوار الجاهزة

استخدم presets ثابتة في الكود:

- `owner`
- `manager`
- `booking_staff`
- `calendar_staff`
- `accountant`
- `viewer`

لا تنشئ custom role builder في الـMVP. يمكن دعم overrides محدودة على العضو.

### 7.3 الصلاحيات الأولية

ابدأ بمجموعات مفهومة، لا عشرات الصلاحيات الدقيقة:

```text
spaces.view
spaces.manage
calendar.view
calendar.manage
booking_requests.view
booking_requests.manage
bookings.view
bookings.manage
quotes.view
quotes.manage
visits.view
visits.manage
finance.view
refunds.request
refunds.approve
members.view
members.manage
company.view
company.manage
payout_settings.manage
```

قواعد:

- `owner` يملك الكل، مع قيود النظام غير القابلة للتجاوز.
- لا يمكن إزالة آخر owner.
- نقل الملكية ليس مطلوبًا في أول Sprint؛ إن أضيف لاحقًا يحتاج re-auth/OTP وTransaction.
- تغيير payout settings أو صلاحيات مالية يحتاج re-auth وإشعارًا للمالك عند تنفيذ المرحلة المالية.
- اسمح بـ`allow`/`deny` override إن نُفذت الصلاحيات المخصصة، و`deny` يتغلب على preset allow.

### 7.4 Schema مقترح

```text
company_memberships
- id
- company_id FK
- user_id FK
- role enum/string
- status: active | suspended | revoked
- invited_by_user_id nullable FK
- joined_at
- created_at
- updated_at
- unique(company_id, user_id)
- indexes(company_id, status), (user_id, status)
```

```text
company_invitations
- id
- company_id FK
- name
- invited_phone nullable
- invited_email nullable
- role
- permission_overrides nullable only if needed
- token_hash unique
- status: pending | accepted | expired | cancelled
- invited_by_user_id FK
- accepted_by_user_id nullable FK
- expires_at
- accepted_at nullable
- cancelled_at nullable
- created_at
- updated_at
```

ضع constraint يفرض وجود وسيلة دعوة واحدة على الأقل، وطبّع البريد والجوال قبل uniqueness checks. لا تعتمد على validator وحده لمنع التكرار.

```text
company_membership_permissions
- id
- company_membership_id FK
- permission
- effect: allow | deny
- unique(company_membership_id, permission)
```

### 7.5 قبول الدعوة

داخل Transaction واحدة:

1. اقفل الدعوة `FOR UPDATE`.
2. تحقق أنها pending وغير منتهية وغير ملغاة.
3. تحقق أن الشركة approved وغير محذوفة/موقوفة.
4. تحقق أن المدعو أثبت امتلاك البريد/الجوال المدعو.
5. ابحث عن User موجود بالهوية normalized؛ لا تنشئ حسابًا مكررًا.
6. أنشئ User فقط إذا لم يوجد وبعد تحقق الهوية وكلمة المرور.
7. أنشئ Membership أو ارفض التعارض بوضوح.
8. حدّث الدعوة accepted وسجل accepted_by/at.
9. سجل Audit event.
10. أصدر token بعد نجاح commit، لا قبلها.

إذا كان User موجودًا، يجب أن يتطلب قبول الدعوة تسجيل الدخول الطبيعي أو reauthentication بقوة مماثلة. امتلاك توكن الدعوة وحده لا يسمح بتغيير كلمة مرور المستخدم أو الاستيلاء على حسابه.

### 7.6 التوافق مع التصميم الحالي

- لا تحذف `companies.user_id` في Sprint 1.
- أنشئ Membership `owner/active` لكل شركة حالية عبر backfill migration آمنة.
- اجعل `companies.user_id` هو legacy owner pointer مؤقتًا.
- انقل middleware/controllers/services تدريجيًا إلى Membership context.
- حدّث `CompanyAuthController` ليعيد memberships والدور والصلاحيات، مع الحفاظ مؤقتًا على fields التي تحتاجها نسخة تطبيق الشركات الحالية.
- طوّر دخول الشركات بحيث يستطيع User عميل موجود وله CompanyMembership فعالة الدخول إلى تطبيق الشركات حتى لو بقي `userType = user`.
- أدخل سياقًا صريحًا للتوكن/التطبيق دون كسر التوكنات الحالية فجأة، ووثق ترحيل وإلغاء legacy tokens.
- راجع Push eligibility والإشعارات؛ لا تفترض أن recipient هو `company.user.id` فقط بعد اكتمال العضويات.
- لا تغيّر user app auth behavior في Sprint RBAC.

### 7.7 API مبدئي

Protected company context:

```http
GET    /api/companies/members
POST   /api/companies/invitations
GET    /api/companies/invitations
POST   /api/companies/invitations/:id/resend
DELETE /api/companies/invitations/:id
PATCH  /api/companies/members/:id
DELETE /api/companies/members/:id
```

Public/auth-assisted invitation acceptance:

```http
GET  /api/company-invitations/inspect?token=...
POST /api/company-invitations/accept
```

لا تُرجع token hash أو كامل الجوال/البريد أو مستندات الشركة من inspect.

### 7.8 Security tests إلزامية

- شركة A لا تقرأ أو تعدل أعضاء/دعوات شركة B.
- موظف بلا `members.manage` لا يدعو أو يعدل موظفين.
- الدعوة المنتهية/الملغاة/المستخدمة مرفوضة.
- قبول متزامن للدعوة نفسها ينتج Membership واحدة فقط.
- عدم تطابق البريد/الجوال مرفوض.
- User موجود لا يتكرر.
- User عميل يملك Membership صحيحة يستطيع دخول تطبيق الشركات، ونفس المستخدم دون Membership يُرفض.
- توكن تطبيق المستخدم لا يستدعي مسارات الشركات، وتوكن تطبيق الشركات لا يستدعي مسارات المستخدم.
- قبول دعوة مستخدم موجود لا يغير كلمة مروره.
- لا يمكن إزالة آخر owner.
- إزالة/تعليق العضو يوقف وصوله في الطلب التالي ويعالج tokens وفق قرار الجلسات.
- كل تغيير role/permission/invitation يسجل Audit event.

## 8. Venue وSpace — النموذج المستهدف

### 8.1 الفصل

```text
Company → Venue → Space
```

- `Venue`: الفرع/الموقع الفعلي والعنوان والمعلومات المشتركة.
- `Space`: الوحدة القابلة للحجز داخل الموقع.

مثال: فندق واحد Venue يحتوي عدة meeting rooms وwedding halls.

### 8.2 Space categories

استخدم slugs ثابتة ومدارة من المنصة:

```text
wedding_hall
private_event_venue
meeting_room
training_room
workshop_room
seminar_space
conference_space
graduation_venue
exhibition_space
multipurpose_space
```

للمساحة category رئيسية واحدة ويمكن أن تملك suitable-use tags متعددة. لا تنشئ إعلانًا مكررًا لكل استخدام.

### 8.3 Schema أساسي

`venues`:

- company_id
- name_ar/name_en عند توفر محتوى ثنائي، أو بنية ترجمة واضحة
- city_code أو city_id، district، street، building number، postal code، additional number
- latitude/longitude
- access instructions
- parking metadata
- verification/publication status
- timestamps/soft-delete

`spaces`:

- venue_id/company_id (قرر ما إذا كان company_id denormalized لأداء/قيود واضحة؛ لا تكرر دون سبب)
- category
- name/description
- booking_mode
- pricing_mode/default rate reference
- publication_status: draft | pending_review | published | suspended | archived
- capacity fields الأساسية
- requires_visit
- min/max duration and notice rules where appropriate
- timestamps/soft-delete

استخدم جداول normalized للخصائص التي تدخل البحث:

```text
amenity_definitions
space_amenities
space_media
```

اسمح بـvalidated category metadata للحقول النادرة، لكن لا تستخدم `vine.any()` للبيانات التي تؤثر في التسعير أو البحث أو الأمان.

### 8.4 خصائص الفئات

قاعات الزواج: سعات الرجال/النساء عند الحاجة، الأقسام، المداخل، غرفة العروس، الكوشة، الضيافة، المواقف، الباقات، والمعاينة.

الاجتماعات/التدريب: seating layouts/capacities، projector/display، video conference، internet، whiteboard، soundproofing، equipment.

المعارض/المؤتمرات: square meters، ceiling height، loading access، power، setup/teardown windows، visitor capacity.

### 8.5 ترحيل Halls

- لا تكسر `/api/halls` فجأة.
- صمم migration/backfill إلى Venue/Space أو compatibility adapter واضح.
- احتفظ بعلاقة الحجوزات التاريخية أثناء الترحيل.
- لا تعدّل `database/schema.ts` يدويًا؛ migrations/models ثم regenerate عبر آليات المشروع.
- أضف contract tests للمسارات القديمة والجديدة أثناء فترة التوافق.

## 9. التوافر والحجوزات الخارجية

### 9.1 الجداول المستهدفة

```text
availability_rules
availability_exceptions
external_reservations
booking_holds
```

### 9.2 المتطلبات

- ساعات عمل أسبوعية لكل Space.
- slots مرنة أو windows بدل 08:00–22:00 الثابتة.
- صباحي/مسائي/يوم كامل لقاعات المناسبات.
- hourly/minimum duration للغرف.
- multi-day + setup/teardown للمعارض.
- blackout/maintenance/closure exceptions.
- preparation/cleanup buffers.
- minimum notice وmaximum advance window.
- timezone واضح؛ تعامل مع الإدخال كوقت محلي للمنشأة وخزن التوقيت وفق قرار موحد موثق.

### 9.3 external reservations

تطبيق الشركات يحتاج عملية سريعة:

```text
space + start/end + type + optional internal note
```

الأنواع:

```text
external_confirmed
external_hold
maintenance
closure
internal_event
```

لا تتطلب بيانات عميل خارجي أو سعرًا في الـMVP.

### 9.4 holds والتعارض

- الاستفسارات والطلبات قبل موافقة الشركة لا تحجب المخزون حجبًا طويلًا.
- Hold payment يملك `expires_at` ويُفرج عنه آليًا.
- blocking statuses فقط تدخل overlap constraint/check.
- حافظ على transaction locking الحالي، لكن أضف DB-level invariant مناسبًا، ويفضل PostgreSQL range/exclusion constraint إن كان متوافقًا مع تمثيل التوقيت المختار.
- اختبر التزامن بين: حجز QaaAt، حجز خارجي، Hold، قبول عرض، وانتهاء Hold.
- لا تنفذ query لكل slot؛ اجلب blocking intervals دفعة واحدة واحسب availability بكفاءة.

## 10. التسعير والباقات

### 10.1 modes

```text
hourly
fixed_session
half_day
full_day
package
custom_quote
```

### 10.2 النموذج

اقترح فصل:

```text
rate_plans
price_rules (عند الحاجة الفعلية فقط)
service_options
space_service_options
packages
package_items
```

لا تبنِ dynamic pricing engine. المطلوب أسعار أساسية مفهومة ووقت/يوم/باقة.

### 10.3 quote/booking snapshot

كل عرض/حجز يملك line items immutable نسبيًا:

```text
description
type
quantity
unit_price
subtotal
discount
vat_rate
vat_amount
total
currency = SAR
```

احفظ كذلك:

- VAT inclusion semantics.
- platform fee/commission إن حُسم النموذج التجاري.
- provider net.
- cancellation policy snapshot/version.
- quote expiry.
- deposit required and remaining balance.

لا تعيد حساب حجز قديم من أسعار حالية.

## 11. المعاينات والعروض

`visits` يجب أن يدعم:

- طلب العميل.
- موافقة/رفض/اقتراح وقت بديل.
- scheduled/cancelled/completed/no_show.
- إشعارات للطرفين.
- actor audit.
- optional relation to inquiry/quote.

`quotes` يجب أن يدعم:

- draft/sent/accepted/rejected/expired/withdrawn.
- versioning بسيط أو منع تعديل sent quote؛ أنشئ revision جديد بدل تغيير ما رآه العميل.
- line items.
- expiry.
- policy snapshot.
- member actor الذي أنشأ/أرسل العرض.
- قبول متزامن آمن ينشئ Hold واحدًا.

## 12. الدفع والاسترداد

لا تبدأ التكامل قبل حسم PSP والنموذج النظامي، لكن صمم boundary واضحة:

```text
payments
payment_attempts
refunds
provider_settlements أو reconciliation records حسب PSP
```

متطلبات إلزامية:

- server-generated amounts فقط.
- idempotency keys مع DB uniqueness.
- signed webhook verification.
- webhook event deduplication.
- حالات منفصلة للدفع والحجز؛ لا تجعل حقل status واحدًا يحمل كل المعاني.
- لا تؤكد الحجز من success redirect.
- full/partial refunds.
- expiry job للـholds/payment windows.
- audit and reconciliation.
- لا تخزن بيانات بطاقات حساسة.
- Mada/Apple Pay عبر PSP إن توفرت.

### 12.1 محاكاة الدفع المؤقتة المعتمدة

لم يتم اختيار PSP حقيقي حتى الآن. لذلك يجب استخدام provider abstraction وتنفيذ وهمي بدل تأجيل تصميم حالات الحجز والدفع.

عرّف boundary متماسكة مثل:

```ts
interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentSession>
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>
  refund(input: RefundPaymentInput): Promise<RefundResult>
  verifyWebhook(request: WebhookRequest): Promise<VerifiedPaymentEvent>
}
```

نفّذ `FakePaymentProvider` للتطوير والاختبارات. عند اختيار مزود حقيقي يجب أن نستبدل adapter فقط، لا حالات booking/quote/hold/payment/refund أو Audit Log.

متطلبات المزود الوهمي:

- يفعّل من config typed مثل `PAYMENT_DRIVER=fake` مع validation في `start/env.ts` و`config/*`.
- يجب أن يفشل التطبيق بشكل مغلق إذا اختير `fake` في production.
- لا تسجل simulation routes أصلًا في production.
- لا تضف endpoint عامًا يصلح للإنتاج مثل `mark-paid`.
- يمكن لواجهة/endpoint تطويرية فقط محاكاة النجاح، الفشل، الإلغاء، الانتهاء، الاسترداد الكامل والجزئي.
- الأحداث الوهمية تمر بنفس workflow idempotent الذي ستستخدمه webhooks الحقيقية لاحقًا.
- الاختبارات تستدعي Fake provider عبر dependency injection ولا تعتمد على route عام غير آمن.
- خزّن payment attempts وevent IDs وidempotency keys والمبالغ والعملة والحالات بصورة واقعية حتى لا نعيد تصميم schema مع المزود الحقيقي.
- تنفيذ Fake payment يكون في Sprint الدفع، وليس Sprint 1.

## 13. الإشعارات بعد العضويات

الإشعارات التشغيلية للشركة لا تذهب تلقائيًا للمالك وحده أو لكل عضو:

- استخرج الأعضاء active الذين يملكون permission المناسبة.
- في البداية يمكن إرسال booking notifications إلى owner/manager/booking_staff، وcalendar alerts إلى owner/manager/calendar_staff.
- صمم الطريق لإضافة notification preferences لاحقًا دون اشتراطها في Sprint 1.
- لا تنفذ remote I/O داخل transaction؛ enqueue outbox داخلها ثم deliver بعد commit كما يفعل النظام الحالي.

## 14. الإدارة

الـMVP يحتاج API/لوحة إدارة لـ:

- مراجعة الشركات والمستندات.
- مراجعة المساحات ونشرها/تعليقها.
- إدارة categories/amenities الأساسية.
- رؤية الطلبات والحجوزات والمدفوعات.
- معالجة refund/dispute workflows.
- رؤية audit logs.
- التدخل بحالات واضحة، لا hard delete للسجلات التجارية.

قسّم صلاحيات الإدارة لاحقًا إن كانت اللوحة ستستخدم من عدة موظفين، لكن لا توسع Sprint 1 إلا بما يلزم لتشغيل feature الجديدة بأمان.

## 15. العقود والاستجابات

- وحد success envelope وerror envelope تدريجيًا.
- استخدم Transformers لكل public resource ولا ترجع raw Lucid models.
- العلاقات الاختيارية يجب أن تكون واضحة ومحمّلة قبل أن يعد بها Transformer.
- Validator لكل body/query/params غير الموثوق.
- query status/category/sort يجب أن يكون enum validated، لا string يمر مباشرة إلى SQL condition.
- حافظ على camelCase responses ووثق الاستثناءات المؤقتة.
- حدّث OpenAPI و`docs/mobile/company-app.md` و`docs/mobile/user-app.md` مع العقود الفعلية.

## 16. ترتيب التنفيذ الإلزامي

لا تنفذ كل الـMVP في PR واحد.

### Sprint 0 — specification and state contracts

- أنشئ/حدّث مواصفات المنتج والحالات والصلاحيات.
- ارسم state transitions لكل inquiry/request/quote/hold/booking/payment/refund.
- سجّل القرارات المفتوحة، ولا تخمّن PSP/commission/VAT ownership.

### Sprint 1 — company memberships and invitations

- migrations + backfill owners.
- models/relationships.
- permission definitions/presets.
- membership/permission context and tenant scoping.
- invitations send/inspect/accept/resend/cancel.
- member list/update/revoke.
- company login response compatible with current app plus memberships.
- دخول تطبيق الشركات بالهوية المشتركة لمستخدم عميل موجود تمت دعوته.
- فصل صريح لتوكنات/جلسات تطبيق المستخدم وتطبيق الشركات، مع اختبارات رفض cross-app tokens.
- notification/email message for invitation.
- audit logs.
- OpenAPI/docs.
- full functional/security tests.

**لا تبدأ Venue/Space قبل اكتمال واختبار Sprint 1.**

### Sprint 2 — Venue/Space and moderation

- schema/categories/amenities/media/publication lifecycle.
- Hall migration/compatibility.
- company CRUD with permissions.
- admin moderation.
- public reads and category-aware filters.

### Sprint 3 — availability and external reservations

- rules/exceptions/external blocks/holds.
- company calendar APIs.
- public availability.
- overlap/concurrency invariants and jobs.

### Sprint 4 — requests, inquiries, and visits

- request_to_book.
- date inquiry.
- visits.
- expiry SLAs configurable by mode/category.
- notifications/audit.

### Sprint 5 — pricing, packages, services, quotes

- rate plans/packages/options.
- quote line items and revisions.
- accept/reject/expire quote.
- payment hold creation.

### Sprint 6 — payments and refunds

- `PaymentProvider` boundary و`FakePaymentProvider` غير المتاح في الإنتاج.
- payment attempts/webhooks/idempotency.
- deposit/full payment.
- refund/cancellation policy execution.
- reconciliation/invoice data.

### Sprint 7 — launch hardening

- complete OpenAPI/mobile docs.
- production storage/queue/limiter.
- metrics, logs, alerts, backups/restore.
- PDPL retention/export/correction/deletion procedures.
- pilot readiness.

## 17. أول Vertical Slices بعد البنية

### Meeting room slice

```text
company creates meeting room
→ defines working hours/hourly rate
→ adds external reservation
→ user searches date/time
→ blocked interval is unavailable
→ user sends request
→ authorized employee accepts
→ payment hold
→ payment webhook confirms booking
```

### Wedding hall slice

```text
company creates wedding hall and package
→ defines evening/day availability
→ blocks externally booked date
→ user sends date inquiry and requirements
→ optional visit
→ authorized employee sends quote
→ user accepts
→ 24–48h hold
→ deposit webhook confirms booking
→ remaining balance tracked
```

لا تعتبر المحرك جاهزًا لبقية الفئات قبل نجاح هذين المسارين؛ هما يغطيان طرفي التعقيد الزمني والتجاري.

## 18. Definition of Done لكل Feature

لا تعتبر feature مكتملة قبل وجود:

1. migration مع constraints/indexes وrollback مدروس.
2. models/relationships/scopes.
3. validators للمدخلات والـquery/params.
4. authorization + tenant-scoped query.
5. service/domain workflow وTransaction للـinvariant.
6. controller رفيع وroutes مرتبة.
7. transformer وعقد response/error ثابت.
8. outbox/job لأي side effect لازم.
9. unit tests للقواعد الصرفة.
10. functional API tests للنجاح والفشل والملكية.
11. concurrency tests للحالات التي تتنافس.
12. OpenAPI والوثائق المحدثة.
13. verification gates ناجحة.

## 19. بوابات التحقق

قبل أي تنفيذ اختبارات قاعدة بيانات:

- تأكد أن `.env.test` يشير إلى PostgreSQL وRedis/queue/storage معزولة تمامًا عن التطوير والإنتاج.
- لا تستخدم `migration:fresh`, rollback أو truncate على قاعدة غير مثبت عزلها.

ثم شغّل، وفق package scripts الحالية:

```bash
node ace list:routes
npm run typecheck
npm run lint
npm test
npm run build
```

لـSprint 1 أضف focused suite للعضويات والدعوات قبل full suite.

## 20. تعليمات هندسية للـAgent

- اقرأ `CLAUDE.md` لكن لا تثق بذكر AdonisJS 6 فيه؛ `package.json` والكود الحالي يثبتان v7، وحدّث الوثيقة عندما يكون ضمن scope.
- اتبع patterns AdonisJS v7 المثبتة في الإصدارات المنصبة، ولا تخمّن API قديمة.
- استخدم `vine.create`/`request.validateUsing` وفق conventions الحالية.
- استخدم container injection بدل `new Service()` في الكود الجديد.
- لا تعدّل `.adonisjs` أو `database/schema.ts` المولد يدويًا.
- لا تضف repository/DTO/module abstractions بأسلوب NestJS.
- لا تثق في company_id/user_id/role/permissions/status/amount من العميل.
- لا تقم remote mail/push/PSP I/O قبل commit.
- حافظ على التغييرات الحالية غير المتعلقة بالمهمة في worktree.
- إذا ظهر قرار تجاري غير محسوم يغير العقد، وثّقه واطلب قرارًا بدل اختراع سلوك.

## 21. المطلوب من الـAgent الآن

ابدأ بـSprint 1 فقط، بعد جرد دقيق للكود الحالي، وقدم قبل التعديل القصير:

1. الملفات/العلاقات الحالية التي ستتأثر.
2. migration/backfill strategy.
3. compatibility strategy لتطبيق الشركات الحالي.
4. API contract المقترح للدعوات والعضويات.
5. permission presets.
6. استراتيجية ترحيل الهوية الموحدة وفصل توكنات التطبيقين.
7. test matrix.

ثم نفّذ Sprint 1 كاملًا، اختبره، حدّث OpenAPI والوثائق، وقدم handoff واضحًا يتضمن:

- الملفات المتغيرة.
- القرارات المتخذة.
- نتائج التحقق.
- أي قرار مفتوح يمنع Sprint 2.

لا تنتقل تلقائيًا إلى Sprint 2 في نفس التغيير دون مراجعة نتائج Sprint 1 واعتماد عقده.
