function item(itemKey, title, options = {}) {
  return {
    itemKey,
    title,
    subtitle: options.subtitle || null,
    body: options.body || null,
    linkLabel: options.linkLabel || null,
    linkUrl: options.linkUrl || null,
    price: options.price || null,
    badge: options.badge || null,
    metadata: options.metadata || {},
    sortOrder: options.sortOrder,
    isFeatured: options.isFeatured || false,
    isEnabled: options.isEnabled !== false
  };
}

function block(blockKey, blockType, options = {}) {
  return {
    blockKey,
    blockType,
    eyebrow: options.eyebrow || null,
    title: options.title || null,
    lede: options.lede || null,
    body: options.body || null,
    settings: options.settings || {},
    sortOrder: options.sortOrder,
    isEnabled: options.isEnabled !== false,
    items: options.items || []
  };
}

function page(slug, options) {
  return {
    slug,
    template: options.template,
    path: options.path,
    title: options.title,
    metaDescription: options.metaDescription,
    ogTitle: options.ogTitle,
    ogDescription: options.ogDescription,
    canonicalPath: options.canonicalPath,
    headerEyebrow: options.headerEyebrow,
    headerTitle: options.headerTitle,
    headerLede: options.headerLede,
    schemaType: options.schemaType,
    schemaData: options.schemaData || {},
    isPublished: true,
    blocks: options.blocks
  };
}

const baseServiceArea = ['New York City', 'Long Island', 'Northern New Jersey'];
const whatsappQuoteUrl = 'https://wa.me/19298017756?text=Hi%20CamerasNYC%2C%20I%27d%20like%20a%20free%20quote.';

const settings = {
  business: {
    name: 'CamerasNYC',
    legalName: 'CamerasNYC LLC',
    phoneDisplay: '929-801-7756',
    phoneNumber: '+19298017756',
    phoneHref: 'tel:+19298017756',
    whatsappNumber: '19298017756',
    whatsappQuoteUrl,
    office: 'Brooklyn, NY',
    officeNote: 'By appointment only',
    serviceArea: 'NYC, Long Island, and Northern NJ',
    priceRange: '$$',
    reviewRating: '4.9',
    reviewCount: '187',
    installCount: '500+',
    credentials: [
      { label: 'NY DOS', value: '#12000310924' },
      { label: 'NJ Lic', value: '#34BX01200123' },
      { label: 'BBB', value: 'A+ Rated' }
    ]
  },
  navigation: {
    brand: 'CamerasNYC',
    links: [
      { label: 'Residential', href: 'residential.html', slug: 'residential' },
      { label: 'Commercial', href: 'commercial.html', slug: 'commercial' },
      { label: 'Services', href: 'services.html', slug: 'services' },
      { label: 'About', href: 'about.html', slug: 'about' },
      { label: 'Contact', href: 'contact.html', slug: 'contact' }
    ],
    phoneLabel: 'Call',
    ctaLabel: 'Free Quote',
    ctaHref: 'contact.html'
  },
  footer: {
    about: 'Locally-owned security camera installation for homes and businesses across NYC, Long Island, and Northern NJ.',
    copyright: 'CamerasNYC LLC. All rights reserved.',
    columns: [
      {
        title: 'Services',
        links: [
          { label: 'Residential', href: 'residential.html' },
          { label: 'Commercial', href: 'commercial.html' },
          { label: 'How we work', href: 'services.html' },
          { label: 'Maintenance', href: 'services.html#maintenance' }
        ]
      },
      {
        title: 'Company',
        links: [
          { label: 'About', href: 'about.html' },
          { label: 'Contact', href: 'contact.html' },
          { label: 'Free quote', href: 'contact.html' }
        ]
      },
      {
        title: 'Coverage',
        items: ['Brooklyn', 'Queens', 'Nassau / Suffolk', 'Bergen / Hudson']
      },
      {
        title: 'Contact',
        links: [
          { label: '929-801-7756', href: 'tel:+19298017756' },
          { label: 'WhatsApp', href: whatsappQuoteUrl }
        ],
        items: ['Brooklyn, NY - By appointment']
      }
    ],
    credentials: ['NY DOS #12000310924', 'NJ Lic #34BX01200123', 'BBB A+']
  },
  trust_bar: {
    items: ['Licensed & Insured', '4.9 on Google', 'NYC - Long Island - New Jersey']
  },
  contact: {
    phoneDisplay: '929-801-7756',
    phoneHref: 'tel:+19298017756',
    whatsappLabel: 'Message on WhatsApp',
    whatsappHref: whatsappQuoteUrl,
    hours: 'Mon-Sat, 8am-7pm',
    voicemail: 'Voicemail returned same day.',
    serviceArea: 'NYC - Long Island - Northern NJ. Outside that radius for jobs of 10+ cameras - ask.',
    responseTime: 'Quotes: within 24 hours. Emergency / same-day: call directly.',
    office: 'Brooklyn, NY',
    officeNote: 'By appointment only.',
    formEndpoint: 'https://formspree.io/f/YOUR_FORM_ID'
  },
  seo_defaults: {
    baseUrl: 'https://camerasnyc.com',
    ogImage: 'https://camerasnyc.com/assets/images/og-image.png',
    twitterCard: 'summary_large_image',
    themeColor: '#faf6ef'
  }
};

