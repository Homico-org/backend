/**
 * Catalog translations — Georgian (ka) and Russian (ru)
 * Tone: Thumbtack/TaskRabbit — short, natural, consumer-friendly, action-oriented.
 * Only labels actually referenced in seed-catalog-v3.ts live here (no orphans).
 */

export const translations: Record<string, { ka: string; ru: string }> = {
  // ═══ 14 TOP-LEVEL CATEGORIES — service-oriented (what you need, not who you hire) ═══
  Cleaners: { ka: "დალაგება", ru: "Уборка" },
  Handymen: { ka: "უნივერსალური ხელოსანი", ru: "Мастер на час" },
  Landscapers: { ka: "მებაღე", ru: "Сад и ландшафт" },
  Movers: { ka: "გადაზიდვა", ru: "Переезд и грузоперевозки" },
  Plumbers: { ka: "სანტექნიკა", ru: "Сантехника" },
  "Electrical pros": { ka: "ელექტროობა", ru: "Электрика" },
  Painters: { ka: "შეღებვა", ru: "Покраска" },
  "HVAC pros": { ka: "გათბობა და კონდიცირება", ru: "Климат-техника" },
  Contractors: { ka: "რემონტი და მშენებლობა", ru: "Ремонт и отделка" },
  Architects: { ka: "არქიტექტურა", ru: "Архитектура" },
  "Pool & spa": { ka: "აუზი და სპა", ru: "Бассейн и спа" },
  Roofing: { ka: "სახურავი", ru: "Кровля" },
  "Windows & doors": { ka: "ფანჯრები და კარები", ru: "Окна и двери" },
  "Concrete & masonry": { ka: "ბეტონი და ქვა", ru: "Бетон и кладка" },

  // ═══ SUBCATEGORIES — Cleaners ═══
  "Regular home cleaning": {
    ka: "ყოველდღიური დალაგება",
    ru: "Регулярная уборка",
  },
  "Deep cleaning": { ka: "გენერალური დალაგება", ru: "Генеральная уборка" },
  "Post-renovation cleaning": {
    ka: "რემონტის შემდეგ დალაგება",
    ru: "Уборка после ремонта",
  },
  "Move-in / move-out cleaning": {
    ka: "გადაბარგების დალაგება",
    ru: "Уборка при переезде",
  },
  "Window & facade cleaning": {
    ka: "ფანჯრებისა და ფასადის წმენდა",
    ru: "Мойка окон и фасада",
  },
  "Carpet & upholstery cleaning": {
    ka: "ხალიჩისა და ავეჯის ქიმწმენდა",
    ru: "Химчистка ковров и мебели",
  },

  // ═══ SUBCATEGORIES — Handymen ═══
  "Furniture assembly": { ka: "ავეჯის აწყობა", ru: "Сборка мебели" },
  "Mounting & hanging": { ka: "კედელზე დამაგრება", ru: "Монтаж на стену" },
  "Minor home repairs": {
    ka: "წვრილი შეკეთებები სახლში",
    ru: "Мелкий ремонт по дому",
  },
  "Door installation": { ka: "კარის დაყენება", ru: "Установка дверей" },
  "Trim & decor": { ka: "პლინტუსი და მოლდინგი", ru: "Плинтусы и молдинги" },

  // ═══ SUBCATEGORIES — Landscapers ═══
  "Landscape design": { ka: "ლანდშაფტის დიზაინი", ru: "Ландшафтный дизайн" },
  "Gardening & planting": {
    ka: "ბაღის მოვლა და დარგვა",
    ru: "Уход за садом и посадка",
  },
  "Lawn & irrigation": { ka: "გაზონი და სარწყავი", ru: "Газон и полив" },
  "Tree & hedge care": {
    ka: "ხეებისა და ბუჩქების მოვლა",
    ru: "Уход за деревьями и кустами",
  },
  "Fences & gates": { ka: "ღობე და ჭიშკარი", ru: "Заборы и ворота" },

  // ═══ SUBCATEGORIES — Movers ═══
  "Home moving": { ka: "ბინის გადასახლება", ru: "Квартирный переезд" },
  "Office moving": { ka: "ოფისის გადასახლება", ru: "Офисный переезд" },
  "Packing & unpacking": {
    ka: "შეფუთვა და ამოწყობა",
    ru: "Упаковка и распаковка",
  },
  "Labor help": { ka: "მტვირთავის მომსახურება", ru: "Услуги грузчиков" },

  // ═══ SUBCATEGORIES — Plumbers ═══
  "Plumbing installation": {
    ka: "ახალი მონტაჟი და დაყენება",
    ru: "Новый монтаж и установка",
  },
  "Plumbing repair": { ka: "შეკეთება და გამოცვლა", ru: "Ремонт и замена" },
  "Drainage & sewage": {
    ka: "კანალიზაცია და დრენაჟი",
    ru: "Канализация и дренаж",
  },
  "Boiler & water heater": { ka: "ქვაბი და ბოილერი", ru: "Котёл и бойлер" },
  "Gas systems": { ka: "გაზის სამუშაოები", ru: "Газовые работы" },

  // ═══ SUBCATEGORIES — Electrical ═══
  "Wiring & power": {
    ka: "ელექტროგაყვანილობა",
    ru: "Электропроводка и питание",
  },
  Lighting: { ka: "განათება", ru: "Освещение" },
  "Electrical panel": { ka: "ელექტროფარი", ru: "Электрощит" },
  "Smart home": { ka: "ჭკვიანი სახლი", ru: "Умный дом" },
  "Security systems": {
    ka: "სიგნალიზაცია და კამერები",
    ru: "Сигнализация и камеры",
  },

  // ═══ SUBCATEGORIES — Painters ═══
  "Interior painting": { ka: "შიდა შეღებვა", ru: "Внутренняя покраска" },
  "Exterior painting": { ka: "გარე შეღებვა", ru: "Наружная покраска" },
  "Plasterer & drywaller": {
    ka: "შელესვა და გიფსოკარტონი",
    ru: "Штукатурка и гипсокартон",
  },

  // ═══ SUBCATEGORIES — HVAC ═══
  Heating: { ka: "გათბობა", ru: "Отопление" },
  "AC & ventilation": {
    ka: "კონდიცირება და ვენტილაცია",
    ru: "Кондиционеры и вентиляция",
  },

  // ═══ SUBCATEGORIES — Contractors ═══
  "General contracting": { ka: "სრული რემონტი", ru: "Капитальный ремонт" },
  "Tile work": { ka: "ფილის სამუშაოები", ru: "Плиточные работы" },
  Flooring: { ka: "იატაკი", ru: "Напольные работы" },
  "Built-in furniture": { ka: "ჩაშენებული ავეჯი", ru: "Встроенная мебель" },
  "Facade & insulation": {
    ka: "ფასადი და თბოიზოლაცია",
    ru: "Фасад и утепление",
  },
  Demolition: { ka: "დემონტაჟი", ru: "Демонтаж" },

  // ═══ SUBCATEGORIES — Architects ═══
  "Architectural design": {
    ka: "არქიტექტურული დიზაინი",
    ru: "Архитектурное проектирование",
  },
  "Permits & documentation": {
    ka: "ნებართვები და დოკუმენტაცია",
    ru: "Разрешения и документация",
  },
  "Supervision & estimation": {
    ka: "ზედამხედველობა და ხარჯთაღრიცხვა",
    ru: "Надзор и сметы",
  },

  // ═══ SUBCATEGORIES — Pool & spa ═══
  "Pool & spa install": {
    ka: "აუზისა და სპას მონტაჟი",
    ru: "Монтаж бассейна и спа",
  },
  "Pool maintenance": { ka: "აუზის მოვლა", ru: "Обслуживание бассейна" },

  // ═══ SUBCATEGORIES — Roofing ═══
  "Roof installation": { ka: "სახურავის მონტაჟი", ru: "Монтаж кровли" },
  "Repair & waterproofing": {
    ka: "შეკეთება და ჰიდროიზოლაცია",
    ru: "Ремонт и гидроизоляция",
  },
  "Gutters & insulation": {
    ka: "წყალმიმღები და იზოლაცია",
    ru: "Водостоки и утепление",
  },

  // ═══ SUBCATEGORIES — Windows & doors ═══
  Windows: { ka: "ფანჯრები", ru: "Окна" },
  "Glazing & glass": { ka: "შემინვა და შუშა", ru: "Остекление и стекло" },
  "Specialty doors": { ka: "კარები", ru: "Двери" },

  // ═══ SUBCATEGORIES — Concrete & masonry ═══
  "Masonry & stonework": {
    ka: "წყობა და ქვის სამუშაო",
    ru: "Кладка и каменные работы",
  },
  "Concrete work": { ka: "ბეტონის სამუშაოები", ru: "Бетонные работы" },
  Paving: { ka: "მოპირკეთება", ru: "Мощение" },

  // ═══ SERVICES — Cleaners ═══
  "Standard home cleaning": {
    ka: "სტანდარტული დალაგება",
    ru: "Стандартная уборка",
  },
  "Weekly / biweekly cleaning": {
    ka: "რეგულარული დალაგება",
    ru: "Регулярная уборка (раз в неделю / две)",
  },
  "Full deep cleaning": {
    ka: "სრული გენერალური დალაგება",
    ru: "Полная генеральная уборка",
  },
  "Kitchen deep clean": {
    ka: "სამზარეულოს ღრმა წმენდა",
    ru: "Генеральная уборка кухни",
  },
  "Bathroom deep clean": {
    ka: "სააბაზანოს ღრმა წმენდა",
    ru: "Генеральная уборка санузла",
  },
  "Full post-renovation cleaning": {
    ka: "სრული დალაგება რემონტის შემდეგ",
    ru: "Полная уборка после ремонта",
  },
  "Construction dust removal": {
    ka: "სამშენებლო მტვრის გატანა",
    ru: "Удаление строительной пыли",
  },
  "Floor & tile deep clean": {
    ka: "იატაკისა და ფილის ღრმა წმენდა",
    ru: "Глубокая чистка полов и плитки",
  },
  "Full move-out cleaning": {
    ka: "სრული გადაბარგების დალაგება",
    ru: "Полная уборка при переезде",
  },
  "Empty apartment cleaning": {
    ka: "ცარიელი ბინის დალაგება",
    ru: "Уборка пустой квартиры",
  },
  "Cabinet & surface cleaning": {
    ka: "კარადებისა და ზედაპირების წმენდა",
    ru: "Чистка шкафов и поверхностей",
  },
  "Interior windows": { ka: "შიდა ფანჯრები", ru: "Внутренние окна" },
  "Exterior windows": { ka: "გარე ფანჯრები", ru: "Наружные окна" },
  "Facade washing": { ka: "ფასადის წმენდა", ru: "Мойка фасада" },
  "Rug & carpet cleaning": { ka: "ხალიჩის წმენდა", ru: "Чистка ковров" },
  "Sofa & upholstery cleaning": {
    ka: "დივანისა და ავეჯის წმენდა",
    ru: "Чистка дивана и мебели",
  },
  "Mattress cleaning": { ka: "მატრასის წმენდა", ru: "Чистка матрасов" },

  // ═══ SERVICES — Handymen ═══
  "Flat-pack furniture assembly": {
    ka: "ყუთში შეფუთული ავეჯის აწყობა",
    ru: "Сборка мебели из коробки (IKEA и аналоги)",
  },
  "Cabinet & wardrobe assembly": {
    ka: "კარადის და გარდერობის აწყობა",
    ru: "Сборка шкафов и гардеробов",
  },
  "Bed & desk assembly": {
    ka: "საწოლისა და მაგიდის აწყობა",
    ru: "Сборка кроватей и столов",
  },
  "Office furniture assembly": {
    ka: "საოფისე ავეჯის აწყობა",
    ru: "Сборка офисной мебели",
  },
  "TV wall-mounting": {
    ka: "ტელევიზორის კედელზე დამაგრება",
    ru: "Крепление телевизора на стену",
  },
  "Shelves & wall storage": {
    ka: "თაროების კედელზე დამაგრება",
    ru: "Монтаж полок и настенных систем",
  },
  "Pictures, mirrors & art": {
    ka: "სურათების, სარკეების ჩამოკიდება",
    ru: "Развеска картин, зеркал и декора",
  },
  "Curtain rods & blinds": {
    ka: "ფარდის კარნიზი და ჟალუზი",
    ru: "Карнизы и жалюзи",
  },
  "Drywall patching": {
    ka: "კედელზე ხვრელის ამოვსება",
    ru: "Заделка отверстий и трещин",
  },
  "Door & window repair": {
    ka: "კარისა და ფანჯრის შეკეთება",
    ru: "Ремонт дверей и окон",
  },
  "Furniture repair": { ka: "ავეჯის შეკეთება", ru: "Ремонт мебели" },
  "Handyman by the hour": { ka: "მასტერი საათით", ru: "Мастер на час" },
  "Interior door install": {
    ka: "შიდა კარის დაყენება",
    ru: "Установка межкомнатных дверей",
  },
  "Entry door install": {
    ka: "შესასვლელი კარის დაყენება",
    ru: "Установка входных дверей",
  },
  "Door hardware & locks": {
    ka: "კარის ფურნიტურა და საკეტები",
    ru: "Фурнитура и замки",
  },
  Baseboards: { ka: "პლინტუსი", ru: "Плинтусы" },
  "Crown moldings": { ka: "ჭერის კარნიზი", ru: "Потолочные молдинги" },
  "Wall paneling": { ka: "კედლის პანელები", ru: "Стеновые панели" },

  // ═══ SERVICES — Landscapers ═══
  "Full landscape plan": {
    ka: "ლანდშაფტური პროექტი",
    ru: "Ландшафтный проект",
  },
  "Design consultation": {
    ka: "დიზაინ-კონსულტაცია",
    ru: "Консультация по дизайну",
  },
  "3D visualization": { ka: "3D ვიზუალიზაცია", ru: "3D визуализация" },
  "Planting & flower beds": {
    ka: "დარგვა და კვლების მოწყობა",
    ru: "Посадка и устройство клумб",
  },
  "Weeding & cleanup": { ka: "სარეველების მოცილება", ru: "Прополка и уборка" },
  "Mulching & fertilizing": {
    ka: "მულჩი და განოყიერება",
    ru: "Мульчирование и удобрение",
  },
  "Seasonal garden care": {
    ka: "სეზონური მოვლა",
    ru: "Сезонный уход за садом",
  },
  "Lawn mowing & care": {
    ka: "გაზონის გათიბვა და მოვლა",
    ru: "Стрижка и уход за газоном",
  },
  "Lawn installation & sodding": {
    ka: "გაზონის მოწყობა",
    ru: "Укладка газона и рулонный газон",
  },
  "Sprinkler system install": {
    ka: "სარწყავი სისტემის მონტაჟი",
    ru: "Монтаж системы полива",
  },
  "Sprinkler system repair": {
    ka: "სარწყავი სისტემის შეკეთება",
    ru: "Ремонт системы полива",
  },
  "Aeration & overseeding": {
    ka: "აერაცია და გაზონის თესვა",
    ru: "Аэрация и подсев газона",
  },
  "Tree pruning": { ka: "ხის გასხვლა", ru: "Обрезка деревьев" },
  "Tree removal": { ka: "ხის მოჭრა", ru: "Спил деревьев" },
  "Stump removal": { ka: "ძირის ამოღება", ru: "Удаление пней" },
  "Hedge trimming": { ka: "ბუჩქების შეკრება", ru: "Стрижка живой изгороди" },
  "Tree & shrub planting": {
    ka: "ხეებისა და ბუჩქების დარგვა",
    ru: "Посадка деревьев и кустов",
  },
  "Wooden fence": { ka: "ხის ღობე", ru: "Деревянный забор" },
  "Metal fence": { ka: "ლითონის ღობე", ru: "Металлический забор" },
  "Gate installation": { ka: "ჭიშკრის დაყენება", ru: "Установка ворот" },
  "Fence repair": { ka: "ღობის შეკეთება", ru: "Ремонт забора" },

  // ═══ SERVICES — Movers ═══
  // Home moving
  "Local home moving": { ka: "ქალაქში გადასახლება", ru: "Переезд по городу" },
  "Long-distance moving": {
    ka: "შორ მანძილზე გადასახლება",
    ru: "Междугородний переезд",
  },
  // Office moving
  "Office relocation": {
    ka: "ოფისის სრული გადასახლება",
    ru: "Переезд офиса под ключ",
  },
  "Office furniture & equipment": {
    ka: "ოფისის ავეჯი და ტექნიკა",
    ru: "Офисная мебель и техника",
  },
  // Packing & unpacking
  "Full packing service": { ka: "სრული შეფუთვა", ru: "Полная упаковка вещей" },
  "Fragile items packing": {
    ka: "მსხვრევადი ნივთების შეფუთვა",
    ru: "Упаковка хрупких вещей",
  },
  "Unpacking service": {
    ka: "ნივთების ამოწყობა",
    ru: "Распаковка и расстановка",
  },
  // Labor help
  "Loading & unloading": {
    ka: "დატვირთვა-განტვირთვა",
    ru: "Погрузка и разгрузка",
  },
  "Heavy appliance moving": {
    ka: "მძიმე ტექნიკის გადატანა",
    ru: "Перевозка крупной техники",
  },
  "Furniture rearranging": {
    ka: "ავეჯის გადაადგილება სახლში",
    ru: "Перестановка мебели",
  },
  "Piano & specialty items": {
    ka: "პიანინო და სპეცტვირთი",
    ru: "Пианино и особые грузы",
  },

  // ═══ SERVICES — Plumbers ═══
  // Installation
  "Faucet installation": { ka: "ონკანის დაყენება", ru: "Установка смесителя" },
  "Toilet installation": { ka: "უნიტაზის დაყენება", ru: "Установка унитаза" },
  "Sink or bathtub install": {
    ka: "ნიჟარის ან აბაზანის დაყენება",
    ru: "Установка раковины и ванны",
  },
  "Shower cabin install": {
    ka: "შხაპის კაბინის დაყენება",
    ru: "Установка душевой кабины",
  },
  "Dishwasher hookup": {
    ka: "ჭურჭლის სარეცხის შეერთება",
    ru: "Подключение посудомоечной машины",
  },
  "Washing machine hookup": {
    ka: "სარეცხი მანქანის შეერთება",
    ru: "Подключение стиральной машины",
  },
  // Repair
  "Leak repair": { ka: "გაჟონვის შეკეთება", ru: "Устранение протечек" },
  "Drain unclogging": { ka: "ჩახერგილი მილის გახსნა", ru: "Прочистка засоров" },
  "Pipe repair": {
    ka: "მილის შეკეთება და გამოცვლა",
    ru: "Ремонт и замена труб",
  },
  "Low water pressure fix": {
    ka: "წყლის სუსტი წნევის მოგვარება",
    ru: "Устранение низкого давления воды",
  },
  "Emergency call": { ka: "ავარიული გამოძახება", ru: "Аварийный вызов" },
  // Drainage & sewage
  "Drainage installation": { ka: "დრენაჟის მოწყობა", ru: "Монтаж дренажа" },
  "Sewage line connection": {
    ka: "კანალიზაციის მაგისტრალთან შეერთება",
    ru: "Подключение к канализации",
  },
  "Outdoor/yard drainage": {
    ka: "ეზოს დრენაჟი",
    ru: "Наружный / дворовый дренаж",
  },
  // Boiler
  "Gas boiler install": {
    ka: "გაზის ქვაბის დაყენება",
    ru: "Установка газового котла",
  },
  "Electric boiler install": {
    ka: "ელექტრო ბოილერის დაყენება",
    ru: "Установка электробойлера",
  },
  "Boiler repair": { ka: "ქვაბის შეკეთება", ru: "Ремонт котла" },
  "Boiler annual service": {
    ka: "ქვაბის სეზონური მოვლა",
    ru: "Сезонное обслуживание котла",
  },
  // Gas
  "Gas line installation": {
    ka: "გაზის ქსელის მონტაჟი",
    ru: "Монтаж газопровода",
  },
  "Gas stove installation": {
    ka: "გაზქურის დაყენება",
    ru: "Установка газовой плиты",
  },
  "Gas leak detection": {
    ka: "გაზის გაჟონვის შემოწმება",
    ru: "Проверка утечки газа",
  },

  // ═══ SERVICES — Electrical ═══
  // Wiring & power
  "New wiring": {
    ka: "ახალი გაყვანილობის მონტაჟი",
    ru: "Монтаж новой проводки",
  },
  "Outlet & switch install": {
    ka: "როზეტებისა და ჩამრთველების დაყენება",
    ru: "Установка розеток и выключателей",
  },
  "Wiring repair": {
    ka: "გაყვანილობის შეკეთება",
    ru: "Ремонт электропроводки",
  },
  "EV charger install": {
    ka: "ელექტროავტომობილის დამტენის დაყენება",
    ru: "Установка зарядки для электромобиля",
  },
  // Lighting
  "Ceiling light install": {
    ka: "ჭაღის და სანათის დაყენება",
    ru: "Установка люстры и светильника",
  },
  "Spotlight install": {
    ka: "წერტილოვანი სანათების მონტაჟი",
    ru: "Установка точечных светильников",
  },
  "LED strip install": { ka: "LED ლენტის მონტაჟი", ru: "Монтаж LED-ленты" },
  "Outdoor lighting": {
    ka: "ეზოს და ფასადის განათება",
    ru: "Уличное освещение",
  },
  "Ceiling fan install": {
    ka: "ჭერის ვენტილატორის დაყენება",
    ru: "Установка потолочного вентилятора",
  },
  // Panel
  "New panel install": {
    ka: "ახალი ელექტროფარის დაყენება",
    ru: "Установка нового электрощита",
  },
  "Breaker replacement": { ka: "ავტომატის გამოცვლა", ru: "Замена автоматов" },
  "Panel upgrade & expansion": {
    ka: "ფარის გაფართოება და განახლება",
    ru: "Расширение и модернизация щита",
  },
  // Smart home
  "Smart switches & outlets": {
    ka: "ჭკვიანი ჩამრთველები და როზეტები",
    ru: "Умные выключатели и розетки",
  },
  "Smart lighting": { ka: "ჭკვიანი განათება", ru: "Умное освещение" },
  "Full smart home setup": {
    ka: "სრული ჭკვიანი სახლის სისტემა",
    ru: "Настройка умного дома под ключ",
  },
  // Security
  "CCTV installation": {
    ka: "ვიდეო-კამერების მონტაჟი",
    ru: "Установка видеокамер",
  },
  "Alarm system install": {
    ka: "სიგნალიზაციის მონტაჟი",
    ru: "Монтаж сигнализации",
  },
  "Intercom install": { ka: "დომოფონის დაყენება", ru: "Установка домофона" },

  // ═══ SERVICES — Painters ═══
  // Interior painting
  "Wall painting": { ka: "კედლების შეღებვა", ru: "Покраска стен" },
  "Ceiling painting": { ka: "ჭერის შეღებვა", ru: "Покраска потолка" },
  "Wallpaper hanging": { ka: "შპალერის გაკვრა", ru: "Поклейка обоев" },
  "Trim, doors & windows": {
    ka: "პლინტუსის, კარისა და ფანჯრის შეღებვა",
    ru: "Покраска плинтусов, дверей и окон",
  },
  // Exterior painting
  "Exterior wall painting": {
    ka: "გარე კედლების შეღებვა",
    ru: "Покраска наружных стен",
  },
  "Fence & railing painting": {
    ka: "ღობისა და მოაჯირის შეღებვა",
    ru: "Покраска забора и перил",
  },
  "Metal surface painting": {
    ka: "ლითონის ზედაპირის შეღებვა",
    ru: "Покраска металлических поверхностей",
  },
  // Plaster & drywall
  Plastering: { ka: "კედლების შელესვა", ru: "Штукатурка стен" },
  "Drywall install": { ka: "გიფსოკარტონის მონტაჟი", ru: "Монтаж гипсокартона" },
  "Ceiling plaster": { ka: "ჭერის შელესვა", ru: "Штукатурка потолка" },
  "Decorative plaster": {
    ka: "დეკორატიული შელესვა",
    ru: "Декоративная штукатурка",
  },

  // ═══ SERVICES — HVAC ═══
  // Heating
  "Radiator installation": {
    ka: "რადიატორის დაყენება",
    ru: "Установка радиаторов",
  },
  "Heating system install": {
    ka: "გათბობის სისტემის მონტაჟი",
    ru: "Монтаж системы отопления",
  },
  "Underfloor heating": { ka: "იატაკის გათბობა", ru: "Тёплый пол" },
  "Heating repair & service": {
    ka: "გათბობის შეკეთება და მოვლა",
    ru: "Ремонт и обслуживание отопления",
  },
  "Thermostat install": {
    ka: "თერმოსტატის დაყენება",
    ru: "Установка термостата",
  },
  // AC & ventilation
  "AC installation": {
    ka: "კონდიციონერის დაყენება",
    ru: "Установка кондиционера",
  },
  "AC repair": { ka: "კონდიციონერის შეკეთება", ru: "Ремонт кондиционера" },
  "AC maintenance & cleaning": {
    ka: "კონდიციონერის მოვლა და წმენდა",
    ru: "Обслуживание и чистка кондиционера",
  },
  "Ventilation install": { ka: "ვენტილაციის მონტაჟი", ru: "Монтаж вентиляции" },
  "Range hood install": { ka: "გამწოვის დაყენება", ru: "Установка вытяжки" },

  // ═══ SERVICES — Contractors ═══
  // General contracting
  "Full home renovation": {
    ka: "სრული რემონტი სახლში",
    ru: "Ремонт квартиры под ключ",
  },
  "Kitchen renovation": { ka: "სამზარეულოს რემონტი", ru: "Ремонт кухни" },
  "Bathroom renovation": { ka: "სააბაზანოს რემონტი", ru: "Ремонт санузла" },
  // Tile work
  "Floor tiling": {
    ka: "იატაკზე ფილის დაგება",
    ru: "Укладка напольной плитки",
  },
  "Wall tiling": { ka: "კედელზე ფილის დაგება", ru: "Укладка настенной плитки" },
  Mosaic: { ka: "მოზაიკა", ru: "Мозаика" },
  "Tile removal": { ka: "ფილის მოხსნა", ru: "Демонтаж плитки" },
  "Grout cleaning & regrouting": {
    ka: "ნაკერების გაწმენდა და განახლება",
    ru: "Очистка и обновление швов",
  },
  // Flooring
  Parquet: { ka: "პარკეტის დაგება", ru: "Укладка паркета" },
  Laminate: { ka: "ლამინატის დაგება", ru: "Укладка ламината" },
  "Vinyl flooring": { ka: "ვინილის იატაკი", ru: "Виниловые полы" },
  "Floor repair": { ka: "იატაკის შეკეთება", ru: "Ремонт пола" },
  "Floor sanding & refinishing": {
    ka: "იატაკის ხეხვა და ლაქირება",
    ru: "Циклёвка и лакировка пола",
  },
  // Built-in furniture
  Wardrobe: { ka: "ჩაშენებული კარადა", ru: "Встроенный шкаф" },
  "Kitchen cabinetry": { ka: "სამზარეულოს ავეჯი", ru: "Кухонный гарнитур" },
  Shelving: { ka: "თაროები", ru: "Стеллажи и полки" },
  Countertops: { ka: "სამუშაო ზედაპირი", ru: "Столешницы" },
  // Facade
  Cladding: { ka: "ფასადის მოპირკეთება", ru: "Облицовка фасада" },
  "Thermal insulation": { ka: "თბოიზოლაცია", ru: "Утепление" },
  "Facade painting": { ka: "ფასადის შეღებვა", ru: "Покраска фасада" },
  "Facade repair": { ka: "ფასადის შეკეთება", ru: "Ремонт фасада" },
  // Demolition
  "Partial demolition": {
    ka: "ნაწილობრივი დემონტაჟი",
    ru: "Частичный демонтаж",
  },
  "Full demolition": { ka: "სრული დემონტაჟი", ru: "Полный демонтаж" },
  "Debris removal": { ka: "ნარჩენების გატანა", ru: "Вывоз мусора" },

  // ═══ SERVICES — Architects ═══
  // Design
  "Residential project": {
    ka: "საცხოვრებლის არქიტექტურული პროექტი",
    ru: "Проект жилого дома",
  },
  "Commercial project": {
    ka: "კომერციული ობიექტის პროექტი",
    ru: "Проект коммерческого объекта",
  },
  "Renovation plan": {
    ka: "რემონტის სამუშაო ნახაზი",
    ru: "Рабочие чертежи ремонта",
  },
  // (3D visualization reused from Landscapers — translation already defined there)
  // Permits
  "Construction permit": {
    ka: "სამშენებლო ნებართვის მიღება",
    ru: "Получение разрешения на строительство",
  },
  "Building expertise": {
    ka: "სამშენებლო ექსპერტიზა",
    ru: "Строительная экспертиза",
  },
  "As-built drawings": {
    ka: "არსებული მდგომარეობის ნახაზი",
    ru: "Исполнительные чертежи",
  },
  "Legal documentation": {
    ka: "იურიდიული დოკუმენტაცია",
    ru: "Юридическая документация",
  },
  // Supervision & estimation
  "Site supervision": {
    ka: "ობიექტზე ზედამხედველობა",
    ru: "Авторский надзор на объекте",
  },
  "Cost estimation": { ka: "ხარჯთაღრიცხვის შედგენა", ru: "Составление сметы" },
  "Construction management": {
    ka: "მშენებლობის მართვა",
    ru: "Управление строительством",
  },
  "Technical consulting": {
    ka: "ტექნიკური კონსულტაცია",
    ru: "Техническая консультация",
  },

  // ═══ SERVICES — Pool & spa ═══
  // Install
  "Pool construction": { ka: "აუზის მშენებლობა", ru: "Строительство бассейна" },
  "Spa / jacuzzi install": {
    ka: "სპა და ჯაკუზის დაყენება",
    ru: "Установка спа и джакузи",
  },
  "Sauna install": { ka: "საუნის მონტაჟი", ru: "Монтаж сауны" },
  "Pool heater install": {
    ka: "აუზის გამაცხელებლის დაყენება",
    ru: "Установка нагревателя бассейна",
  },
  // Maintenance
  "Regular pool cleaning": {
    ka: "აუზის რეგულარული წმენდა",
    ru: "Регулярная чистка бассейна",
  },
  "Water treatment": { ka: "წყლის დამუშავება", ru: "Водоподготовка" },
  "Pump & filter service": {
    ka: "ტუმბოსა და ფილტრის მოვლა",
    ru: "Обслуживание насоса и фильтра",
  },
  "Pool repair": { ka: "აუზის შეკეთება", ru: "Ремонт бассейна" },

  // ═══ SERVICES — Roofing ═══
  // Installation
  "Metal roof install": {
    ka: "ლითონის სახურავის მონტაჟი",
    ru: "Монтаж металлической кровли",
  },
  "Tile roof install": {
    ka: "კრამიტის სახურავის მონტაჟი",
    ru: "Монтаж черепичной кровли",
  },
  "Flat roof install": {
    ka: "ბრტყელი სახურავის მონტაჟი",
    ru: "Монтаж плоской кровли",
  },
  "Bitumen shingle roof": {
    ka: "ბიტუმის კრამიტის სახურავი",
    ru: "Монтаж битумной черепицы",
  },
  // Repair & waterproofing
  "Roof repair": { ka: "სახურავის შეკეთება", ru: "Ремонт кровли" },
  "Roof leak repair": {
    ka: "სახურავის გაჟონვის შეკეთება",
    ru: "Устранение протечек кровли",
  },
  "Roof waterproofing": {
    ka: "სახურავის ჰიდროიზოლაცია",
    ru: "Гидроизоляция кровли",
  },
  "Roof inspection": { ka: "სახურავის შემოწმება", ru: "Осмотр кровли" },
  // Gutters & insulation
  "Gutter install": { ka: "წყალმიმღების მონტაჟი", ru: "Монтаж водостоков" },
  "Gutter cleaning": { ka: "წყალმიმღების გაწმენდა", ru: "Чистка водостоков" },
  "Attic & roof insulation": {
    ka: "სახურავის თბოიზოლაცია",
    ru: "Утепление кровли и чердака",
  },

  // ═══ SERVICES — Windows & doors ═══
  // Windows
  "PVC windows": { ka: "PVC ფანჯრების მონტაჟი", ru: "Монтаж ПВХ-окон" },
  "Aluminum windows": {
    ka: "ალუმინის ფანჯრების მონტაჟი",
    ru: "Монтаж алюминиевых окон",
  },
  "Wood windows": { ka: "ხის ფანჯრების მონტაჟი", ru: "Монтаж деревянных окон" },
  "Window screens & mesh": {
    ka: "კოღოს საწინააღმდეგო ბადე",
    ru: "Москитные сетки",
  },
  // Glazing & glass
  "Balcony glazing": { ka: "ბალკონის შემინვა", ru: "Остекление балкона" },
  "Glass replacement": { ka: "მინის გამოცვლა", ru: "Замена стекла" },
  "Glass partitions": { ka: "შუშის ტიხრები", ru: "Стеклянные перегородки" },
  "Window repair & sealing": {
    ka: "ფანჯრის შეკეთება და ჰერმეტიზაცია",
    ru: "Ремонт окон и герметизация",
  },
  // Doors
  "Entry door": {
    ka: "შესასვლელი კარის დაყენება",
    ru: "Установка входной двери",
  },
  "Security / armored door": { ka: "ჯავშნული კარი", ru: "Бронированная дверь" },
  "Sliding & French doors": {
    ka: "მოცურავე და ორფრთიანი კარი",
    ru: "Раздвижные и распашные двери",
  },
  "Garage door": { ka: "ავტოფარეხის კარი", ru: "Гаражные ворота" },

  // ═══ SERVICES — Concrete & masonry ═══
  // Masonry
  "Brick laying": { ka: "აგურის წყობა", ru: "Кирпичная кладка" },
  "Stone walls": {
    ka: "ქვის კედლის აშენება",
    ru: "Строительство каменных стен",
  },
  "Retaining walls": { ka: "საყრდენი კედელი", ru: "Подпорные стены" },
  "Masonry repair": { ka: "წყობის შეკეთება", ru: "Ремонт кладки" },
  // Concrete
  "Foundation work": { ka: "საძირკვლის სამუშაოები", ru: "Фундаментные работы" },
  "Concrete pouring": { ka: "ბეტონის ჩასხმა", ru: "Заливка бетона" },
  "Concrete stairs": {
    ka: "ბეტონის კიბის მოწყობა",
    ru: "Заливка бетонной лестницы",
  },
  "Concrete repair": { ka: "ბეტონის შეკეთება", ru: "Ремонт бетона" },
  // Paving
  "Driveway paving": {
    ka: "მისასვლელი გზის მოპირკეთება",
    ru: "Мощение подъездной дороги",
  },
  "Walkways & garden paths": {
    ka: "ბილიკები და ბაღის გზები",
    ru: "Дорожки и садовые тропинки",
  },
  "Patio & terrace": {
    ka: "ტერასა და ეზოს მოპირკეთება",
    ru: "Мощение террасы и двора",
  },
  "Paving stones": {
    ka: "ფილების და ქვაფენილის დაგება",
    ru: "Укладка брусчатки и плитки",
  },
};
