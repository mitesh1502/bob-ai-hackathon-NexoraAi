/**
 * NEXORA AI — Dynamic Inspection Checklist Generator
 *
 * Generates per-inspection checklists based on:
 * - Asset type
 * - Field of work
 * - Prior risk conditions and open flags
 * - Current weather alerts
 * - Recent sensor alerts
 * - Historical incidents
 * - Complaint category
 *
 * For each item: why it's requested, which AI factor it relates to,
 * what evidence is needed, and what action might reduce risk.
 */

// Inline types to avoid workspace resolution issues at TS compile time
type AssetType =
  | 'transformer' | 'distribution_panel' | 'appliance' | 'feeder'
  | 'substation_equipment' | 'pole_mounted' | 'switchgear'
  | 'cable_line' | 'generator' | 'other';
type FieldOfWork =
  | 'civil_engineering' | 'mechanical_engineering' | 'electrical_engineering' | 'other';

export interface ChecklistItem {
  id: string;
  category: string;
  task: string;
  why: string;
  aiFactorRelated: string;
  evidenceRequired: string;
  riskReductionAction: string;
  isMandatory: boolean;
  isSafetyWarning?: boolean;
  safetyEscalation?: string;
  observationCode?: string;
}

interface ChecklistContext {
  assetType: AssetType;
  fieldOfWork?: FieldOfWork;
  currentRiskLevel?: string;
  activeFlags?: string[];     // e.g. ['overheating', 'water_ingress']
  weatherAlerts?: string[];   // e.g. ['flood_alert', 'storm_alert']
  sensorAlerts?: string[];    // e.g. ['temperature_out_of_range']
  historyFlags?: string[];    // e.g. ['repeated_tripping']
  complaintCategory?: string;
  previousCondition?: string;
}

// Core checklist items applicable to all assets
const CORE_ITEMS: ChecklistItem[] = [
  {
    id: 'core_01',
    category: 'Safety',
    task: 'Confirm site is safe to approach — no exposed live conductors, no flooding, no fire/smoke',
    why: 'Worker safety is the first priority before any inspection begins',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Photo of safe approach path',
    riskReductionAction: 'If unsafe, do not approach — escalate immediately to supervisor',
    isMandatory: true,
    isSafetyWarning: true,
    safetyEscalation: 'Call supervisor and emergency services if fire, smoke, or serious hazard found',
  },
  {
    id: 'core_02',
    category: 'Identification',
    task: 'Verify asset ID, type, and location against task assignment',
    why: 'Ensures report is attributed to the correct asset',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Photo of asset nameplate/ID tag',
    riskReductionAction: 'Correct asset ID before submitting report',
    isMandatory: true,
  },
  {
    id: 'core_03',
    category: 'Visual',
    task: 'Photograph the asset from at least three angles: wide-area, front-close, and any damage',
    why: 'Photo evidence supports all risk scoring and recommendations',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Minimum 3 GIS-tagged photos',
    riskReductionAction: 'Complete full photographic documentation before any corrective action',
    isMandatory: true,
  },
  {
    id: 'core_04',
    category: 'Visual',
    task: 'Inspect enclosure and protective covers for visible damage',
    why: 'Damaged enclosures indicate risk of exposure and weather ingress',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Photo of enclosure; note any cracks, dents, missing covers',
    riskReductionAction: 'Seal minor damage; recommend full replacement if structurally compromised',
    isMandatory: true,
    observationCode: 'damaged_enclosure',
  },
  {
    id: 'core_05',
    category: 'Electrical',
    task: 'Check and record earthing/grounding status',
    why: 'Poor earthing is a critical safety flag that significantly raises risk score',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Measurement of earth resistance; photo of earthing connections',
    riskReductionAction: 'If earthing is poor or missing, flag as critical and recommend immediate remediation',
    isMandatory: true,
    observationCode: 'poor_earthing',
    isSafetyWarning: true,
  },
  {
    id: 'core_06',
    category: 'Environmental',
    task: 'Check for corrosion on exposed metal parts',
    why: 'Corrosion reduces structural and electrical integrity',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Photo of any corroded areas; note severity',
    riskReductionAction: 'Treat minor corrosion; recommend replacement if advanced',
    isMandatory: true,
    observationCode: 'corrosion',
  },
  {
    id: 'core_07',
    category: 'Environmental',
    task: 'Inspect for water ingress, moisture, or flooding evidence',
    why: 'Water ingress significantly raises electrical failure risk',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Photo of interior/base; moisture meter reading if available',
    riskReductionAction: 'Seal entry points; recommend drying and insulation inspection',
    isMandatory: true,
    observationCode: 'water_ingress',
  },
  {
    id: 'core_08',
    category: 'Electrical',
    task: 'Inspect wiring insulation — check for cracks, burns, or exposed conductors',
    why: 'Exposed wiring is a critical safety flag',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Close-up photo of wiring; note any damage',
    riskReductionAction: 'If exposed: isolate safely; recommend immediate cable replacement',
    isMandatory: true,
    observationCode: 'exposed_wiring',
    isSafetyWarning: true,
    safetyEscalation: 'If live exposed conductors are found, isolate circuit and escalate immediately',
  },
  {
    id: 'core_09',
    category: 'Mechanical',
    task: 'Check for unusual noises or excessive vibration during operation',
    why: 'Vibration and noise indicate mechanical wear or internal faults',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Record observation; note frequency and description',
    riskReductionAction: 'Check mounting bolts; recommend internal inspection if persistent',
    isMandatory: false,
    observationCode: 'unusual_noise',
  },
  {
    id: 'core_10',
    category: 'Environmental',
    task: 'Verify signage is present and legible',
    why: 'Missing safety signage is a compliance issue',
    aiFactorRelated: 'worker_observation',
    evidenceRequired: 'Photo of signage or note if missing',
    riskReductionAction: 'Report missing signage for replacement',
    isMandatory: false,
    observationCode: 'missing_signage',
  },
];

