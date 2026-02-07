import { FeatureExplanation, FeatureStep } from './dto/rich-content.dto';

export type FeatureKey =
  | 'registration_client'
  | 'registration_pro'
  | 'post_job'
  | 'find_professionals'
  | 'pricing'
  | 'verification'
  | 'messaging'
  | 'proposals'
  | 'reviews'
  | 'portfolio'
  | 'how_it_works'
  | 'tools'
  | 'tool_analyzer'
  | 'tool_prices'
  | 'tool_calculator'
  | 'tool_compare';

interface KnowledgeBase {
  features: Record<FeatureKey, FeatureExplanation>;
  faqs: {
    question: { en: string; ka: string; ru: string };
    answer: { en: string; ka: string; ru: string };
    relatedFeature?: FeatureKey;
  }[];
}

export const KNOWLEDGE_BASE: KnowledgeBase = {
  features: {
    registration_client: {
      feature: 'registration_client',
      title: 'Client Registration',
      titleKa: 'კლიენტის რეგისტრაცია',
      titleRu: 'Регистрация клиента',
      description:
        'Register as a homeowner to find professionals, post jobs, and get quotes.',
      descriptionKa:
        'დარეგისტრირდით როგორც სახლის მფლობელი პროფესიონალების საპოვნელად, სამუშაოების განსათავსებლად და შეთავაზებების მისაღებად.',
      descriptionRu:
        'Зарегистрируйтесь как домовладелец, чтобы находить специалистов, размещать заказы и получать предложения.',
      steps: [
        {
          step: 1,
          title: 'Enter your phone or email',
          titleKa: 'შეიყვანეთ ტელეფონი ან ელფოსტა',
          titleRu: 'Введите телефон или email',
          description: 'We will send you a verification code.',
          descriptionKa: 'გამოგიგზავნით დამადასტურებელ კოდს.',
          descriptionRu: 'Мы отправим вам код подтверждения.',
          icon: 'phone',
        },
        {
          step: 2,
          title: 'Verify your account',
          titleKa: 'დაადასტურეთ ანგარიში',
          titleRu: 'Подтвердите аккаунт',
          description: 'Enter the 6-digit code we sent you.',
          descriptionKa: 'შეიყვანეთ 6-ნიშნა კოდი, რომელიც გამოგიგზავნეთ.',
          descriptionRu: 'Введите 6-значный код, который мы отправили.',
          icon: 'shield-check',
        },
        {
          step: 3,
          title: 'Set up your profile',
          titleKa: 'შეავსეთ პროფილი',
          titleRu: 'Заполните профиль',
          description: 'Add your name and optional profile photo.',
          descriptionKa: 'დაამატეთ თქვენი სახელი და პროფილის ფოტო.',
          descriptionRu: 'Добавьте имя и фото профиля.',
          icon: 'user',
        },
        {
          step: 4,
          title: 'Start browsing',
          titleKa: 'დაიწყეთ ძებნა',
          titleRu: 'Начните поиск',
          description:
            'Browse professionals or post a job to receive quotes.',
          descriptionKa:
            'დაათვალიერეთ პროფესიონალები ან განათავსეთ განცხადება შეთავაზებების მისაღებად.',
          descriptionRu:
            'Просматривайте специалистов или разместите заказ для получения предложений.',
          icon: 'search',
        },
      ],
      actionUrl: '/register',
      actionLabel: 'Register as Client',
      actionLabelKa: 'რეგისტრაცია კლიენტად',
      actionLabelRu: 'Регистрация клиента',
    },

    registration_pro: {
      feature: 'registration_pro',
      title: 'Professional Registration',
      titleKa: 'პროფესიონალის რეგისტრაცია',
      titleRu: 'Регистрация специалиста',
      description:
        'Register as a professional to showcase your work and receive job requests.',
      descriptionKa:
        'დარეგისტრირდით როგორც პროფესიონალი თქვენი სამუშაოების საჩვენებლად და შეკვეთების მისაღებად.',
      descriptionRu:
        'Зарегистрируйтесь как специалист, чтобы демонстрировать работы и получать заказы.',
      steps: [
        {
          step: 1,
          title: 'Create your account',
          titleKa: 'შექმენით ანგარიში',
          titleRu: 'Создайте аккаунт',
          description: 'Enter phone/email and verify with a code.',
          descriptionKa: 'შეიყვანეთ ტელეფონი/ელფოსტა და დაადასტურეთ კოდით.',
          descriptionRu: 'Введите телефон/email и подтвердите кодом.',
          icon: 'user-plus',
        },
        {
          step: 2,
          title: 'Select your services',
          titleKa: 'აირჩიეთ სერვისები',
          titleRu: 'Выберите услуги',
          description:
            'Choose categories and subcategories that match your expertise.',
          descriptionKa:
            'აირჩიეთ კატეგორიები და ქვეკატეგორიები, რომლებიც შეესაბამება თქვენს გამოცდილებას.',
          descriptionRu:
            'Выберите категории и подкатегории, соответствующие вашему опыту.',
          icon: 'briefcase',
        },
        {
          step: 3,
          title: 'Build your profile',
          titleKa: 'შექმენით პროფილი',
          titleRu: 'Создайте профиль',
          description:
            'Add your bio, experience, pricing, and service areas.',
          descriptionKa:
            'დაამატეთ თქვენი ბიოგრაფია, გამოცდილება, ფასები და მომსახურების არეალი.',
          descriptionRu:
            'Добавьте биографию, опыт, цены и зоны обслуживания.',
          icon: 'edit',
        },
        {
          step: 4,
          title: 'Upload your portfolio',
          titleKa: 'ატვირთეთ პორტფოლიო',
          titleRu: 'Загрузите портфолио',
          description:
            'Showcase your best work with before/after photos.',
          descriptionKa:
            'აჩვენეთ თქვენი საუკეთესო სამუშაოები "მანამდე და შემდეგ" ფოტოებით.',
          descriptionRu:
            'Покажите лучшие работы с фото "до и после".',
          icon: 'image',
        },
        {
          step: 5,
          title: 'Verify your identity',
          titleKa: 'გაიარეთ ვერიფიკაცია',
          titleRu: 'Подтвердите личность',
          description:
            'Upload ID documents to get the verified badge.',
          descriptionKa:
            'ატვირთეთ პირადობის დოკუმენტები ვერიფიცირებული ბეჯის მისაღებად.',
          descriptionRu:
            'Загрузите документы для получения значка верификации.',
          icon: 'badge-check',
        },
      ],
      actionUrl: '/register',
      actionLabel: 'Register as Professional',
      actionLabelKa: 'რეგისტრაცია პროფესიონალად',
      actionLabelRu: 'Регистрация специалიста',
    },

    post_job: {
      feature: 'post_job',
      title: 'Post a Job',
      titleKa: 'განცხადების განთავსება',
      titleRu: 'Разместить заказ',
      description:
        'Post a job request and receive quotes from qualified professionals.',
      descriptionKa:
        'განათავსეთ სამუშაოს მოთხოვნა და მიიღეთ შეთავაზებები კვალიფიციური პროფესიონალებისგან.',
      descriptionRu:
        'Разместите заказ и получите предложения от квалифицированных специалистов.',
      steps: [
        {
          step: 1,
          title: 'Describe your project',
          titleKa: 'აღწერეთ პროექტი',
          titleRu: 'Опишите проект',
          description:
            'Tell us what work you need done, including details and requirements.',
          descriptionKa:
            'გვითხარით რა სამუშაო გჭირდებათ, დეტალების და მოთხოვნების ჩათვლით.',
          descriptionRu:
            'Расскажите, какая работа нужна, включая детали и требования.',
          icon: 'file-text',
        },
        {
          step: 2,
          title: 'Add photos (optional)',
          titleKa: 'დაამატეთ ფოტოები (არასავალდებულო)',
          titleRu: 'Добавьте фото (необязательно)',
          description:
            'Upload photos of the space or area that needs work.',
          descriptionKa:
            'ატვირთეთ ფოტოები სივრცის ან ადგილის, რომელსაც სჭირდება სამუშაო.',
          descriptionRu:
            'Загрузите фото пространства или зоны для работы.',
          icon: 'camera',
        },
        {
          step: 3,
          title: 'Set your budget and timeline',
          titleKa: 'დააყენეთ ბიუჯეტი და ვადა',
          titleRu: 'Укажите бюджет и сроки',
          description:
            'Specify your budget range and when you need the work completed.',
          descriptionKa:
            'მიუთითეთ ბიუჯეტის დიაპაზონი და როდის გჭირდებათ სამუშაოს დასრულება.',
          descriptionRu:
            'Укажите диапазон бюджета и когда нужно завершить работу.',
          icon: 'calendar',
        },
        {
          step: 4,
          title: 'Receive quotes',
          titleKa: 'მიიღეთ შეთავაზებები',
          titleRu: 'Получите предложения',
          description:
            'Qualified professionals will send you proposals with pricing.',
          descriptionKa:
            'კვალიფიციური პროფესიონალები გამოგიგზავნიან შეთავაზებებს ფასებით.',
          descriptionRu:
            'Квалифицированные специалисты отправят предложения с ценами.',
          icon: 'inbox',
        },
        {
          step: 5,
          title: 'Choose and hire',
          titleKa: 'აირჩიეთ და დაიქირავეთ',
          titleRu: 'Выберите и наймите',
          description:
            'Compare proposals, chat with pros, and hire the best fit.',
          descriptionKa:
            'შეადარეთ შეთავაზებები, დაწერეთ პროფესიონალებს და დაიქირავეთ საუკეთესო.',
          descriptionRu:
            'Сравните предложения, пообщайтесь и наймите лучшего.',
          icon: 'check-circle',
        },
      ],
      actionUrl: '/post-job',
      actionLabel: 'Post a Job',
      actionLabelKa: 'განცხადების დამატება',
      actionLabelRu: 'Разместить заказ',
    },

    find_professionals: {
      feature: 'find_professionals',
      title: 'Find Professionals',
      titleKa: 'პროფესიონალების პოვნა',
      titleRu: 'Найти специалистов',
      description:
        'Browse verified professionals by category, rating, and price.',
      descriptionKa:
        'დაათვალიერეთ ვერიფიცირებული პროფესიონალები კატეგორიის, რეიტინგისა და ფასის მიხედვით.',
      descriptionRu:
        'Просматривайте верифицированных специалистов по категории, рейтингу и цене.',
      steps: [
        {
          step: 1,
          title: 'Choose a category',
          titleKa: 'აირჩიეთ კატეგორია',
          titleRu: 'Выберите категорию',
          description:
            'Select the type of work you need (plumbing, electrical, renovation, etc.).',
          descriptionKa:
            'აირჩიეთ საჭირო სამუშაოს ტიპი (სანტექნიკა, ელექტრიკა, რემონტი და ა.შ.).',
          descriptionRu:
            'Выберите тип работы (сантехника, электрика, ремонт и т.д.).',
          icon: 'grid',
        },
        {
          step: 2,
          title: 'Filter and sort',
          titleKa: 'გაფილტრეთ და დაალაგეთ',
          titleRu: 'Фильтруйте и сортируйте',
          description:
            'Filter by rating, price range, and service area. Sort by rating or reviews.',
          descriptionKa:
            'გაფილტრეთ რეიტინგით, ფასით და მომსახურების არეალით. დაალაგეთ რეიტინგით ან შეფასებებით.',
          descriptionRu:
            'Фильтруйте по рейтингу, цене и зоне обслуживания. Сортируйте по рейтингу или отзывам.',
          icon: 'sliders',
        },
        {
          step: 3,
          title: 'View profiles',
          titleKa: 'ნახეთ პროფილები',
          titleRu: 'Просмотрите профили',
          description:
            'Check portfolios, reviews, completed jobs, and pricing.',
          descriptionKa:
            'ნახეთ პორტფოლიოები, შეფასებები, შესრულებული სამუშაოები და ფასები.',
          descriptionRu:
            'Смотрите портфолио, отзывы, выполненные работы и цены.',
          icon: 'user',
        },
        {
          step: 4,
          title: 'Contact directly',
          titleKa: 'დაუკავშირდით პირდაპირ',
          titleRu: 'Свяжитесь напрямую',
          description:
            'Message professionals directly or request a quote.',
          descriptionKa:
            'მიწერეთ პროფესიონალებს პირდაპირ ან მოითხოვეთ შეთავაზება.',
          descriptionRu:
            'Напишите специалистам напрямую или запросите предложение.',
          icon: 'message-circle',
        },
      ],
      actionUrl: '/professionals',
      actionLabel: 'Browse Professionals',
      actionLabelKa: 'პროფესიონალების ნახვა',
      actionLabelRu: 'Найти специалистов',
    },

    pricing: {
      feature: 'pricing',
      title: 'Pricing Information',
      titleKa: 'ფასების ინფორმაცია',
      titleRu: 'Информация о ценах',
      description:
        'Homico is free for homeowners. Professionals have flexible pricing.',
      descriptionKa:
        'Homico უფასოა სახლის მფლობელებისთვის. პროფესიონალებს აქვთ მოქნილი ფასები.',
      descriptionRu:
        'Homico бесплатен для домовладельцев. У специалистов гибкие цены.',
      steps: [
        {
          step: 1,
          title: 'Free for homeowners',
          titleKa: 'უფასო მფლობელებისთვის',
          titleRu: 'Бесплатно для домовладельцев',
          description:
            'Browse professionals, post jobs, and receive quotes at no cost.',
          descriptionKa:
            'დაათვალიერეთ პროფესიონალები, განათავსეთ განცხადებები და მიიღეთ შეთავაზებები უფასოდ.',
          descriptionRu:
            'Просматривайте специалистов, размещайте заказы и получайте предложения бесплатно.',
          icon: 'gift',
        },
        {
          step: 2,
          title: 'Transparent professional pricing',
          titleKa: 'გამჭვირვალე ფასები',
          titleRu: 'Прозрачные цены специалистов',
          description:
            'Professionals display their price ranges on their profiles.',
          descriptionKa:
            'პროფესიონალები აჩვენებენ ფასების დიაპაზონებს თავიანთ პროფილებზე.',
          descriptionRu:
            'Специалисты показывают диапазоны цен в своих профилях.',
          icon: 'tag',
        },
        {
          step: 3,
          title: 'Get multiple quotes',
          titleKa: 'მიიღეთ რამდენიმე შეთავაზება',
          titleRu: 'Получите несколько предложений',
          description:
            'Post a job and compare quotes from different professionals.',
          descriptionKa:
            'განათავსეთ განცხადება და შეადარეთ შეთავაზებები სხვადასხვა პროფესიონალებისგან.',
          descriptionRu:
            'Разместите заказ и сравните предложения от разных специалистов.',
          icon: 'layers',
        },
      ],
      actionUrl: '/tools/prices',
      actionLabel: 'View Pricing',
      actionLabelKa: 'ფასების ნახვა',
      actionLabelRu: 'Посмотреть цены',
    },

    verification: {
      feature: 'verification',
      title: 'Verification Process',
      titleKa: 'ვერიფიკაციის პროცესი',
      titleRu: 'Процесс верификации',
      description:
        'Verified professionals have confirmed their identity and credentials.',
      descriptionKa:
        'ვერიფიცირებულ პროფესიონალებს დადასტურებული აქვთ თავიანთი პირადობა და კვალიფიკაცია.',
      descriptionRu:
        'Верифицированные специалисты подтвердили личность и квалификацию.',
      steps: [
        {
          step: 1,
          title: 'ID verification',
          titleKa: 'პირადობის დადასტურება',
          titleRu: 'Подтверждение личности',
          description:
            'Professionals upload government-issued ID documents.',
          descriptionKa:
            'პროფესიონალები ტვირთავენ სამთავრობო პირადობის დოკუმენტებს.',
          descriptionRu:
            'Специалисты загружают государственные удостоверения личности.',
          icon: 'id-card',
        },
        {
          step: 2,
          title: 'Phone verification',
          titleKa: 'ტელეფონის დადასტურება',
          titleRu: 'Подтверждение телефона',
          description:
            'Phone number is verified via SMS code.',
          descriptionKa:
            'ტელეფონის ნომერი დადასტურებულია SMS კოდით.',
          descriptionRu:
            'Номер телефона подтверждён SMS-кодом.',
          icon: 'phone',
        },
        {
          step: 3,
          title: 'Profile review',
          titleKa: 'პროფილის განხილვა',
          titleRu: 'Проверка профиля',
          description:
            'Our team reviews the profile for completeness and accuracy.',
          descriptionKa:
            'ჩვენი გუნდი ამოწმებს პროფილს სისრულეზე და სიზუსტეზე.',
          descriptionRu:
            'Наша команда проверяет профиль на полноту и точность.',
          icon: 'shield-check',
        },
        {
          step: 4,
          title: 'Verified badge',
          titleKa: 'ვერიფიცირებული ბეჯი',
          titleRu: 'Значок верификации',
          description:
            'Approved professionals receive the blue verified badge.',
          descriptionKa:
            'დამტკიცებული პროფესიონალები იღებენ ლურჯ ვერიფიცირებულ ბეჯს.',
          descriptionRu:
            'Одобренные специалисты получают синий значок верификации.',
          icon: 'badge-check',
        },
      ],
      actionUrl: '/pro/verification',
      actionLabel: 'Get Verified',
      actionLabelKa: 'გაიარეთ ვერიფიკაცია',
      actionLabelRu: 'Пройти верификацию',
    },

    messaging: {
      feature: 'messaging',
      title: 'Messaging',
      titleKa: 'შეტყობინებები',
      titleRu: 'Сообщения',
      description:
        'Communicate directly with professionals through the platform.',
      descriptionKa:
        'დაუკავშირდით პირდაპირ პროფესიონალებს პლატფორმის საშუალებით.',
      descriptionRu:
        'Общайтесь напрямую со специалистами через платформу.',
      steps: [
        {
          step: 1,
          title: 'Start a conversation',
          titleKa: 'დაიწყეთ საუბარი',
          titleRu: 'Начните разговор',
          description:
            'Message professionals from their profile or from a job proposal.',
          descriptionKa:
            'მიწერეთ პროფესიონალებს მათი პროფილიდან ან სამუშაოს შეთავაზებიდან.',
          descriptionRu:
            'Напишите специалисту с его профиля или из предложения.',
          icon: 'message-circle',
        },
        {
          step: 2,
          title: 'Share details',
          titleKa: 'გააზიარეთ დეტალები',
          titleRu: 'Поделитесь деталями',
          description:
            'Share photos, documents, and project details in the chat.',
          descriptionKa:
            'გააზიარეთ ფოტოები, დოკუმენტები და პროექტის დეტალები ჩატში.',
          descriptionRu:
            'Делитесь фото, документами и деталями проекта в чате.',
          icon: 'paperclip',
        },
        {
          step: 3,
          title: 'Get notifications',
          titleKa: 'მიიღეთ შეტყობინებები',
          titleRu: 'Получайте уведомления',
          description:
            'Receive notifications when professionals respond.',
          descriptionKa:
            'მიიღეთ შეტყობინებები როცა პროფესიონალები გიპასუხებენ.',
          descriptionRu:
            'Получайте уведомления, когда специалисты отвечают.',
          icon: 'bell',
        },
      ],
      actionUrl: '/messages',
      actionLabel: 'Go to Messages',
      actionLabelKa: 'შეტყობინებებზე გადასვლა',
      actionLabelRu: 'Перейти к сообщениям',
    },

    proposals: {
      feature: 'proposals',
      title: 'Job Proposals',
      titleKa: 'სამუშაო შეთავაზებები',
      titleRu: 'Предложения по заказам',
      description:
        'Receive and compare proposals from professionals for your job.',
      descriptionKa:
        'მიიღეთ და შეადარეთ შეთავაზებები პროფესიონალებისგან თქვენი სამუშაოსთვის.',
      descriptionRu:
        'Получайте и сравнивайте предложения от специалистов для вашего заказа.',
      steps: [
        {
          step: 1,
          title: 'Post your job',
          titleKa: 'განათავსეთ განცხადება',
          titleRu: 'Разместите заказ',
          description:
            'Describe what you need and set your budget.',
          descriptionKa:
            'აღწერეთ რა გჭირდებათ და დააყენეთ ბიუჯეტი.',
          descriptionRu:
            'Опишите, что нужно, и укажите бюджет.',
          icon: 'file-plus',
        },
        {
          step: 2,
          title: 'Receive proposals',
          titleKa: 'მიიღეთ შეთავაზებები',
          titleRu: 'Получите предложения',
          description:
            'Professionals will send proposals with pricing and timeline.',
          descriptionKa:
            'პროფესიონალები გამოგიგზავნიან შეთავაზებებს ფასებითა და ვადებით.',
          descriptionRu:
            'Специалисты отправят предложения с ценами и сроками.',
          icon: 'inbox',
        },
        {
          step: 3,
          title: 'Compare and choose',
          titleKa: 'შეადარეთ და აირჩიეთ',
          titleRu: 'Сравните и выберите',
          description:
            'Review profiles, ratings, and prices to make your choice.',
          descriptionKa:
            'გადახედეთ პროფილებს, რეიტინგებს და ფასებს არჩევანის გასაკეთებლად.',
          descriptionRu:
            'Изучите профили, рейтинги и цены, чтобы сделать выбор.',
          icon: 'check-square',
        },
        {
          step: 4,
          title: 'Accept and proceed',
          titleKa: 'დაეთანხმეთ და გააგრძელეთ',
          titleRu: 'Примите и продолжите',
          description:
            'Accept a proposal to start working with the professional.',
          descriptionKa:
            'დაეთანხმეთ შეთავაზებას პროფესიონალთან მუშაობის დასაწყებად.',
          descriptionRu:
            'Примите предложение, чтобы начать работу со специалистом.',
          icon: 'handshake',
        },
      ],
      actionUrl: '/jobs',
      actionLabel: 'View My Jobs',
      actionLabelKa: 'ჩემი განცხადებები',
      actionLabelRu: 'Мои заказы',
    },

    reviews: {
      feature: 'reviews',
      title: 'Reviews',
      titleKa: 'შეფასებები',
      titleRu: 'Отзывы',
      description:
        'Read and write reviews to help the community make informed decisions.',
      descriptionKa:
        'წაიკითხეთ და დაწერეთ შეფასებები საზოგადოების ინფორმირებული გადაწყვეტილებების მისაღებად.',
      descriptionRu:
        'Читайте и пишите отзывы, чтобы помочь сообществу принимать решения.',
      steps: [
        {
          step: 1,
          title: 'Complete a job',
          titleKa: 'დაასრულეთ სამუშაო',
          titleRu: 'Завершите работу',
          description:
            'Reviews can be left after a job is marked complete.',
          descriptionKa:
            'შეფასებები შეიძლება დატოვოთ სამუშაოს დასრულების შემდეგ.',
          descriptionRu:
            'Отзывы можно оставить после завершения работы.',
          icon: 'check-circle',
        },
        {
          step: 2,
          title: 'Rate your experience',
          titleKa: 'შეაფასეთ გამოცდილება',
          titleRu: 'Оцените опыт',
          description:
            'Give a 1-5 star rating and write about your experience.',
          descriptionKa:
            'მიეცით 1-5 ვარსკვლავი და დაწერეთ თქვენი გამოცდილების შესახებ.',
          descriptionRu:
            'Поставьте оценку от 1 до 5 звёзд и напишите об опыте.',
          icon: 'star',
        },
        {
          step: 3,
          title: 'Add photos (optional)',
          titleKa: 'დაამატეთ ფოტოები (არასავალდებულო)',
          titleRu: 'Добавьте фото (необязательно)',
          description:
            'Upload photos of the completed work.',
          descriptionKa:
            'ატვირთეთ ფოტოები დასრულებული სამუშაოს.',
          descriptionRu:
            'Загрузите фото завершённой работы.',
          icon: 'camera',
        },
        {
          step: 4,
          title: 'Help others',
          titleKa: 'დაეხმარეთ სხვებს',
          titleRu: 'Помогите другим',
          description:
            'Your review helps other homeowners make better choices.',
          descriptionKa:
            'თქვენი შეფასება ეხმარება სხვა მფლობელებს უკეთესი არჩევანის გაკეთებაში.',
          descriptionRu:
            'Ваш отзыв поможет другим домовладельцам сделать лучший выбор.',
          icon: 'users',
        },
      ],
      actionUrl: '/reviews',
      actionLabel: 'View Reviews',
      actionLabelKa: 'შეფასებების ნახვა',
      actionLabelRu: 'Посмотреть отзывы',
    },

    portfolio: {
      feature: 'portfolio',
      title: 'Professional Portfolio',
      titleKa: 'პროფესიონალის პორტფოლიო',
      titleRu: 'Портфолио специалиста',
      description:
        'View before/after photos and completed projects from professionals.',
      descriptionKa:
        'ნახეთ "მანამდე და შემდეგ" ფოტოები და დასრულებული პროექტები პროფესიონალებისგან.',
      descriptionRu:
        'Смотрите фото "до и после" и завершённые проекты от специалистов.',
      steps: [
        {
          step: 1,
          title: 'Browse portfolios',
          titleKa: 'დაათვალიერეთ პორტფოლიოები',
          titleRu: 'Просмотрите портфолио',
          description:
            'View project photos on professional profiles.',
          descriptionKa:
            'ნახეთ პროექტის ფოტოები პროფესიონალების პროფილებზე.',
          descriptionRu:
            'Смотрите фото проектов в профилях специалистов.',
          icon: 'image',
        },
        {
          step: 2,
          title: 'See before/after',
          titleKa: 'ნახეთ მანამდე/შემდეგ',
          titleRu: 'Смотрите до/после',
          description:
            'Compare before and after photos of completed work.',
          descriptionKa:
            'შეადარეთ სამუშაოს ფოტოები დაწყებამდე და დასრულების შემდეგ.',
          descriptionRu:
            'Сравните фото работ до и после завершения.',
          icon: 'columns',
        },
        {
          step: 3,
          title: 'Read project details',
          titleKa: 'წაიკითხეთ პროექტის დეტალები',
          titleRu: 'Читайте детали проекта',
          description:
            'Learn about the scope, materials, and timeline of projects.',
          descriptionKa:
            'გაიგეთ პროექტების მოცულობის, მასალებისა და ვადების შესახებ.',
          descriptionRu:
            'Узнайте об объёме, материалах и сроках проектов.',
          icon: 'file-text',
        },
      ],
      actionUrl: '/portfolio',
      actionLabel: 'View Portfolios',
      actionLabelKa: 'პორტფოლიოების ნახვა',
      actionLabelRu: 'Посмотреть портфолио',
    },

    how_it_works: {
      feature: 'how_it_works',
      title: 'How Homico Works',
      titleKa: 'როგორ მუშაობს Homico',
      titleRu: 'Как работает Homico',
      description:
        'Homico connects homeowners with verified renovation professionals.',
      descriptionKa:
        'Homico აკავშირებს სახლის მფლობელებს ვერიფიცირებულ რემონტის პროფესიონალებთან.',
      descriptionRu:
        'Homico соединяет домовладельцев с верифицированными специалистами по ремонту.',
      steps: [
        {
          step: 1,
          title: 'Post or Browse',
          titleKa: 'განათავსეთ ან დაათვალიერეთ',
          titleRu: 'Разместите или ищите',
          description:
            'Post a job or browse professionals by category.',
          descriptionKa:
            'განათავსეთ განცხადება ან დაათვალიერეთ პროფესიონალები კატეგორიით.',
          descriptionRu:
            'Разместите заказ или ищите специалистов по категории.',
          icon: 'search',
        },
        {
          step: 2,
          title: 'Compare Options',
          titleKa: 'შეადარეთ ვარიანტები',
          titleRu: 'Сравните варианты',
          description:
            'Review profiles, portfolios, reviews, and pricing.',
          descriptionKa:
            'გადახედეთ პროფილებს, პორტფოლიოებს, შეფასებებს და ფასებს.',
          descriptionRu:
            'Изучите профили, портфолио, отзывы и цены.',
          icon: 'bar-chart',
        },
        {
          step: 3,
          title: 'Connect Directly',
          titleKa: 'დაუკავშირდით პირდაპირ',
          titleRu: 'Свяжитесь напрямую',
          description:
            'Message professionals and discuss your project.',
          descriptionKa:
            'მიწერეთ პროფესიონალებს და განიხილეთ თქვენი პროექტი.',
          descriptionRu:
            'Напишите специалистам и обсудите проект.',
          icon: 'message-circle',
        },
        {
          step: 4,
          title: 'Hire with Confidence',
          titleKa: 'დაიქირავეთ დარწმუნებით',
          titleRu: 'Нанимайте уверенно',
          description:
            'Choose the best professional for your needs.',
          descriptionKa:
            'აირჩიეთ საუკეთესო პროფესიონალი თქვენი საჭიროებებისთვის.',
          descriptionRu:
            'Выберите лучшего специалиста для своих нужд.',
          icon: 'check-circle',
        },
      ],
      actionUrl: '/',
      actionLabel: 'Get Started',
      actionLabelKa: 'დაიწყეთ',
      actionLabelRu: 'Начать',
    },

    tools: {
      feature: 'tools',
      title: 'Renovation Tools',
      titleKa: 'რემონტის ხელსაწყოები',
      titleRu: 'Инструменты для ремонта',
      description:
        'Free tools to help you plan, estimate, and compare renovation costs.',
      descriptionKa:
        'უფასო ხელსაწყოები რემონტის დაგეგმვის, ხარჯების შეფასებისა და შედარებისთვის.',
      descriptionRu:
        'Бесплатные инструменты для планирования, оценки и сравнения затрат на ремонт.',
      steps: [
        {
          step: 1,
          title: 'Estimate Analyzer',
          titleKa: 'შეფასების ანალიზატორი',
          titleRu: 'Анализатор сметы',
          description:
            'Upload contractor estimates to analyze prices against market averages.',
          descriptionKa:
            'ატვირთეთ კონტრაქტორის შეფასებები ფასების გასაანალიზებლად საბაზრო საშუალოსთან მიმართებაში.',
          descriptionRu:
            'Загрузите сметы подрядчиков для анализа цен относительно рыночных средних.',
          icon: 'file-search',
        },
        {
          step: 2,
          title: 'Price Database',
          titleKa: 'ფასების მონაცემთა ბაზა',
          titleRu: 'База данных цен',
          description:
            'Browse renovation service prices by category to know market rates.',
          descriptionKa:
            'დაათვალიერეთ რემონტის სერვისების ფასები კატეგორიების მიხედვით საბაზრო ფასების გასაგებად.',
          descriptionRu:
            'Просматривайте цены на ремонтные услуги по категориям для понимания рыночных ставок.',
          icon: 'database',
        },
        {
          step: 3,
          title: 'Cost Calculator',
          titleKa: 'ხარჯების კალკულატორი',
          titleRu: 'Калькулятор стоимости',
          description:
            'Calculate estimated renovation costs based on your project details.',
          descriptionKa:
            'გამოთვალეთ სავარაუდო რემონტის ღირებულება თქვენი პროექტის დეტალების მიხედვით.',
          descriptionRu:
            'Рассчитайте примерную стоимость ремонта на основе деталей вашего проекта.',
          icon: 'calculator',
        },
        {
          step: 4,
          title: 'Estimate Comparison',
          titleKa: 'შეფასებების შედარება',
          titleRu: 'Сравнение смет',
          description:
            'Compare estimates from multiple contractors side by side.',
          descriptionKa:
            'შეადარეთ სხვადასხვა კონტრაქტორის შეფასებები ერთმანეთს.',
          descriptionRu:
            'Сравните сметы от разных подрядчиков рядом друг с другом.',
          icon: 'scale',
        },
      ],
      actionUrl: '/tools',
      actionLabel: 'Open Tools',
      actionLabelKa: 'ხელსაწყოების გახსნა',
      actionLabelRu: 'Открыть инструменты',
    },

    tool_analyzer: {
      feature: 'tool_analyzer',
      title: 'Estimate Analyzer',
      titleKa: 'შეფასების ანალიზატორი',
      titleRu: 'Анализатор сметы',
      description:
        'Upload your renovation estimate to check if prices are fair compared to market averages.',
      descriptionKa:
        'ატვირთეთ თქვენი რემონტის შეფასება და შეამოწმეთ ფასები საბაზრო საშუალოსთან მიმართებაში.',
      descriptionRu:
        'Загрузите вашу смету на ремонт, чтобы проверить справедливость цен по сравнению с рыночными средними.',
      steps: [
        {
          step: 1,
          title: 'Upload estimate',
          titleKa: 'ატვირთეთ შეფასება',
          titleRu: 'Загрузите смету',
          description:
            'Upload Excel, PDF, or image of your contractor estimate.',
          descriptionKa:
            'ატვირთეთ Excel, PDF ან ფოტო თქვენი კონტრაქტორის შეფასებიდან.',
          descriptionRu:
            'Загрузите Excel, PDF или фото сметы от подрядчика.',
          icon: 'upload',
        },
        {
          step: 2,
          title: 'AI analyzes prices',
          titleKa: 'AI აანალიზებს ფასებს',
          titleRu: 'ИИ анализирует цены',
          description:
            'Our AI compares each line item against market average prices.',
          descriptionKa:
            'ჩვენი AI ადარებს თითოეულ პოზიციას საბაზრო საშუალო ფასებთან.',
          descriptionRu:
            'Наш ИИ сравнивает каждую позицию со средними рыночными ценами.',
          icon: 'sparkles',
        },
        {
          step: 3,
          title: 'See alerts',
          titleKa: 'ნახეთ გაფრთხილებები',
          titleRu: 'Смотрите предупреждения',
          description:
            'Get alerts for overpriced items, missing prices, and potential savings.',
          descriptionKa:
            'მიიღეთ გაფრთხილებები გადაჭარბებულ ფასებზე, გამოტოვებულ ფასებზე და პოტენციურ დაზოგვაზე.',
          descriptionRu:
            'Получите предупреждения о завышенных ценах, отсутствующих ценах и потенциальной экономии.',
          icon: 'alert-triangle',
        },
        {
          step: 4,
          title: 'Negotiate better',
          titleKa: 'მოაწყვეთ უკეთესი მოლაპარაკება',
          titleRu: 'Договоритесь лучше',
          description:
            'Use insights to negotiate fair prices with your contractor.',
          descriptionKa:
            'გამოიყენეთ შედეგები სამართლიანი ფასების მოსალაპარაკებლად კონტრაქტორთან.',
          descriptionRu:
            'Используйте результаты для переговоров о справедливых ценах с подрядчиком.',
          icon: 'handshake',
        },
      ],
      actionUrl: '/tools/analyzer',
      actionLabel: 'Analyze Estimate',
      actionLabelKa: 'შეფასების ანალიზი',
      actionLabelRu: 'Анализировать смету',
    },

    tool_prices: {
      feature: 'tool_prices',
      title: 'Price Database',
      titleKa: 'ფასების მონაცემთა ბაზა',
      titleRu: 'База данных цен',
      description:
        'Browse current market prices for renovation services in Georgia.',
      descriptionKa:
        'დაათვალიერეთ მიმდინარე საბაზრო ფასები რემონტის სერვისებზე საქართველოში.',
      descriptionRu:
        'Просматривайте текущие рыночные цены на ремонтные услуги в Грузии.',
      steps: [
        {
          step: 1,
          title: 'Browse categories',
          titleKa: 'დაათვალიერეთ კატეგორიები',
          titleRu: 'Просмотрите категории',
          description:
            'Filter by category: electrical, plumbing, walls, flooring, painting, etc.',
          descriptionKa:
            'გაფილტრეთ კატეგორიით: ელექტრიკა, სანტექნიკა, კედლები, იატაკი, შეღებვა და ა.შ.',
          descriptionRu:
            'Фильтруйте по категории: электрика, сантехника, стены, полы, покраска и т.д.',
          icon: 'grid',
        },
        {
          step: 2,
          title: 'Search services',
          titleKa: 'მოძებნეთ სერვისები',
          titleRu: 'Ищите услуги',
          description:
            'Search for specific services by name.',
          descriptionKa:
            'მოძებნეთ კონკრეტული სერვისები სახელით.',
          descriptionRu:
            'Ищите конкретные услуги по названию.',
          icon: 'search',
        },
        {
          step: 3,
          title: 'View price ranges',
          titleKa: 'ნახეთ ფასების დიაპაზონი',
          titleRu: 'Смотрите диапазоны цен',
          description:
            'See min/max prices, units (per sqm, per piece, etc.).',
          descriptionKa:
            'ნახეთ მინ/მაქს ფასები, ერთეულები (კვმ-ზე, ცალზე და ა.შ.).',
          descriptionRu:
            'Смотрите мин/макс цены, единицы измерения (за кв.м, за штуку и т.д.).',
          icon: 'tag',
        },
      ],
      actionUrl: '/tools/prices',
      actionLabel: 'View Prices',
      actionLabelKa: 'ფასების ნახვა',
      actionLabelRu: 'Посмотреть цены',
    },

    tool_calculator: {
      feature: 'tool_calculator',
      title: 'Renovation Calculator',
      titleKa: 'რემონტის კალკულატორი',
      titleRu: 'Калькулятор ремонта',
      description:
        'Estimate your renovation costs by entering project details.',
      descriptionKa:
        'შეაფასეთ რემონტის ღირებულება თქვენი პროექტის დეტალების შეყვანით.',
      descriptionRu:
        'Оцените стоимость ремонта, введя детали вашего проекта.',
      steps: [
        {
          step: 1,
          title: 'Enter room details',
          titleKa: 'შეიყვანეთ ოთახის დეტალები',
          titleRu: 'Введите данные помещения',
          description:
            'Specify room dimensions, type (bathroom, kitchen, bedroom).',
          descriptionKa:
            'მიუთითეთ ოთახის ზომები, ტიპი (აბაზანა, სამზარეულო, საძინებელი).',
          descriptionRu:
            'Укажите размеры помещения, тип (ванная, кухня, спальня).',
          icon: 'ruler',
        },
        {
          step: 2,
          title: 'Select work types',
          titleKa: 'აირჩიეთ სამუშაოს ტიპები',
          titleRu: 'Выберите виды работ',
          description:
            'Choose what work you need: electrical, plumbing, walls, flooring, etc.',
          descriptionKa:
            'აირჩიეთ რა სამუშაო გჭირდებათ: ელექტრიკა, სანტექნიკა, კედლები, იატაკი და ა.შ.',
          descriptionRu:
            'Выберите нужные работы: электрика, сантехника, стены, полы и т.д.',
          icon: 'check-square',
        },
        {
          step: 3,
          title: 'Get estimate',
          titleKa: 'მიიღეთ შეფასება',
          titleRu: 'Получите оценку',
          description:
            'See estimated cost range based on current market prices.',
          descriptionKa:
            'ნახეთ სავარაუდო ღირებულების დიაპაზონი მიმდინარე საბაზრო ფასების მიხედვით.',
          descriptionRu:
            'Смотрите примерный диапазон стоимости на основе текущих рыночных цен.',
          icon: 'calculator',
        },
      ],
      actionUrl: '/tools/calculator',
      actionLabel: 'Calculate Cost',
      actionLabelKa: 'ღირებულების გამოთვლა',
      actionLabelRu: 'Рассчитать стоимость',
    },

    tool_compare: {
      feature: 'tool_compare',
      title: 'Estimate Comparison',
      titleKa: 'შეფასებების შედარება',
      titleRu: 'Сравнение смет',
      description:
        'Compare renovation estimates from multiple contractors side by side.',
      descriptionKa:
        'შეადარეთ რემონტის შეფასებები სხვადასხვა კონტრაქტორისგან ერთმანეთს.',
      descriptionRu:
        'Сравните сметы на ремонт от разных подрядчиков рядом друг с другом.',
      steps: [
        {
          step: 1,
          title: 'Upload estimates',
          titleKa: 'ატვირთეთ შეფასებები',
          titleRu: 'Загрузите сметы',
          description:
            'Upload 2-4 contractor estimates for comparison.',
          descriptionKa:
            'ატვირთეთ 2-4 კონტრაქტორის შეფასება შესადარებლად.',
          descriptionRu:
            'Загрузите 2-4 сметы от подрядчиков для сравнения.',
          icon: 'upload',
        },
        {
          step: 2,
          title: 'View comparison',
          titleKa: 'ნახეთ შედარება',
          titleRu: 'Смотрите сравнение',
          description:
            'See prices side by side, category by category.',
          descriptionKa:
            'ნახეთ ფასები გვერდიგვერდ, კატეგორიების მიხედვით.',
          descriptionRu:
            'Смотрите цены рядом друг с другом по категориям.',
          icon: 'columns',
        },
        {
          step: 3,
          title: 'Find best value',
          titleKa: 'იპოვეთ საუკეთესო ღირებულება',
          titleRu: 'Найдите лучшую цену',
          description:
            'Identify which contractor offers the best value for each category.',
          descriptionKa:
            'დაადგინეთ რომელი კონტრაქტორი სთავაზობს საუკეთესო ფასს თითოეული კატეგორიისთვის.',
          descriptionRu:
            'Определите, какой подрядчик предлагает лучшую цену для каждой категории.',
          icon: 'trophy',
        },
        {
          step: 4,
          title: 'Make decision',
          titleKa: 'მიიღეთ გადაწყვეტილება',
          titleRu: 'Примите решение',
          description:
            'Choose the contractor with the best balance of price and quality.',
          descriptionKa:
            'აირჩიეთ კონტრაქტორი ფასისა და ხარისხის საუკეთესო ბალანსით.',
          descriptionRu:
            'Выберите подрядчика с лучшим балансом цены и качества.',
          icon: 'check-circle',
        },
      ],
      actionUrl: '/tools/compare',
      actionLabel: 'Compare Estimates',
      actionLabelKa: 'შეფასებების შედარება',
      actionLabelRu: 'Сравнить сметы',
    },
  },

  faqs: [
    {
      question: {
        en: 'Is Homico free to use?',
        ka: 'უფასოა Homico-ს გამოყენება?',
        ru: 'Бесплатно ли использовать Homico?',
      },
      answer: {
        en: 'Yes! Homico is completely free for homeowners. You can browse professionals, post jobs, and receive quotes at no cost.',
        ka: 'დიახ! Homico სრულიად უფასოა სახლის მფლობელებისთვის. შეგიძლიათ დაათვალიეროთ პროფესიონალები, განათავსოთ განცხადებები და მიიღოთ შეთავაზებები უფასოდ.',
        ru: 'Да! Homico полностью бесплатен для домовладельцев. Вы можете просматривать специалистов, размещать заказы и получать предложения бесплатно.',
      },
      relatedFeature: 'pricing',
    },
    {
      question: {
        en: 'How do I know if a professional is trustworthy?',
        ka: 'როგორ გავიგო, რომ პროფესიონალი სანდოა?',
        ru: 'Как узнать, можно ли доверять специалисту?',
      },
      answer: {
        en: 'Look for the verified badge, read reviews from other clients, check their portfolio, and review their completed jobs count.',
        ka: 'მოძებნეთ ვერიფიცირებული ბეჯი, წაიკითხეთ შეფასებები სხვა კლიენტებისგან, ნახეთ მათი პორტფოლიო და შესრულებული სამუშაოების რაოდენობა.',
        ru: 'Ищите значок верификации, читайте отзывы других клиентов, смотрите портфолио и количество выполненных работ.',
      },
      relatedFeature: 'verification',
    },
    {
      question: {
        en: 'How long does it take to get quotes?',
        ka: 'რამდენ ხანში მივიღებ შეთავაზებებს?',
        ru: 'Сколько времени занимает получение предложений?',
      },
      answer: {
        en: 'Most job posts receive their first proposals within 24 hours. The more details you provide, the faster professionals can respond with accurate quotes.',
        ka: 'უმეტესობა განცხადებები იღებს პირველ შეთავაზებებს 24 საათში. რაც მეტ დეტალს მიაწვდით, მით უფრო სწრაფად შეძლებენ პროფესიონალები ზუსტი შეთავაზებების გაგზავნას.',
        ru: 'Большинство заказов получают первые предложения в течение 24 часов. Чем больше деталей вы укажете, тем быстрее специалисты смогут ответить точными предложениями.',
      },
      relatedFeature: 'proposals',
    },
    {
      question: {
        en: 'Can I contact professionals directly?',
        ka: 'შემიძლია პირდაპირ დავუკავშირდე პროფესიონალებს?',
        ru: 'Могу ли я связаться со специалистами напрямую?',
      },
      answer: {
        en: 'Yes! You can message any professional directly from their profile page or through our messaging system.',
        ka: 'დიახ! შეგიძლიათ მიწეროთ ნებისმიერ პროფესიონალს პირდაპირ მათი პროფილის გვერდიდან ან ჩვენი შეტყობინებების სისტემით.',
        ru: 'Да! Вы можете написать любому специалисту напрямую с его страницы профиля или через нашу систему сообщений.',
      },
      relatedFeature: 'messaging',
    },
    {
      question: {
        en: 'What types of work can I find on Homico?',
        ka: 'რა ტიპის სამუშაოები შემიძლია ვიპოვო Homico-ზე?',
        ru: 'Какие виды работ можно найти на Homico?',
      },
      answer: {
        en: 'Homico covers all home renovation and improvement categories including plumbing, electrical, interior design, general construction, painting, flooring, and more.',
        ka: 'Homico მოიცავს სახლის რემონტისა და გაუმჯობესების ყველა კატეგორიას, მათ შორის სანტექნიკას, ელექტრიკას, ინტერიერის დიზაინს, მშენებლობას, შეღებვას, იატაკის დაგებას და სხვა.',
        ru: 'Homico охватывает все категории ремонта и улучшения дома, включая сантехнику, электрику, дизайн интерьера, строительство, покраску, укладку полов и многое другое.',
      },
      relatedFeature: 'find_professionals',
    },
  ],
};

