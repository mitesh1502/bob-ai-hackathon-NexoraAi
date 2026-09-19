import { pool, query } from './db';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

// ─── Helper ────────────────────────────────────────────────────────────────
async function insertState(id: string, name: string, code: string) {
  await query(
    `INSERT INTO states (id, name, code) VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
    [id, name, code]
  );
}

async function insertDistrict(id: string, stateId: string, name: string, code: string) {
  await query(
    `INSERT INTO districts (id, state_id, name, code) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [id, stateId, name, code]
  );
}

async function insertTaluka(districtId: string, stateId: string, name: string): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO talukas (id, name, district_id, state_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [id, name, districtId, stateId]
  );
  // re-fetch in case it already existed
  const rows = await query<any>(
    `SELECT id FROM talukas WHERE name = $1 AND district_id = $2 LIMIT 1`,
    [name, districtId]
  );
  return rows[0]?.id ?? id;
}

async function insertVillage(talukaId: string, districtId: string, stateId: string, name: string) {
  await query(
    `INSERT INTO villages (id, name, taluka_id, district_id, state_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [uuidv4(), name, talukaId, districtId, stateId]
  );
}

// Seed talukas + 2 villages per taluka for one district
async function seedTalukaVillages(
  districtId: string,
  stateId: string,
  talukaData: Array<{ taluka: string; villages: string[] }>
) {
  for (const { taluka, villages } of talukaData) {
    const tId = await insertTaluka(districtId, stateId, taluka);
    for (const v of villages) {
      await insertVillage(tId, districtId, stateId, v);
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function seedGeography() {
  logger.info('[GeoSeed] Starting full India geography seed...');

  // ── 36 States / UTs ────────────────────────────────────────────
  const ST: Record<string, string> = {};
  const stateList: Array<[string, string]> = [
    ['AN', 'Andaman and Nicobar Islands'],
    ['AP', 'Andhra Pradesh'],
    ['AR', 'Arunachal Pradesh'],
    ['AS', 'Assam'],
    ['BR', 'Bihar'],
    ['CH', 'Chandigarh'],
    ['CG', 'Chhattisgarh'],
    ['DN', 'Dadra and Nagar Haveli and Daman and Diu'],
    ['DL', 'Delhi'],
    ['GA', 'Goa'],
    ['GJ', 'Gujarat'],
    ['HR', 'Haryana'],
    ['HP', 'Himachal Pradesh'],
    ['JK', 'Jammu and Kashmir'],
    ['JH', 'Jharkhand'],
    ['KA', 'Karnataka'],
    ['KL', 'Kerala'],
    ['LA', 'Ladakh'],
    ['LD', 'Lakshadweep'],
    ['MP', 'Madhya Pradesh'],
    ['MH', 'Maharashtra'],
    ['MN', 'Manipur'],
    ['ML', 'Meghalaya'],
    ['MZ', 'Mizoram'],
    ['NL', 'Nagaland'],
    ['OD', 'Odisha'],
    ['PY', 'Puducherry'],
    ['PB', 'Punjab'],
    ['RJ', 'Rajasthan'],
    ['SK', 'Sikkim'],
    ['TN', 'Tamil Nadu'],
    ['TS', 'Telangana'],
    ['TR', 'Tripura'],
    ['UP', 'Uttar Pradesh'],
    ['UK', 'Uttarakhand'],
    ['WB', 'West Bengal'],
  ];

  for (const [code, name] of stateList) {
    const id = uuidv4();
    ST[code] = id;
    await insertState(id, name, code);
  }

  // Re-fetch actual IDs
  const stateRows = await query<any>(`SELECT id, code FROM states WHERE is_active = TRUE`);
  for (const s of stateRows) ST[s.code] = s.id;

  logger.info('[GeoSeed] States done.');

  // ── Maharashtra (36 districts) ─────────────────────────────────
  const MH = ST['MH'];
  const mhDistricts: Array<[string, string]> = [
    ['Mumbai', 'MUM'], ['Mumbai Suburban', 'MUM-SUB'], ['Thane', 'THN'],
    ['Pune', 'PUN'], ['Nashik', 'NSK'], ['Aurangabad', 'AUR'], ['Nagpur', 'NGP'],
    ['Solapur', 'SLP'], ['Kolhapur', 'KLP'], ['Satara', 'SAT'], ['Sangli', 'SAN'],
    ['Raigad', 'RGD'], ['Ratnagiri', 'RTN'], ['Sindhudurg', 'SND'], ['Dhule', 'DHL'],
    ['Nandurbar', 'NDB'], ['Jalgaon', 'JLG'], ['Ahmednagar', 'AHN'], ['Beed', 'BED'],
    ['Latur', 'LTR'], ['Osmanabad', 'OSM'], ['Nanded', 'NND'], ['Hingoli', 'HNG'],
    ['Parbhani', 'PRB'], ['Jalna', 'JLN'], ['Buldhana', 'BLD'], ['Akola', 'AKL'],
    ['Washim', 'WSH'], ['Amravati', 'AMR'], ['Yavatmal', 'YVT'], ['Wardha', 'WRD'],
    ['Gadchiroli', 'GDC'], ['Chandrapur', 'CDP'], ['Bhandara', 'BHN'], ['Gondia', 'GND'],
    ['Palghar', 'PLG'],
  ];
  const MH_DIST: Record<string, string> = {};
  for (const [name, code] of mhDistricts) {
    const id = uuidv4();
    await insertDistrict(id, MH, name, `MH-${code}`);
    MH_DIST[name] = id;
  }
  const mhDistRows = await query<any>(`SELECT id, name FROM districts WHERE state_id = $1`, [MH]);
  for (const r of mhDistRows) MH_DIST[r.name] = r.id;

  // Talukas for select MH districts
  await seedTalukaVillages(MH_DIST['Mumbai'], MH, [
    { taluka: 'Borivali', villages: ['Kandivali', 'Malad'] },
    { taluka: 'Andheri', villages: ['Versova', 'Jogeshwari'] },
    { taluka: 'Kurla', villages: ['Ghatkopar', 'Chembur'] },
  ]);
  await seedTalukaVillages(MH_DIST['Pune'], MH, [
    { taluka: 'Haveli', villages: ['Khadki', 'Dapodi'] },
    { taluka: 'Pune City', villages: ['Shivajinagar', 'Hadapsar'] },
    { taluka: 'Maval', villages: ['Talegaon', 'Kamshet'] },
  ]);
  await seedTalukaVillages(MH_DIST['Nashik'], MH, [
    { taluka: 'Nashik', villages: ['Nashik Road', 'Ozar'] },
    { taluka: 'Niphad', villages: ['Niphad', 'Lasalgaon'] },
    { taluka: 'Sinnar', villages: ['Sinnar', 'Saikheda'] },
  ]);
  await seedTalukaVillages(MH_DIST['Nagpur'], MH, [
    { taluka: 'Nagpur City', villages: ['Sitabuldi', 'Dharampeth'] },
    { taluka: 'Kamptee', villages: ['Kamptee', 'Khapri'] },
    { taluka: 'Hingna', villages: ['Hingna', 'Butibori'] },
  ]);
  await seedTalukaVillages(MH_DIST['Thane'], MH, [
    { taluka: 'Thane', villages: ['Kopri', 'Wagle Estate'] },
    { taluka: 'Kalyan', villages: ['Kalyan East', 'Dombivli'] },
    { taluka: 'Bhiwandi', villages: ['Bhiwandi', 'Anjur'] },
  ]);
  logger.info('[GeoSeed] MH done.');

  // ── Kerala (14 districts) ───────────────────────────────────────
  const KL = ST['KL'];
  const klDistricts: Array<[string, string]> = [
    ['Thiruvananthapuram', 'TVM'], ['Kollam', 'KLM'], ['Pathanamthitta', 'PTA'],
    ['Alappuzha', 'ALP'], ['Kottayam', 'KTM'], ['Idukki', 'IDK'], ['Ernakulam', 'EKM'],
    ['Thrissur', 'TSR'], ['Palakkad', 'PKD'], ['Malappuram', 'MLP'], ['Kozhikode', 'KZD'],
    ['Wayanad', 'WYD'], ['Kannur', 'KNR'], ['Kasaragod', 'KSD'],
  ];
  const KL_DIST: Record<string, string> = {};
  for (const [name, code] of klDistricts) {
    const id = uuidv4();
    await insertDistrict(id, KL, name, `KL-${code}`);
    KL_DIST[name] = id;
  }
  const klDistRows = await query<any>(`SELECT id, name FROM districts WHERE state_id = $1`, [KL]);
  for (const r of klDistRows) KL_DIST[r.name] = r.id;

  await seedTalukaVillages(KL_DIST['Thiruvananthapuram'], KL, [
    { taluka: 'Thiruvananthapuram', villages: ['Pattom', 'Kowdiar'] },
    { taluka: 'Nedumangad', villages: ['Nedumangad', 'Vattiyoorkavu'] },
    { taluka: 'Neyyattinkara', villages: ['Neyyattinkara', 'Balaramapuram'] },
  ]);
  await seedTalukaVillages(KL_DIST['Ernakulam'], KL, [
    { taluka: 'Kanayannur', villages: ['Fort Kochi', 'Mattancherry'] },
    { taluka: 'Kochi', villages: ['Edappally', 'Kakkanad'] },
    { taluka: 'Aluva', villages: ['Aluva', 'Perumbavoor'] },
  ]);
  await seedTalukaVillages(KL_DIST['Thrissur'], KL, [
    { taluka: 'Thrissur', villages: ['Thrissur City', 'Ollur'] },
    { taluka: 'Chalakudy', villages: ['Chalakudy', 'Kodungallur'] },
    { taluka: 'Mukundapuram', villages: ['Irinjalakuda', 'Kunnamkulam'] },
  ]);
  await seedTalukaVillages(KL_DIST['Kozhikode'], KL, [
    { taluka: 'Kozhikode', villages: ['Calicut Beach', 'Malaparamba'] },
    { taluka: 'Vatakara', villages: ['Vatakara', 'Koyilandy'] },
    { taluka: 'Thamarassery', villages: ['Thamarassery', 'Thiruvambady'] },
  ]);
  logger.info('[GeoSeed] KL done.');

  // ── Delhi (11 districts) ────────────────────────────────────────
  const DL = ST['DL'];
  const dlDistricts: Array<[string, string]> = [
    ['Central Delhi', 'CEN'], ['East Delhi', 'EST'], ['New Delhi', 'NDL'],
    ['North Delhi', 'NRT'], ['North East Delhi', 'NED'], ['North West Delhi', 'NWD'],
    ['Shahdara', 'SHA'], ['South Delhi', 'STH'], ['South East Delhi', 'SED'],
    ['South West Delhi', 'SWD'], ['West Delhi', 'WES'],
  ];
  const DL_DIST: Record<string, string> = {};
  for (const [name, code] of dlDistricts) {
    const id = uuidv4();
    await insertDistrict(id, DL, name, `DL-${code}`);
    DL_DIST[name] = id;
  }
  const dlDistRows = await query<any>(`SELECT id, name FROM districts WHERE state_id = $1`, [DL]);
  for (const r of dlDistRows) DL_DIST[r.name] = r.id;

  await seedTalukaVillages(DL_DIST['New Delhi'], DL, [
    { taluka: 'New Delhi Sub-District', villages: ['Connaught Place', 'India Gate'] },
    { taluka: 'Naraina Sub-District', villages: ['Naraina', 'Pusa'] },
  ]);
  await seedTalukaVillages(DL_DIST['South Delhi'], DL, [
    { taluka: 'Hauz Khas Sub-District', villages: ['Hauz Khas', 'Green Park'] },
    { taluka: 'Kalkaji Sub-District', villages: ['Kalkaji', 'Govindpuri'] },
  ]);
  await seedTalukaVillages(DL_DIST['North West Delhi'], DL, [
    { taluka: 'Rohini Sub-District', villages: ['Rohini Sector 3', 'Pitampura'] },
    { taluka: 'Shalimar Bagh Sub-District', villages: ['Shalimar Bagh', 'Ashok Vihar'] },
  ]);
  logger.info('[GeoSeed] DL done.');

  // ── Karnataka (31 districts) ────────────────────────────────────
  const KA = ST['KA'];
  const kaDistricts: Array<[string, string]> = [
    ['Bagalkot', 'BGK'], ['Ballari', 'BLR'], ['Belagavi', 'BLG'],
    ['Bengaluru Rural', 'BRR'], ['Bengaluru Urban', 'BNG'], ['Bidar', 'BDR'],
    ['Chamarajanagar', 'CMR'], ['Chikkaballapur', 'CKB'], ['Chikkamagaluru', 'CKM'],
    ['Chitradurga', 'CTG'], ['Dakshina Kannada', 'DKN'], ['Davanagere', 'DVG'],
    ['Dharwad', 'DHW'], ['Gadag', 'GDG'], ['Hassan', 'HSN'], ['Haveri', 'HVR'],
    ['Kalaburagi', 'KLB'], ['Kodagu', 'KDG'], ['Kolar', 'KLR'], ['Koppal', 'KPL'],
    ['Mandya', 'MDY'], ['Mysuru', 'MYS'], ['Raichur', 'RCR'], ['Ramanagara', 'RMN'],
    ['Shivamogga', 'SMG'], ['Tumakuru', 'TMK'], ['Udupi', 'UDP'],
    ['Uttara Kannada', 'UTK'], ['Vijayapura', 'VJP'], ['Yadgir', 'YDG'],
    ['Bengaluru', 'BLR2'],
  ];
  const KA_DIST: Record<string, string> = {};
  for (const [name, code] of kaDistricts) {
    const id = uuidv4();
    await insertDistrict(id, KA, name, `KA-${code}`);
    KA_DIST[name] = id;
  }
  const kaDistRows = await query<any>(`SELECT id, name FROM districts WHERE state_id = $1`, [KA]);
  for (const r of kaDistRows) KA_DIST[r.name] = r.id;

  await seedTalukaVillages(KA_DIST['Bengaluru Urban'], KA, [
    { taluka: 'Bangalore North', villages: ['Yelahanka', 'Hebbal'] },
    { taluka: 'Bangalore South', villages: ['JP Nagar', 'Bannerghatta'] },
    { taluka: 'Bangalore East', villages: ['Whitefield', 'KR Puram'] },
  ]);
  await seedTalukaVillages(KA_DIST['Mysuru'], KA, [
    { taluka: 'Mysuru', villages: ['Mysore City', 'Nanjangud Road'] },
    { taluka: 'Nanjangud', villages: ['Nanjangud', 'T Narasipur'] },
    { taluka: 'Hunsur', villages: ['Hunsur', 'Periyapatna'] },
  ]);
  await seedTalukaVillages(KA_DIST['Belagavi'], KA, [
    { taluka: 'Belagavi', villages: ['Belagavi City', 'Tilakwadi'] },
    { taluka: 'Gokak', villages: ['Gokak', 'Nandagad'] },
    { taluka: 'Chikodi', villages: ['Chikodi', 'Nipani'] },
  ]);
  await seedTalukaVillages(KA_DIST['Dakshina Kannada'], KA, [
    { taluka: 'Mangaluru', villages: ['Mangaluru City', 'Ullal'] },
    { taluka: 'Bantwal', villages: ['Bantwal', 'Vitla'] },
    { taluka: 'Puttur', villages: ['Puttur', 'Uppinangady'] },
  ]);
  logger.info('[GeoSeed] KA done.');

  // ── Tamil Nadu (38 districts) ───────────────────────────────────
  const TN = ST['TN'];
  const tnDistricts: Array<[string, string]> = [
    ['Ariyalur', 'ARL'], ['Chengalpattu', 'CGP'], ['Chennai', 'CHN'],
    ['Coimbatore', 'CBE'], ['Cuddalore', 'CDL'], ['Dharmapuri', 'DHP'],
    ['Dindigul', 'DDL'], ['Erode', 'ERD'], ['Kallakurichi', 'KLK'],
    ['Kancheepuram', 'KCP'], ['Kanyakumari', 'KNY'], ['Karur', 'KRR'],
    ['Krishnagiri', 'KRG'], ['Madurai', 'MDR'], ['Mayiladuthurai', 'MYD'],
    ['Nagapattinam', 'NGP'], ['Namakkal', 'NMK'], ['Nilgiris', 'NLG'],
    ['Perambalur', 'PRB'], ['Pudukkottai', 'PDK'], ['Ramanathapuram', 'RMN'],
    ['Ranipet', 'RNP'], ['Salem', 'SLM'], ['Sivaganga', 'SVG'],
    ['Tenkasi', 'TNK'], ['Thanjavur', 'TNJ'], ['Theni', 'THN'],
    ['Thoothukudi', 'TTK'], ['Tiruchirappalli', 'TRC'], ['Tirunelveli', 'TNV'],
    ['Tirupathur', 'TPT'], ['Tiruppur', 'TPR'], ['Tiruvallur', 'TVL'],
    ['Tiruvannamalai', 'TVM'], ['Tiruvarur', 'TVR'], ['Vellore', 'VLR'],
    ['Villupuram', 'VLP'], ['Virudhunagar', 'VDN'],
  ];
  const TN_DIST: Record<string, string> = {};
  for (const [name, code] of tnDistricts) {
    const id = uuidv4();
    await insertDistrict(id, TN, name, `TN-${code}`);
    TN_DIST[name] = id;
  }
  const tnDistRows = await query<any>(`SELECT id, name FROM districts WHERE state_id = $1`, [TN]);
  for (const r of tnDistRows) TN_DIST[r.name] = r.id;

  await seedTalukaVillages(TN_DIST['Chennai'], TN, [
    { taluka: 'Chennai North', villages: ['Kolathur', 'Perambur'] },
    { taluka: 'Chennai South', villages: ['Adyar', 'Velachery'] },
    { taluka: 'Chennai Central', villages: ['T Nagar', 'Nungambakkam'] },
  ]);
  await seedTalukaVillages(TN_DIST['Coimbatore'], TN, [
    { taluka: 'Coimbatore North', villages: ['Gandhipuram', 'RS Puram'] },
    { taluka: 'Coimbatore South', villages: ['Peelamedu', 'Ganapathy'] },
    { taluka: 'Pollachi', villages: ['Pollachi', 'Anaimalai'] },
  ]);
  await seedTalukaVillages(TN_DIST['Madurai'], TN, [
    { taluka: 'Madurai North', villages: ['Alanganallur', 'Melur'] },
    { taluka: 'Madurai South', villages: ['Thiruparankundram', 'Vadipatti'] },
    { taluka: 'Madurai East', villages: ['Sholavandan', 'T Kallupatti'] },
  ]);
  await seedTalukaVillages(TN_DIST['Salem'], TN, [
    { taluka: 'Salem', villages: ['Hasthampatti', 'Kondalampatti'] },
    { taluka: 'Omalur', villages: ['Omalur', 'Mettur'] },
    { taluka: 'Attur', villages: ['Attur', 'Yercaud'] },
  ]);
  logger.info('[GeoSeed] TN done.');

  // ── Gujarat (33 districts) ──────────────────────────────────────
  const GJ = ST['GJ'];
  const gjDistricts: Array<[string, string]> = [
    ['Ahmedabad', 'AMD'], ['Amreli', 'AML'], ['Anand', 'AND'],
    ['Aravalli', 'ARA'], ['Banaskantha', 'BSK'], ['Bharuch', 'BRC'],
    ['Bhavnagar', 'BVN'], ['Botad', 'BTD'], ['Chhota Udaipur', 'CUD'],
    ['Dahod', 'DHD'], ['Dang', 'DNG'], ['Devbhumi Dwarka', 'DDW'],
    ['Gandhinagar', 'GND'], ['Gir Somnath', 'GSM'], ['Jamnagar', 'JMN'],
    ['Junagadh', 'JNG'], ['Kheda', 'KHD'], ['Kutch', 'KTC'],
    ['Mahisagar', 'MHS'], ['Mehsana', 'MSN'], ['Morbi', 'MRB'],
    ['Narmada', 'NRM'], ['Navsari', 'NVS'], ['Panchmahal', 'PCM'],
    ['Patan', 'PTN'], ['Porbandar', 'PBD'], ['Rajkot', 'RJK'],
    ['Sabarkantha', 'SBK'], ['Surat', 'SRT'], ['Surendranagar', 'SRN'],
    ['Tapi', 'TPI'], ['Vadodara', 'VDR'], ['Valsad', 'VLS'],
  ];
  const GJ_DIST: Record<string, string> = {};
  for (const [name, code] of gjDistricts) {
    const id = uuidv4();
    await insertDistrict(id, GJ, name, `GJ-${code}`);
    GJ_DIST[name] = id;
  }
  const gjDistRows = await query<any>(`SELECT id, name FROM districts WHERE state_id = $1`, [GJ]);
  for (const r of gjDistRows) GJ_DIST[r.name] = r.id;

  await seedTalukaVillages(GJ_DIST['Ahmedabad'], GJ, [
    { taluka: 'Ahmedabad City', villages: ['Sabarmati', 'Naroda'] },
    { taluka: 'Dascroi', villages: ['Vatva', 'Odhav'] },
    { taluka: 'Dholka', villages: ['Dholka', 'Bagodara'] },
  ]);
  await seedTalukaVillages(GJ_DIST['Surat'], GJ, [
    { taluka: 'Surat City', villages: ['Adajan', 'Udhna'] },
    { taluka: 'Choryasi', villages: ['Sachin', 'Hazira'] },
    { taluka: 'Olpad', villages: ['Olpad', 'Sayan'] },
  ]);
  await seedTalukaVillages(GJ_DIST['Vadodara'], GJ, [
    { taluka: 'Vadodara City', villages: ['Alkapuri', 'Manjalpur'] },
    { taluka: 'Waghodiya', villages: ['Waghodiya', 'Sinor'] },
    { taluka: 'Savli', villages: ['Savli', 'Padra'] },
  ]);
  await seedTalukaVillages(GJ_DIST['Rajkot'], GJ, [
    { taluka: 'Rajkot', villages: ['Rajkot City', 'Aji Dam'] },
    { taluka: 'Gondal', villages: ['Gondal', 'Upleta'] },
    { taluka: 'Kotda Sangani', villages: ['Kotda Sangani', 'Metoda'] },
  ]);
  logger.info('[GeoSeed] GJ done.');

  // ── Uttar Pradesh (75 districts) ────────────────────────────────
  const UP = ST['UP'];
  const upDistricts: Array<[string, string]> = [
    ['Agra', 'AGR'], ['Aligarh', 'ALG'], ['Prayagraj', 'PRY'],
    ['Ambedkar Nagar', 'ABN'], ['Amethi', 'ATH'], ['Amroha', 'AMR'],
    ['Auraiya', 'AUR'], ['Azamgarh', 'AZM'], ['Baghpat', 'BGP'],
    ['Bahraich', 'BHR'], ['Ballia', 'BLL'], ['Balrampur', 'BLP'],
    ['Banda', 'BND'], ['Barabanki', 'BBK'], ['Bareilly', 'BRL'],
    ['Basti', 'BST'], ['Bhadohi', 'BDH'], ['Bijnor', 'BJN'],
    ['Budaun', 'BDN'], ['Bulandshahr', 'BSH'], ['Chandauli', 'CDL'],
    ['Chitrakoot', 'CTK'], ['Deoria', 'DOR'], ['Etah', 'ETH'],
    ['Etawah', 'ETW'], ['Ayodhya', 'AYD'], ['Farrukhabad', 'FRK'],
    ['Fatehpur', 'FTP'], ['Firozabad', 'FRZ'], ['Gautam Buddha Nagar', 'GBN'],
    ['Ghaziabad', 'GZB'], ['Ghazipur', 'GZP'], ['Gonda', 'GND'],
    ['Gorakhpur', 'GRP'], ['Hamirpur', 'HMP'], ['Hapur', 'HPR'],
    ['Hardoi', 'HDI'], ['Hathras', 'HTH'], ['Jalaun', 'JLN'],
    ['Jaunpur', 'JNP'], ['Jhansi', 'JHS'], ['Kannauj', 'KNJ'],
    ['Kanpur Dehat', 'KPD'], ['Kanpur Nagar', 'KPN'], ['Kasganj', 'KSG'],
    ['Kaushambi', 'KSB'], ['Kushinagar', 'KSN'], ['Lakhimpur Kheri', 'LKH'],
    ['Lalitpur', 'LLP'], ['Lucknow', 'LKN'], ['Maharajganj', 'MHJ'],
    ['Mahoba', 'MHB'], ['Mainpuri', 'MNP'], ['Mathura', 'MTH'],
    ['Mau', 'MAU'], ['Meerut', 'MRT'], ['Mirzapur', 'MZP'],
    ['Moradabad', 'MRD'], ['Muzaffarnagar', 'MZN'], ['Pilibhit', 'PLB'],
    ['Pratapgarh', 'PRG'], ['Rae Bareli', 'RBR'], ['Rampur', 'RMP'],
    ['Saharanpur', 'SRN'], ['Sambhal', 'SMB'], ['Sant Kabir Nagar', 'SKN'],
    ['Shahjahanpur', 'SJP'], ['Shamli', 'SML'], ['Shravasti', 'SRV'],
    ['Siddharthnagar', 'SDN'], ['Sitapur', 'STP'], ['Sonbhadra', 'SNB'],
    ['Sultanpur', 'SLT'], ['Unnao', 'UNO'], ['Varanasi', 'VNS'],
  ];
  const UP_DIST: Record<string, string> = {};
  for (const [name, code] of upDistricts) {
    const id = uuidv4();
    await insertDistrict(id, UP, name, `UP-${code}`);
    UP_DIST[name] = id;
  }
  const upDistRows = await query<any>(`SELECT id, name FROM districts WHERE state_id = $1`, [UP]);
  for (const r of upDistRows) UP_DIST[r.name] = r.id;

  await seedTalukaVillages(UP_DIST['Lucknow'], UP, [
    { taluka: 'Lucknow Sadar', villages: ['Hazratganj', 'Gomti Nagar'] },
    { taluka: 'Malihabad', villages: ['Malihabad', 'Kakori'] },
    { taluka: 'Mohanlalganj', villages: ['Mohanlalganj', 'Bakshi Ka Talab'] },
  ]);
  await seedTalukaVillages(UP_DIST['Agra'], UP, [
    { taluka: 'Agra', villages: ['Taj Ganj', 'Belanganj'] },
    { taluka: 'Etmadpur', villages: ['Etmadpur', 'Khandauli'] },
    { taluka: 'Kiraoli', villages: ['Kiraoli', 'Fatehabad'] },
  ]);
  await seedTalukaVillages(UP_DIST['Varanasi'], UP, [
    { taluka: 'Varanasi', villages: ['Sigra', 'Sarnath'] },
    { taluka: 'Pindra', villages: ['Pindra', 'Chiraigaon'] },
    { taluka: 'Arajiline', villages: ['Arajiline', 'Sevapuri'] },
  ]);
  await seedTalukaVillages(UP_DIST['Kanpur Nagar'], UP, [
    { taluka: 'Kanpur Sadar', villages: ['Kidwai Nagar', 'Swaroop Nagar'] },
    { taluka: 'Ghatampur', villages: ['Ghatampur', 'Patara'] },
    { taluka: 'Bilhaur', villages: ['Bilhaur', 'Shivrajpur'] },
  ]);
  logger.info('[GeoSeed] UP done.');

  // ── Demo districts for remaining states ─────────────────────────
  const demoStates: Array<[string, string[]]> = [
    ['AN', ['South Andaman (Demo)', 'North and Middle Andaman (Demo)', 'Nicobar (Demo)']],
    ['AP', ['Visakhapatnam (Demo)', 'Krishna (Demo)', 'Guntur (Demo)']],
    ['AR', ['West Siang (Demo)', 'East Siang (Demo)', 'Papum Pare (Demo)']],
    ['AS', ['Kamrup Metropolitan (Demo)', 'Jorhat (Demo)', 'Dibrugarh (Demo)']],
    ['BR', ['Patna (Demo)', 'Gaya (Demo)', 'Muzaffarpur (Demo)']],
    ['CH', ['Chandigarh District (Demo)', 'Mohali (Demo)', 'Panchkula (Demo)']],
    ['CG', ['Raipur (Demo)', 'Bilaspur (Demo)', 'Durg (Demo)']],
    ['DN', ['Dadra and Nagar Haveli (Demo)', 'Daman (Demo)', 'Diu (Demo)']],
    ['GA', ['North Goa (Demo)', 'South Goa (Demo)']],
    ['HR', ['Gurugram (Demo)', 'Faridabad (Demo)', 'Ambala (Demo)']],
    ['HP', ['Shimla (Demo)', 'Kangra (Demo)', 'Mandi (Demo)']],
    ['JK', ['Jammu (Demo)', 'Srinagar (Demo)', 'Anantnag (Demo)']],
    ['JH', ['Ranchi (Demo)', 'Dhanbad (Demo)', 'Jamshedpur (Demo)']],
    ['LA', ['Leh (Demo)', 'Kargil (Demo)']],
    ['LD', ['Lakshadweep Island (Demo)']],
    ['MP', ['Bhopal (Demo)', 'Indore (Demo)', 'Jabalpur (Demo)']],
    ['MN', ['Imphal West (Demo)', 'Imphal East (Demo)', 'Bishnupur (Demo)']],
    ['ML', ['East Khasi Hills (Demo)', 'West Jaintia Hills (Demo)', 'West Garo Hills (Demo)']],
    ['MZ', ['Aizawl (Demo)', 'Lunglei (Demo)', 'Champhai (Demo)']],
    ['NL', ['Dimapur (Demo)', 'Kohima (Demo)', 'Mokokchung (Demo)']],
    ['OD', ['Bhubaneswar (Demo)', 'Cuttack (Demo)', 'Rourkela (Demo)']],
    ['PY', ['Puducherry District (Demo)', 'Karaikal (Demo)', 'Yanam (Demo)']],
    ['PB', ['Amritsar (Demo)', 'Ludhiana (Demo)', 'Jalandhar (Demo)']],
    ['RJ', ['Jaipur (Demo)', 'Jodhpur (Demo)', 'Udaipur (Demo)']],
    ['SK', ['East Sikkim (Demo)', 'West Sikkim (Demo)', 'North Sikkim (Demo)']],
    ['TS', ['Hyderabad (Demo)', 'Rangareddy (Demo)', 'Medchal (Demo)']],
    ['TR', ['West Tripura (Demo)', 'Gomati (Demo)', 'Sipahijala (Demo)']],
    ['UK', ['Dehradun (Demo)', 'Haridwar (Demo)', 'Nainital (Demo)']],
    ['WB', ['Kolkata (Demo)', 'Howrah (Demo)', 'Hooghly (Demo)']],
  ];

  for (const [code, distNames] of demoStates) {
    const sId = ST[code];
    if (!sId) continue;
    for (const dName of distNames) {
      const dCode = `${code}-${dName.replace(/[^A-Z]/gi, '').slice(0, 6).toUpperCase()}`;
      const dId = uuidv4();
      await insertDistrict(dId, sId, dName, dCode);
      // Re-fetch
      const rows = await query<any>(
        `SELECT id FROM districts WHERE state_id = $1 AND name = $2 LIMIT 1`,
        [sId, dName]
      );
      const realDId = rows[0]?.id ?? dId;
      // Seed 2 demo talukas per demo district
      const t1 = await insertTaluka(realDId, sId, `${dName.replace(' (Demo)', '')} Taluka 1 (Demo)`);
      await insertVillage(t1, realDId, sId, `Village A (Demo)`);
      await insertVillage(t1, realDId, sId, `Village B (Demo)`);
    }
  }

  logger.info('[GeoSeed] Demo states done.');
  logger.info('[GeoSeed] ✅ Full India geography seed complete!');
  await pool.end();
}

seedGeography().catch((err) => {
  logger.error('[GeoSeed] Failed:', err);
  process.exit(1);
});