// Conditional items triggered by specific flags
const CONDITIONAL_ITEMS: Record<string, ChecklistItem[]> = {
  overheating: [
    {
      id: 'cond_overheating_01',
      category: 'Thermal',
      task: 'Record surface temperature using thermal gun or infrared thermometer',
      why: 'Overheating flag was raised — temperature confirmation is required to validate the risk',
      aiFactorRelated: 'sensor + worker_observation',
      evidenceRequired: 'Temperature reading with timestamp; thermal photo if available',
      riskReductionAction: 'If >70°C: shut down and escalate. 50–70°C: reduce load, improve ventilation',
      isMandatory: true,
      observationCode: 'overheating',
    },
    {
      id: 'cond_overheating_02',
      category: 'Thermal',
      task: 'Inspect ventilation — check for blocked vents or obstructions',
      why: 'Poor ventilation is a primary cause of overheating',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Photo of vents; note any blockages',
      riskReductionAction: 'Clear obstructions; recommend ventilation improvement',
      isMandatory: true,
      observationCode: 'poor_ventilation',
    },
    {
      id: 'cond_overheating_03',
      category: 'Thermal',
      task: 'Check for burning smell or visible discoloration/charring',
      why: 'Discoloration or burning smell may indicate imminent failure',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Photo of discolored areas; note smell intensity',
      riskReductionAction: 'If burning smell or charring present: isolate and escalate immediately',
      isMandatory: true,
      observationCode: 'burning_smell',
      isSafetyWarning: true,
      safetyEscalation: 'Burning smell + high temperature = potential fire risk. Isolate and call supervisor',
    },
    {
      id: 'cond_overheating_04',
      category: 'Electrical',
      task: 'Measure and record current load vs. rated capacity',
      why: 'Overloading is a primary cause of thermal stress',
      aiFactorRelated: 'load_capacity',
      evidenceRequired: 'Current meter reading; record against nameplate rating',
      riskReductionAction: 'If overloaded: recommend load balancing or capacity upgrade',
      isMandatory: true,
      observationCode: 'overloading',
    },
  ],

  water_ingress: [
    {
      id: 'cond_water_01',
      category: 'Environmental',
      task: 'Check all seals and gaskets for failure or deterioration',
      why: 'Failed seals are the primary route for water ingress',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Photo of seals; note any cracking or gaps',
      riskReductionAction: 'Replace failed seals; apply temporary waterproofing pending permanent repair',
      isMandatory: true,
      observationCode: 'water_ingress',
    },
    {
      id: 'cond_water_02',
      category: 'Environmental',
      task: 'Inspect drainage channels around and below the asset',
      why: 'Blocked drainage increases flood exposure risk',
      aiFactorRelated: 'geographic',
      evidenceRequired: 'Photo of drainage area; note any blockages',
      riskReductionAction: 'Clear blocked drains; recommend drainage improvement',
      isMandatory: true,
    },
    {
      id: 'cond_water_03',
      category: 'Environmental',
      task: 'Check for nearby flooding or standing water',
      why: 'Proximity to flooding raises geographic and weather-based risk factors',
      aiFactorRelated: 'weather + geographic',
      evidenceRequired: 'Photo of surrounding area; note distance to water',
      riskReductionAction: 'If flooding is near: recommend asset isolation until water recedes',
      isMandatory: true,
      observationCode: 'flood_exposure',
      isSafetyWarning: true,
    },
    {
      id: 'cond_water_04',
      category: 'Electrical',
      task: 'Inspect for corrosion caused by moisture — especially on connections',
      why: 'Moisture accelerates corrosion, which raises failure probability',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Close-up photo of connections; note corrosion level',
      riskReductionAction: 'Clean and treat corrosion; replace severely corroded connections',
      isMandatory: true,
      observationCode: 'corrosion',
    },
    {
      id: 'cond_water_05',
      category: 'Environmental',
      task: 'Record moisture level inside enclosure',
      why: 'Humidity inside enclosure is a key risk indicator',
      aiFactorRelated: 'sensor',
      evidenceRequired: 'Hygrometer reading if available; photo of interior',
      riskReductionAction: 'If >80% humidity: recommend desiccant or dehumidifier installation',
      isMandatory: false,
    },
  ],

  flood_alert: [
    {
      id: 'cond_flood_01',
      category: 'Safety',
      task: 'STOP: Do not approach asset if it is in or near flooded area',
      why: 'Active flood conditions present life-threatening electrical hazard',
      aiFactorRelated: 'weather',
      evidenceRequired: 'Photo from safe distance; do not enter flooded zone',
      riskReductionAction: 'Document flood extent and report; do not proceed until area is declared safe',
      isMandatory: true,
      isSafetyWarning: true,
      safetyEscalation: 'FLOOD + ELECTRICAL = LIFE RISK. Do not enter. Contact supervisor and emergency services.',
    },
  ],

  storm_alert: [
    {
      id: 'cond_storm_01',
      category: 'Safety',
      task: 'Check for storm damage: fallen lines, broken poles, displaced equipment',
      why: 'Storm conditions are a primary cause of structural failure',
      aiFactorRelated: 'weather',
      evidenceRequired: 'Wide-area photo of asset and surroundings',
      riskReductionAction: 'If structural damage found: cordon off area and escalate',
      isMandatory: true,
      isSafetyWarning: true,
    },
  ],

  repeated_tripping: [
    {
      id: 'cond_trip_01',
      category: 'Electrical',
      task: 'Review trip log and record number of trips in last 30 days',
      why: 'Repeated tripping is a strong predictor of imminent failure',
      aiFactorRelated: 'historical',
      evidenceRequired: 'Trip log screenshot or written record; note dates and causes',
      riskReductionAction: 'Identify root cause; recommend protection relay testing or replacement',
      isMandatory: true,
      observationCode: 'repeated_tripping',
    },
  ],

  evidence_of_arcing: [
    {
      id: 'cond_arc_01',
      category: 'Electrical',
      task: 'CRITICAL: Document arcing evidence — burn marks, pit marks, melted insulation',
      why: 'Arcing is a direct precursor to catastrophic failure and fire',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Close-up photo of arcing evidence; do not touch or disturb',
      riskReductionAction: 'Isolate asset immediately; escalate to supervisor; do not restore power',
      isMandatory: true,
      isSafetyWarning: true,
      safetyEscalation: 'Evidence of arcing = CRITICAL risk. Isolate, escalate, do not restore without qualified engineer sign-off',
      observationCode: 'evidence_of_arcing',
    },
  ],
};