const pages = {
  home: page('home', {
    template: 'home',
    path: '/',
    title: 'Security Camera Installation in NYC, Long Island & NJ | CamerasNYC',
    metaDescription: 'Locally-owned security camera sales and installation for homes and businesses across NYC, Long Island, and New Jersey. Free quote, same-day service, licensed & insured.',
    ogTitle: 'Security Camera Installation in NYC, Long Island & NJ | CamerasNYC',
    ogDescription: 'Locally-owned security camera sales and installation for homes and businesses across NYC, Long Island, and New Jersey.',
    canonicalPath: '/',
    headerEyebrow: 'Security cameras · NYC, LI, NJ',
    headerTitle: 'Cameras that actually watch. Installed right the first time.',
    headerLede: 'Locally-owned. Cleanly wired. No call centers, no 36-month contracts. We design and install professional camera systems for homes and businesses across the tri-state.',
    schemaType: 'LocalBusiness',
    schemaData: {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': 'https://camerasnyc.com/#business',
      name: 'CamerasNYC',
      url: 'https://camerasnyc.com/',
      image: 'https://camerasnyc.com/assets/images/og-image.png',
      telephone: '+19298017756',
      priceRange: '$$',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Brooklyn',
        addressRegion: 'NY',
        addressCountry: 'US'
      },
      areaServed: [
        { '@type': 'City', name: 'New York' },
        { '@type': 'AdministrativeArea', name: 'Long Island' },
        { '@type': 'AdministrativeArea', name: 'Northern New Jersey' }
      ],
      openingHoursSpecification: [{
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        opens: '08:00',
        closes: '19:00'
      }],
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        reviewCount: '187'
      }
    },
    blocks: [
      block('hero', 'hero', {
        eyebrow: 'Security cameras · NYC, LI, NJ',
        title: 'Cameras that actually watch. Installed right the first time.',
        lede: 'Locally-owned. Cleanly wired. No call centers, no 36-month contracts. We design and install professional camera systems for homes and businesses across the tri-state.',
        settings: {
          imagePlaceholder: 'hero-front-porch-doorbell',
          imageSlot: 'hero',
          placeholderClass: 'photo-ph--dusk',
          imageCaption: ['Placeholder - front door at dusk', 'Swap in real photo'],
          primaryCta: { label: 'Get a free quote', href: 'contact.html' },
          secondaryCta: { label: 'WhatsApp us', href: whatsappQuoteUrl }
        },
        sortOrder: 10,
        items: [
          item('homes-secured', '500+ homes secured', { metadata: { value: '500+', label: 'homes secured' }, sortOrder: 10 }),
          item('google-rating', '4.9 on Google', { metadata: { value: '4.9', label: 'on Google' }, sortOrder: 20 }),
          item('same-day', 'Same-day emergency service', { metadata: { value: 'Same-day', label: 'emergency service' }, sortOrder: 30 })
        ]
      }),
      block('systems', 'two_track', {
        eyebrow: 'Pick your path',
        title: 'Two operations. One installer.',
        lede: "Home security and commercial surveillance look similar from outside. They're not. Start in the right place.",
        sortOrder: 20,
        items: [
          item('residential', 'Residential', {
            body: 'Doorbell, outdoor, indoor, and whole-home camera systems for homeowners and renters.',
            linkLabel: 'Explore home systems',
            linkUrl: 'residential.html',
            metadata: {
              audience: 'For homeowners',
              imagePlaceholder: 'residential-doorbell',
              imageSlot: 'home.two_track.residential',
              placeholderClass: 'photo-ph--porch',
              bullets: [
                'Doorbell, outdoor, and indoor cameras',
                'Phone alerts, cloud or local recording',
                'Alexa, Google Home, and Apple Home compatible',
                'Renter-friendly options - no permanent drilling required'
              ]
            },
            sortOrder: 10
          }),
          item('commercial', 'Commercial', {
            body: 'Multi-site surveillance, NVR storage, access control readiness, and commercial documentation.',
            linkLabel: 'Request a site survey',
            linkUrl: 'commercial.html',
            metadata: {
              audience: 'For businesses',
              imagePlaceholder: 'commercial-storefront',
              imageSlot: 'home.two_track.commercial',
              placeholderClass: 'photo-ph--storefront',
              bullets: [
                'Multi-site management, retail, hospitality, warehouse',
                'NVR + cloud hybrid storage, 30-90 day retention',
                'Access control integration on request',
                'NDAA-compliant equipment for regulated industries'
              ]
            },
            sortOrder: 20
          })
        ]
      }),
      block('included', 'feature_grid', {
        eyebrow: "What's included",
        title: 'What you actually get when you hire us.',
        sortOrder: 30,
        items: [
          item('survey', 'Free site survey', {
            subtitle: '01 / Survey',
            body: 'We walk the property, sketch coverage, and show you where each camera should sit and why.',
            sortOrder: 10
          }),
          item('install', 'Clean installation', {
            subtitle: '02 / Install',
            body: 'Cable runs concealed, conduit where it matters, no exposed wires across your siding.',
            sortOrder: 20
          }),
          item('setup', 'App & remote viewing', {
            subtitle: '03 / Setup',
            body: 'We configure mobile alerts, motion zones, and remote login before we pack up.',
            sortOrder: 30
          }),
          item('support', 'Lifetime tech support', {
            subtitle: '04 / Support',
            body: 'Call us when wifi dies, when you upgrade your router, or when a camera comes loose. Same number, same person.',
            sortOrder: 40
          })
        ]
      }),
      block('why_local', 'rich_text', {
        eyebrow: 'Why local',
        title: 'The chains have call centers. We have a phone.',
        body: 'National security companies are built for scale, not service. When something goes wrong - and at some point, something will - you want the person who installed it on the line, not a queue in another state.',
        settings: {
          imagePlaceholder: 'local-installer-photo',
          imageSlot: 'home.why_local',
          placeholderClass: 'photo-ph--interior',
          imageTag: 'Local crew',
          imageCaption: ['Placeholder - installer on a job', 'Swap in real photo'],
          credentials: ['NY DOS #12000310924', 'NJ Lic. #34BX01200123', 'BBB A+ Rated']
        },
        sortOrder: 40,
        items: [
          item('phone', 'We answer the phone.', {
            subtitle: '01',
            body: "A real number. A real installer. If we can't pick up live, we call back the same day.",
            sortOrder: 10
          }),
          item('licensed', "We're licensed in NY and NJ.", {
            subtitle: '02',
            body: 'Every install is permitted, properly grounded, and code-compliant. Insurance carriers accept our paperwork.',
            sortOrder: 20
          }),
          item('service', 'We service what we sell.', {
            subtitle: '03',
            body: 'No subcontracted preferred technicians. The team that installs your system is the team you see again.',
            sortOrder: 30
          })
        ]
      }),
      block('service_area', 'feature_grid', {
        eyebrow: 'Service area',
        title: 'From Bay Ridge to Bergen County.',
        lede: "We cover the five boroughs, both Long Island counties, and the inner ring of North Jersey. If your zip isn't on the list, ask.",
        settings: {
          mapLabel: 'Stylized map of NYC, Long Island, and northern New Jersey service area'
        },
        sortOrder: 50,
        items: [
          item('nyc', 'New York City', { metadata: { areas: ['Brooklyn', 'Queens', 'Manhattan', 'The Bronx', 'Staten Island'] }, sortOrder: 10 }),
          item('long-island', 'Long Island', { metadata: { areas: ['Nassau County', 'Suffolk County', 'Long Beach', 'Hempstead', 'Huntington'] }, sortOrder: 20 }),
          item('north-nj', 'Northern NJ', { metadata: { areas: ['Bergen County', 'Hudson County', 'Essex County', 'Union County', 'Passaic County'] }, sortOrder: 30 }),
          item('response-time', 'Response time', { metadata: { areas: ['Quote: within 24 hours', 'Survey: 2-5 days', 'Install: 1-2 weeks', 'Emergency: same-day'] }, sortOrder: 40 })
        ]
      }),
      block('recent_work', 'case_studies', {
        eyebrow: 'Recent work',
        title: 'A few from the last 90 days.',
        settings: { cta: { label: 'Talk about yours', href: 'contact.html' } },
        sortOrder: 60,
        items: [
          item('bay-ridge-hardware', 'Hardware store - 12-camera multi-angle', {
            subtitle: 'Bay Ridge, Brooklyn',
            metadata: {
              imagePlaceholder: 'install-bay-ridge',
              imageSlot: 'home.recent_work.bay_ridge',
              placeholderClass: 'photo-ph--brick'
            },
            sortOrder: 10
          }),
          item('glen-cove-home', 'Whole-home with doorbell & floodcam', {
            subtitle: 'Glen Cove, Long Island',
            metadata: {
              imagePlaceholder: 'install-glen-cove',
              imageSlot: 'home.recent_work.glen_cove',
              placeholderClass: 'photo-ph--garden'
            },
            sortOrder: 20
          }),
          item('jersey-city-lobby', '3-building lobby & perimeter retrofit', {
            subtitle: 'Jersey City, NJ',
            metadata: {
              imagePlaceholder: 'install-jersey-city',
              imageSlot: 'home.recent_work.jersey_city',
              placeholderClass: 'photo-ph--lobby'
            },
            sortOrder: 30
          })
        ]
      }),
      block('quote_cta', 'cta_band', {
        title: 'Get a quote in 24 hours.',
        lede: "Tell us where you are and what you're trying to cover. We'll come look.",
        settings: {
          actions: [
            { label: 'WhatsApp us', href: whatsappQuoteUrl, style: 'whatsapp' },
            { label: 'Call 929-801-7756', href: 'tel:+19298017756', style: 'ghost-light' }
          ]
        },
        sortOrder: 70
      })
    ]
  }),

  residential: page('residential', {
    template: 'standard',
    path: '/residential.html',
    title: 'Home Security Camera Installation in NYC, LI & NJ | CamerasNYC',
    metaDescription: 'Professionally installed home security cameras. Doorbell, outdoor, indoor, and full-home systems. Renter-friendly options. Free quote across NYC, Long Island, and Northern NJ.',
    ogTitle: 'Home Security Camera Installation in NYC, LI & NJ | CamerasNYC',
    ogDescription: 'Professionally installed home security cameras. Doorbell, outdoor, indoor, and full-home systems. Renter-friendly options. Free quote.',
    canonicalPath: '/residential.html',
    headerEyebrow: 'Residential',
    headerTitle: "Home security that's actually neighborly.",
    headerLede: "No giant dome cameras above the porch. No subscription you can't cancel. We design quiet, accurate systems that fit the house - and the people in it.",
    schemaType: 'Service',
    schemaData: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Residential Security Camera Installation',
      provider: { '@type': 'LocalBusiness', name: 'CamerasNYC', url: 'https://camerasnyc.com/' },
      areaServed: baseServiceArea,
      serviceType: 'Home security camera installation, doorbell cameras, NVR systems',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: '900',
        highPrice: '6500'
      }
    },
    blocks: [
      block('page_header', 'page_header', {
        eyebrow: 'Residential',
        title: "Home security that's actually neighborly.",
        lede: "No giant dome cameras above the porch. No subscription you can't cancel. We design quiet, accurate systems that fit the house - and the people in it.",
        sortOrder: 10
      }),
      block('camera_types', 'feature_grid', {
        eyebrow: 'What we install',
        title: 'Four camera types. Most homes use a mix.',
        sortOrder: 20,
        items: [
          item('smart-doorbells', 'Smart doorbells', {
            subtitle: '01 / Front door',
            body: 'Wired or battery. Two-way audio, package detection, motion zones. Works with Ring, Nest, Reolink, or our recommended OEM.',
            sortOrder: 10
          }),
          item('outdoor-cameras', 'Outdoor cameras', {
            subtitle: '02 / Perimeter',
            body: '4K IP cams, color night vision, weather-rated. Mounted under soffits, on garages, or pole-mounted for driveways.',
            sortOrder: 20
          }),
          item('indoor-cameras', 'Indoor cameras', {
            subtitle: '03 / Interior',
            body: "Discreet placement, privacy-shutter options, baby/elder monitoring use cases. We help you decide what's worth covering and what isn't.",
            sortOrder: 30
          }),
          item('full-systems', 'Full systems', {
            subtitle: '04 / Whole-home',
            body: 'NVR-based, 4-16 cameras, local storage with optional cloud backup. Centralized recording so nothing lives on the camera itself.',
            sortOrder: 40
          })
        ]
      }),
      block('sample_packages', 'pricing_packages', {
        eyebrow: 'Sample packages',
        title: 'A rough sense of pricing.',
        lede: 'Every install is quoted after a free site survey. These are typical ranges for tri-state homes - including hardware, cable, mounting, and configuration.',
        sortOrder: 30,
        items: [
          item('starter', 'Starter', {
            price: '$900-$1,400',
            body: 'Apartment, condo, or small home. Coverage where it matters, no waste.',
            metadata: {
              priceSuffix: 'installed',
              includes: ['2-3 cameras (typically 1 doorbell + 1-2 outdoor)', 'Mobile app + alerts', 'Cloud recording (your subscription)', 'Up to 4 hours on-site']
            },
            linkLabel: 'Get quoted',
            linkUrl: 'contact.html',
            sortOrder: 10
          }),
          item('standard', 'Standard', {
            price: '$1,800-$3,200',
            body: 'Single-family or townhouse. Front, back, sides covered, plus interior key rooms.',
            metadata: {
              priceSuffix: 'installed',
              includes: ['4-6 cameras (mix of outdoor + indoor)', '4K resolution, color night vision', 'NVR with 2TB local storage', 'Smart-home integration (Alexa / Google / Apple)', 'Lifetime support included']
            },
            linkLabel: 'Get quoted',
            linkUrl: 'contact.html',
            sortOrder: 20,
            isFeatured: true
          }),
          item('whole-home', 'Whole-home', {
            price: '$3,500-$6,500',
            body: 'Larger home, multiple buildings, detached garage. Full perimeter + interior coverage.',
            metadata: {
              priceSuffix: 'installed',
              includes: ['8-12+ cameras, multi-zone', '4K, license-plate-capable PTZ option', 'NVR with 4-8TB, optional cloud backup', 'Hardwired POE - no wifi dependence', 'White-glove install & tuning']
            },
            linkLabel: 'Get quoted',
            linkUrl: 'contact.html',
            sortOrder: 30
          })
        ]
      }),
      block('integrations', 'rich_text', {
        eyebrow: 'Works with your stack',
        title: 'Plays nice with what you already own.',
        lede: "We don't lock you into a single ecosystem. Tell us what hubs and assistants you use; we'll spec hardware that integrates cleanly.",
        settings: {
          logos: ['Amazon Alexa', 'Google Home', 'Apple Home / HomeKit', 'Home Assistant', 'SmartThings', 'IFTTT']
        },
        sortOrder: 40
      }),
      block('install_process', 'process_steps', {
        eyebrow: 'How install day works',
        title: 'From the doorbell to the live feed in one visit.',
        sortOrder: 50,
        items: [
          item('walk-through', 'Walk-through', { subtitle: '1', body: 'Confirm camera locations, mark cable paths, run wifi/wired tests.', sortOrder: 10 }),
          item('cable-mount', 'Cable + mount', { subtitle: '2', body: 'Drill, run cable inside walls or in conduit, mount cameras, weatherproof.', sortOrder: 20 }),
          item('configure', 'Configure', { subtitle: '3', body: 'NVR setup, motion zones, alerts, smart-home links, app on your phone.', sortOrder: 30 }),
          item('walkthrough-out', 'Walkthrough out', { subtitle: '4', body: 'We show you how to use it. You ask questions. Then we clean up and leave.', sortOrder: 40 })
        ]
      }),
      block('faq', 'faq', {
        eyebrow: 'FAQ',
        title: 'Questions we get most weeks.',
        sortOrder: 60,
        items: [
          item('drilling', 'Do you have to drill into my house?', {
            body: 'For most outdoor cameras, yes - small fastener holes (1/4") into siding or fascia, properly sealed. For wired cameras we run cable through existing soffits or attic where possible. If you are a renter or want zero permanent install, we have battery-cam and wifi options that mount with adhesive or removable brackets.',
            sortOrder: 10
          }),
          item('wifi', 'Will it work over my home wifi?', {
            body: "For 1-3 cameras, usually yes. For 4+ cameras or 4K resolution we strongly recommend wired POE - wifi gets unreliable when cameras compete with phones, laptops, and streaming. We'll test your network speed during the survey and tell you honestly whether wifi will hold up.",
            sortOrder: 20
          }),
          item('renters', 'What about renters?', {
            body: "We do renter-friendly installs all the time. Battery-powered cameras, magnetic mounts, doorbell cams that replace existing fixtures and reverse out cleanly. We'll talk through what your lease allows.",
            sortOrder: 30
          }),
          item('subscriptions', 'Do I have to pay a monthly subscription?', {
            body: "Not to us. We don't charge recurring fees - you own the system. If you choose cameras that offer cloud storage, that's a separate subscription paid directly to the manufacturer (typically $3-$10/mo per camera), and it's optional. Most of our installs use local recording on an NVR with no monthly fees at all.",
            sortOrder: 40
          }),
          item('remote-view', "Can I see the cameras when I'm not home?", {
            body: 'Yes - every system we install includes a phone app for live view, recorded playback, and motion alerts. We set it up on your phone before we leave, and add additional users (spouse, family, business partner) on request.',
            sortOrder: 50
          }),
          item('breaks', 'What if a camera breaks later?', {
            body: 'Call us. Most issues we can diagnose remotely. If hardware fails inside the manufacturer warranty (typically 2-3 years), we coordinate the replacement. After warranty, you pay parts; we usually waive labor for past customers.',
            sortOrder: 60
          })
        ]
      }),
      block('quote_cta', 'cta_band', {
        title: 'Free home survey. No pressure.',
        lede: "We come out, walk the property, sketch coverage, and email a written quote. That's it.",
        settings: {
          actions: [
            { label: 'Book a survey', href: 'contact.html', style: 'primary' },
            { label: 'WhatsApp us', href: 'https://wa.me/19298017756?text=Hi%20CamerasNYC%2C%20I%27d%20like%20a%20home%20camera%20quote.', style: 'whatsapp' }
          ]
        },
        sortOrder: 70
      })
    ]
  }),

  commercial: page('commercial', {
    template: 'standard',
    path: '/commercial.html',
    title: 'Commercial Security Camera Installation NYC, LI & NJ | CamerasNYC',
    metaDescription: 'Commercial surveillance for retail, hospitality, warehouse, multifamily, and construction. Multi-site management, NDAA-compliant options. Free site survey across the tri-state.',
    ogTitle: 'Commercial Security Camera Installation NYC, LI & NJ | CamerasNYC',
    ogDescription: 'Commercial surveillance for retail, hospitality, warehouse, multifamily, and construction. Multi-site management, NDAA-compliant options.',
    canonicalPath: '/commercial.html',
    headerEyebrow: 'Commercial',
    headerTitle: 'Surveillance that scales with your business.',
    headerLede: "From a single retail floor to four warehouses across the tri-state. We design and install commercial camera systems that survive shift changes, growth, and the occasional adjuster's questions.",
    schemaType: 'Service',
    schemaData: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Commercial Security Camera Installation',
      provider: { '@type': 'LocalBusiness', name: 'CamerasNYC', url: 'https://camerasnyc.com/' },
      areaServed: baseServiceArea,
      serviceType: 'Commercial surveillance, multi-site CCTV, NDAA-compliant camera systems, access control integration'
    },
    blocks: [
      block('page_header', 'page_header', {
        eyebrow: 'Commercial',
        title: 'Surveillance that scales with your business.',
        lede: "From a single retail floor to four warehouses across the tri-state. We design and install commercial camera systems that survive shift changes, growth, and the occasional adjuster's questions.",
        sortOrder: 10
      }),
      block('industries', 'feature_grid', {
        eyebrow: 'Industries served',
        title: "We've installed in every operation that has a key.",
        sortOrder: 20,
        items: [
          item('retail', 'Retail', { subtitle: 'RT', body: 'Loss prevention coverage, POS overlay, dressing-room privacy compliance, integrated counter dashboards.', sortOrder: 10 }),
          item('hospitality', 'Hospitality', { subtitle: 'HS', body: 'Hotel back-of-house, bar/restaurant ROC, kitchen pass coverage, guest-area discretion balanced with security.', sortOrder: 20 }),
          item('warehouse-logistics', 'Warehouse & logistics', { subtitle: 'WH', body: 'Loading dock, aisle coverage, cage / high-value room, license-plate-capture at gates.', sortOrder: 30 }),
          item('multifamily', 'Multifamily', { subtitle: 'MF', body: 'Lobby, mailroom, garage, package room, perimeter. Tenant-portal-ready feeds for property managers.', sortOrder: 40 }),
          item('construction-sites', 'Construction sites', { subtitle: 'CN', body: 'Solar/4G trailer-cam setups, after-hours alert routing, weekly check-ins, easy demobilization at completion.', sortOrder: 50 }),
          item('auto-shops', 'Auto shops', { subtitle: 'AU', body: 'Bay coverage, key drop area, lot perimeter, parts-room access. Designed for insurance documentation.', sortOrder: 60 })
        ]
      }),
      block('capabilities', 'feature_grid', {
        eyebrow: 'Capabilities',
        title: 'Built for operators, not hobbyists.',
        sortOrder: 30,
        items: [
          item('centralized-management', 'Centralized management', { subtitle: 'Multi-site', body: 'One pane of glass across every location. Role-based access, audit logs, shared playback links.', sortOrder: 10 }),
          item('nvr-cloud', 'NVR + cloud', { subtitle: 'Hybrid storage', body: 'Local recording (30-90 day retention) with selective cloud backup of flagged events. Survives ISP outages.', sortOrder: 20 }),
          item('integration-ready', 'Integration ready', { subtitle: 'Access control', body: 'Tie cameras to keycard events, door sensors, and alarm panels. Pair video clips with badge swipes automatically.', sortOrder: 30 }),
          item('compliant-equipment', 'Compliant equipment', { subtitle: 'NDAA', body: 'NDAA Section 889 compliant hardware lines available. Required for government work - and quietly a great signal of equipment provenance for everyone else.', sortOrder: 40 })
        ]
      }),
      block('recent_jobs', 'case_studies', {
        eyebrow: 'Recent jobs',
        title: 'A few from the last year.',
        settings: { cta: { label: 'Talk about yours', href: 'contact.html' } },
        sortOrder: 40,
        items: [
          item('brooklyn-retail-chain', 'Brooklyn-based retail chain', {
            subtitle: '18 cameras across 4 locations',
            body: 'Centralized cloud management, POS-tied playback for after-hours shrinkage review. Saved an estimated $40K/yr in identified loss within 6 months.',
            metadata: {
              imagePlaceholder: 'case-brooklyn-retail',
              imageSlot: 'commercial.recent_jobs.brooklyn_retail',
              placeholderClass: 'photo-ph--storefront',
              tag: 'Retail'
            },
            sortOrder: 10
          }),
          item('long-island-fulfillment', 'Long Island fulfillment center', {
            subtitle: '32 cameras 110K sq ft warehouse',
            body: 'License-plate capture at three loading bays, color-night-vision aisle coverage, integration with their WMS for incident timestamps.',
            metadata: {
              imagePlaceholder: 'case-warehouse',
              imageSlot: 'commercial.recent_jobs.warehouse',
              placeholderClass: 'photo-ph--warehouse',
              tag: 'Logistics'
            },
            sortOrder: 20
          }),
          item('jersey-city-complex', 'Jersey City residential complex', {
            subtitle: '48 cameras 3 buildings, 220 units',
            body: 'Lobby + perimeter + package room. Property manager portal for resident feed requests; pre-formatted clip export for police inquiries.',
            metadata: {
              imagePlaceholder: 'case-jersey-city',
              imageSlot: 'commercial.recent_jobs.jersey_city',
              placeholderClass: 'photo-ph--lobby',
              tag: 'Multifamily'
            },
            sortOrder: 30
          })
        ]
      }),
      block('compliance', 'rich_text', {
        eyebrow: 'Compliance & insurance',
        title: 'Paperwork your underwriter will actually accept.',
        body: 'We provide install documentation, equipment serials, camera coverage diagrams, and certified electrician sign-off where required. Our work meets NY DOS, NJ Department of Consumer Affairs, and local municipality requirements - and our insurance certificate is reissued per-job at no charge.',
        settings: {
          credentials: ['NY DOS #12000310924', 'NJ Lic. #34BX01200123', '$2M GL policy on file', 'NDAA Section 889']
        },
        sortOrder: 50
      }),
      block('quote_cta', 'cta_band', {
        title: 'Request a site survey.',
        lede: "No cost, no commitment. We'll walk the property and email a written proposal.",
        settings: {
          actions: [
            { label: 'Request survey', href: 'contact.html', style: 'primary' },
            { label: 'WhatsApp us', href: 'https://wa.me/19298017756?text=Hi%20CamerasNYC%2C%20I%27d%20like%20a%20site%20survey.', style: 'whatsapp' }
          ]
        },
        sortOrder: 60
      })
    ]
  }),

  services: page('services', {
    template: 'standard',
    path: '/services.html',
    title: 'Services & How We Work | CamerasNYC',
    metaDescription: 'How CamerasNYC works: free site survey, written quote, professional install, lifetime support. One-time install, maintenance, and 24/7 monitoring options across NYC, LI, and NJ.',
    ogTitle: 'Services & How We Work | CamerasNYC',
    ogDescription: 'How CamerasNYC works: free site survey, written quote, professional install, lifetime support. One-time install, maintenance, and 24/7 monitoring options.',
    canonicalPath: '/services.html',
    headerEyebrow: 'Services',
    headerTitle: 'How we work — honest from the first call.',
    headerLede: 'Four steps, in order. No surprise add-ons. No "platinum-package" upsells once the trucks are out. The quote you accept is the bill you pay.',
    schemaType: 'WebPage',
    schemaData: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Services & How We Work',
      url: 'https://camerasnyc.com/services.html'
    },
    blocks: [
      block('page_header', 'page_header', {
        eyebrow: 'Services',
        title: 'How we work — honest from the first call.',
        lede: 'Four steps, in order. No surprise add-ons. No "platinum-package" upsells once the trucks are out. The quote you accept is the bill you pay.',
        sortOrder: 10
      }),
      block('process', 'process_steps', {
        eyebrow: 'The process',
        title: 'From "we need cameras" to "they are live."',
        sortOrder: 20,
        items: [
          item('site-survey', 'Free site survey', { subtitle: '1', body: "We come out, walk the property, ask what you're trying to solve. Typically 30-60 minutes.", sortOrder: 10 }),
          item('written-quote', 'Written quote', { subtitle: '2', body: 'Within 24 hours: itemized scope, equipment list, coverage diagram, fixed total. Valid for 30 days.', sortOrder: 20 }),
          item('professional-install', 'Professional install', { subtitle: '3', body: 'Typically 1-2 days for residential, 3-5 for mid-size commercial. Clean cable runs, code-compliant.', sortOrder: 30 }),
          item('ongoing-support', 'Ongoing support', { subtitle: '4', body: 'App help, firmware updates, weather repairs. One number. Same crew that did the install.', sortOrder: 40 })
        ]
      }),
      block('service_tiers', 'pricing_packages', {
        eyebrow: 'Service tiers',
        title: 'Three ways to work with us.',
        lede: 'Pick the level of ongoing involvement that fits. You can move between tiers any time.',
        settings: {
          comparisonFeatures: [
            'Site survey & quote',
            'Professional installation',
            'Lifetime tech support (phone)',
            'Annual on-site check',
            'Firmware updates & tuning',
            'Priority emergency response',
            '24/7 alarm-grade monitoring',
            'Police/fire dispatch coordination'
          ]
        },
        sortOrder: 30,
        items: [
          item('install-only', 'Install only', {
            price: 'One-time',
            metadata: { included: ['Site survey & quote', 'Professional installation', 'Lifetime tech support (phone)'] },
            sortOrder: 10
          }),
          item('install-maintenance', 'Install + maintenance', {
            price: '+ $25-$60/mo',
            metadata: { included: ['Site survey & quote', 'Professional installation', 'Lifetime tech support (phone)', 'Annual on-site check', 'Firmware updates & tuning', 'Priority emergency response'] },
            sortOrder: 20,
            isFeatured: true
          }),
          item('install-monitoring', 'Install + monitoring', {
            price: '+ $45-$120/mo',
            metadata: { included: ['Site survey & quote', 'Professional installation', 'Lifetime tech support (phone)', 'Annual on-site check', 'Firmware updates & tuning', 'Priority emergency response', '24/7 alarm-grade monitoring', 'Police/fire dispatch coordination'] },
            sortOrder: 30
          })
        ]
      }),
      block('emergency', 'rich_text', {
        eyebrow: 'Same-day available',
        title: 'Break-in last night? We can be there today.',
        body: "If you've had an incident and need cameras up before tonight, call. We keep open slots in the schedule for emergency installs and prioritize them ahead of routine work.",
        settings: { primaryCta: { label: 'Call 929-801-7756', href: 'tel:+19298017756' } },
        sortOrder: 40,
        items: [
          item('triage-call', 'Triage call', { subtitle: '01', body: '5 minutes on the phone to assess what you need covered immediately.', sortOrder: 10 }),
          item('same-day-visit', 'Same-day visit', { subtitle: '02', body: 'For calls before noon, we typically arrive between 2-6pm with portable units.', sortOrder: 20 }),
          item('permanent-retrofit', 'Permanent retrofit', { subtitle: '03', body: 'Within 5-10 days, we return with the full kit and convert the temporary install into a permanent one.', sortOrder: 30 })
        ]
      }),
      block('quote_cta', 'cta_band', {
        title: 'Ready to start the survey?',
        lede: "Tell us where you are, what you're trying to cover, and when works to walk through.",
        settings: {
          actions: [
            { label: 'Get a quote', href: 'contact.html', style: 'primary' },
            { label: 'WhatsApp us', href: whatsappQuoteUrl, style: 'whatsapp' }
          ]
        },
        sortOrder: 50
      })
    ]
  }),

  about: page('about', {
    template: 'standard',
    path: '/about.html',
    title: 'About CamerasNYC — Locally-Owned Security Installers',
    metaDescription: 'CamerasNYC is a locally-owned, NY- and NJ-licensed security camera installer based in NYC. Meet the team and learn how we work differently from the national chains.',
    ogTitle: 'About CamerasNYC — Locally-Owned Security Installers',
    ogDescription: 'CamerasNYC is a locally-owned, NY- and NJ-licensed security camera installer based in NYC. Meet the team and learn how we work differently from the chains.',
    canonicalPath: '/about.html',
    headerEyebrow: 'About',
    headerTitle: 'Brooklyn-based. New York-licensed. Built for the neighborhood.',
    headerLede: "We started CamerasNYC because the security industry treats homeowners and small businesses like a quarterly target. Every install we do, we do as if we'll see the customer again - because, usually, we will.",
    schemaType: 'AboutPage',
    schemaData: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About CamerasNYC',
      url: 'https://camerasnyc.com/about.html'
    },
    blocks: [
      block('page_header', 'page_header', {
        eyebrow: 'About',
        title: 'Brooklyn-based. New York-licensed. Built for the neighborhood.',
        lede: "We started CamerasNYC because the security industry treats homeowners and small businesses like a quarterly target. Every install we do, we do as if we'll see the customer again - because, usually, we will.",
        sortOrder: 10
      }),
      block('origin_story', 'rich_text', {
        eyebrow: 'Origin',
        title: 'How this got started.',
        body: "Marcus Chen spent 12 years installing low-voltage and security systems for one of the major national security firms across the five boroughs. The work was good. The customer experience was not.\n\nCalls went to a help line in another state. Service techs rotated every visit. Customers were sold three-year monitoring contracts they didn't understand for systems they didn't fully control. So in 2014, we left and started CamerasNYC with three rules: we own the relationship, we own the install, and we own the support.\n\nWe've installed 500+ systems since. Some customers we've serviced for five years and counting. Most of our work comes from neighbors of customers - the strongest signal we know that we're doing this right.",
        sortOrder: 20
      }),
      block('founder', 'rich_text', {
        eyebrow: 'Founder',
        title: 'Marcus Chen',
        body: "Owner - Lead Installer - 12 years in the trade\n\nOn every install above 6 cameras, I'm on-site. On commercial jobs, I run the survey personally. If you talk to anyone here, it's me, my partner, or one of two long-tenured techs - never a sales rep.\n\nI live in Brooklyn. I service Brooklyn the way I'd want my own house serviced. That's the entire business model.",
        settings: {
          imagePlaceholder: 'founder-photo',
          imageSlot: 'about.founder',
          placeholderClass: 'photo-ph--interior',
          imageTag: 'Founder',
          imageCaption: ['Placeholder - founder portrait', 'Swap in real photo']
        },
        sortOrder: 30
      }),
      block('differentiators', 'feature_grid', {
        eyebrow: "What's different",
        title: "Three things the chains don't do.",
        sortOrder: 40,
        items: [
          item('own-system', 'You own the system.', {
            subtitle: '01',
            body: 'No 36-month monitoring contracts. No equipment leased to you. You own every camera, every cable, every byte of footage. If you stop paying us anything, the system still works.',
            sortOrder: 10
          }),
          item('real-phone', 'Real phone, real person.', {
            subtitle: '02',
            body: "One number. Goes to a person who has been on your roof. No call routing, no tier-one script, no escalation maze. We pick up - and if we can't, we call back the same day.",
            sortOrder: 20
          }),
          item('pricing-holds', 'Pricing that holds.', {
            subtitle: '03',
            body: 'The quote is the price. We do not add change orders for additional drilling or longer cable runs - those are in the original walk-through. If we miss something, we eat it.',
            sortOrder: 30
          })
        ]
      }),
      block('credentials', 'rich_text', {
        eyebrow: 'Credentials',
        title: 'Licensed, insured, and on the right side of the paperwork.',
        body: 'We carry full general liability and workers comp coverage. Certificates of insurance are reissued per-job for commercial customers at no additional charge. Ask and we will send a current COI naming your business as additional insured.',
        sortOrder: 50,
        items: [
          item('ny-dos', 'NY DOS', { body: '#12000310924', sortOrder: 10 }),
          item('nj-license', 'NJ Lic.', { body: '#34BX01200123', sortOrder: 20 }),
          item('general-liability', 'General Liability', { body: '$2M', sortOrder: 30 }),
          item('workers-comp', 'Workers Comp', { body: 'Active', sortOrder: 40 }),
          item('bbb', 'BBB', { body: 'A+ Rated', sortOrder: 50 }),
          item('ndaa', 'NDAA', { body: 'Section 889', sortOrder: 60 })
        ]
      }),
      block('quote_cta', 'cta_band', {
        title: 'Want to talk it through?',
        lede: "No sales pressure. Just a real conversation about what you need and whether we're the right fit.",
        settings: {
          actions: [
            { label: 'Reach out', href: 'contact.html', style: 'primary' },
            { label: 'WhatsApp us', href: 'https://wa.me/19298017756?text=Hi%20CamerasNYC%2C%20I%27d%20like%20to%20talk.', style: 'whatsapp' }
          ]
        },
        sortOrder: 60
      })
    ]
  }),

  contact: page('contact', {
    template: 'contact',
    path: '/contact.html',
    title: 'Get a Free Quote | CamerasNYC',
    metaDescription: 'Get a free security camera quote in 24 hours. Serving NYC, Long Island, and Northern NJ. Call or fill out the form — we respond within one business day.',
    ogTitle: 'Get a Free Quote | CamerasNYC',
    ogDescription: 'Get a free security camera quote in 24 hours. Serving NYC, Long Island, and Northern NJ.',
    canonicalPath: '/contact.html',
    headerEyebrow: 'Contact',
    headerTitle: 'Free quote in 24 hours.',
    headerLede: "Tell us a little about the property. We'll reach out within one business day to schedule a free site survey.",
    schemaType: 'ContactPage',
    schemaData: {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Contact CamerasNYC',
      url: 'https://camerasnyc.com/contact.html',
      mainEntity: {
        '@type': 'LocalBusiness',
        name: 'CamerasNYC',
        telephone: '+19298017756'
      }
    },
    blocks: [
      block('page_header', 'page_header', {
        eyebrow: 'Contact',
        title: 'Free quote in 24 hours.',
        lede: "Tell us a little about the property. We'll reach out within one business day to schedule a free site survey.",
        sortOrder: 10
      }),
      block('contact_info', 'contact_info', {
        sortOrder: 20,
        items: [
          item('whatsapp', 'WhatsApp us', {
            body: "Fastest reply. Send a photo of the property if you've got one.",
            linkLabel: 'Message on WhatsApp',
            linkUrl: whatsappQuoteUrl,
            sortOrder: 10
          }),
          item('phone', 'Or call', {
            body: 'Mon-Sat, 8am-7pm. Voicemail returned same day.',
            linkLabel: '929-801-7756',
            linkUrl: 'tel:+19298017756',
            sortOrder: 20
          }),
          item('service-area', 'Service area', {
            body: 'NYC - Long Island - Northern NJ. Outside that radius for jobs of 10+ cameras - ask.',
            sortOrder: 30
          }),
          item('response-time', 'Response time', {
            body: 'Quotes: within 24 hours. Emergency / same-day: call directly.',
            sortOrder: 40
          }),
          item('office', 'Office', {
            body: 'Brooklyn, NY\nBy appointment only.',
            sortOrder: 50
          })
        ]
      }),
      block('quote_form', 'form_intro', {
        eyebrow: 'Request a quote',
        title: 'Tell us about the property.',
        body: "We'll respond within one business day. No spam. No third-party sharing.",
        settings: {
          formName: 'quote',
          action: 'https://formspree.io/f/YOUR_FORM_ID',
          method: 'POST',
          fields: [
            { name: 'name', label: 'Your name', type: 'text', required: true, autocomplete: 'name' },
            { name: 'phone', label: 'Phone', type: 'tel', required: true, autocomplete: 'tel' },
            { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' },
            { name: 'zip', label: 'Property zip code', type: 'text', required: true, pattern: '[0-9]{5}', maxlength: 5, autocomplete: 'postal-code' },
            { name: 'type', label: 'Property type', type: 'select', required: true },
            { name: 'cameras', label: 'Estimated # of cameras', type: 'select', required: false },
            { name: 'notes', label: 'What are you trying to cover? (optional)', type: 'textarea', required: false }
          ],
          propertyTypes: [
            'Residential - apartment / condo',
            'Residential - single-family home',
            'Residential - townhouse',
            'Commercial - retail',
            'Commercial - restaurant / hospitality',
            'Commercial - warehouse / industrial',
            'Commercial - multifamily / property mgmt',
            'Commercial - office',
            'Construction / temporary site',
            'Other'
          ],
          cameraCounts: ['Not sure yet', '1-2', '3-4', '5-8', '9-16', '17+'],
          honeypotField: 'bot-field',
          placeholder: 'Front door, driveway, back alley, loading dock, etc. Anything we should know about the property.'
        },
        sortOrder: 30
      })
    ]
  })
};

module.exports = {
  settings,
  pages
};