export function getFeatureExplanation(
  featureKey: FeatureKey,
): FeatureExplanation | null {
  return KNOWLEDGE_BASE.features[featureKey] || null;
}

export function getAllFeatures(): FeatureExplanation[] {
  return Object.values(KNOWLEDGE_BASE.features);
}

export function searchKnowledge(
  query: string,
  locale: 'en' | 'ka' | 'ru' = 'en',
): { features: FeatureExplanation[]; faqs: typeof KNOWLEDGE_BASE.faqs } {
  const queryLower = query.toLowerCase();

  const matchedFeatures = Object.values(KNOWLEDGE_BASE.features).filter(
    (feature) => {
      const title =
        locale === 'ka'
          ? feature.titleKa
          : locale === 'ru'
            ? feature.titleRu
            : feature.title;
      const description =
        locale === 'ka'
          ? feature.descriptionKa
          : locale === 'ru'
            ? feature.descriptionRu
            : feature.description;

      return (
        title?.toLowerCase().includes(queryLower) ||
        description?.toLowerCase().includes(queryLower) ||
        feature.feature.toLowerCase().includes(queryLower)
      );
    },
  );

  const matchedFaqs = KNOWLEDGE_BASE.faqs.filter((faq) => {
    const question = faq.question[locale] || faq.question.en;
    const answer = faq.answer[locale] || faq.answer.en;

    return (
      question.toLowerCase().includes(queryLower) ||
      answer.toLowerCase().includes(queryLower)
    );
  });

  return {
    features: matchedFeatures,
    faqs: matchedFaqs,
  };
}