// Asset-type-specific checklist additions
const ASSET_TYPE_ITEMS: Record<string, ChecklistItem[]> = {
  transformer: [
    {
      id: 'tr_01',
      category: 'Transformer',
      task: 'Inspect oil level and check for oil leakage',
      why: 'Oil level directly affects transformer cooling and insulation — leaks raise failure risk',
      aiFactorRelated: 'sensor + worker_observation',
      evidenceRequired: 'Oil level gauge reading; photo of oil conservator and base',
      riskReductionAction: 'Top up oil if low; investigate and repair leakage source',
      isMandatory: true,
      observationCode: 'oil_leakage',
    },
    {
      id: 'tr_02',
      category: 'Transformer',
      task: 'Check oil temperature gauge reading vs. normal operating range',
      why: 'Elevated oil temperature indicates overloading or cooling failure',
      aiFactorRelated: 'sensor',
      evidenceRequired: 'Oil temperature reading; normal range from nameplate',
      riskReductionAction: 'If >80°C: reduce load; >95°C: shut down immediately',
      isMandatory: true,
    },
    {
      id: 'tr_03',
      category: 'Transformer',
      task: 'Inspect bushings for cracks, contamination, or flashover marks',
      why: 'Failed bushings are a common cause of transformer faults',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Close-up photo of all bushings',
      riskReductionAction: 'Clean contaminated bushings; replace cracked or damaged ones',
      isMandatory: true,
    },
    {
      id: 'tr_04',
      category: 'Transformer',
      task: 'Check conservator, breather, and silica gel condition',
      why: 'Saturated silica gel leads to moisture contamination of oil',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Photo of silica gel color; note if pink/saturated',
      riskReductionAction: 'Replace silica gel if saturated',
      isMandatory: false,
    },
  ],

  substation_equipment: [
    {
      id: 'sub_01',
      category: 'Substation',
      task: 'Inspect all circuit breakers for proper operation indication',
      why: 'Faulty breakers compromise protection of downstream assets',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Photo of breaker status indicators; note any alarm lights',
      riskReductionAction: 'Test breaker operation; replace if unresponsive',
      isMandatory: true,
    },
    {
      id: 'sub_02',
      category: 'Substation',
      task: 'Check bus bars for overheating or discoloration',
      why: 'Hot spots on bus bars indicate excessive current or poor connections',
      aiFactorRelated: 'sensor + worker_observation',
      evidenceRequired: 'Thermal photo if available; visual inspection photo',
      riskReductionAction: 'Tighten connections; replace if damage is significant',
      isMandatory: true,
    },
  ],

  pole_mounted: [
    {
      id: 'pole_01',
      category: 'Structural',
      task: 'Inspect pole for rot, cracks, or tilt',
      why: 'Structural failure of poles causes outages and safety hazards',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Photo of pole base, mid-section, and top; note any tilt angle',
      riskReductionAction: 'If tilt >5°: recommend immediate replacement; brace if urgent',
      isMandatory: true,
      observationCode: 'structural_instability',
    },
    {
      id: 'pole_02',
      category: 'Structural',
      task: 'Check for pest or animal damage — nests, gnaw marks, bird fouling',
      why: 'Animal damage is a common and often overlooked failure cause',
      aiFactorRelated: 'worker_observation',
      evidenceRequired: 'Photo of any animal activity or damage',
      riskReductionAction: 'Install bird/pest deterrents; repair damaged insulation',
      isMandatory: false,
      observationCode: 'pest_animal_damage',
    },
  ],
};

export function generateChecklist(context: ChecklistContext): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const addedIds = new Set<string>();

  function addItem(item: ChecklistItem) {
    if (!addedIds.has(item.id)) {
      items.push(item);
      addedIds.add(item.id);
    }
  }

  // Always include core items
  CORE_ITEMS.forEach(addItem);

  // Asset-type specific items
  const assetItems = ASSET_TYPE_ITEMS[context.assetType] ?? [];
  assetItems.forEach(addItem);

  // Trigger conditional items from active flags
  const allFlags = [
    ...(context.activeFlags ?? []),
    ...(context.weatherAlerts ?? []),
    ...(context.sensorAlerts ?? []),
    ...(context.historyFlags ?? []),
  ];

  for (const flag of allFlags) {
    const condItems = CONDITIONAL_ITEMS[flag] ?? [];
    condItems.forEach(addItem);
  }

  // Sort: mandatory safety warnings first, then mandatory, then optional
  return items.sort((a, b) => {
    if (a.isSafetyWarning && !b.isSafetyWarning) return -1;
    if (!a.isSafetyWarning && b.isSafetyWarning) return 1;
    if (a.isMandatory && !b.isMandatory) return -1;
    if (!a.isMandatory && b.isMandatory) return 1;
    return 0;
  });
}
