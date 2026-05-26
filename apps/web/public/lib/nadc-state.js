/* ═══════════════════════════════════════════════════════════════════════════
   NADC STATE ENGINE  v1.0.0
   SHA National Ambulance Dispatch Centre
   ─────────────────────────────────────────────────────────────────────────
   Single source of truth for all three UIs:
     - LED Dashboard  (/dashboard)
     - Dispatcher Console (/dispatch)
     - Supervisor Screen  (/supervisor)

   Usage (browser <script> tag, no build step required):
     NACDState.init({ seedIncidents: 12 });              // offline simulation
     NACDState.init({ supabaseUrl: '...', supabaseKey: '...' }); // + Supabase sync

   Event bus:
     NACDState.on('state:tick',        function(state)    { render(state); });
     NACDState.on('incident:created',  function(incident) { addCard(incident); });
     NACDState.on('incident:updated',  function(incident) { updateCard(incident); });
     NACDState.on('unit:moved',        function(unit)     { moveMarker(unit); });

   Dispatcher API:
     NACDState.dispatch.createIncident({ priority:1, complaint:'Cardiac arrest', ... });
     NACDState.dispatch.assignUnit(incidentId, unitId);
     NACDState.dispatch.updateStatus(incidentId, NACDState.STATUS.ON_SCENE);
     NACDState.dispatch.setHospital(incidentId, hospitalId);
     NACDState.dispatch.closeIncident(incidentId);
     NACDState.dispatch.cancelIncident(incidentId);
   ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var NACDState = (function () {

    // ═══════════════════════════════════════════════════════════════════════
    // 1. CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════
    var STATUS = {
      PENDING:     'pending',
      DISPATCHED:  'dispatched',
      EN_ROUTE:    'en_route',
      ON_SCENE:    'on_scene',
      TRANSPORT:   'transport',
      AT_HOSPITAL: 'at_hospital',   // Phase 4d: NERS alignment — between transport and cleared
      CLEARED:     'cleared',
      CANCELLED:   'cancelled'
    };

    var UNIT_STATUS = {
      AVAILABLE:   'available',
      DISPATCHING: 'dispatching',
      EN_ROUTE:    'en_route',
      ON_SCENE:    'on_scene',
      TRANSPORT:   'transport',
      STANDBY:     'standby',
      MAINTENANCE: 'maintenance'
    };

    var STATUS_COLORS = {
      pending:    '#FFD700',
      dispatched: '#FF2D2D',
      en_route:   '#FF8C00',
      on_scene:   '#27AAE1',
      transport:  '#50C020',
      cleared:    '#555',
      cancelled:  '#333'
    };

    var PRIORITY_COLORS = { 1: '#FF2D2D', 2: '#FF8C00', 3: '#FFD700', 4: '#50C020' };

    // Simulation speed (seconds of real time for each phase)
    // At 1000ms tick interval these feel realistic on a live LED wall
    var TIMINGS = {
      autoDipatchSec:  { min: 20,  max: 60  },  // pending → dispatched
      acknowledgesSec: { min: 8,   max: 20  },  // dispatched → en_route
      onSceneSec:      { min: 30,  max: 120 },  // en_route → on_scene (distance-based)
      treatmentSec:    { min: 40,  max: 150 },  // on_scene → transport
      transportSec:    { min: 30,  max: 100 },  // transport → cleared (distance-based)
      clearDelaySec:   10                        // after hospital arrival → unit available
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 2. SEED DATA — HOSPITALS (53 facilities)
    // ═══════════════════════════════════════════════════════════════════════
    var HOSPITALS = [
      // ── Level 6: National Referrals ────────────────────────────────────
      {id:'h001',n:'KNH',        full:'Kenyatta National Hospital',              level:6, lat:-1.3017, lng:36.8071, county:'Nairobi',      edPct:76, div:'open',  nat:true, specialties:['trauma','cardiac','neuro']},
      {id:'h002',n:'MTRH',       full:'Moi Teaching & Referral Hospital',        level:6, lat: 0.5143, lng:35.2698, county:'Uasin Gishu', edPct:82, div:'open',  nat:true, specialties:['trauma','burns','ortho']},
      {id:'h003',n:'KUTRRH',     full:'Kenyatta University Teaching Hospital',   level:6, lat:-1.1810, lng:36.9362, county:'Kiambu',      edPct:71, div:'open',  nat:true, specialties:['cardiac','maternity','paeds']},
      {id:'h004',n:'Mathari',    full:'Mathari Natl Teaching & Referral Hosp.', level:6, lat:-1.2599, lng:36.8430, county:'Nairobi',      edPct:65, div:'open',  nat:true, specialties:['psychiatry','neurology']},
      {id:'h005',n:'NSIPH',      full:'Natl Spinal Injury Prevention Hospital', level:6, lat:-1.2960, lng:36.8390, county:'Nairobi',      edPct:58, div:'open',  nat:true, specialties:['spinal','ortho','rehab']},
      // ── Level 5: Nairobi County ─────────────────────────────────────────
      {id:'h006',n:'Mama Lucy',  full:'Mama Lucy Kibaki Hospital',              level:5, lat:-1.2656, lng:36.9083, county:'Nairobi',      edPct:88, div:'open'},
      {id:'h007',n:'Pumwani',    full:'Pumwani Maternity Hospital',             level:5, lat:-1.2699, lng:36.8481, county:'Nairobi',      edPct:91, div:'diversion'},
      {id:'h008',n:'Mbagathi',   full:'Mbagathi County Hospital',               level:5, lat:-1.3218, lng:36.7884, county:'Nairobi',      edPct:79, div:'open'},
      // ── Level 5: Private / Mission (Nairobi) ────────────────────────────
      {id:'h009',n:'Nairobi Hosp',full:'The Nairobi Hospital',                  level:5, lat:-1.2990, lng:36.7895, county:'Nairobi',      edPct:72, div:'open', specialties:['cardiac','ICU']},
      {id:'h010',n:'Aga Khan',   full:'Aga Khan University Hospital Nairobi',   level:5, lat:-1.2588, lng:36.8203, county:'Nairobi',      edPct:74, div:'open', specialties:['cardiac','oncology']},
      {id:'h011',n:'MP Shah',    full:'M.P. Shah Hospital',                     level:5, lat:-1.2699, lng:36.8166, county:'Nairobi',      edPct:68, div:'open'},
      {id:'h012',n:"Gertrude's", full:"Gertrude's Children's Hospital",         level:5, lat:-1.2656, lng:36.8363, county:'Nairobi',      edPct:60, div:'open', specialties:['paeds']},
      {id:'h013',n:'Karen Hosp', full:'Karen Hospital',                         level:5, lat:-1.3549, lng:36.7041, county:'Nairobi',      edPct:55, div:'open'},
      {id:'h014',n:'Mater Hosp', full:'Mater Misericordiae Hospital',           level:5, lat:-1.3015, lng:36.8398, county:'Nairobi',      edPct:91, div:'bypass'},
      // ── Level 5: County Referrals (47 counties) ─────────────────────────
      {id:'h015',n:'Coast Gen',  full:'Coast General Teaching & Referral Hosp.',level:5, lat:-4.0623, lng:39.6648, county:'Mombasa',      edPct:74, div:'open'},
      {id:'h016',n:'Kwale CRH',  full:'Kwale County Referral Hospital',         level:5, lat:-4.1736, lng:39.4527, county:'Kwale',        edPct:55, div:'open'},
      {id:'h017',n:'Kilifi CRH', full:'Kilifi County Hospital',                 level:5, lat:-3.6330, lng:39.8495, county:'Kilifi',       edPct:62, div:'open'},
      {id:'h018',n:'Tana River', full:'Hola County Referral Hospital',          level:5, lat:-1.4844, lng:40.0268, county:'Tana River',   edPct:42, div:'open'},
      {id:'h019',n:'Lamu CRH',   full:'King Fahad County Hospital Lamu',        level:5, lat:-2.2686, lng:40.9020, county:'Lamu',         edPct:50, div:'open'},
      {id:'h020',n:'Taita CRH',  full:'Moi County Referral Hospital Voi',       level:5, lat:-3.3967, lng:38.5579, county:'Taita-Taveta', edPct:58, div:'open'},
      {id:'h021',n:'Garissa CRH',full:'Garissa County Referral Hospital',       level:5, lat:-0.4532, lng:39.6401, county:'Garissa',      edPct:70, div:'open'},
      {id:'h022',n:'Wajir CRH',  full:'Wajir County Referral Hospital',         level:5, lat: 1.7471, lng:40.0573, county:'Wajir',        edPct:48, div:'open'},
      {id:'h023',n:'Mandera CRH',full:'Mandera County Referral Hospital',       level:5, lat: 3.9366, lng:41.8670, county:'Mandera',      edPct:52, div:'open'},
      {id:'h024',n:'Marsabit',   full:'Marsabit County Referral Hospital',      level:5, lat: 2.3284, lng:37.9947, county:'Marsabit',     edPct:44, div:'open'},
      {id:'h025',n:'Isiolo CRH', full:'Isiolo County Referral Hospital',        level:5, lat: 0.3556, lng:37.5833, county:'Isiolo',       edPct:60, div:'open'},
      {id:'h026',n:'Meru CRH',   full:'Meru Teaching & Referral Hospital',      level:5, lat: 0.0475, lng:37.6491, county:'Meru',         edPct:66, div:'open'},
      {id:'h027',n:'Tharaka CRH',full:'Chuka County Referral Hospital',         level:5, lat:-0.3052, lng:37.9139, county:'Tharaka-Nithi',edPct:53, div:'open'},
      {id:'h028',n:'Embu CRH',   full:'Embu Level 5 Hospital',                  level:5, lat:-0.5270, lng:37.4579, county:'Embu',         edPct:69, div:'open'},
      {id:'h029',n:'Kitui CRH',  full:'Kitui County Referral Hospital',         level:5, lat:-1.3667, lng:38.0167, county:'Kitui',        edPct:61, div:'open'},
      {id:'h030',n:'Machakos',   full:'Machakos Level 5 Hospital',              level:5, lat:-1.5177, lng:37.2634, county:'Machakos',     edPct:75, div:'open'},
      {id:'h031',n:'Makueni CRH',full:'Makueni County Referral Hospital',       level:5, lat:-1.8033, lng:37.6210, county:'Makueni',      edPct:58, div:'open'},
      {id:'h032',n:'Nyandarua',  full:'Ol Kalou County Referral Hospital',      level:5, lat:-0.2667, lng:36.3833, county:'Nyandarua',    edPct:47, div:'open'},
      {id:'h033',n:'Nyeri CRH',  full:'Nyeri County Referral Hospital',         level:5, lat:-0.4167, lng:36.9500, county:'Nyeri',        edPct:71, div:'open'},
      {id:'h034',n:'Kirinyaga',  full:'Kerugoya County Referral Hospital',      level:5, lat:-0.5005, lng:37.2786, county:'Kirinyaga',    edPct:63, div:'open'},
      {id:'h035',n:"Murang'a",   full:"Murang'a Level 5 Hospital",              level:5, lat:-0.7167, lng:37.1500, county:"Murang'a",     edPct:68, div:'open'},
      {id:'h036',n:'Kiambu CRH', full:'Kiambu Level 5 Hospital',                level:5, lat:-1.1719, lng:36.8353, county:'Kiambu',      edPct:82, div:'diversion'},
      {id:'h037',n:'Turkana CRH',full:'Lodwar County Referral Hospital',        level:5, lat: 3.1167, lng:35.6000, county:'Turkana',      edPct:45, div:'open'},
      {id:'h038',n:'West Pokot', full:'Kapenguria County Referral Hospital',    level:5, lat: 1.2366, lng:35.1120, county:'West Pokot',   edPct:40, div:'open'},
      {id:'h039',n:'Samburu CRH',full:'Maralal County Referral Hospital',       level:5, lat: 1.0980, lng:36.6963, county:'Samburu',      edPct:38, div:'open'},
      {id:'h040',n:'Trans Nzoia',full:'Kitale County Referral Hospital',        level:5, lat: 1.0167, lng:35.0000, county:'Trans Nzoia',  edPct:62, div:'open'},
      {id:'h041',n:'Uasin Gishu',full:'Eldoret Town Hospital',                  level:5, lat: 0.5204, lng:35.2700, county:'Uasin Gishu', edPct:70, div:'open'},
      {id:'h042',n:'Elgeyo',     full:'Iten County Referral Hospital',          level:5, lat: 0.6750, lng:35.5098, county:'Elgeyo-Marakwet',edPct:44,div:'open'},
      {id:'h043',n:'Nandi CRH',  full:'Kapsabet County Referral Hospital',      level:5, lat: 0.2033, lng:35.1022, county:'Nandi',        edPct:54, div:'open'},
      {id:'h044',n:'Baringo CRH',full:'Kabarnet County Referral Hospital',      level:5, lat: 0.4918, lng:35.7427, county:'Baringo',      edPct:48, div:'open'},
      {id:'h045',n:'Laikipia',   full:'Nanyuki Teaching & Referral Hospital',   level:5, lat: 0.0178, lng:37.0729, county:'Laikipia',     edPct:61, div:'open'},
      {id:'h046',n:'Nakuru CRH', full:'Nakuru Level 5 Hospital',                level:5, lat:-0.3031, lng:36.0800, county:'Nakuru',       edPct:77, div:'open'},
      {id:'h047',n:'Narok CRH',  full:'Narok County Referral Hospital',         level:5, lat:-1.0833, lng:35.8667, county:'Narok',        edPct:56, div:'open'},
      {id:'h048',n:'Kajiado CRH',full:'Kajiado County Referral Hospital',       level:5, lat:-1.8500, lng:36.7833, county:'Kajiado',      edPct:64, div:'open'},
      {id:'h049',n:'Kericho CRH',full:'Kericho County Referral Hospital',       level:5, lat:-0.3667, lng:35.2833, county:'Kericho',      edPct:60, div:'open'},
      {id:'h050',n:'Bomet CRH',  full:'Bomet County Referral Hospital',         level:5, lat:-0.7833, lng:35.3500, county:'Bomet',        edPct:52, div:'open'},
      {id:'h051',n:'Kakamega',   full:'Kakamega County Teaching & Referral',    level:5, lat: 0.2827, lng:34.7519, county:'Kakamega',     edPct:73, div:'open'},
      {id:'h052',n:'Vihiga CRH', full:'Vihiga County Referral Hospital',        level:5, lat: 0.0833, lng:34.7167, county:'Vihiga',       edPct:55, div:'open'},
      {id:'h053',n:'Bungoma CRH',full:'Bungoma County Referral Hospital',       level:5, lat: 0.5600, lng:34.5600, county:'Bungoma',      edPct:66, div:'open'},
      {id:'h054',n:'Busia CRH',  full:'Busia County Referral Hospital',         level:5, lat: 0.4604, lng:34.1116, county:'Busia',        edPct:58, div:'open'},
      {id:'h055',n:'Siaya CRH',  full:'Siaya County Referral Hospital',         level:5, lat:-0.0617, lng:34.2875, county:'Siaya',        edPct:64, div:'open'},
      {id:'h056',n:'Kisumu CRH', full:'Jaramogi Oginga Odinga Teaching Hosp.',  level:5, lat:-0.0917, lng:34.7680, county:'Kisumu',       edPct:71, div:'open'},
      {id:'h057',n:'Homa Bay',   full:'Homa Bay County Teaching & Referral',    level:5, lat:-0.5274, lng:34.4508, county:'Homa Bay',     edPct:62, div:'open'},
      {id:'h058',n:'Migori CRH', full:'Migori County Referral Hospital',        level:5, lat:-1.0633, lng:34.4731, county:'Migori',       edPct:58, div:'open'},
      {id:'h059',n:'Kisii CRH',  full:'Kisii Teaching & Referral Hospital',     level:5, lat:-0.6817, lng:34.7667, county:'Kisii',        edPct:67, div:'open'},
      {id:'h060',n:'Nyamira CRH',full:'Nyamira County Referral Hospital',       level:5, lat:-0.5667, lng:34.9333, county:'Nyamira',      edPct:53, div:'open'},

      // ── Level 4: Sub-county / District Hospitals ────────────────────────
      // Nairobi
      {id:'h061',n:'Kayole',     full:'Kayole Sub-District Hospital',           level:4, lat:-1.2692, lng:36.9225, county:'Nairobi',      edPct:62, div:'open'},
      {id:'h062',n:'Mutuini',    full:'Mutuini Hospital',                        level:4, lat:-1.3556, lng:36.7394, county:'Nairobi',      edPct:55, div:'open'},
      {id:'h063',n:"Lang'ata",   full:"Lang'ata District Hospital",              level:4, lat:-1.3614, lng:36.7590, county:'Nairobi',      edPct:58, div:'open'},
      {id:'h064',n:'Dandora',    full:'Dandora Community Health Centre L4',      level:4, lat:-1.2542, lng:36.9003, county:'Nairobi',      edPct:50, div:'open'},
      // Kiambu
      {id:'h065',n:'Gatundu',    full:'Gatundu District Hospital',               level:4, lat:-1.0028, lng:36.9944, county:'Kiambu',      edPct:48, div:'open'},
      {id:'h066',n:'Limuru',     full:'Limuru District Hospital',                level:4, lat:-1.1035, lng:36.6408, county:'Kiambu',      edPct:44, div:'open'},
      {id:'h067',n:'Kigumo',     full:'Kigumo District Hospital',                level:4, lat:-0.7683, lng:37.0292, county:'Kiambu',      edPct:40, div:'open'},
      {id:'h068',n:'Ruiru',      full:'Ruiru District Hospital',                 level:4, lat:-1.1454, lng:36.9665, county:'Kiambu',      edPct:52, div:'open'},
      // Nakuru
      {id:'h069',n:'Naivasha',   full:'Naivasha District Hospital',              level:4, lat:-0.7154, lng:36.4309, county:'Nakuru',      edPct:61, div:'open'},
      {id:'h070',n:'Gilgil',     full:'Gilgil District Hospital',                level:4, lat:-0.4953, lng:36.3213, county:'Nakuru',      edPct:43, div:'open'},
      {id:'h071',n:'Molo',       full:'Molo District Hospital',                  level:4, lat:-0.2487, lng:35.7336, county:'Nakuru',      edPct:39, div:'open'},
      {id:'h072',n:'Subukia',    full:'Subukia District Hospital',               level:4, lat: 0.0722, lng:36.1703, county:'Nakuru',      edPct:35, div:'open'},
      // Mombasa
      {id:'h073',n:'Port Reitz', full:'Port Reitz District Hospital',            level:4, lat:-4.0369, lng:39.6267, county:'Mombasa',     edPct:64, div:'open'},
      {id:'h074',n:'Tudor',      full:'Tudor District Hospital',                 level:4, lat:-4.0441, lng:39.6795, county:'Mombasa',     edPct:57, div:'open'},
      // Kilifi
      {id:'h075',n:'Malindi',    full:'Malindi District Hospital',               level:4, lat:-3.2080, lng:40.1186, county:'Kilifi',      edPct:53, div:'open'},
      {id:'h076',n:'Mariakani',  full:'Mariakani District Hospital',             level:4, lat:-3.8378, lng:39.4756, county:'Kilifi',      edPct:40, div:'open'},
      // Kwale
      {id:'h077',n:'Msambweni',  full:'Msambweni District Hospital',             level:4, lat:-4.4697, lng:39.4742, county:'Kwale',       edPct:45, div:'open'},
      // Meru
      {id:'h078',n:'Nkubu',      full:'Nkubu District Hospital',                 level:4, lat:-0.0756, lng:37.5822, county:'Meru',        edPct:47, div:'open'},
      {id:'h079',n:'Maua',       full:'Maua District Hospital',                  level:4, lat: 0.2333, lng:37.9333, county:'Meru',        edPct:42, div:'open'},
      {id:'h080',n:'Tigania',    full:'Tigania District Hospital',               level:4, lat: 0.1750, lng:37.7614, county:'Meru',        edPct:38, div:'open'},
      // Embu
      {id:'h081',n:'Ishiara',    full:'Ishiara District Hospital',               level:4, lat:-0.3525, lng:37.7365, county:'Embu',        edPct:44, div:'open'},
      {id:'h082',n:'Siakago',    full:'Siakago District Hospital',               level:4, lat:-0.5489, lng:37.8064, county:'Embu',        edPct:36, div:'open'},
      // Nyeri
      {id:'h083',n:'Othaya',     full:'Othaya District Hospital',                level:4, lat:-0.5733, lng:36.9275, county:'Nyeri',       edPct:50, div:'open'},
      {id:'h084',n:'Mukurweini', full:'Mukurweini District Hospital',            level:4, lat:-0.7058, lng:36.9922, county:'Nyeri',       edPct:42, div:'open'},
      // Kirinyaga
      {id:'h085',n:'Sagana',     full:'Sagana District Hospital',                level:4, lat:-0.6722, lng:37.2033, county:'Kirinyaga',   edPct:46, div:'open'},
      {id:'h086',n:'Kianyaga',   full:'Kianyaga District Hospital',              level:4, lat:-0.5483, lng:37.4533, county:'Kirinyaga',   edPct:38, div:'open'},
      // Machakos
      {id:'h087',n:'Kangundo',   full:'Kangundo District Hospital',              level:4, lat:-1.2422, lng:37.3398, county:'Machakos',    edPct:49, div:'open'},
      {id:'h088',n:'Kathiani',   full:'Kathiani District Hospital',              level:4, lat:-1.1372, lng:37.0919, county:'Machakos',    edPct:43, div:'open'},
      // Kajiado
      {id:'h089',n:'Ngong',      full:'Ngong District Hospital',                 level:4, lat:-1.3602, lng:36.6574, county:'Kajiado',     edPct:55, div:'open'},
      {id:'h090',n:'Isinya',     full:'Isinya District Hospital',                level:4, lat:-1.6833, lng:36.8500, county:'Kajiado',     edPct:37, div:'open'},
      {id:'h091',n:'Namanga',    full:'Namanga District Hospital',               level:4, lat:-2.5358, lng:36.8105, county:'Kajiado',     edPct:30, div:'open'},
      // Laikipia
      {id:'h092',n:'Rumuruti',   full:'Rumuruti District Hospital',              level:4, lat: 0.2700, lng:36.5333, county:'Laikipia',    edPct:40, div:'open'},
      // Uasin Gishu
      {id:'h093',n:'Turbo',      full:'Turbo District Hospital',                 level:4, lat: 0.6292, lng:35.0514, county:'Uasin Gishu', edPct:48, div:'open'},
      {id:'h094',n:'Burnt Forest',full:'Burnt Forest District Hospital',         level:4, lat: 0.4583, lng:35.4058, county:'Uasin Gishu', edPct:36, div:'open'},
      // Trans Nzoia
      {id:'h095',n:'Kiminini',   full:'Kiminini District Hospital',              level:4, lat: 1.0667, lng:34.8833, county:'Trans Nzoia', edPct:45, div:'open'},
      // Kakamega
      {id:'h096',n:'Mumias',     full:'Mumias District Hospital',                level:4, lat: 0.3367, lng:34.4906, county:'Kakamega',    edPct:52, div:'open'},
      {id:'h097',n:'Malava',     full:'Malava District Hospital',                level:4, lat: 0.4500, lng:34.7000, county:'Kakamega',    edPct:44, div:'open'},
      // Kisumu
      {id:'h098',n:'Kisumu East',full:'Kisumu East District Hospital',           level:4, lat:-0.0878, lng:34.7921, county:'Kisumu',      edPct:57, div:'open'},
      // Bungoma
      {id:'h099',n:'Webuye',     full:'Webuye District Hospital',                level:4, lat: 0.6096, lng:34.7669, county:'Bungoma',     edPct:50, div:'open'},
      // Homa Bay
      {id:'h100',n:'Ndhiwa',     full:'Ndhiwa District Hospital',                level:4, lat:-0.8000, lng:34.5667, county:'Homa Bay',    edPct:42, div:'open'},
      // Baringo
      {id:'h101',n:'Eldama Rav', full:'Eldama Ravine District Hospital',         level:4, lat: 0.0464, lng:35.7236, county:'Baringo',     edPct:40, div:'open'},
      // Turkana
      {id:'h102',n:'Kakuma',     full:'Kakuma District Hospital',                level:4, lat: 3.7167, lng:34.8500, county:'Turkana',     edPct:38, div:'open'},
      {id:'h103',n:'Lokichar',   full:'Lokichar District Hospital',              level:4, lat: 2.5833, lng:35.6500, county:'Turkana',     edPct:32, div:'open'},
      // Samburu
      {id:'h104',n:'Wamba',      full:'Wamba District Hospital',                 level:4, lat: 0.9667, lng:37.3333, county:'Samburu',     edPct:35, div:'open'},
      // West Pokot
      {id:'h105',n:'Ortum',      full:'Ortum District Hospital',                 level:4, lat: 1.4333, lng:35.2500, county:'West Pokot',  edPct:33, div:'open'},
      // Tana River
      {id:'h106',n:'Garsen',     full:'Garsen District Hospital',                level:4, lat:-2.2806, lng:40.1458, county:'Tana River',  edPct:38, div:'open'},
      // Garissa
      {id:'h107',n:'Modogashe',  full:'Modogashe District Hospital',             level:4, lat: 0.9833, lng:39.0167, county:'Garissa',     edPct:34, div:'open'},
      // Wajir
      {id:'h108',n:'Habaswein',  full:'Habaswein District Hospital',             level:4, lat: 1.0097, lng:39.4944, county:'Wajir',       edPct:31, div:'open'},
      // Narok
      {id:'h109',n:'Kilgoris',   full:'Kilgoris District Hospital',              level:4, lat:-1.0083, lng:34.8847, county:'Narok',       edPct:39, div:'open'},
      // Nyandarua
      {id:'h110',n:'Engineer',   full:'Engineer District Hospital',              level:4, lat:-0.6350, lng:36.5600, county:'Nyandarua',   edPct:41, div:'open'}
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // 3. ZONES — legacy alias (kept for backwards-compat references)
    //    Real deployment zones are KENYA_ZONES below.
    // ═══════════════════════════════════════════════════════════════════════
    var ZONES = [
      {id:'CBD',  name:'CBD / Nairobi Centre', county:'Nairobi', lat:-1.2921, lng:36.8219, radius:0.025, avgMins:4.2},
      {id:'WEST', name:'Westlands',            county:'Nairobi', lat:-1.2640, lng:36.8000, radius:0.030, avgMins:6.5},
      {id:'EAST', name:'Eastlands',            county:'Nairobi', lat:-1.2800, lng:36.8620, radius:0.040, avgMins:7.1},
      {id:'STHB', name:'South B / South C',   county:'Nairobi', lat:-1.3120, lng:36.8350, radius:0.025, avgMins:6.8},
      {id:'LANG', name:"Lang'ata",             county:'Nairobi', lat:-1.3420, lng:36.7580, radius:0.035, avgMins:8.3},
      {id:'KASA', name:'Kasarani',             county:'Nairobi', lat:-1.2200, lng:36.8980, radius:0.045, avgMins:9.1},
      {id:'EMBA', name:'Embakasi',             county:'Nairobi', lat:-1.3200, lng:36.9020, radius:0.050, avgMins:9.8},
      {id:'KARE', name:'Karen / Ngong',        county:'Nairobi', lat:-1.3640, lng:36.7120, radius:0.045, avgMins:10.2}
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // 3b. KENYA_ZONES — 52 deployment zones covering all 47 counties, weighted by 2019 census
    //     count = number of fleet units pre-positioned in this zone
    //     Total: 150 units
    // ═══════════════════════════════════════════════════════════════════════
    var KENYA_ZONES = [
      // ── Nairobi Metro (33) ───────────────────────────────────────────────
      {id:'CBD',  name:'CBD / Nairobi Centre', county:'Nairobi',      lat:-1.2921, lng:36.8219, radius:0.025, avgMins:4.2,  count:6},
      {id:'WEST', name:'Westlands',            county:'Nairobi',      lat:-1.2640, lng:36.8000, radius:0.030, avgMins:6.5,  count:4},
      {id:'EAST', name:'Eastlands',            county:'Nairobi',      lat:-1.2800, lng:36.8620, radius:0.040, avgMins:7.1,  count:5},
      {id:'STHB', name:'South B / South C',   county:'Nairobi',      lat:-1.3120, lng:36.8350, radius:0.025, avgMins:6.8,  count:4},
      {id:'LANG', name:"Lang'ata",             county:'Nairobi',      lat:-1.3420, lng:36.7580, radius:0.035, avgMins:8.3,  count:3},
      {id:'KASA', name:'Kasarani',             county:'Nairobi',      lat:-1.2200, lng:36.8980, radius:0.045, avgMins:9.1,  count:3},
      {id:'EMBA', name:'Embakasi',             county:'Nairobi',      lat:-1.3200, lng:36.9020, radius:0.050, avgMins:9.8,  count:3},
      // ── Kiambu (9) ──────────────────────────────────────────────────────
      {id:'KIAB', name:'Kiambu Town',          county:'Kiambu',       lat:-1.1719, lng:36.8353, radius:0.025, avgMins:7.2,  count:5},
      {id:'THIK', name:'Thika Town',           county:'Kiambu',       lat:-1.0332, lng:37.0694, radius:0.030, avgMins:8.5,  count:4},
      // ── Nakuru (8) ──────────────────────────────────────────────────────
      {id:'NKRU', name:'Nakuru Town',          county:'Nakuru',       lat:-0.3031, lng:36.0800, radius:0.040, avgMins:9.0,  count:5},
      {id:'NAIV', name:'Naivasha',             county:'Nakuru',       lat:-0.7167, lng:36.4318, radius:0.030, avgMins:10.5, count:3},
      // ── Kakamega / Vihiga (8) ───────────────────────────────────────────
      {id:'KAKA', name:'Kakamega Town',        county:'Kakamega',     lat: 0.2827, lng:34.7519, radius:0.035, avgMins:8.8,  count:4},
      {id:'VIHI', name:'Vihiga / Mbale',       county:'Vihiga',       lat: 0.0833, lng:34.7167, radius:0.030, avgMins:9.5,  count:3},
      // ── Bungoma / Trans Nzoia (8) ───────────────────────────────────────
      {id:'BUNG', name:'Bungoma Town',         county:'Bungoma',      lat: 0.5600, lng:34.5600, radius:0.035, avgMins:9.2,  count:4},
      {id:'KITA', name:'Kitale',               county:'Trans Nzoia',  lat: 1.0167, lng:35.0000, radius:0.030, avgMins:9.8,  count:4},
      // ── Mombasa / Kilifi (10) ───────────────────────────────────────────
      {id:'MOMB', name:'Mombasa Island',       county:'Mombasa',      lat:-4.0435, lng:39.6682, radius:0.030, avgMins:7.5,  count:5},
      {id:'KILF', name:'Kilifi Town',          county:'Kilifi',       lat:-3.6330, lng:39.8495, radius:0.035, avgMins:10.2, count:4},
      // ── Kisumu / Siaya (9) ──────────────────────────────────────────────
      {id:'KISM', name:'Kisumu City',          county:'Kisumu',       lat:-0.0917, lng:34.7680, radius:0.035, avgMins:8.2,  count:4},
      {id:'SIAY', name:'Siaya Town',           county:'Siaya',        lat:-0.0617, lng:34.2875, radius:0.030, avgMins:10.8, count:4},
      // ── Kisii / Nyamira (8) ─────────────────────────────────────────────
      {id:'KISI', name:'Kisii Town',           county:'Kisii',        lat:-0.6817, lng:34.7667, radius:0.030, avgMins:9.5,  count:4},
      {id:'NYAM', name:'Nyamira Town',         county:'Nyamira',      lat:-0.5667, lng:34.9333, radius:0.025, avgMins:10.5, count:3},
      // ── Homa Bay / Migori (8) ───────────────────────────────────────────
      {id:'HOBA', name:'Homa Bay Town',        county:'Homa Bay',     lat:-0.5274, lng:34.4508, radius:0.030, avgMins:10.2, count:4},
      {id:'MIGR', name:'Migori Town',          county:'Migori',       lat:-1.0633, lng:34.4731, radius:0.028, avgMins:11.0, count:4},
      // ── Eldoret / Nandi (10) ────────────────────────────────────────────
      {id:'ELDO', name:'Eldoret Town',         county:'Uasin Gishu',  lat: 0.5143, lng:35.2698, radius:0.040, avgMins:8.0,  count:5},
      {id:'KAPS', name:'Kapsabet',             county:'Nandi',        lat: 0.2033, lng:35.1022, radius:0.028, avgMins:10.5, count:4},
      // ── Meru / Tharaka-Nithi (7) ────────────────────────────────────────
      {id:'MERU', name:'Meru Town',            county:'Meru',         lat: 0.0475, lng:37.6491, radius:0.035, avgMins:9.8,  count:4},
      {id:'CHUK', name:'Chuka',                county:'Tharaka-Nithi',lat:-0.3052, lng:37.9139, radius:0.025, avgMins:11.5, count:2},
      // ── Embu / Machakos / Makueni (9) ───────────────────────────────────
      {id:'EMBU', name:'Embu Town',            county:'Embu',         lat:-0.5270, lng:37.4579, radius:0.030, avgMins:9.2,  count:3},
      {id:'MACH', name:'Machakos Town',        county:'Machakos',     lat:-1.5177, lng:37.2634, radius:0.030, avgMins:8.8,  count:4},
      {id:'MAKU', name:'Makueni Town',         county:'Makueni',      lat:-1.8033, lng:37.6210, radius:0.025, avgMins:11.0, count:2},
      // ── Nyeri / Kirinyaga (6) ───────────────────────────────────────────
      {id:'NYER', name:'Nyeri Town',           county:'Nyeri',        lat:-0.4167, lng:36.9500, radius:0.030, avgMins:8.5,  count:3},
      {id:'KERU', name:'Kerugoya',             county:'Kirinyaga',    lat:-0.5005, lng:37.2786, radius:0.025, avgMins:9.8,  count:2},
      // ── Kajiado / Narok (5) ─────────────────────────────────────────────
      {id:'KAJI', name:'Kajiado Town',         county:'Kajiado',      lat:-1.8500, lng:36.7833, radius:0.030, avgMins:12.0, count:3},
      {id:'NARO', name:'Narok Town',           county:'Narok',        lat:-1.0833, lng:35.8667, radius:0.030, avgMins:13.5, count:2},
      // ── Busia (2) ───────────────────────────────────────────────────────
      {id:'BUSI', name:'Busia Town',           county:'Busia',        lat: 0.4604, lng:34.1116, radius:0.025, avgMins:10.5, count:2},
      // ── Turkana / West Pokot (4) ─────────────────────────────────────────
      {id:'LODW', name:'Lodwar',               county:'Turkana',      lat: 3.1167, lng:35.6000, radius:0.040, avgMins:18.0, count:2},
      {id:'KAPE', name:'Kapenguria',           county:'West Pokot',   lat: 1.2366, lng:35.1120, radius:0.030, avgMins:15.0, count:2},
      // ── Garissa / Wajir (3) ─────────────────────────────────────────────
      {id:'GARI', name:'Garissa Town',         county:'Garissa',      lat:-0.4532, lng:39.6401, radius:0.035, avgMins:16.0, count:2},
      {id:'WAJI', name:'Wajir Town',           county:'Wajir',        lat: 1.7471, lng:40.0573, radius:0.030, avgMins:18.0, count:1},
      // ── 15 additional counties for full 47-county coverage ───────────────
      {id:'MUNG', name:"Murang'a Town",        county:"Murang'a",     lat:-0.7208, lng:37.1524, radius:0.028, avgMins:10.0, count:1},
      {id:'NYAN', name:'Ol Kalou',             county:'Nyandarua',    lat:-0.1833, lng:36.3667, radius:0.028, avgMins:11.5, count:1},
      {id:'KITU', name:'Kitui Town',           county:'Kitui',        lat:-1.3673, lng:38.0123, radius:0.030, avgMins:12.0, count:1},
      {id:'KERI', name:'Kericho Town',         county:'Kericho',      lat:-0.3697, lng:35.2863, radius:0.028, avgMins:9.8,  count:1},
      {id:'BOME', name:'Bomet Town',           county:'Bomet',        lat:-0.7897, lng:35.3394, radius:0.025, avgMins:11.0, count:1},
      {id:'BARI', name:'Kabarnet',             county:'Baringo',      lat: 0.4927, lng:35.7440, radius:0.030, avgMins:13.0, count:1},
      {id:'LAIK', name:'Nanyuki',              county:'Laikipia',     lat: 0.0073, lng:37.0738, radius:0.030, avgMins:11.5, count:1},
      {id:'ELGM', name:'Iten',                 county:'Elgeyo-Marakwet',lat:0.6705,lng:35.5058, radius:0.025, avgMins:13.5, count:1},
      {id:'ISIO', name:'Isiolo Town',          county:'Isiolo',       lat: 0.3542, lng:38.0694, radius:0.030, avgMins:14.0, count:1},
      {id:'SAMB', name:'Maralal',              county:'Samburu',      lat: 1.0967, lng:36.7012, radius:0.030, avgMins:16.0, count:1},
      {id:'TAIT', name:'Voi',                  county:'Taita-Taveta', lat:-3.3966, lng:38.5566, radius:0.030, avgMins:13.0, count:1},
      {id:'TANR', name:'Hola',                 county:'Tana River',   lat:-1.5000, lng:40.0333, radius:0.030, avgMins:17.0, count:1},
      {id:'LAMU', name:'Lamu Town',            county:'Lamu',         lat:-2.2694, lng:40.9023, radius:0.025, avgMins:15.0, count:1},
      {id:'MARS', name:'Marsabit Town',        county:'Marsabit',     lat: 2.3333, lng:37.9833, radius:0.040, avgMins:19.0, count:1},
      {id:'MAND', name:'Mandera Town',         county:'Mandera',      lat: 3.9366, lng:41.8670, radius:0.040, avgMins:22.0, count:1}
    ];

    // Flat weighted array: each zone repeated `count` times — used for
    // proportional random incident placement across the country.
    var _WEIGHTED_ZONES = (function () {
      var arr = [];
      for (var _zi = 0; _zi < KENYA_ZONES.length; _zi++) {
        var _z = KENYA_ZONES[_zi];
        for (var _c = 0; _c < _z.count; _c++) arr.push(_z);
      }
      return arr;
    }());

    // ═══════════════════════════════════════════════════════════════════════
    // 4. DISPATCHER ROSTER
    // ═══════════════════════════════════════════════════════════════════════
    var AGENTS = [
      {id:'ag001', n:'J. Kamau',    role:'Senior Dispatcher', status:'on_call', ext:'201', shift:'day'},
      {id:'ag002', n:'A. Wanjiku',  role:'Dispatcher',        status:'on_call', ext:'202', shift:'day'},
      {id:'ag003', n:'P. Odhiambo', role:'Dispatcher',        status:'on_call', ext:'203', shift:'day'},
      {id:'ag004', n:'F. Mutua',    role:'Dispatcher',        status:'on_call', ext:'204', shift:'day'},
      {id:'ag005', n:'B. Atieno',   role:'Dispatcher',        status:'on_call', ext:'205', shift:'day'},
      {id:'ag006', n:'G. Njoroge',  role:'Dispatcher',        status:'ready',   ext:'206', shift:'day'},
      {id:'ag007', n:'H. Maina',    role:'Supervisor',        status:'break',   ext:'200', shift:'day'}
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // 5. CHIEF COMPLAINTS (for simulation — ICD-11 coded)
    // ═══════════════════════════════════════════════════════════════════════
    var COMPLAINTS = [
      // Priority 1 — Critical
      {text:'Cardiac arrest',           icd11:'SC56.0', priority:1, als:true},
      {text:'Road traffic accident — major', icd11:'ND00', priority:1, als:true},
      {text:'Gunshot / penetrating trauma',  icd11:'NF0C', priority:1, als:true},
      {text:'Severe respiratory distress',   icd11:'CA23.Z', priority:1, als:true},
      {text:'Stroke / CVA',             icd11:'8B20', priority:1, als:true},
      {text:'Major burns (>30% BSA)',   icd11:'NF2E.0', priority:1, als:true},
      {text:'Eclampsia / obstetric emergency', icd11:'JA00', priority:1, als:true},
      // Priority 2 — Urgent
      {text:'Chest pain (STEMI suspected)',  icd11:'BA41', priority:2, als:true},
      {text:'Altered level of consciousness',icd11:'MG43', priority:2, als:false},
      {text:'Severe trauma — limb',          icd11:'NC90', priority:2, als:false},
      {text:'Seizure',                   icd11:'8A60.Z', priority:2, als:false},
      {text:'Diabetic emergency — hypoglycaemia', icd11:'5A41', priority:2, als:false},
      {text:'Snake bite',                icd11:'NE61', priority:2, als:true},
      {text:'Anaphylaxis',               icd11:'CA01.0', priority:2, als:true},
      // Priority 3 — Non-urgent
      {text:'Abdominal pain',            icd11:'MD81.1', priority:3, als:false},
      {text:'Difficulty breathing — mild', icd11:'MD18', priority:3, als:false},
      {text:'Fall — possible fracture',  icd11:'PA00', priority:3, als:false},
      {text:'Fever with convulsions (child)', icd11:'MG26', priority:3, als:false},
      // Priority 4 — Routine
      {text:'Headache / fever',          icd11:'MD21', priority:4, als:false},
      {text:'Minor laceration',          icd11:'NE80', priority:4, als:false},
      {text:'Non-emergency transfer',    icd11:'QA00', priority:4, als:false}
    ];

    // Fake what3words word pool
    var W3W_WORDS = [
      'tables','frozen','rivers','glass','smile','amber','pilot','clock',
      'stone','cedar','rapid','noble','crown','light','swift','green',
      'barrel','track','bloom','plaza','field','tower','bridge','silver',
      'copper','safari','garden','market','valley','ridge','crest','peak'
    ];

    var PROVIDER_NAMES = [
      'AMREF Flying Doctors','St John Ambulance Kenya','Kenya Red Cross',
      'Flare Emergency Response','Nairobi County EMS','Kiambu County EMS',
      'Africa Air Rescue','AAR Healthcare','Avenue Healthcare EMS'
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // 6. INTERNAL STATE STORE
    // ═══════════════════════════════════════════════════════════════════════
    var _state = {
      incidents:  [],
      fleet:      [],
      hospitals:  [],
      agents:     [],
      zones:      KENYA_ZONES,
      incCounter: 10000,
      initialized: false
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 7. EVENT BUS
    // ═══════════════════════════════════════════════════════════════════════
    var _listeners = {};

    function _on(event, cb) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(cb);
      return _pub;
    }

    function _off(event, cb) {
      if (!_listeners[event]) return _pub;
      _listeners[event] = _listeners[event].filter(function (f) { return f !== cb; });
      return _pub;
    }

    function _emit(event, data) {
      var handlers = _listeners[event] || [];
      for (var i = 0; i < handlers.length; i++) {
        try { handlers[i](data); } catch (e) { console.error('[NACDState] handler error on ' + event + ':', e); }
      }
      var star = _listeners['*'] || [];
      for (var j = 0; j < star.length; j++) {
        try { star[j](event, data); } catch (e) {}
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 8. UTILITY HELPERS
    // ═══════════════════════════════════════════════════════════════════════
    var _seededRand = Math.random; // replaced in init() with seeded version

    function _initRNG(seed) {
      var s = (seed >>> 0) || 0x6ACE1234;
      _seededRand = function() {
        s = (s + 0x6D2B79F5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function _rand(min, max)      { return min + _seededRand() * (max - min); }
    function _randInt(min, max)   { return Math.floor(_rand(min, max + 1)); }
    function _pick(arr)           { return arr[_randInt(0, arr.length - 1)]; }
    function _pad(n, d)           { return String(n).padStart(d, '0'); }
    function _incNum(n)           { return 'INC-' + _pad(n, 6); }

    function _distKm(lat1, lng1, lat2, lng2) {
      var R = 6371;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function _randomInZone(zone) {
      var angle = _seededRand() * 2 * Math.PI;
      var r     = Math.sqrt(_seededRand()) * zone.radius;
      return { lat: zone.lat + r * Math.cos(angle), lng: zone.lng + r * Math.sin(angle) };
    }

    // Find seeded zone whose centroid is nearest to a given lat/lng. Used to
    // backfill county/zone for incidents created with coords but no county tag.
    function _nearestZone(lat, lng) {
      if (lat == null || lng == null || !_state || !_state.zones) return null;
      var best = null, bestD = Infinity;
      for (var i = 0; i < _state.zones.length; i++) {
        var z  = _state.zones[i];
        var dy = z.lat - lat, dx = z.lng - lng;
        var d  = dy * dy + dx * dx;
        if (d < bestD) { bestD = d; best = z; }
      }
      return best;
    }

    function _randomW3W() {
      return '///' + _pick(W3W_WORDS) + '.' + _pick(W3W_WORDS) + '.' + _pick(W3W_WORDS);
    }

    function _findUnit(id) {
      for (var i = 0; i < _state.fleet.length; i++) {
        if (_state.fleet[i].id === id) return _state.fleet[i];
      }
      return null;
    }

    function _findHospital(id) {
      for (var i = 0; i < _state.hospitals.length; i++) {
        if (_state.hospitals[i].id === id) return _state.hospitals[i];
      }
      return null;
    }

    function _findIncident(id) {
      for (var i = 0; i < _state.incidents.length; i++) {
        if (_state.incidents[i].id === id) return _state.incidents[i];
      }
      return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. FLEET GENERATOR — 150 units seeded across zones
    // ═══════════════════════════════════════════════════════════════════════
    var UNIT_TYPES  = ['ALS','ALS','BLS','BLS','BLS']; // 40% ALS, 60% BLS
    // Speed: ~40 km/h city = ~0.000099 deg/s; use 0.00011 for snappier sim
    var SPEED_DEG_S = 0.00011;

    function _generateFleet() {
      var units = [];
      var seq   = 0; // global unit counter for id/type/provider cycling
      for (var zi = 0; zi < KENYA_ZONES.length; zi++) {
        var zone = KENYA_ZONES[zi];
        for (var ci = 0; ci < zone.count; ci++) {
          seq++;
          var pos = _randomInZone(zone);
          units.push({
            id:          'A-' + _pad(seq, 3),
            type:        UNIT_TYPES[seq % UNIT_TYPES.length],
            status:      UNIT_STATUS.AVAILABLE,
            lat:         pos.lat,
            lng:         pos.lng,
            targetLat:   null,
            targetLng:   null,
            zone:        zone.id,
            county:      zone.county,
            crew:        2,
            provider:    PROVIDER_NAMES[seq % PROVIDER_NAMES.length],
            providerId:  _PROVIDERS[(seq - 1) % 7].id,
            fuel:        _randInt(40, 100),
            anomaly:     _seededRand() < 0.03,
            anomalyDesc: null,
            incidentId:       null,
            _routeWaypoints:  null,
            _waypointIdx:     0,
            updatedAt:        Date.now()
          });
        }
      }
      // Seed a handful of named anomalies
      units[7].anomaly  = true; units[7].anomalyDesc  = 'GPS signal lost >5 min';
      units[23].anomaly = true; units[23].anomalyDesc = 'Engine warning light';
      units[61].anomaly = true; units[61].anomalyDesc = 'Low fuel (<10%)';
      units[61].fuel    = 8;

      // ── E+ Emergency Medical Services (PRV008) — 120 units, EP-001 to EP-120
      // Phase 1 fleet: national coverage, 50% ALS / 50% BLS, heavy Nairobi + major cities
      var _EPLUS_DIST = [
        // Nairobi Metro (~50)
        {zid:'CBD',  n:12}, {zid:'WEST', n:8},  {zid:'EAST', n:7},
        {zid:'STHB', n:5},  {zid:'LANG', n:4},  {zid:'KASA', n:4},
        {zid:'EMBA', n:5},  {zid:'KIAB', n:5},
        // Mombasa / Coast (~15)
        {zid:'MOMB', n:9},  {zid:'KILF', n:4},  {zid:'TAIT', n:2},
        // Western / Nyanza (~18)
        {zid:'KISM', n:7},  {zid:'KAKA', n:5},  {zid:'KISI', n:4},  {zid:'SIAY', n:2},
        // Rift Valley (~22)
        {zid:'ELDO', n:9},  {zid:'NKRU', n:8},  {zid:'KERI', n:3},  {zid:'NAIV', n:2},
        // Central / Eastern + Kiambu overflow (~15)
        {zid:'NYER', n:3},  {zid:'MERU', n:3},  {zid:'MACH', n:4},
        {zid:'EMBU', n:2},  {zid:'THIK', n:3}
      ];
      var epSeq = 0;
      for (var ei = 0; ei < _EPLUS_DIST.length; ei++) {
        var ezd   = _EPLUS_DIST[ei];
        var eZone = _zoneById(ezd.zid) || KENYA_ZONES[0];
        for (var ej = 0; ej < ezd.n; ej++) {
          epSeq++;
          var epos = _randomInZone(eZone);
          units.push({
            id:          'EP-' + _pad(epSeq, 3),
            type:        epSeq % 2 === 0 ? 'ALS' : 'BLS',
            status:      UNIT_STATUS.AVAILABLE,
            lat:         epos.lat,
            lng:         epos.lng,
            targetLat:   null,
            targetLng:   null,
            zone:        eZone.id,
            county:      eZone.county,
            crew:        2,
            provider:    'E+ Emergency Medical Services',
            providerId:  'PRV008',
            fuel:        _randInt(55, 100),
            anomaly:     false,
            anomalyDesc: null,
            incidentId:       null,
            _routeWaypoints:  null,
            _waypointIdx:     0,
            updatedAt:        Date.now()
          });
        }
      }
      // Seed a couple of E+ anomalies
      if (units.length > 157) { units[157].anomaly = true; units[157].anomalyDesc = 'Service overdue (12,000 km)'; }
      if (units.length > 193) { units[193].anomaly = true; units[193].anomalyDesc = 'Stretcher mechanism — maintenance required'; }

      return units;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 10. INCIDENT FACTORY
    // ═══════════════════════════════════════════════════════════════════════
    function _buildIncident(overrides) {
      var complaint = _pick(COMPLAINTS);
      var zone      = _pick(_WEIGHTED_ZONES);
      var pos       = _randomInZone(zone);
      var now       = Date.now();

      _state.incCounter++;
      var inc = {
        id:           'inc_' + _state.incCounter,
        number:       _incNum(_state.incCounter),
        priority:     complaint.priority,
        status:       STATUS.PENDING,
        complaint:    complaint.text,
        icd11:        complaint.icd11,
        requiresALS:  complaint.als,
        lat:          pos.lat,
        lng:          pos.lng,
        address:      zone.name + ', ' + zone.county + ' County',
        w3w:          _randomW3W(),
        county:       zone.county,
        zone:         zone.id,
        unitId:       null,
        hospitalId:   null,
        dispatcherId: null,
        notes:        '',
        // timestamps
        createdAt:    now,
        dispatchedAt: null,
        enRouteAt:    null,
        onSceneAt:    null,
        transportAt:  null,
        clearedAt:    null,
        // internal sim targets (ms epoch)
        _autoDispatchAt: now + _randInt(TIMINGS.autoDipatchSec.min, TIMINGS.autoDipatchSec.max) * 1000,
        _ackAt:          null,
        _transportAt:    null,
        _clearAt:        null
      };

      // Apply any overrides from dispatcher or test harness
      if (overrides) {
        for (var k in overrides) {
          if (overrides.hasOwnProperty(k)) inc[k] = overrides[k];
        }

        // ── User-created incidents (PSAP or dispatcher manual entry) MUST NOT
        // auto-dispatch — the dispatcher needs to decide. The sim tick checks
        // `now >= inc._autoDispatchAt`; setting it to null disables that branch.
        if (overrides.source === 'psap' || overrides.source === 'dispatcher') {
          inc._autoDispatchAt = null;
        }

        // ── If caller passed lat/lng but did NOT pass county/zone, derive both
        // from the nearest seeded zone instead of leaving the random pick in
        // place. Prevents "Westlands incident tagged Makueni" bug.
        if (overrides.lat != null && overrides.lng != null &&
            (overrides.county == null || overrides.county === '' ||
             overrides.zone   == null || overrides.zone   === '')) {
          var nz = _nearestZone(inc.lat, inc.lng);
          if (nz) {
            if (overrides.county == null || overrides.county === '') inc.county = nz.county;
            if (overrides.zone   == null || overrides.zone   === '') inc.zone   = nz.id;
          }
        }
      }

      // ── Pre-assign nearest hospital so the hospital screen has a
      // pre-pre-alert (an "inbound" record) the moment an incident exists.
      // Dispatcher can still override via setHospital; the engine will
      // re-confirm at the TRANSPORT transition via _findBestHospital.
      if (!inc.hospitalId && _state.hospitals && _state.hospitals.length) {
        try {
          var picked = _findBestHospital(inc);
          if (picked) inc.hospitalId = picked.id;
        } catch (e) { /* hospitals not ready yet — fine, transport step will fill */ }
      }

      _state.incidents.push(inc);
      _emit('incident:created', inc);
      return inc;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 11. INCIDENT STATUS TRANSITIONS
    // ═══════════════════════════════════════════════════════════════════════
    function _transition(inc, newStatus, now, opts) {
      var old = inc.status;
      inc.status = newStatus;

      var tsMap = {
        dispatched: 'dispatchedAt',
        en_route:   'enRouteAt',
        on_scene:   'onSceneAt',
        transport:  'transportAt',
        cleared:    'clearedAt'
      };
      if (tsMap[newStatus]) inc[tsMap[newStatus]] = now;

      var unit = inc.unitId ? _findUnit(inc.unitId) : null;

      if (newStatus === STATUS.DISPATCHED) {
        inc._ackAt = now + _randInt(TIMINGS.acknowledgesSec.min, TIMINGS.acknowledgesSec.max) * 1000;
        if (unit) unit.status = UNIT_STATUS.DISPATCHING;
      }

      if (newStatus === STATUS.EN_ROUTE) {
        if (unit) {
          unit.status          = UNIT_STATUS.EN_ROUTE;
          unit.targetLat       = inc.lat;
          unit.targetLng       = inc.lng;
          unit._routeWaypoints = null;
          unit._waypointIdx    = 0;
        }
      }

      if (newStatus === STATUS.ON_SCENE) {
        inc._transportAt = now + _randInt(TIMINGS.treatmentSec.min, TIMINGS.treatmentSec.max) * 1000;
        if (unit) {
          unit.status    = UNIT_STATUS.ON_SCENE;
          unit.targetLat = null;
          unit.targetLng = null;
        }
      }

      if (newStatus === STATUS.TRANSPORT) {
        var hosp = opts && opts.hospital ? opts.hospital : _findBestHospital(inc);
        if (hosp && !inc.hospitalId) inc.hospitalId = hosp.id;
        var dest  = inc.hospitalId ? _findHospital(inc.hospitalId) : null;
        if (unit && dest) {
          unit.status          = UNIT_STATUS.TRANSPORT;
          unit.targetLat       = dest.lat;
          unit.targetLng       = dest.lng;
          unit._routeWaypoints = null;
          unit._waypointIdx    = 0;
        }
        // Estimate clear time based on distance
        var travelSec = TIMINGS.transportSec.min;
        if (unit && dest) {
          var km = _distKm(unit.lat, unit.lng, dest.lat, dest.lng);
          travelSec = Math.max(TIMINGS.transportSec.min, Math.min(TIMINGS.transportSec.max, km * 60));
        }
        inc._clearAt = now + travelSec * 1000;
      }

      if (newStatus === STATUS.CLEARED || newStatus === STATUS.CANCELLED) {
        if (unit) {
          unit.status          = UNIT_STATUS.AVAILABLE;
          unit.incidentId      = null;
          var homeZone         = _zoneById(unit.zone);
          unit.targetLat       = homeZone ? homeZone.lat : null;
          unit.targetLng       = homeZone ? homeZone.lng : null;
          unit._routeWaypoints = null;
          unit._waypointIdx    = 0;
        }
      }

      _emit('incident:updated', inc);
      _emit('incident:status_changed', { incident: inc, from: old, to: newStatus });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 12. FLEET HELPERS
    // ═══════════════════════════════════════════════════════════════════════
    function _findNearestAvailable(lat, lng, needALS, preferZone) {
      var best = null, bestDist = Infinity;
      var MAX_DISPATCH_KM = 150; // don't send units from >150 km away if closer ones exist

      // First pass: same zone (highest priority)
      if (preferZone) {
        for (var i = 0; i < _state.fleet.length; i++) {
          var u = _state.fleet[i];
          if (u.status !== UNIT_STATUS.AVAILABLE) continue;
          if (needALS && u.type !== 'ALS') continue;
          if (u.zone !== preferZone) continue;
          var d = _distKm(u.lat, u.lng, lat, lng);
          if (d < bestDist) { bestDist = d; best = u; }
        }
        if (best) return best;
      }

      // Second pass: within MAX_DISPATCH_KM
      for (var j = 0; j < _state.fleet.length; j++) {
        var v = _state.fleet[j];
        if (v.status !== UNIT_STATUS.AVAILABLE) continue;
        if (needALS && v.type !== 'ALS') continue;
        var dv = _distKm(v.lat, v.lng, lat, lng);
        if (dv <= MAX_DISPATCH_KM && dv < bestDist) { bestDist = dv; best = v; }
      }
      if (best) return best;

      // Last resort: global nearest (no coverage in range)
      for (var k = 0; k < _state.fleet.length; k++) {
        var w = _state.fleet[k];
        if (w.status !== UNIT_STATUS.AVAILABLE) continue;
        if (needALS && w.type !== 'ALS') continue;
        var dk = _distKm(w.lat, w.lng, lat, lng);
        if (dk < bestDist) { bestDist = dk; best = w; }
      }
      return best;
    }

    function _findBestHospital(inc) {
      var candidates = _state.hospitals.filter(function (h) {
        return h.div !== 'bypass' && h.edPct < 95;
      });
      if (!candidates.length) candidates = _state.hospitals.slice();
      var best = null, bestDist = Infinity;
      for (var i = 0; i < candidates.length; i++) {
        var h = candidates[i];
        // Prefer Level 6 for P1
        var d = _distKm(h.lat, h.lng, inc.lat, inc.lng);
        if (inc.priority === 1 && h.level === 6) d *= 0.7; // bias toward national referrals for critical
        if (d < bestDist) { bestDist = d; best = h; }
      }
      return best;
    }

    function _autoDispatch(inc, unit, now) {
      inc.unitId      = unit.id;
      unit.incidentId = inc.id;
      _transition(inc, STATUS.DISPATCHED, now);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13a. ROUTE WAYPOINT FOLLOWING
    // ═══════════════════════════════════════════════════════════════════════
    function _advanceAlongRoute(unit) {
      var wp = unit._routeWaypoints;
      if (!wp || wp.length < 2) return false;
      var idx = unit._waypointIdx || 0;
      if (idx >= wp.length - 1) {
        // Route complete — snap to exact destination (targetLat/Lng) and clear waypoints
        if (unit.targetLat !== null && unit.targetLng !== null) {
          unit.lat = unit.targetLat;
          unit.lng = unit.targetLng;
        } else {
          unit.lat = wp[wp.length - 1][1];
          unit.lng = wp[wp.length - 1][0];
        }
        unit._routeWaypoints = null;
        unit._waypointIdx    = 0;
        return true;
      }
      var budget = SPEED_DEG_S;
      while (budget > 1e-9 && idx < wp.length - 1) {
        var nextLng = wp[idx + 1][0];
        var nextLat = wp[idx + 1][1];
        var dlat = nextLat - unit.lat;
        var dlng = nextLng - unit.lng;
        var segDist = Math.sqrt(dlat * dlat + dlng * dlng);
        if (segDist <= budget) {
          unit.lat = nextLat;
          unit.lng = nextLng;
          idx++;
          budget -= segDist;
        } else {
          unit.lat += (dlat / segDist) * budget;
          unit.lng += (dlng / segDist) * budget;
          budget = 0;
        }
      }
      unit._waypointIdx = idx;
      return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 13. UNIT MOVEMENT (called every tick)
    // ═══════════════════════════════════════════════════════════════════════
    function _moveUnits() {
      var now = Date.now();
      for (var i = 0; i < _state.fleet.length; i++) {
        var u = _state.fleet[i];

        if (u.targetLat !== null && u.targetLng !== null) {
          if (u._routeWaypoints) {
            _advanceAlongRoute(u);
          } else {
            var dlat = u.targetLat - u.lat;
            var dlng = u.targetLng - u.lng;
            var dist = Math.sqrt(dlat * dlat + dlng * dlng);
            if (dist < 0.0008) {
              u.lat = u.targetLat;
              u.lng = u.targetLng;
            } else {
              u.lat += (dlat / dist) * SPEED_DEG_S;
              u.lng += (dlng / dist) * SPEED_DEG_S;
            }
          }
          u.updatedAt = now;
          _emit('unit:moved', u);

        } else if (u.status === UNIT_STATUS.AVAILABLE || u.status === UNIT_STATUS.STANDBY) {
          // Random patrol drift (keeps map alive, prevents burn-in)
          if (Math.random() < 0.08) {
            var zone = _zoneById(u.zone) || KENYA_ZONES[0];
            u.lat += (Math.random() - 0.5) * 0.0009;
            u.lng += (Math.random() - 0.5) * 0.0009;
            // Clamp to zone
            var dz   = Math.sqrt(Math.pow(u.lat - zone.lat, 2) + Math.pow(u.lng - zone.lng, 2));
            if (dz > zone.radius) {
              u.lat = zone.lat + (u.lat - zone.lat) / dz * zone.radius * 0.92;
              u.lng = zone.lng + (u.lng - zone.lng) / dz * zone.radius * 0.92;
            }
            u.updatedAt = now;
          }
        }
      }
    }

    function _zoneById(id) {
      for (var i = 0; i < KENYA_ZONES.length; i++) { if (KENYA_ZONES[i].id === id) return KENYA_ZONES[i]; }
      return null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 14. SIMULATION ENGINE
    // ═══════════════════════════════════════════════════════════════════════
    var _simRunning  = false;
    var _simInterval = null;
    var _simRate     = 1.0; // target incidents per minute

    function _simTick() {
      var now = Date.now();

      // ── Generate new incidents (LOCAL/offline mode only) ────────────────
      // When Supabase is wired, /api/cron/heartbeat is the single source
      // for new incidents — otherwise N open tabs would race-spawn into
      // the same DB and create a write storm.
      if (!_sb) {
        var active = _state.incidents.filter(function (i) {
          return i.status !== STATUS.CLEARED && i.status !== STATUS.CANCELLED;
        }).length;
        var gap = 14 - active;
        if (gap > 0 && Math.random() < (0.04 * gap)) {
          _buildIncident();
        }
      }

      // ── Progress existing incidents ─────────────────────────────────────
      for (var i = 0; i < _state.incidents.length; i++) {
        var inc = _state.incidents[i];
        if (inc.status === STATUS.CLEARED || inc.status === STATUS.CANCELLED) continue;

        // Auto-dispatch pending
        if (inc.status === STATUS.PENDING && now >= inc._autoDispatchAt) {
          var unit = _findNearestAvailable(inc.lat, inc.lng, inc.requiresALS, inc.zone);
          if (unit) _autoDispatch(inc, unit, now);
          continue;
        }

        // Acknowledge → en route
        if (inc.status === STATUS.DISPATCHED && inc._ackAt && now >= inc._ackAt) {
          _transition(inc, STATUS.EN_ROUTE, now);
          continue;
        }

        // En route → on scene
        // Only flip once the road-route is exhausted. The old 150 m proximity
        // check fired mid-route — _transition then nulled targetLat/Lng so the
        // unit stopped advancing wherever it happened to be (often "way off"
        // from the scene per tester feedback 2026-05-23).
        if (inc.status === STATUS.EN_ROUTE && inc.unitId) {
          var u2 = _findUnit(inc.unitId);
          if (u2) {
            var routeRemaining = u2._routeWaypoints &&
                                 u2._routeWaypoints.length > 1 &&
                                 (u2._waypointIdx || 0) < u2._routeWaypoints.length - 1;
            var distKm = _distKm(u2.lat, u2.lng, inc.lat, inc.lng);
            // Two conditions: (a) following waypoints — wait until exhausted;
            //                 (b) straight-line — wait until within 50 m
            if (!routeRemaining && distKm < 0.05) {
              _transition(inc, STATUS.ON_SCENE, now);
              continue;
            }
          }
        }

        // On scene → transport
        if (inc.status === STATUS.ON_SCENE && inc._transportAt && now >= inc._transportAt) {
          _transition(inc, STATUS.TRANSPORT, now);
          continue;
        }

        // Transport → cleared (proximity to hospital)
        if (inc.status === STATUS.TRANSPORT && inc.unitId) {
          var u3   = _findUnit(inc.unitId);
          var hosp = inc.hospitalId ? _findHospital(inc.hospitalId) : null;
          if (u3 && hosp && _distKm(u3.lat, u3.lng, hosp.lat, hosp.lng) < 0.15) {
            _transition(inc, STATUS.CLEARED, now);
          }
        }
      }

      // ── Prune cleared incidents (keep last 30 for history) ──────────────
      var cleared = _state.incidents.filter(function (i) { return i.status === STATUS.CLEARED; });
      if (cleared.length > 30) {
        var toRemove = {};
        cleared.slice(0, cleared.length - 30).forEach(function (i) { toRemove[i.id] = true; });
        _state.incidents = _state.incidents.filter(function (i) { return !toRemove[i.id]; });
      }

      // ── Move units ──────────────────────────────────────────────────────
      _moveUnits();

      // ── Fluctuate hospital ED capacity ──────────────────────────────────
      if (Math.random() < 0.05) {
        var h = _state.hospitals[_randInt(0, _state.hospitals.length - 1)];
        h.edPct = Math.min(99, Math.max(20, h.edPct + _randInt(-3, 3)));
        if (h.edPct >= 95) h.div = 'bypass';
        else if (h.edPct >= 85) h.div = 'diversion';
        else h.div = 'open';
      }

      // ── Auto-generate claims from newly-cleared incidents ───────────────
      _autoSyncClaims();

      // ── Emit global tick ────────────────────────────────────────────────
      _emit('state:tick', _publicState());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 15. SUPABASE SYNC LAYER (optional — graceful offline)
    // ═══════════════════════════════════════════════════════════════════════
    var _sb = null; // supabase client instance

    // Phase 4h — ID translation maps, write queue, echo-prevention ring buffer
    var _hospUuidByExtId   = {};  // 'h001' → uuid
    var _hospExtIdByUuid   = {};  // uuid   → 'h001'
    var _incUuidByDisplay  = {};  // 'INC-010001' → uuid
    var _incDisplayByUuid  = {};  // uuid   → 'INC-010001'
    var _mapsReady         = false;
    var _writeQueue        = [];
    var _localRequestIds   = [];  // ring buffer, cap 100 — echo prevention
    var _hydrateIdMaps     = function () {};  // assigned by Phase 4h helpers below
    var _pushDispatchEvent = function () {};  // assigned by Phase 4h helpers below

    // ── Rescue Slice 5: private state ─────────────────────────────────────────
    var _dbAgentUuidMap  = {};     // display_name (lowercase) → DB agent UUID
    var _claimsDbLoaded  = false;  // guard: prevent double backfill
    // JS claim status → DB case_invoices.status enum
    var _CLAIM_STATUS_DB = {
      QUEUED:       'queued',
      UNDER_REVIEW: 'submitted',
      APPROVED:     'approved',
      DISPUTED:     'submitted',   // no 'disputed' in DB enum — keep as submitted
      REJECTED:     'rejected',
      PAID:         'payment_completed'
    };
    // DB-allowed supervisor_actions.action_type enum values
    var _SV_ACTION_DB_TYPES = ['whisper','barge','transfer','flag_qa','note','takeover'];

    function _initSupabase(url, key) {
      if (typeof window === 'undefined') return;
      // Supabase JS v2 UMD must be loaded before NACDState
      var sbLib = window.supabase || (window.Supabase && window.Supabase.createClient);
      if (!sbLib) { console.warn('[NACDState] Supabase JS not found — running offline.'); return; }

      try {
        _sb = sbLib.createClient(url, key);
        console.info('[NACDState] Supabase connected:', url);
        _subscribeRealtime();
      } catch (e) {
        console.warn('[NACDState] Supabase init failed:', e.message);
      }
    }

    function _subscribeRealtime() {
      if (!_sb) return;
      _sb.channel('nadc-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' },   _onDbIncident)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fleet_units' }, _onDbUnit)
        .subscribe(function (status) {
          console.info('[NACDState] Realtime:', status);
        });
    }

    function _onDbIncident(payload) {
      var row = payload.new || payload.old;
      if (!row) return;
      // Echo prevention — skip rows we pushed ourselves
      if (_localRequestIds.indexOf(row.id) !== -1) return;
      // Resolve display_id → local incident, or hydrate a NEW one if unseen
      var displayNum = row.display_id || _incDisplayByUuid[row.id] || null;
      if (!displayNum) return;
      // Maintain the ID mapping for future writes
      _incUuidByDisplay[displayNum] = row.id;
      _incDisplayByUuid[row.id]     = displayNum;
      var inc = _findIncident(displayNum);
      if (!inc) {
        // New incident from another tab/screen — hydrate locally so this
        // screen shows it without a page reload
        inc = _hydrateIncidentFromRow(row);
        if (inc) {
          _state.incidents.push(inc);
          _emit('incident:created', inc);
        }
        return;
      }
      // Apply update — v2 schema column names
      inc.status      = row.status     || inc.status;
      inc.unitId      = row.unit_id    || inc.unitId;
      inc.hospitalId  = row.hospital_id || inc.hospitalId;
      if (row.dispatched_at) inc.dispatchedAt = new Date(row.dispatched_at).getTime();
      if (row.en_route_at)   inc.enRouteAt    = new Date(row.en_route_at).getTime();
      if (row.on_scene_at)   inc.onSceneAt    = new Date(row.on_scene_at).getTime();
      if (row.transport_at)  inc.transportAt  = new Date(row.transport_at).getTime();
      if (row.cleared_at)    inc.clearedAt    = new Date(row.cleared_at).getTime();
      _emit('incident:updated', inc);
    }

    // Build a local incident object from a v2-schema incidents row.
    // Used both by the realtime listener and by the initial DB hydration.
    function _hydrateIncidentFromRow(row) {
      if (!row || !row.display_id) return null;
      var inc = {
        number:        row.display_id,
        priority:      row.priority,
        status:        row.status || STATUS.PENDING,
        complaint:     row.complaint,
        icd11:         row.icd11,
        requiresALS:   !!row.requires_als,
        lat:           row.lat,
        lng:           row.lng,
        address:       row.address,
        w3w:           row.w3w,
        county:        row.county,
        zone:          row.zone,
        callerName:    row.caller_name,
        callerPhone:   row.caller_phone,
        callerRelation: row.caller_relation,
        patientAge:    row.patient_age,
        patientSex:    row.patient_sex,
        unitId:        row.unit_id,
        hospitalId:    row.hospital_id,
        source:        row.source || 'sim',
        createdAt:     row.created_at  ? new Date(row.created_at).getTime()  : Date.now(),
        dispatchedAt:  row.dispatched_at ? new Date(row.dispatched_at).getTime() : null,
        enRouteAt:     row.en_route_at   ? new Date(row.en_route_at).getTime()   : null,
        onSceneAt:     row.on_scene_at   ? new Date(row.on_scene_at).getTime()   : null,
        transportAt:   row.transport_at  ? new Date(row.transport_at).getTime()  : null,
        clearedAt:     row.cleared_at    ? new Date(row.cleared_at).getTime()    : null
      };
      return inc;
    }

    function _onDbUnit(payload) {
      var row = payload.new;
      if (!row) return;
      var unit = _findUnit(row.id);
      if (unit) {
        unit.status = row.status       || unit.status;
        unit.lat    = row.current_lat  || unit.lat;
        unit.lng    = row.current_lng  || unit.lng;
      }
    }

    function _pushIncident(inc) {
      if (!_sb) return;
      if (!_mapsReady) { _writeQueue.push(function () { _pushIncident(inc); }); return; }
      var uuid     = _toUuid('incident', inc.number);
      // v2 hospitals.id IS the human-readable id (e.g. 'h001'), no UUID mapping
      var hospId   = inc.hospitalId || null;
      _tagLocalRequest(uuid);
      // v2 schema column names: complaint, icd11, lat, lng, address, w3w,
      // requires_als, patient_age, patient_sex, caller_*, source
      _sb.from('incidents').upsert({
        id:                uuid,
        display_id:        inc.number,
        priority:          inc.priority,
        status:            inc.status,
        complaint:         inc.complaint,
        icd11:             inc.icd11 || null,
        requires_als:      !!inc.requiresALS,
        lat:               inc.lat,
        lng:               inc.lng,
        address:           inc.address || (inc.zone ? inc.zone + ', ' + (inc.county || 'Nairobi') : 'Unknown'),
        w3w:               inc.w3w || null,
        county:            inc.county || 'Nairobi',
        zone:              inc.zone || 'CBD',
        caller_name:       inc.callerName  || null,
        caller_phone:      inc.callerPhone || null,
        caller_relation:   inc.callerRelation || null,
        patient_age:       inc.patientAge ? Number(inc.patientAge) : null,
        patient_sex:       inc.patientSex || null,
        unit_id:           inc.unitId   || null,
        hospital_id:       hospId,
        source:            inc.source || 'sim',
        dispatched_at:     inc.dispatchedAt ? new Date(inc.dispatchedAt).toISOString() : null,
        en_route_at:       inc.enRouteAt   ? new Date(inc.enRouteAt).toISOString()   : null,
        on_scene_at:       inc.onSceneAt   ? new Date(inc.onSceneAt).toISOString()   : null,
        transport_at:      inc.transportAt ? new Date(inc.transportAt).toISOString() : null,
        cleared_at:        inc.clearedAt   ? new Date(inc.clearedAt).toISOString()   : null,
        updated_at:        new Date().toISOString()
      }, { onConflict: 'id' }).then(function (r) {
        if (r.error) console.warn('[NACDState] incident push error:', r.error.message);
      });
    }

    function _pushUnit(unit) {
      if (!_sb) return;
      // Translate incidentId (internal 'inc_10001' form) → UUID for FK
      var incUuid = null;
      if (unit.incidentId) {
        var assignedInc = _findIncident(unit.incidentId);
        if (assignedInc) incUuid = _toUuid('incident', assignedInc.number);
      }
      _sb.from('fleet_units').update({
        status:              unit.status,
        current_lat:         unit.lat,
        current_lng:         unit.lng,
        current_incident_id: incUuid,
        last_seen:           new Date().toISOString()
      }).eq('id', unit.id).then(function (r) {
        if (r.error) console.warn('[NACDState] unit push error:', r.error.message);
      });
    }

    // ── Phase 4h helpers ──────────────────────────────────────────────────────

    function _genUuid() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    function _toUuid(entity, displayId) {
      if (!displayId) return null;
      if (entity === 'unit') return displayId;  // A-001..A-150 IS the PK — identity
      if (entity === 'hospital') return _hospUuidByExtId[displayId] || null;
      // entity === 'incident': look up by INC- display number; generate if new
      if (_incUuidByDisplay[displayId]) return _incUuidByDisplay[displayId];
      var uuid = _genUuid();
      _incUuidByDisplay[displayId] = uuid;
      _incDisplayByUuid[uuid]      = displayId;
      return uuid;
    }

    function _tagLocalRequest(uuid) {
      _localRequestIds.push(uuid);
      if (_localRequestIds.length > 100) _localRequestIds.shift();
    }

    // Hydrate _hosp* and _inc* maps + load existing incidents/fleet from
    // Supabase. v2 hospitals.id IS the human-readable id so the ext_id
    // mapping is identity. Assigned as a var so setSupabaseClient can
    // call it after _sb is patched.
    _hydrateIdMaps = function () {
      if (!_sb) return;
      Promise.all([
        _sb.from('hospitals').select('id'),
        _sb.from('incidents')
          .select('*')
          .in('status', ['pending','dispatched','en_route','on_scene','transport'])
          .order('created_at', { ascending: false })
          .limit(200),
        _sb.from('fleet_units')
          .select('id, status, current_lat, current_lng, current_incident_id')
          .limit(300)
      ]).then(function (results) {
        var hospRows = (results[0] && results[0].data) ? results[0].data : [];
        var incRows  = (results[1] && results[1].data) ? results[1].data : [];
        var unitRows = (results[2] && results[2].data) ? results[2].data : [];

        // hospitals.id is identity in v2 — no UUID mapping needed
        for (var i = 0; i < hospRows.length; i++) {
          var h = hospRows[i];
          if (h.id) {
            _hospUuidByExtId[h.id] = h.id;
            _hospExtIdByUuid[h.id] = h.id;
          }
        }

        // Build the display↔uuid map from any existing incidents
        for (var j = 0; j < incRows.length; j++) {
          var r = incRows[j];
          if (r.id && r.display_id) {
            _incUuidByDisplay[r.display_id] = r.id;
            _incDisplayByUuid[r.id]         = r.display_id;
          }
        }

        // HYDRATE active incidents into local state so every page sees the
        // SAME pool (cross-screen consistency).
        // Skip if we already have the same display_id locally.
        var existingNumbers = {};
        for (var k = 0; k < _state.incidents.length; k++) {
          existingNumbers[_state.incidents[k].number] = true;
        }
        var hydrated = 0;
        for (var m = 0; m < incRows.length; m++) {
          if (existingNumbers[incRows[m].display_id]) continue;
          var inc = _hydrateIncidentFromRow(incRows[m]);
          if (inc) {
            _state.incidents.push(inc);
            hydrated += 1;
          }
        }

        // HYDRATE fleet status from DB — preserves dispatcher decisions
        // across page reloads
        var unitsByDisplay = {};
        for (var u = 0; u < _state.fleet.length; u++) {
          unitsByDisplay[_state.fleet[u].id] = _state.fleet[u];
        }
        var unitsUpdated = 0;
        for (var n = 0; n < unitRows.length; n++) {
          var uRow = unitRows[n];
          var local = unitsByDisplay[uRow.id];
          if (!local) continue;
          if (uRow.status && uRow.status !== local.status) {
            local.status = uRow.status;
            unitsUpdated += 1;
          }
          if (uRow.current_lat != null) local.lat = uRow.current_lat;
          if (uRow.current_lng != null) local.lng = uRow.current_lng;
          if (uRow.current_incident_id) {
            // Translate DB uuid → display number so other code paths work
            local.incidentId = _incDisplayByUuid[uRow.current_incident_id] || null;
          }
        }

        _mapsReady = true;
        console.info('[NACDState] hydrated:',
          hospRows.length, 'hospitals,',
          incRows.length, 'incidents (', hydrated, 'newly local),',
          unitsUpdated, 'unit status updates');
        if (hydrated > 0) _emit('state:initialized', _publicState());

        var q = _writeQueue.splice(0);
        for (var k = 0; k < q.length; k++) { q[k](); }
        // Rescue Slice 4 — load persisted incidents now that UUID maps are ready
        _loadIncidentsFromDb();
        // Rescue Slice 5 — load agents (for supervisor FK) and claims backfill
        _loadAgentsFromDb();
        _loadClaimsFromDb();
      }).catch(function (e) {
        console.warn('[NACDState] ID map hydration failed:', e && e.message);
        _mapsReady = true;  // degrade gracefully — writes use generated UUIDs
        var q = _writeQueue.splice(0);
        for (var k = 0; k < q.length; k++) { q[k](); }
        // Still attempt DB load — hospital translations won't work but incident
        // status/data will still be correct (fallback: demo seed intact)
        _loadIncidentsFromDb();
        // Rescue Slice 5 — still attempt on error path (UUIDs will be partial)
        _loadAgentsFromDb();
        _loadClaimsFromDb();
      });
    };

    // ── Rescue Slice 4 — load active incidents from Supabase on auth ─────────────
    // Called after _hydrateIdMaps resolves so hospital UUID → ext_id translations
    // are ready. Falls back gracefully: if Supabase is unavailable or returns no
    // rows the existing seeded demo state is preserved intact.
    function _loadIncidentsFromDb() {
      if (!_sb) return;
      var since = new Date(Date.now() - 86400000).toISOString(); // last 24 h
      _sb.from('incidents')
        .select('id, display_id, incident_number, priority, status, chief_complaint, ' +
                'icd11_code, location_lat, location_lng, location_address, location_w3w, ' +
                'county, zone, unit_id, hospital_id, dispatched_at, on_scene_at, ' +
                'cleared_at, created_at')
        .neq('status', 'cleared')
        .neq('status', 'cancelled')
        .gte('created_at', since)
        .then(function (result) {
          if (result.error) {
            console.warn('[NACDState] _loadIncidentsFromDb failed (RLS/table):', result.error.message,
              '— demo seed intact.');
            return;
          }
          var rows = result.data || [];
          if (rows.length === 0) {
            console.info('[NACDState] No active DB incidents — using seeded demo.');
            return;
          }
          var merged = 0;
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var displayId = row.display_id || row.incident_number;
            if (!displayId) continue;
            // Register UUID ↔ display-id mapping for future writes
            if (row.id) {
              _incUuidByDisplay[displayId] = row.id;
              _incDisplayByUuid[row.id]    = displayId;
            }
            // Skip if seeded state already has this display_id (prevents duplicates
            // when BroadcastChannel sim and DB Realtime both fire on the same incident)
            var alreadyInState = false;
            for (var j = 0; j < _state.incidents.length; j++) {
              if (_state.incidents[j].number === displayId) { alreadyInState = true; break; }
            }
            if (alreadyInState) continue;
            // Translate hospital UUID → local ext_id ('h001'..'h110')
            var hospExtId = (row.hospital_id && _hospExtIdByUuid[row.hospital_id])
              ? _hospExtIdByUuid[row.hospital_id] : null;
            _state.incCounter++;
            var inc = {
              id:           'inc_' + _state.incCounter,
              number:       displayId,
              priority:     row.priority             || 1,
              status:       row.status               || 'pending',
              complaint:    row.chief_complaint       || 'Unknown',
              icd11:        row.icd11_code            || '',
              requiresALS:  false,
              lat:          row.location_lat          || -1.2921,
              lng:          row.location_lng          || 36.8219,
              address:      row.location_address      || '',
              w3w:          row.location_w3w          || '',
              county:       row.county                || 'Nairobi',
              zone:         row.zone                  || 'CBD',
              unitId:       row.unit_id               || null,
              hospitalId:   hospExtId,
              notes:        '',
              createdAt:    row.created_at    ? new Date(row.created_at).getTime()    : Date.now(),
              dispatchedAt: row.dispatched_at ? new Date(row.dispatched_at).getTime() : null,
              onSceneAt:    row.on_scene_at   ? new Date(row.on_scene_at).getTime()   : null,
              clearedAt:    row.cleared_at    ? new Date(row.cleared_at).getTime()    : null,
              _fromDb: true  // marker so sim engine doesn't re-seed this incident
            };
            _state.incidents.push(inc);
            _emit('incident:created', inc);
            merged++;
          }
          if (merged > 0) {
            console.info('[NACDState] Loaded', merged, 'active incident(s) from Supabase.');
            _emit('state:tick', _publicState());
          }
        })
        .catch(function (e) {
          console.warn('[NACDState] _loadIncidentsFromDb exception:', e && e.message,
            '— demo seed intact.');
        });
    }

    // Fire-and-forget write to dispatch_events after every local state mutation.
    // incId is the internal 'inc_10001' form — translated to UUID here.
    _pushDispatchEvent = function (incId, unitId, eventType, note, actorType) {
      if (!_sb || !_mapsReady) return;
      var dispInc  = _findIncident(incId);
      var incUuid  = dispInc ? _toUuid('incident', dispInc.number) : null;
      if (!incUuid) return;
      var actorId = null;
      try {
        if (typeof window !== 'undefined' && window.Clerk && window.Clerk.user) {
          actorId = window.Clerk.user.id || null;
        }
      } catch (e) {}
      _sb.from('dispatch_events').insert({
        incident_id:    incUuid,
        unit_id:        unitId     || null,
        event_type:     eventType,
        event_note:     note       || null,
        actor_type:     actorType  || 'system',
        actor_agent_id: actorId
      }).then(function (r) {
        if (r.error) console.warn('[NACDState] dispatch_event push error:', r.error.message);
      });
    };

    // ─────────────────────────────────────────────────────────────────────
    // Rescue Slice 5 — Supabase persistence helpers
    // All writes are fire-and-forget (warn-only). Demo works without DB.
    // ─────────────────────────────────────────────────────────────────────

    // Upsert a claim record into case_invoices.
    // Only fires when the incident has a real DB UUID (skips seeded/offline claims).
    function _pushCaseInvoice(claim) {
      if (!_sb || !_mapsReady) return;
      var incKey  = claim.incidentId || claim.id;
      var incUuid = _incUuidByDisplay[incKey]; // only real DB incidents
      if (!incUuid) return; // seeded/offline claim — skip silently
      var dbStatus = _CLAIM_STATUS_DB[claim.status] || 'queued';
      _sb.from('case_invoices').upsert({
        incident_id:    incUuid,
        invoice_number: claim.id         || null,
        distance_km:    claim.distanceKm || null,
        total_kes:      claim.tariff     || null,
        status:         dbStatus,
        submitted_at:   claim.submittedAt ? new Date(claim.submittedAt).toISOString() : new Date().toISOString(),
        paid_at:        claim.paidAt      ? new Date(claim.paidAt).toISOString()      : null
      }, { onConflict: 'incident_id' })
      .then(function (r) {
        if (r.error) console.warn('[NACDState] case_invoices upsert failed:', r.error.message);
        else console.info('[NACDState] case_invoices upserted for', incKey, '→', dbStatus);
      })
      .catch(function (e) { console.warn('[NACDState] case_invoices exception:', e && e.message); });
    }

    // Map DB case_invoices.status back to JS claim status label.
    function _dbToJsClaim(dbStatus) {
      return ({ queued: 'QUEUED', submitted: 'UNDER_REVIEW', approved: 'APPROVED',
                rejected: 'REJECTED', payment_completed: 'PAID', draft: 'QUEUED'
              })[dbStatus] || 'QUEUED';
    }

    // Resolve an in-memory agent ID to its DB UUID (needed for NOT NULL FKs).
    function _resolveAgentDbUuid(inMemoryId) {
      if (!inMemoryId) return null;
      for (var i = 0; i < _state.agentRecords.length; i++) {
        var ar = _state.agentRecords[i];
        if (ar.id === inMemoryId) {
          return ar._dbUuid || _dbAgentUuidMap[(ar.displayName || '').toLowerCase()] || null;
        }
      }
      return null;
    }

    // Insert a supervisor_actions row. Skips if action_type is not in DB enum
    // or if the required created_by_agent UUID cannot be resolved.
    function _pushSupervisorAction(row) {
      if (!_sb || !_mapsReady) return;
      var isDbType = false;
      for (var i = 0; i < _SV_ACTION_DB_TYPES.length; i++) {
        if (_SV_ACTION_DB_TYPES[i] === row.actionType) { isDbType = true; break; }
      }
      if (!isDbType) return; // force_break, message_agent not in DB enum
      var inc         = row.incidentId ? _findIncident(row.incidentId) : null;
      var incUuid     = inc ? _incUuidByDisplay[inc.number] : null;
      var agentUuid   = _resolveAgentDbUuid(row.createdByAgent);
      if (!agentUuid) {
        console.info('[NACDState] supervisor_action skip — no DB agent UUID (action:', row.actionType + ')');
        return;
      }
      _sb.from('supervisor_actions').insert({
        incident_id:      incUuid          || null,
        unit_id:          row.unitId       || null,
        action_type:      row.actionType,
        action_status:    row.actionStatus || 'active',
        action_note:      row.actionNote   || null,
        created_by_agent: agentUuid
      })
      .then(function (r) {
        if (r.error) console.warn('[NACDState] supervisor_actions insert failed:', r.error.message);
        else console.info('[NACDState] supervisor_action persisted:', row.actionType);
      })
      .catch(function (e) { console.warn('[NACDState] supervisor_actions exception:', e && e.message); });
    }

    // Insert a qa_flags row. created_by_agent is nullable in the schema.
    function _pushQAFlag(row) {
      if (!_sb || !_mapsReady) return;
      var inc     = row.incidentId ? _findIncident(row.incidentId) : null;
      var incUuid = inc ? _incUuidByDisplay[inc.number] : null;
      if (!incUuid) { console.info('[NACDState] qa_flag skip — no DB incident UUID'); return; }
      _sb.from('qa_flags').insert({
        incident_id:      incUuid,
        flag_type:        row.flagType         || 'operational',
        severity:         row.severity         || 'med',
        status:           row.status           || 'open',
        reason:           row.reason           || null,
        created_by_agent: _resolveAgentDbUuid(row.createdByAgent) || null
      })
      .then(function (r) {
        if (r.error) console.warn('[NACDState] qa_flags insert failed:', r.error.message);
        else console.info('[NACDState] qa_flag persisted:', row.flagType);
      })
      .catch(function (e) { console.warn('[NACDState] qa_flags exception:', e && e.message); });
    }

    // Insert a supervisor_notes row. created_by_agent is NOT NULL in the schema.
    function _pushSupervisorNote(row) {
      if (!_sb || !_mapsReady) return;
      var agentUuid = _resolveAgentDbUuid(row.createdByAgent);
      if (!agentUuid) {
        console.info('[NACDState] supervisor_note skip — no DB agent UUID (type:', row.noteType + ')');
        return;
      }
      var inc     = row.incidentId ? _findIncident(row.incidentId) : null;
      var incUuid = inc ? _incUuidByDisplay[inc.number] : null;
      _sb.from('supervisor_notes').insert({
        incident_id:      incUuid   || null,
        unit_id:          row.unitId || null,
        note_type:        row.noteType,
        note_text:        row.noteText,
        created_by_agent: agentUuid
      })
      .then(function (r) {
        if (r.error) console.warn('[NACDState] supervisor_notes insert failed:', r.error.message);
        else console.info('[NACDState] supervisor_note persisted:', row.noteType);
      })
      .catch(function (e) { console.warn('[NACDState] supervisor_notes exception:', e && e.message); });
    }

    // Upsert a patient_profiles row.
    function _pushPatientProfile(incId, profile) {
      if (!_sb || !_mapsReady) return;
      var inc = _findIncident(incId);
      if (!inc) return;
      var incUuid = _incUuidByDisplay[inc.number];
      if (!incUuid) { console.info('[NACDState] patient_profile skip — no DB UUID for', incId); return; }
      _sb.from('patient_profiles').upsert({
        incident_id:     incUuid,
        full_name:       profile.fullName    || null,
        approximate_age: profile.age         || null,
        gender:          profile.gender      || null,
        caller_name:     profile.callerName  || null,
        caller_phone:    profile.callerPhone || null,
        pickup_address:  profile.address     || null,
        notes:           profile.notes       || null,
        updated_at:      new Date().toISOString()
      }, { onConflict: 'incident_id' })
      .then(function (r) {
        if (r.error) console.warn('[NACDState] patient_profiles upsert failed:', r.error.message);
        else console.info('[NACDState] patient_profile upserted for', inc.number);
      })
      .catch(function (e) { console.warn('[NACDState] patient_profiles exception:', e && e.message); });
    }

    // Load real agent UUIDs from DB for FK resolution in supervisor writes.
    function _loadAgentsFromDb() {
      if (!_sb) return;
      _sb.from('agents')
        .select('id, display_name, role, is_active')
        .eq('is_active', true)
        .then(function (result) {
          if (result.error) {
            console.warn('[NACDState] _loadAgentsFromDb failed:', result.error.message);
            return;
          }
          var rows = result.data || [];
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r.id && r.display_name) {
              _dbAgentUuidMap[r.display_name.toLowerCase()] = r.id;
            }
          }
          // Back-fill _dbUuid on any in-memory agent records that match
          for (var j = 0; j < _state.agentRecords.length; j++) {
            var ar = _state.agentRecords[j];
            var uuid = _dbAgentUuidMap[(ar.displayName || '').toLowerCase()];
            if (uuid) ar._dbUuid = uuid;
          }
          console.info('[NACDState] Agent DB map hydrated:',
            Object.keys(_dbAgentUuidMap).length, 'agents');
        })
        .catch(function (e) {
          console.warn('[NACDState] _loadAgentsFromDb exception:', e && e.message);
        });
    }

    // Back-fill claims queue from DB: case_invoices (status updates) +
    // dispatch_events (epcr_submitted, for claims that have no invoice row yet).
    // Fires claims:updated if any new items are injected.
    function _loadClaimsFromDb() {
      if (!_sb || _claimsDbLoaded) return;
      _claimsDbLoaded = true;
      if (!_state.claims) return;
      var since = new Date(Date.now() - 86400000).toISOString(); // last 24 h

      // Path 1: case_invoices — load rows with known incident UUIDs
      _sb.from('case_invoices')
        .select('incident_id, invoice_number, total_kes, distance_km, status, submitted_at, paid_at')
        .neq('status', 'draft')
        .gte('submitted_at', since)
        .then(function (result) {
          if (result.error) {
            console.warn('[NACDState] _loadClaimsFromDb:case_invoices failed:', result.error.message);
            return;
          }
          var rows = result.data || [];
          var injected = 0;
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var displayId = _incDisplayByUuid[row.incident_id];
            if (!displayId) continue;
            // Dedup: skip if already in queue
            var alreadyIn = false;
            for (var ci = 0; ci < _state.claims.length; ci++) {
              var c = _state.claims[ci];
              if (c.incidentId === displayId ||
                  (row.invoice_number && c.id === row.invoice_number)) {
                alreadyIn = true; break;
              }
            }
            if (alreadyIn) continue;
            _state.claims.unshift({
              id:           row.invoice_number || _fmtClaimId(_claimCounter++),
              incidentId:   displayId,
              providerId:   'PRV001',
              providerName: 'DB Backfill',
              unitId:       '—',
              unitType:     'ALS',
              distanceKm:   row.distance_km || 15,
              tariff:       row.total_kes   || 3500,
              status:       _dbToJsClaim(row.status),
              icd11Code: '—', icd11Label: 'Case invoice (DB)',
              fhirValid: true, eligibilityValid: true, fraudScore: 0,
              hospitalName: '—', priority: 2,
              submittedAt: row.submitted_at ? new Date(row.submitted_at).getTime() : Date.now(),
              approvedAt:  null,
              paidAt:      row.paid_at ? new Date(row.paid_at).getTime() : null,
              paymentRef:  null, deductions: 0, deductionReason: '', fromDb: true
            });
            injected++;
          }
          if (injected > 0) {
            console.info('[NACDState] Claims backfilled from case_invoices:', injected);
            _emit('claims:updated', _state.claims.slice());
          }
        })
        .catch(function (e) {
          console.warn('[NACDState] _loadClaimsFromDb:case_invoices exception:', e && e.message);
        });

      // Path 2: dispatch_events epcr_submitted — catches ePCR claims with no invoice row
      _sb.from('dispatch_events')
        .select('incident_id, unit_id, payload, created_at')
        .eq('event_type', 'epcr_submitted')
        .gte('created_at', since)
        .then(function (result) {
          if (result.error) {
            console.warn('[NACDState] _loadClaimsFromDb:dispatch_events failed:', result.error.message);
            return;
          }
          var rows = result.data || [];
          var injected = 0;
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var payload   = row.payload || {};
            var claimRef  = payload.claimRef  || null;
            var displayId = row.incident_id ? _incDisplayByUuid[row.incident_id] : null;
            var incKey    = claimRef || displayId;
            if (!incKey) continue;
            // Dedup by claimRef or incidentId
            var alreadyIn = false;
            for (var ci = 0; ci < _state.claims.length; ci++) {
              var c = _state.claims[ci];
              if (c.id === incKey || c.incidentId === incKey ||
                  (displayId && c.incidentId === displayId)) {
                alreadyIn = true; break;
              }
            }
            if (alreadyIn) continue;
            var distKm = payload.distanceKm || 15;
            _state.claims.unshift({
              id:           claimRef || _fmtClaimId(_claimCounter++),
              incidentId:   incKey,
              providerId:   'PRV001',
              providerName: 'EMT ePCR (DB)',
              unitId:       row.unit_id || '—',
              unitType:     'ALS',
              distanceKm:   distKm,
              tariff:       _calcTariff('ALS', distKm),
              status:       'QUEUED',
              icd11Code:    payload.icdCode || '—', icd11Label: 'ePCR (DB backfill)',
              fhirValid: true, eligibilityValid: true, fraudScore: 0,
              hospitalName: '—', priority: 2,
              submittedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
              approvedAt: null, paidAt: null, paymentRef: null,
              deductions: 0, deductionReason: '', fromDb: true
            });
            injected++;
          }
          if (injected > 0) {
            console.info('[NACDState] Claims backfilled from dispatch_events:', injected);
            _emit('claims:updated', _state.claims.slice());
          }
        })
        .catch(function (e) {
          console.warn('[NACDState] _loadClaimsFromDb:dispatch_events exception:', e && e.message);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 16. KPI CALCULATOR
    // ═══════════════════════════════════════════════════════════════════════
    function _calcKPIs() {
      var active = _state.incidents.filter(function (i) {
        return i.status !== STATUS.CLEARED && i.status !== STATUS.CANCELLED;
      });
      var p1 = 0, p2 = 0, p34 = 0, deployed = 0, avail = 0, maint = 0, anomalies = 0;

      for (var i = 0; i < active.length; i++) {
        if (active[i].priority === 1) p1++;
        else if (active[i].priority === 2) p2++;
        else p34++;
      }

      for (var j = 0; j < _state.fleet.length; j++) {
        var u = _state.fleet[j];
        if (u.anomaly) anomalies++;
        if (u.status === UNIT_STATUS.AVAILABLE || u.status === UNIT_STATUS.STANDBY) avail++;
        else if (u.status === UNIT_STATUS.MAINTENANCE) maint++;
        else deployed++;
      }

      // Response time: avg time from incident creation to dispatch
      var dispTimes = _state.incidents.filter(function (i) {
        return i.dispatchedAt && i.createdAt;
      }).map(function (i) { return (i.dispatchedAt - i.createdAt) / 1000; });

      var avgResponseSec = dispTimes.length ?
        Math.round(dispTimes.reduce(function (s, t) { return s + t; }, 0) / dispTimes.length) : 0;

      // SLA: P1 < 8 min, P2 < 15 min (mock compliance calc)
      var slaPct = 94.2 - (p1 > 3 ? (p1 - 3) * 0.8 : 0);

      var cleared = _state.incidents.filter(function(i){ return i.status === STATUS.CLEARED; });
      var goldenHrBreaches = cleared.filter(function(i){
        return i.clearedAt && i.createdAt && (i.clearedAt - i.createdAt) > 3600000;
      }).length + (p1 > 2 ? p1 - 2 : 0);
      var shiftBase = Math.round(50 + _state.incidents.length * 2.3);
      var hrsSinceStart = Math.min(12, (Date.now() % 43200000) / 3600000);
      return {
        p1: p1, p2: p2, p34: p34,
        totalActive:    active.length,
        deployed:       deployed,
        available:      avail,
        maintenance:    maint,
        anomalies:      anomalies,
        fleetTotal:     _state.fleet.length,
        avgResponseSec: avgResponseSec,
        slaCompliancePct: Math.max(80, Math.round(slaPct * 10) / 10),
        callsInQueue:   Math.max(0, Math.round((p1 * 0.4 + p2 * 0.2) + (Date.now() % 3000) / 1500)),
        callsShift:     Math.round(shiftBase + hrsSinceStart * 8.5),
        conveyed:       Math.round(cleared.length * 0.78 + hrsSinceStart * 3.2),
        goldenHr:       Math.max(0, goldenHrBreaches),
        avgWaitSec:     Math.max(12, Math.round(22 + p1 * 8 + (Date.now() % 14000) / 1000 - 7)),
        longestWaitSec: Math.max(30, Math.round(78 + p1 * 25 + (Date.now() % 38000) / 1000 - 19)),
        abandoned:      Math.max(0, Math.round(1 + p1 * 0.3 + (Date.now() % 5000) / 2500)),
        hospsOnDiversion: _state.hospitals.filter(function (h) { return h.div !== 'open'; }).length
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 17. PUBLIC STATE SNAPSHOT
    // ═══════════════════════════════════════════════════════════════════════
    function _publicState() {
      return {
        incidents: _state.incidents.slice(),
        fleet:     _state.fleet.slice(),
        hospitals: _state.hospitals.slice(),
        agents:    _state.agentRecords.slice(),
        zones:     _state.zones,
        kpis:      _calcKPIs(),
        timestamp: Date.now()
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 18. DISPATCHER API (manual overrides — always beat simulation)
    // ═══════════════════════════════════════════════════════════════════════
    var dispatch = {

      createIncident: function (data) {
        var inc = _buildIncident(data);
        if (_sb) _pushIncident(inc);
        return inc;
      },

      // Set road-route waypoints on a dispatched unit so it follows roads instead of straight line.
      // waypoints: array of [lng, lat] pairs (GeoJSON order — same as Mapbox output)
      setUnitWaypoints: function (unitId, waypoints) {
        var unit = _findUnit(unitId);
        if (!unit || !waypoints || waypoints.length < 2) return false;
        unit._routeWaypoints = waypoints;
        unit._waypointIdx    = 0;
        return true;
      },

      assignUnit: function (incidentId, unitId) {
        var inc  = _findIncident(incidentId);
        var unit = _findUnit(unitId);
        if (!inc || !unit) return false;

        // Release any previously assigned unit
        if (inc.unitId && inc.unitId !== unitId) {
          var prev = _findUnit(inc.unitId);
          if (prev) { prev.status = UNIT_STATUS.AVAILABLE; prev.incidentId = null; }
        }

        _autoDispatch(inc, unit, Date.now());
        if (_sb) { _pushIncident(inc); _pushUnit(unit); }
        return inc;
      },

      updateStatus: function (incidentId, newStatus) {
        var inc = _findIncident(incidentId);
        if (!inc) return false;
        _transition(inc, newStatus, Date.now());
        if (_sb) _pushIncident(inc);
        return inc;
      },

      setHospital: function (incidentId, hospitalId) {
        var inc  = _findIncident(incidentId);
        var hosp = _findHospital(hospitalId);
        if (!inc || !hosp) return false;
        inc.hospitalId = hospitalId;
        if (inc.status === STATUS.TRANSPORT) {
          var unit = inc.unitId ? _findUnit(inc.unitId) : null;
          if (unit) { unit.targetLat = hosp.lat; unit.targetLng = hosp.lng; }
        }
        _emit('incident:updated', inc);
        if (_sb) _pushIncident(inc);
        return inc;
      },

      closeIncident: function (incidentId) {
        return dispatch.updateStatus(incidentId, STATUS.CLEARED);
      },

      cancelIncident: function (incidentId) {
        var inc = _findIncident(incidentId);
        if (!inc) return false;
        if (inc.unitId) {
          var unit = _findUnit(inc.unitId);
          if (unit) { unit.status = UNIT_STATUS.AVAILABLE; unit.incidentId = null; }
        }
        inc.status    = STATUS.CANCELLED;
        inc.clearedAt = Date.now();
        _emit('incident:updated', inc);
        if (_sb) _pushIncident(inc);
        return inc;
      },

      addNote: function (incidentId, note) {
        var inc = _findIncident(incidentId);
        if (!inc) return false;
        inc.notes = (inc.notes ? inc.notes + '\n' : '') + new Date().toISOString().substr(11,8) + ' — ' + note;
        _emit('incident:updated', inc);
        return inc;
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 19. SIM CONTROLS (for testing / demo)
    // ═══════════════════════════════════════════════════════════════════════
    var sim = {
      start: function () {
        if (_simRunning) return;
        _simRunning  = true;
        _simInterval = setInterval(_simTick, 1000);
        _emit('sim:started', null);
      },
      stop: function () {
        _simRunning = false;
        clearInterval(_simInterval);
        _simInterval = null;
        _emit('sim:stopped', null);
      },
      isRunning:       function () { return _simRunning; },
      triggerIncident: function (opts) { return _buildIncident(opts); },
      setRate:         function (r) { _simRate = r; }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 20. INIT
    // ═══════════════════════════════════════════════════════════════════════
    function init(config) {
      config = config || {};
      if (_state.initialized) { console.warn('[NACDState] Already initialized.'); return _pub; }

      // Seed the RNG so all screens produce identical initial state
      _initRNG(config.seed !== undefined ? config.seed : 20260517);

      // Copy seed data
      _state.hospitals = JSON.parse(JSON.stringify(HOSPITALS));
      _state.agents    = JSON.parse(JSON.stringify(AGENTS));

      // Generate fleet
      _state.fleet = _generateFleet();

      // Supabase (optional)
      if (config.supabaseUrl && config.supabaseKey) {
        _initSupabase(config.supabaseUrl, config.supabaseKey);
      }

      // Seed incidents at various lifecycle stages for a realistic opening state.
      // When Supabase is configured, default to 0 — _hydrateIdMaps will load the
      // shared pool from DB (so every screen shows the SAME incidents) and the
      // heartbeat cron tops them up. Pages can still opt in to local seed via
      // seedIncidents: N if they want offline-only behavior.
      var defaultSeed = (_sb && config.supabaseKey) ? 0 : 12;
      var seedCount = config.seedIncidents !== undefined ? config.seedIncidents : defaultSeed;
      var now = Date.now();

      for (var i = 0; i < seedCount; i++) {
        var inc  = _buildIncident();
        var unit = _findNearestAvailable(inc.lat, inc.lng, inc.requiresALS, inc.zone);

        if (i < 2 && unit) {
          // On scene
          _autoDispatch(inc, unit, now - 600000);
          _transition(inc, STATUS.EN_ROUTE,  now - 480000);
          _transition(inc, STATUS.ON_SCENE,  now - 200000);
        } else if (i < 5 && unit) {
          // En route
          _autoDispatch(inc, unit, now - 120000);
          _transition(inc, STATUS.EN_ROUTE,  now - 90000);
          unit.targetLat = inc.lat;
          unit.targetLng = inc.lng;
        } else if (i < 8 && unit) {
          // Dispatched
          _autoDispatch(inc, unit, now - 30000);
        } else if (i < 10 && unit) {
          // Transport
          _autoDispatch(inc, unit, now - 900000);
          _transition(inc, STATUS.EN_ROUTE,  now - 780000);
          _transition(inc, STATUS.ON_SCENE,  now - 600000);
          _transition(inc, STATUS.TRANSPORT, now - 120000);
        }
        // remaining: PENDING
      }

      // Seed claims (uses _state.hospitals — must run after hospital init)
      _seedClaims();

      // Seed agent records (Phase 4d — database-backed agents)
      _seedAgentRecords();

      _state.initialized = true;

      // After generation: reset to true Math.random so ongoing sim can diverge naturally
      _seededRand = Math.random;

      // Start sim
      if (config.autoStart !== false) sim.start();

      _emit('state:initialized', _publicState());
      console.info('[NACDState] Initialized —', _state.fleet.length, 'units,', _state.hospitals.length, 'hospitals,', _state.incidents.length, 'incidents.');
      return _pub;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 21. CLAIMS NAMESPACE
    // ═══════════════════════════════════════════════════════════════════════
    var _PROVIDERS = [
      { id:'PRV001', name:'AAR Healthcare EMS',              method:'pesalink' },
      { id:'PRV002', name:'Amref Flying Doctors',            method:'pesalink' },
      { id:'PRV003', name:'St John Ambulance Kenya',         method:'mpesa'    },
      { id:'PRV004', name:'Nairobi Hospital EMS',            method:'pesalink' },
      { id:'PRV005', name:'Aga Khan EMS',                    method:'pesalink' },
      { id:'PRV006', name:'Mombasa County EMS',              method:'mpesa'    },
      { id:'PRV007', name:'PCEA Kikuyu Hospital EMS',        method:'mpesa'    },
      { id:'PRV008', name:'E+ Emergency Medical Services',   method:'pesalink' }
    ];

    var _ICD11_POOL = [
      { code:'I46.9',  label:'Cardiac arrest, unspecified' },
      { code:'I21.9',  label:'Acute myocardial infarction, unspecified' },
      { code:'J80',    label:'Acute respiratory distress syndrome' },
      { code:'S09.90', label:'Head injury, unspecified' },
      { code:'S72.00', label:'Femoral fracture, closed' },
      { code:'T39.1',  label:'Paracetamol overdose' },
      { code:'O60.1',  label:'Preterm labour with preterm delivery' },
      { code:'A09',    label:'Gastroenteritis and colitis, infectious' },
      { code:'R55',    label:'Syncope and collapse' },
      { code:'T14.9',  label:'Injury, unspecified' },
      { code:'R00.1',  label:'Bradycardia, unspecified' },
      { code:'J18.9',  label:'Pneumonia, unspecified' },
      { code:'K92.1',  label:'Melaena — GI bleed' },
      { code:'S22.20', label:'Fracture of sternum' },
      { code:'T71',    label:'Asphyxiation' },
      { code:'F32.9',  label:'Major depressive episode' },
      { code:'G40.909',label:'Epilepsy, unspecified' },
      { code:'E11.9',  label:'Type 2 diabetes, without complications' },
      { code:'J44.1',  label:'COPD with acute exacerbation' },
      { code:'I63.9',  label:'Cerebral infarction, unspecified' }
    ];

    var _CLAIM_STATUSES = ['QUEUED','UNDER_REVIEW','APPROVED','DISPUTED','REJECTED','PAID'];

    function _calcTariff(unitType, distanceKm) {
      var BASE   = unitType === 'ALS' ? 3500 : 2000;
      var PER_KM = 85;
      var CAP    = unitType === 'ALS' ? 15000 : 8000;
      var t = BASE + (distanceKm > 25 ? (distanceKm - 25) * PER_KM : 0);
      return Math.min(t, CAP);
    }

    function _fmtClaimId(n) {
      return 'CLM-2026-' + ('0000' + n).slice(-5);
    }

    // Tracks which incident IDs have already had a claim created (prevent duplicates)
    var _claimedIncIds = {};
    var _claimCounter  = 9000;  // starts above seed range (8800–8829)

    // Converts newly-cleared incidents into real claim entries on each tick.
    // Derived claims are tagged with fromIncident:true so the UI can badge them.
    function _autoSyncClaims() {
      if (!_state.claims) return;
      var changed = false;
      for (var i = 0; i < _state.incidents.length; i++) {
        var inc = _state.incidents[i];
        if (inc.status !== STATUS.CLEARED) continue;
        if (_claimedIncIds[inc.id]) continue;
        _claimedIncIds[inc.id] = true;

        // Determine unit type from fleet
        var unit = inc.unitId ? _findUnit(inc.unitId) : null;
        var uType = (unit && unit.type) ? unit.type : (inc.requiresALS ? 'ALS' : 'BLS');

        // Distance: unit start to scene. Use haversine between incident and nearest hospital.
        var hosp = inc.hospitalId ? _findHospital(inc.hospitalId) : null;
        if (!hosp && _state.hospitals.length) {
          // pick nearest hospital by straight-line
          var bestD = Infinity, bestH = null;
          for (var h = 0; h < _state.hospitals.length; h++) {
            var d = _distKm(inc.lat, inc.lng, _state.hospitals[h].lat, _state.hospitals[h].lng);
            if (d < bestD) { bestD = d; bestH = _state.hospitals[h]; }
          }
          hosp = bestH;
        }
        var distKm = hosp ? Math.round(_distKm(inc.lat, inc.lng, hosp.lat, hosp.lng) * 10) / 10 : 15;
        distKm = Math.max(2, distKm);

        var tariff = _calcTariff(uType, distKm);
        var icd    = _ICD11_POOL[_claimCounter % _ICD11_POOL.length];
        var prv    = _PROVIDERS[_claimCounter % _PROVIDERS.length];

        _state.claims.unshift({
          id:               _fmtClaimId(_claimCounter++),
          incidentId:       inc.number || inc.id,
          providerId:       prv.id,
          providerName:     prv.name,
          unitId:           inc.unitId || '—',
          unitType:         uType,
          distanceKm:       distKm,
          tariff:           tariff,
          status:           'QUEUED',
          icd11Code:        icd.code,
          icd11Label:       icd.label,
          fhirValid:        true,
          eligibilityValid: true,
          fraudScore:       Math.floor(Math.random() * 35),  // low risk for dispatch-originated
          hospitalName:     hosp ? (hosp.name || hosp.n) : 'KNH',
          priority:         inc.priority || 2,
          submittedAt:      inc.clearedAt || Date.now(),
          approvedAt:       null,
          paidAt:           null,
          paymentRef:       null,
          deductions:       0,
          deductionReason:  '',
          fromIncident:     true   // badge flag for UI
        });
        changed = true;
      }
      if (changed) _emit('claims:updated', _state.claims.slice());
    }

    function _seedClaims() {
      var now = Date.now();
      var DAY = 86400000;
      var claims = [];
      var incNums = [4100,4105,4112,4118,4127,4134,4141,4150,4159,4168,4177,4183,4190,4200,4215,4230,4248,4261,4274,4289,4302,4318,4332,4347,4361,4378,4391,4405,4420,4435];
      var statuses = ['PAID','PAID','PAID','PAID','PAID','APPROVED','APPROVED','APPROVED','UNDER_REVIEW','UNDER_REVIEW','QUEUED','QUEUED','QUEUED','QUEUED','QUEUED','DISPUTED','REJECTED','QUEUED','APPROVED','PAID','QUEUED','UNDER_REVIEW','APPROVED','PAID','QUEUED','DISPUTED','QUEUED','PAID','APPROVED','QUEUED'];

      for (var i = 0; i < 30; i++) {
        var prv     = _PROVIDERS[i % _PROVIDERS.length];
        var uType   = (i % 5 === 0) ? 'BLS' : 'ALS';
        var distKm  = 8 + Math.floor((i * 7 + 3) % 42);
        var tariff  = _calcTariff(uType, distKm);
        var icd     = _ICD11_POOL[i % _ICD11_POOL.length];
        var status  = statuses[i];
        var fraud   = (i === 5 || i === 16 || i === 22) ? (65 + (i * 4) % 30) : (Math.abs((i * 13 + 7) % 55));
        var daysAgo = (i < 10) ? (30 - i * 2) : (i < 20) ? (12 - (i - 10)) : (i - 18);
        var subAt   = now - daysAgo * DAY - (i * 3600000);
        var paidAt  = (status === 'PAID') ? subAt + 5 * DAY : null;
        var approvedAt = (status === 'APPROVED' || status === 'PAID') ? subAt + 2 * DAY : null;
        var deductions = (status === 'APPROVED' || status === 'PAID') && (i % 7 === 0) ? 500 : 0;
        var hospIdx = i % _state.hospitals.length;
        var hosp    = _state.hospitals[hospIdx];

        claims.push({
          id:               _fmtClaimId(8800 + i),
          incidentId:       'INC-2026-' + ('0000' + incNums[i]).slice(-5),
          providerId:       prv.id,
          providerName:     prv.name,
          unitId:           'A-' + ('000' + ((i * 7 + 1) % 150 + 1)).slice(-3),
          unitType:         uType,
          distanceKm:       distKm,
          tariff:           tariff,
          status:           status,
          icd11Code:        icd.code,
          icd11Label:       icd.label,
          fhirValid:        fraud < 60,
          eligibilityValid: fraud < 70,
          fraudScore:       fraud,
          hospitalName:     hosp ? hosp.name : 'KNH',
          priority:         (i % 5 < 2) ? 1 : (i % 5 < 4) ? 2 : 3,
          submittedAt:      subAt,
          approvedAt:       approvedAt,
          paidAt:           paidAt,
          paymentRef:       paidAt ? ('QK' + (2300 + i) + 'XXX') : null,
          deductions:       deductions,
          deductionReason:  deductions ? 'SLA breach' : ''
        });
      }
      _state.claims = claims;
    }

    var _claimsApi = {
      approveClaim: function(claimId, deduction, deductionReason) {
        for (var i = 0; i < _state.claims.length; i++) {
          if (_state.claims[i].id === claimId) {
            _state.claims[i].status = 'APPROVED';
            _state.claims[i].approvedAt = Date.now();
            _state.claims[i].deductions = deduction || 0;
            _state.claims[i].deductionReason = deductionReason || '';
            _pushCaseInvoice(_state.claims[i]);
            _notify();
            return true;
          }
        }
        return false;
      },
      disputeClaim: function(claimId, reason) {
        for (var i = 0; i < _state.claims.length; i++) {
          if (_state.claims[i].id === claimId) {
            _state.claims[i].status = 'DISPUTED';
            _state.claims[i].disputeReason = reason || '';
            _pushCaseInvoice(_state.claims[i]);
            _notify();
            return true;
          }
        }
        return false;
      },
      underReviewClaim: function(claimId) {
        for (var i = 0; i < _state.claims.length; i++) {
          if (_state.claims[i].id === claimId) {
            _state.claims[i].status = 'UNDER_REVIEW';
            _pushCaseInvoice(_state.claims[i]);
            _notify();
            return true;
          }
        }
        return false;
      },
      rejectClaim: function(claimId, reason) {
        for (var i = 0; i < _state.claims.length; i++) {
          if (_state.claims[i].id === claimId) {
            _state.claims[i].status = 'REJECTED';
            _state.claims[i].rejectReason = reason || '';
            _pushCaseInvoice(_state.claims[i]);
            _notify();
            return true;
          }
        }
        return false;
      },
      batchApprove: function(claimIds) {
        var now = Date.now();
        for (var ci = 0; ci < claimIds.length; ci++) {
          for (var i = 0; i < _state.claims.length; i++) {
            if (_state.claims[i].id === claimIds[ci] && _state.claims[i].status === 'QUEUED') {
              _state.claims[i].status = 'APPROVED';
              _state.claims[i].approvedAt = now;
              _pushCaseInvoice(_state.claims[i]);
            }
          }
        }
        _notify();
      },
      triggerPaymentRun: function(providerIds) {
        var now = Date.now();
        var txBase = 2400;
        for (var i = 0; i < _state.claims.length; i++) {
          var c = _state.claims[i];
          if (c.status === 'APPROVED') {
            var inList = false;
            if (!providerIds || providerIds.length === 0) {
              inList = true;
            } else {
              for (var p = 0; p < providerIds.length; p++) {
                if (c.providerId === providerIds[p]) { inList = true; break; }
              }
            }
            if (inList) {
              c.status = 'PAID';
              c.paidAt = now;
              c.paymentRef = 'QK' + (txBase++) + Math.random().toString(36).substring(2,5).toUpperCase();
              _pushCaseInvoice(c);
            }
          }
        }
        _notify();
      },

      // Receive a cleared incident from dispatch (via BroadcastChannel) and create a claim.
      injectFromDispatch: function(inc) {
        if (!_state.claims) return;
        var incKey = inc.number || inc.id;
        for (var ci = 0; ci < _state.claims.length; ci++) {
          if (_state.claims[ci].incidentId === incKey) return; // already exists
        }
        var unit  = inc.unitId ? _findUnit(inc.unitId) : null;
        var uType = unit ? unit.type : (inc.requiresALS ? 'ALS' : 'BLS');
        var hosp  = inc.hospitalId ? _findHospital(inc.hospitalId) : null;
        if (!hosp && _state.hospitals.length) {
          var bestD2 = Infinity;
          for (var hi = 0; hi < _state.hospitals.length; hi++) {
            var d2 = _distKm(inc.lat || 0, inc.lng || 0, _state.hospitals[hi].lat, _state.hospitals[hi].lng);
            if (d2 < bestD2) { bestD2 = d2; hosp = _state.hospitals[hi]; }
          }
        }
        var distKm2 = hosp ? Math.max(2, Math.round(_distKm(inc.lat||0, inc.lng||0, hosp.lat, hosp.lng)*10)/10) : 15;
        var tariff2  = _calcTariff(uType, distKm2);
        var prv2     = unit ? {id: unit.providerId || 'PRV001', name: unit.provider || 'AMREF Flying Doctors'} : _PROVIDERS[_claimCounter % _PROVIDERS.length];
        var _injectedClaim = {
          id:               _fmtClaimId(_claimCounter++),
          incidentId:       incKey,
          providerId:       prv2.id,
          providerName:     prv2.name,
          unitId:           inc.unitId || '—',
          unitType:         uType,
          distanceKm:       distKm2,
          tariff:           tariff2,
          status:           'QUEUED',
          icd11Code:        inc.icd11  || '—',
          icd11Label:       inc.complaint || 'Emergency',
          fhirValid:        true,
          eligibilityValid: true,
          fraudScore:       Math.floor(Math.random() * 35),
          hospitalName:     hosp ? (hosp.n || hosp.name || hosp.full) : 'KNH',
          priority:         inc.priority || 2,
          submittedAt:      inc.clearedAt || Date.now(),
          approvedAt:       null, paidAt: null, paymentRef: null,
          deductions:       0, deductionReason: '',
          fromIncident:     true
        };
        _state.claims.unshift(_injectedClaim);
        _pushCaseInvoice(_injectedClaim);
        _emit('claims:updated', _state.claims.slice());
      }
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 23. PHASE 4d — MERGE HARDENING (NERS discipline adoption)
    //     All code runs inside the closure — no public surface change to
    //     _state or _notify. See v4 §3.2 for rationale.
    // ═══════════════════════════════════════════════════════════════════════

    // ── Utility helpers ────────────────────────────────────────────────────
    function _uid() {
      return 'x' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    }

    // _notify — immediate re-render after a state mutation.
    // Also fixes the latent bug in _claimsApi which called _notify() before
    // it was defined; function declarations hoist, so this definition covers
    // all prior call sites in the same closure scope.
    function _notify() {
      _emit('state:tick', _publicState());
    }

    // ── New state slots ────────────────────────────────────────────────────
    _state.patientProfiles   = {};  // keyed by incidentId
    _state.observations      = [];  // append-only clinical obs
    _state.consumables       = [];  // case consumables
    _state.invoices          = {};  // keyed by incidentId → case_invoices row
    _state.agentRecords      = [];  // database-backed agents (dispatchers, supervisors, call-takers)
    _state.shifts            = [];
    _state.assignments       = [];
    _state.qaFlags           = [];  // newest first
    _state.supervisorNotes   = [];  // newest first
    _state.supervisorActions = [];  // newest first
    _state.dispatchEvents    = [];  // immutable audit stream, newest first, capped at 500

    // ── Immutable event recorder ───────────────────────────────────────────
    // Every state-changing mutator routes through here.
    function _recordEvent(incId, unitId, eventType, note, actorType) {
      _state.dispatchEvents.unshift({
        id:          _uid(),
        incidentId:  incId     || null,
        unitId:      unitId    || null,
        eventType:   eventType,
        eventNote:   note      || null,
        actorType:   actorType || 'system',
        createdAt:   Date.now()
      });
      if (_state.dispatchEvents.length > 500) _state.dispatchEvents.length = 500;
      _pushDispatchEvent(incId, unitId, eventType, note, actorType);
    }

    // ── Agent seed data ────────────────────────────────────────────────────
    function _seedAgentRecords() {
      var seed = [
        { displayName:'Joyce Otieno',   role:'supervisor',        extension:'2001', status:'ready'   },
        { displayName:'David Kimani',   role:'senior_dispatcher', extension:'2010', status:'on_call' },
        { displayName:'Mary Wanjiku',   role:'dispatcher',        extension:'2011', status:'on_call' },
        { displayName:'Peter Mwangi',   role:'dispatcher',        extension:'2012', status:'ready'   },
        { displayName:'Grace Achieng',  role:'dispatcher',        extension:'2013', status:'break'   },
        { displayName:'Samuel Karanja', role:'dispatcher',        extension:'2014', status:'on_call' },
        { displayName:'Faith Njeri',    role:'call_taker',        extension:'2020', status:'on_call' },
        { displayName:'Brian Ouma',     role:'call_taker',        extension:'2021', status:'ready'   },
        { displayName:'Lucy Wairimu',   role:'call_taker',        extension:'2022', status:'on_call' },
        { displayName:'Daniel Kiprop',  role:'call_taker',        extension:'2023', status:'break'   }
      ];
      _state.agentRecords = [];
      for (var i = 0; i < seed.length; i++) {
        _state.agentRecords.push({
          id:          _uid(),
          displayName: seed[i].displayName,
          role:        seed[i].role,
          extension:   seed[i].extension,
          status:      seed[i].status,
          isActive:    true,
          createdAt:   Date.now()
        });
      }
    }

    // ── intake namespace ───────────────────────────────────────────────────
    var _intake = {
      upsertProfile: function(incId, profile) {
        _state.patientProfiles[incId] = Object.assign(
          {}, _state.patientProfiles[incId] || {}, profile, { updatedAt: Date.now() }
        );
        _recordEvent(incId, null, 'intake_updated', null, 'dispatcher');
        _pushPatientProfile(incId, profile);
        _notify();
      }
    };

    // ── fieldCare namespace ────────────────────────────────────────────────
    var _fieldCare = {
      recordObservation: function(incId, obs) {
        var row = Object.assign({ id: _uid(), incidentId: incId, recordedAt: Date.now() }, obs);
        _state.observations.push(row);
        _recordEvent(incId, null, 'vitals_recorded', null, 'emt');
        _notify();
        return row;
      },
      addConsumable: function(incId, item) {
        var row = Object.assign({ id: _uid(), incidentId: incId, recordedAt: Date.now() }, item);
        _state.consumables.push(row);
        _recordEvent(incId, null, 'consumable_added', null, 'emt');
        _notify();
        return row;
      }
    };

    // ── supervisor namespace ───────────────────────────────────────────────
    var _svAllowedTypes    = ['whisper','barge','transfer','flag_qa','note','takeover','force_break','message_agent'];
    var _svNoteAllowlist   = ['operational','case','dispatch','transfer','takeover','field'];

    var _supervisorNs = {
      act: function(opts) {
        var typeOk = false;
        for (var ti = 0; ti < _svAllowedTypes.length; ti++) {
          if (_svAllowedTypes[ti] === opts.actionType) { typeOk = true; break; }
        }
        if (!typeOk) return null;
        var row = {
          id:             _uid(),
          incidentId:     opts.incidentId     || null,
          unitId:         opts.unitId         || null,
          targetAgentId:  opts.targetAgentId  || null,
          actionType:     opts.actionType,
          actionStatus:   'active',
          actionNote:     opts.note           || null,
          createdByAgent: opts.createdByAgentId || null,
          createdAt:      Date.now(),
          endedAt:        null
        };
        _state.supervisorActions.unshift(row);
        _recordEvent(opts.incidentId, opts.unitId,
          'supervisor_' + opts.actionType, opts.note || null, 'supervisor');
        _pushSupervisorAction(row);
        _notify();
        return row;
      },
      flagQA: function(opts) {
        var row = {
          id:             _uid(),
          incidentId:     opts.incidentId,
          flagType:       opts.flagType  || 'operational',
          severity:       opts.severity  || 'med',
          status:         'open',
          reason:         opts.reason    || '',
          createdByAgent: opts.createdByAgentId || null,
          createdAt:      Date.now()
        };
        _state.qaFlags.unshift(row);
        _pushQAFlag(row);
        _supervisorNs.act({
          actionType:       'flag_qa',
          incidentId:       opts.incidentId,
          note:             opts.reason,
          createdByAgentId: opts.createdByAgentId
        });
        return row;
      },
      note: function(opts) {
        var isDispatchVisible = false;
        for (var i = 0; i < _svNoteAllowlist.length; i++) {
          if (_svNoteAllowlist[i] === opts.noteType) { isDispatchVisible = true; break; }
        }
        var row = {
          id:               _uid(),
          incidentId:       opts.incidentId     || null,
          unitId:           opts.unitId         || null,
          targetAgentId:    opts.targetAgentId  || null,
          noteType:         opts.noteType,
          noteText:         opts.noteText,
          createdByAgent:   opts.createdByAgentId || null,
          createdAt:        Date.now(),
          visibleToDispatch: isDispatchVisible
        };
        _state.supervisorNotes.unshift(row);
        _pushSupervisorNote(row);
        if (row.visibleToDispatch) {
          _supervisorNs.act({
            actionType:       'note',
            incidentId:       opts.incidentId,
            note:             opts.noteText,
            createdByAgentId: opts.createdByAgentId
          });
        } else {
          _notify();
        }
        return row;
      },
      resolveQA: function(flagId, agentId) {
        for (var i = 0; i < _state.qaFlags.length; i++) {
          if (_state.qaFlags[i].id === flagId) {
            _state.qaFlags[i].status          = 'resolved';
            _state.qaFlags[i].resolvedByAgent = agentId || null;
            _state.qaFlags[i].resolvedAt      = Date.now();
            _notify();
            return;
          }
        }
      }
    };

    // ── dispatchAwareness namespace ────────────────────────────────────────
    // What Dispatch should see for a given incident (NERS §10 visibility rules).
    // RULE: Never surface supervisor_notes where noteType is not in allowlist.
    var _dispatchAwareness = {
      forIncident: function(incId) {
        var openQA = [];
        for (var qi = 0; qi < _state.qaFlags.length; qi++) {
          var qf = _state.qaFlags[qi];
          if (qf.incidentId === incId && qf.status === 'open') openQA.push(qf);
        }
        var latestAction = null;
        for (var ai = 0; ai < _state.supervisorActions.length; ai++) {
          if (_state.supervisorActions[ai].incidentId === incId) {
            latestAction = _state.supervisorActions[ai]; break;
          }
        }
        var takeoverActive = false, transferActive = false, bargeActive = false;
        for (var si = 0; si < _state.supervisorActions.length; si++) {
          var sa = _state.supervisorActions[si];
          if (sa.incidentId !== incId || sa.actionStatus !== 'active') continue;
          if (sa.actionType === 'takeover') takeoverActive = true;
          if (sa.actionType === 'transfer') transferActive = true;
          if (sa.actionType === 'barge')    bargeActive    = true;
        }
        var allowedNotes = [];
        for (var ni = 0; ni < _state.supervisorNotes.length; ni++) {
          var sn = _state.supervisorNotes[ni];
          if (sn.incidentId === incId && sn.visibleToDispatch) allowedNotes.push(sn);
        }
        return {
          openQA:         openQA,
          latestAction:   latestAction,
          takeoverActive: takeoverActive,
          transferActive: transferActive,
          bargeActive:    bargeActive,
          allowedNotes:   allowedNotes
        };
      }
    };

    // ── Getter helpers (private) ───────────────────────────────────────────
    function _getObservations(incId) {
      var out = [];
      for (var i = 0; i < _state.observations.length; i++) {
        if (_state.observations[i].incidentId === incId) out.push(_state.observations[i]);
      }
      return out;
    }
    function _getConsumables(incId) {
      var out = [];
      for (var i = 0; i < _state.consumables.length; i++) {
        if (_state.consumables[i].incidentId === incId) out.push(_state.consumables[i]);
      }
      return out;
    }
    function _getQAFlags(opts) {
      if (opts && opts.openOnly) {
        var out = [];
        for (var i = 0; i < _state.qaFlags.length; i++) {
          if (_state.qaFlags[i].status === 'open') out.push(_state.qaFlags[i]);
        }
        return out;
      }
      return _state.qaFlags.slice();
    }
    function _getSupervisorActions(incId) {
      if (!incId) return _state.supervisorActions.slice();
      var out = [];
      for (var i = 0; i < _state.supervisorActions.length; i++) {
        if (_state.supervisorActions[i].incidentId === incId) out.push(_state.supervisorActions[i]);
      }
      return out;
    }
    function _getDispatchEvents(incId) {
      if (!incId) return _state.dispatchEvents.slice();
      var out = [];
      for (var i = 0; i < _state.dispatchEvents.length; i++) {
        if (_state.dispatchEvents[i].incidentId === incId) out.push(_state.dispatchEvents[i]);
      }
      return out;
    }
    function _getShifts(d) {
      var out = [];
      for (var i = 0; i < _state.shifts.length; i++) {
        if (_state.shifts[i].shiftDate === d) out.push(_state.shifts[i]);
      }
      return out;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 21b. PSAP NAMESPACE
    // ═══════════════════════════════════════════════════════════════════════
    // In-memory triage session store — keyed by sessionId (uuid-lite string).
    var _psapSessions = {};
    var _psapProtocols = [];  // fetched from Supabase or loaded externally

    function _psapUuid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    // CAT_META: protocol category → hospital specialty_tags to match
    var _psapCatTags = {
      'CARDIAC':     ['cardiac','icu','stroke_unit'],
      'NEURO':       ['neuro','stroke_unit','icu'],
      'BURNS':       ['burns','icu'],
      'PSYCHIATRIC': ['psychiatry'],
      'TRAUMA':      ['trauma','icu','ortho'],
      'MATERNITY':   ['maternity','obstetrics','neonatal'],
      'PAEDS':       ['paeds','neonatal'],
      'TOXICOLOGY':  ['toxicology','icu'],
      'RESPIRATORY': ['icu','general'],
      'RENAL':       ['renal','icu'],
      'ORTHO':       ['ortho','trauma'],
      'SPINAL':      ['spinal','neuro','ortho'],
      'MEDICAL':     ['icu','general'],
      'OBSTETRIC':   ['obstetrics','maternity','neonatal'],
      'ENVENOMATION':['icu','toxicology','general']
    };

    var _psapNs = {

      // Load protocols (called by PSAP screen after Supabase fetch or offline fallback)
      loadProtocols: function(protocols) {
        _psapProtocols = protocols || [];
        _emit('psap:protocols:loaded', _psapProtocols);
      },

      // Return all loaded protocols
      getProtocols: function() { return _psapProtocols.slice(); },

      // Find a single protocol by id
      getProtocol: function(id) {
        for (var i = 0; i < _psapProtocols.length; i++) {
          if (_psapProtocols[i].id === id) return _psapProtocols[i];
        }
        return null;
      },

      // Start a new triage session; returns the session object
      startSession: function(opts) {
        opts = opts || {};
        var sid = _psapUuid();
        var session = {
          id:             sid,
          createdAt:      Date.now(),
          callStartMs:    Date.now(),
          source:         opts.source || 'manual_entry',
          // caller/patient/location
          callerPhone:    opts.callerPhone    || '',
          callerName:     opts.callerName     || '',
          callerRelation: opts.callerRelation || '',
          patientPhone:   opts.patientPhone   || '',
          patientAge:     opts.patientAge     || null,
          patientSex:     opts.patientSex     || '',
          locationAddress:opts.locationAddress|| '',
          locationW3w:    opts.locationW3w    || '',
          locationLandmark:opts.locationLandmark||'',
          locationFloor:  opts.locationFloor  || '',
          locationNotes:  opts.locationNotes  || '',
          // triage state
          protocolId:     null,
          answers:        {},   // { questionId: value }
          echoTriggered:  false,
          echoQuestionId: null,
          determinantCode:null,
          determinantLevel:null,
          // PAI / resource
          recommendedUnitIds:    [],
          chosenUnitId:          null,
          recommendedHospitalIds:[],
          chosenHospitalId:      null,
          hospitalPreAlertSent:  false,
          // disposition
          disposition:    null,
          incidentId:     null,
          // SLA
          callAnsweredAt: Date.now(),
          firstDeterminantAt: null,
          dispatchInitiatedAt: null,
          callEndedAt:    null
        };
        _psapSessions[sid] = session;
        _emit('psap:session:started', session);
        return session;
      },

      // Get an existing session by id
      getSession: function(sid) { return _psapSessions[sid] || null; },

      // Update free-form fields on a session (caller/patient/location)
      updateSession: function(sid, patch) {
        var s = _psapSessions[sid];
        if (!s) return null;
        for (var k in patch) {
          if (Object.prototype.hasOwnProperty.call(patch, k)) s[k] = patch[k];
        }
        _emit('psap:session:updated', s);
        return s;
      },

      // Select a protocol for this session; clears prior answers
      selectProtocol: function(sid, protocolId) {
        var s = _psapSessions[sid];
        if (!s) return null;
        s.protocolId      = protocolId;
        s.answers         = {};
        s.echoTriggered   = false;
        s.echoQuestionId  = null;
        s.determinantCode = null;
        s.determinantLevel= null;
        s.recommendedUnitIds    = [];
        s.recommendedHospitalIds= [];
        _emit('psap:session:updated', s);
        return s;
      },

      // Record an answer to a key question; recomputes determinant and checks echo
      answerQuestion: function(sid, questionId, value) {
        var s = _psapSessions[sid];
        if (!s) return null;
        s.answers[questionId] = value;

        var proto = _psapNs.getProtocol(s.protocolId);
        if (!proto) { _emit('psap:session:updated', s); return s; }

        // Echo trigger check: any echo_trigger with answer false
        s.echoTriggered  = false;
        s.echoQuestionId = null;
        var ets = proto.echo_triggers || [];
        for (var ei = 0; ei < ets.length; ei++) {
          var et = ets[ei];
          if (et.id in s.answers && s.answers[et.id] === false) {
            s.echoTriggered  = true;
            s.echoQuestionId = et.id;
            break;
          }
        }

        // Determinant computation (ordered rules, first match wins)
        var rules = proto.determinant_rules || [];
        // Sort: E first, then D, C, B, A (level char sort reversed)
        var ordered = rules.slice().sort(function(a, b) {
          var order = {E:0,D:1,C:2,B:3,A:4};
          var la = order[a.level] !== undefined ? order[a.level] : 99;
          var lb = order[b.level] !== undefined ? order[b.level] : 99;
          return la - lb;
        });

        var matched = null;
        for (var ri = 0; ri < ordered.length; ri++) {
          var rule = ordered[ri];
          var conds = rule.conditions || [];
          // Empty conditions = default/catch-all fallback — skip until all rules tried
          if (conds.length === 0) {
            if (!matched) matched = rule; // save as fallback
            continue;
          }
          var allMet = true;
          for (var ci = 0; ci < conds.length; ci++) {
            var cond = conds[ci];
            var ans  = s.answers[cond.qid];
            if (ans === undefined) { allMet = false; break; }
            if (cond.op === 'eq'  && ans !== cond.val) { allMet = false; break; }
            if (cond.op === 'gt'  && !(ans >  cond.val)) { allMet = false; break; }
            if (cond.op === 'lt'  && !(ans <  cond.val)) { allMet = false; break; }
            if (cond.op === 'gte' && !(ans >= cond.val)) { allMet = false; break; }
            if (cond.op === 'lte' && !(ans <= cond.val)) { allMet = false; break; }
            if (cond.op === 'neq' && ans === cond.val)   { allMet = false; break; }
          }
          if (allMet) { matched = rule; break; }
        }

        // Echo override: regardless of computed level, echo = E
        if (s.echoTriggered) {
          s.determinantLevel = 'E';
          s.determinantCode  = matched ? matched.code : (proto.short_name || proto.id) + '-E-ECHO';
        } else if (matched) {
          s.determinantLevel = matched.level;
          s.determinantCode  = matched.code;
        }

        if (s.determinantLevel && !s.firstDeterminantAt) {
          s.firstDeterminantAt = Date.now();
        }

        // Auto-refresh unit/hospital recommendations
        _psapNs.recommendUnits(sid);
        _psapNs.recommendHospitals(sid);

        _emit('psap:session:updated', s);
        return s;
      },

      // Recommend available units sorted by distance to incident location, ALS preferred for D/E
      recommendUnits: function(sid) {
        var s = _psapSessions[sid];
        if (!s) return [];
        // Find incident lat/lng — derive from location string or use Nairobi CBD default
        var refLat = -1.2921, refLng = 36.8219;
        var fleet  = _state.fleet;
        var level  = s.determinantLevel;
        var needAls = (level === 'E' || level === 'D');

        var candidates = [];
        for (var i = 0; i < fleet.length; i++) {
          var u = fleet[i];
          if (u.status !== 'available' && u.status !== 'standby') continue;
          var dist = _distKm(refLat, refLng, u.lat, u.lng);
          var alsScore = (needAls && u.type === 'ALS') ? 0 : (needAls && u.type === 'BLS') ? 1 : 0;
          candidates.push({ unit: u, dist: dist, alsScore: alsScore });
        }
        candidates.sort(function(a, b) {
          if (a.alsScore !== b.alsScore) return a.alsScore - b.alsScore;
          return a.dist - b.dist;
        });

        var ids = [];
        for (var j = 0; j < Math.min(5, candidates.length); j++) {
          ids.push(candidates[j].unit.id);
        }
        s.recommendedUnitIds = ids;
        return ids;
      },

      // Recommend hospitals: tag-match protocol category → specialty_tags, sort by match score + distance
      recommendHospitals: function(sid) {
        var s = _psapSessions[sid];
        if (!s) return [];
        var proto = _psapNs.getProtocol(s.protocolId);
        var catTags = proto ? (_psapCatTags[proto.category] || ['general']) : ['general'];
        var refLat = -1.2921, refLng = 36.8219;
        var hospitals = _state.hospitals;

        var scored = [];
        for (var i = 0; i < hospitals.length; i++) {
          var h = hospitals[i];
          if (h.divert_status === 'bypass') continue;
          // Score: number of tag matches
          var matchScore = 0;
          var htags = h.specialty_tags || h.specialties || [];
          for (var ti = 0; ti < catTags.length; ti++) {
            for (var hi = 0; hi < htags.length; hi++) {
              if (htags[hi].toLowerCase() === catTags[ti].toLowerCase()) { matchScore++; break; }
            }
          }
          var dist = _distKm(refLat, refLng, h.lat, h.lng);
          var capacityOk = (h.capacity_pct || h.edPct || 50) < 95;
          if (!capacityOk) continue;
          scored.push({ h: h, matchScore: matchScore, dist: dist });
        }

        scored.sort(function(a, b) {
          if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
          return a.dist - b.dist;
        });

        var ids = [];
        for (var j = 0; j < Math.min(5, scored.length); j++) {
          ids.push(scored[j].h.id);
        }
        s.recommendedHospitalIds = ids;
        return ids;
      },

      // Choose a unit for this session
      chooseUnit: function(sid, unitId) {
        var s = _psapSessions[sid];
        if (!s) return null;
        s.chosenUnitId = unitId;
        _emit('psap:session:updated', s);
        return s;
      },

      // Choose a hospital for this session; optionally mark pre-alert sent
      chooseHospital: function(sid, hospitalId, preAlert) {
        var s = _psapSessions[sid];
        if (!s) return null;
        s.chosenHospitalId = hospitalId;
        if (preAlert) s.hospitalPreAlertSent = true;
        _emit('psap:session:updated', s);
        return s;
      },

      // Mark pre-alert as sent
      sendPreAlert: function(sid) {
        var s = _psapSessions[sid];
        if (!s) return null;
        s.hospitalPreAlertSent = true;
        _emit('psap:session:updated', s);
        return s;
      },

      // Create an incident from the session (wraps dispatch.createIncident)
      // Returns the new incident object; marks session disposition = 'incident_created'
      createIncident: function(sid, priority) {
        var s = _psapSessions[sid];
        if (!s) return null;
        var proto = _psapNs.getProtocol(s.protocolId);
        var incData = {
          priority:        priority || (s.determinantLevel === 'E' || s.determinantLevel === 'D' ? 1 :
                            s.determinantLevel === 'C' ? 2 : 3),
          complaint:       proto ? proto.display_name : 'Unknown Complaint',
          location:        s.locationAddress || s.locationW3w || 'Unknown Location',
          address:         s.locationAddress || s.locationW3w || 'Unknown Location',
          w3w:             s.locationW3w || '',
          callerName:      s.callerName,
          callerPhone:     s.callerPhone,
          patientAge:      s.patientAge,
          patientSex:      s.patientSex,
          determinantCode: s.determinantCode,
          determinantLevel:s.determinantLevel,
          source:          'psap',                       // forces _autoDispatchAt = null
          triageSessionId: s.id
        };
        // Carry geocoded lat/lng/county from the PSAP form so the incident is
        // placed at the actual scene rather than a random seeded zone.
        if (s.locationLat != null) incData.lat    = s.locationLat;
        if (s.locationLng != null) incData.lng    = s.locationLng;
        if (s.locationCounty)      incData.county = s.locationCounty;
        var inc = dispatch.createIncident(incData);
        if (!inc) return null;
        s.incidentId           = inc.id;
        s.disposition          = 'incident_created';
        s.dispatchInitiatedAt  = Date.now();
        s.callEndedAt          = Date.now();

        // Assign chosen unit if selected
        if (s.chosenUnitId) dispatch.assignUnit(inc.id, s.chosenUnitId);
        // Set chosen hospital if selected
        if (s.chosenHospitalId) dispatch.setHospital(inc.id, s.chosenHospitalId);

        // Persist triage session to Supabase (best-effort, no await in ES5)
        _psapNs._persistSession(s);

        _emit('psap:incident:created', { session: s, incident: inc });
        return inc;
      },

      // Log a disposition without creating an incident
      logDisposition: function(sid, dispositionType) {
        var s = _psapSessions[sid];
        if (!s) return null;
        s.disposition  = dispositionType;
        s.callEndedAt  = Date.now();
        _psapNs._persistSession(s);
        _emit('psap:session:closed', s);
        return s;
      },

      // Best-effort persist of a triage session to Supabase triage_sessions table
      _persistSession: function(s) {
        if (!_sb) return;
        var row = {
          id:                    s.id,
          source:                s.source,
          call_taker_id:         'psap_ui',  // default; real Clerk UID injected post-auth
          caller_phone:          s.callerPhone      || null,
          caller_name:           s.callerName       || null,
          caller_relationship:   s.callerRelation   || null,
          patient_phone:         s.patientPhone     || null,
          patient_age:           s.patientAge       || null,
          patient_sex:           s.patientSex       || null,
          location_address:      s.locationAddress  || null,
          location_w3w:          s.locationW3w      || null,
          location_landmark:     s.locationLandmark || null,
          location_floor_room:   s.locationFloor    || null,
          location_notes:        s.locationNotes    || null,
          protocol_id:           s.protocolId       || null,
          key_question_answers:  s.answers,
          determinant_code:      s.determinantCode  || null,
          determinant_level:     s.determinantLevel || null,
          echo_bypass_triggered: s.echoTriggered    || false,
          echo_question_id:      s.echoQuestionId   || null,
          recommended_unit_ids:     s.recommendedUnitIds     || [],
          chosen_unit_id:           s.chosenUnitId           || null,
          recommended_hospital_ids: s.recommendedHospitalIds || [],
          chosen_hospital_id:       s.chosenHospitalId       || null,
          hospital_pre_alert_sent:  s.hospitalPreAlertSent   || false,
          disposition:           s.disposition      || null,
          incident_id:           s.incidentId       || null,
          call_started_at:          s.callAnsweredAt     ? new Date(s.callAnsweredAt).toISOString()     : null,
          determinant_finalized_at: s.firstDeterminantAt ? new Date(s.firstDeterminantAt).toISOString(): null,
          unit_dispatched_at:       s.dispatchInitiatedAt? new Date(s.dispatchInitiatedAt).toISOString(): null,
          closed_at:                s.callEndedAt        ? new Date(s.callEndedAt).toISOString()        : null
        };
        _sb.from('triage_sessions').upsert(row, { onConflict: 'id' })
          .then(function(res) {
            if (res && res.error) console.warn('[NACDState.psap] triage_sessions upsert error:', res.error.message);
          })
          .catch(function(e) { console.warn('[NACDState.psap] triage_sessions upsert failed:', e); });
      }
    };

    // ── Dispatch mutator wrap — idempotent ─────────────────────────────────
    // Guard: if Phase 4d is re-loaded (hot reload / double-include), the wrap
    // must not fire twice. _eventWrapped flag prevents double-emit.
    (function wrapForEvents() {
      var dp = dispatch;
      if (dp._eventWrapped) return;
      dp._eventWrapped = true;
      var origCreate = dp.createIncident;
      var origAssign = dp.assignUnit;
      var origStatus = dp.updateStatus;
      var origHosp   = dp.setHospital;
      var origClose  = dp.closeIncident;
      var origCancel = dp.cancelIncident;
      // createIncident returns the new incident object — r.id is valid
      dp.createIncident = function(data) {
        var r = origCreate.apply(this, arguments);
        _recordEvent(r && r.id ? r.id : null, null, 'incident_created', null, 'dispatcher');
        return r;
      };
      // assignUnit / updateStatus / etc. receive incId as first arg — safe even if return is falsy
      dp.assignUnit = function(incId, unitId) {
        var r = origAssign.apply(this, arguments);
        _recordEvent(incId, unitId, 'unit_assigned', null, 'dispatcher');
        return r;
      };
      dp.updateStatus = function(incId, status) {
        var r = origStatus.apply(this, arguments);
        _recordEvent(incId, null, 'status_' + status, null, 'dispatcher');
        return r;
      };
      dp.setHospital = function(incId, hospId) {
        var r = origHosp.apply(this, arguments);
        _recordEvent(incId, null, 'hospital_set', String(hospId), 'dispatcher');
        return r;
      };
      dp.closeIncident = function(incId) {
        var r = origClose.apply(this, arguments);
        _recordEvent(incId, null, 'incident_closed', null, 'dispatcher');
        return r;
      };
      dp.cancelIncident = function(incId) {
        var r = origCancel.apply(this, arguments);
        _recordEvent(incId, null, 'incident_cancelled', null, 'dispatcher');
        return r;
      };
    })();

    // ═══════════════════════════════════════════════════════════════════════
    // 22. PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════
    var _pub = {
      init:         init,
      on:           _on,
      off:          _off,

      getState:     function () { return _publicState(); },
      getIncidents: function () { return _state.incidents.slice(); },
      getFleet:     function () { return _state.fleet.slice(); },

      // Provider-driven operational status changes (break, maintenance, back-on).
      // Restricted to non-incident states so a provider can't accidentally
      // override the dispatch engine. Returns true on success, false on reject.
      // Allowed values: 'available', 'standby' (break), 'maintenance', 'off_duty'.
      fleet: {
        setStatus: function (unitId, newStatus) {
          var ALLOWED = { available:1, standby:1, maintenance:1, off_duty:1 };
          if (!ALLOWED[newStatus]) return false;
          var unit = _findUnit(unitId);
          if (!unit) return false;
          // Don't override mid-incident — dispatcher must clear first.
          if (unit.incidentId &&
              (unit.status === 'dispatching' || unit.status === 'dispatched' ||
               unit.status === 'en_route' || unit.status === 'on_scene' ||
               unit.status === 'transport')) {
            return false;
          }
          unit.status    = newStatus;
          unit.updatedAt = Date.now();
          if (_sb) { try { _pushUnit(unit); } catch (e) {} }
          _emit('unit:moved', unit);   // existing event listeners already react to this
          return true;
        }
      },
      getHospitals: function () { return _state.hospitals.slice(); },
      getAgents:    function () { return _state.agentRecords.slice(); },
      getZones:     function () { return _state.zones; },
      getKPIs:      function () { return _calcKPIs(); },
      findUnit:     _findUnit,
      findHospital: _findHospital,
      findIncident: _findIncident,

      getClaims:    function() { return _state.claims ? _state.claims.slice() : []; },
      claims:       _claimsApi,

      getProviders: function() {
        var claims = _state.claims || [];
        var fleet  = _state.fleet  || [];
        var _PROV_META = {
          PRV001:{ county:'Nairobi',  sla:88, phone:'+254 703 082 000', email:'info@aar.co.ke' },
          PRV002:{ county:'Nairobi',  sla:91, phone:'+254 20 699 3000', email:'ems@amref.org' },
          PRV003:{ county:'Nairobi',  sla:86, phone:'+254 20 210 0000', email:'dispatch@stjohnkenya.org' },
          PRV004:{ county:'Nairobi',  sla:89, phone:'+254 20 284 5000', email:'ems@nairobihospital.org' },
          PRV005:{ county:'Nairobi',  sla:92, phone:'+254 20 366 2000', email:'ems@agakhankenya.org' },
          PRV006:{ county:'Mombasa',  sla:84, phone:'+254 41 222 7000', email:'ems@mombasacounty.go.ke' },
          PRV007:{ county:'Kiambu',   sla:83, phone:'+254 66 321 0000', email:'ems@pcea-kikuyu.org' },
          PRV008:{ county:'National', sla:93, phone:'+254 709 767 000', email:'info@eplus.co.ke', website:'eplus.co.ke' }
        };
        return _PROVIDERS.map(function(p, idx) {
          var meta       = _PROV_META[p.id] || {};
          var provClaims = claims.filter(function(c){ return c.providerId === p.id; });
          var provFleet  = fleet.filter(function(u){ return u.providerId === p.id; });
          var paid       = provClaims.filter(function(c){ return c.status === 'PAID'; });
          var totalPaid  = paid.reduce(function(s, c){ return s + (c.tariff - (c.deductions||0)); }, 0);
          var pending    = provClaims.filter(function(c){ return c.status === 'QUEUED' || c.status === 'UNDER_REVIEW'; }).length;
          return {
            id:              p.id,
            name:            p.name,
            paymentMethod:   p.method,
            fleetCount:      provFleet.length,
            crewCount:       Math.ceil(provFleet.length * 2.5),
            totalClaims:     provClaims.length,
            pendingClaims:   pending,
            totalPaidKES:    totalPaid,
            contractStatus:  'ACTIVE',
            onboardingStep:  6,
            slaCompliance:   meta.sla || (85 + (idx * 3) % 14),
            county:          meta.county || 'Nairobi',
            phone:           meta.phone  || '+254 700 ' + ('000000' + (100000 + idx * 13271)).slice(-6),
            email:           meta.email  || p.name.toLowerCase().replace(/[^a-z]/g,'.').replace(/\.+/g,'.') + '@sha.go.ke',
            website:         meta.website || '',
            contractNo:      'SHA/EMS/' + (2024 + idx % 2) + '/' + ('000' + (idx + 1)).slice(-3)
          };
        });
      },

      // Phase 4d — new getters (NERS data-model adoption)
      getPatientProfile:    function(incId) { return _state.patientProfiles[incId] || null; },
      getObservations:      _getObservations,
      getConsumables:       _getConsumables,
      getInvoice:           function(incId) { return _state.invoices[incId] || null; },
      getAgentRecords:      function() { return _state.agentRecords.slice(); },
      getShifts:            _getShifts,
      getQAFlags:           _getQAFlags,
      getSupervisorActions: _getSupervisorActions,
      getDispatchEvents:    _getDispatchEvents,

      // Phase 4d — new mutator namespaces
      intake:            _intake,
      fieldCare:         _fieldCare,
      supervisor:        _supervisorNs,
      dispatchAwareness: _dispatchAwareness,

      // Sprint 6 — PSAP triage engine
      psap: _psapNs,

      dispatch: dispatch,
      sim:      sim,

      // Phase 4g — allow external authenticated Supabase client injection
      // Called by NACDAuth after Clerk JWT exchange; patches _sb so writes use the JWT.
      setSupabaseClient: function(sb) {
        if (!sb) return;
        _sb = sb;
        _subscribeRealtime();
        _hydrateIdMaps();
        console.info('[NACDState] Supabase client patched (authenticated).');
      },

      // Rescue Slice 4 — expose Supabase client for EMT/claims direct writes.
      // Returns null if Supabase is not configured (demo-only mode).
      getSupabaseClient: function() { return _sb || null; },

      // Rescue Slice 4 — translate incident display_id ('INC-010001') → Supabase UUID.
      // Returns null if the mapping is not yet hydrated or the incident is unknown.
      getIncidentUuid: function(displayId) {
        return (displayId && _incUuidByDisplay[displayId]) ? _incUuidByDisplay[displayId] : null;
      },

      setUnitRoute: function(unitId, lngLatCoords) {
        var unit = _findUnit(unitId);
        if (!unit || !lngLatCoords || lngLatCoords.length < 2) return false;
        unit._routeWaypoints = lngLatCoords;
        unit._waypointIdx = 0;
        return true;
      },

      // Constants — expose so UIs don't hardcode strings
      STATUS:       STATUS,
      UNIT_STATUS:  UNIT_STATUS,
      STATUS_COLORS: STATUS_COLORS,
      PRIORITY_COLORS: PRIORITY_COLORS,
      ZONES:        ZONES,
      HOSPITALS:    HOSPITALS
    };

    return _pub;
  })();

  // Attach to global scope
  global.NACDState = NACDState;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
