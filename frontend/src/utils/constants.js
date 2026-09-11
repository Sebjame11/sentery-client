export const COMPANIES = ['Apple','Microsoft','Amazon','Alphabet','NVIDIA','Meta','Tesla','Berkshire Hathaway','TSMC','Samsung','JPMorgan Chase','Visa','Mastercard','Netflix','Spotify','Stripe','Shopify','SpaceX','OpenAI'];

// Default pipeline stages (used when workspace has no custom config)
export const DEFAULT_PIPELINE_STAGES = [
  { id: 'lead', name: 'Lead', probability: 10, order: 0, isSystem: true },
  { id: 'contacted', name: 'Contacted', probability: 20, order: 1 },
  { id: 'engaged', name: 'Engaged', probability: 35, order: 2 },
  { id: 'meeting', name: 'Meeting', probability: 50, order: 3 },
  { id: 'proposal', name: 'Proposal', probability: 70, order: 4 },
  { id: 'negotiation', name: 'Negotiation', probability: 85, order: 5 },
  { id: 'won', name: 'Closed Won', probability: 100, order: 6, isSystem: true },
  { id: 'lost', name: 'Closed Lost', probability: 0, order: 7, isSystem: true },
];

// Hardcoded defaults for backward compat (flat arrays/objects)
export const PIPELINE_STAGES = DEFAULT_PIPELINE_STAGES.map(s => s.id);

export const STAGE_LABELS = Object.fromEntries(DEFAULT_PIPELINE_STAGES.map(s => [s.id, s.name]));

export const STAGE_WEIGHTS = Object.fromEntries(DEFAULT_PIPELINE_STAGES.map(s => [s.id, s.probability / 100]));

// Get pipeline stages from workspace config, or fall back to defaults
export function getPipelineStages(workspace) {
  const custom = workspace?.company_profile?.pipeline_stages;
  if (Array.isArray(custom) && custom.length > 0) return custom;
  return DEFAULT_PIPELINE_STAGES;
}

// Get stage IDs array from workspace
export function getStageIds(workspace) {
  return getPipelineStages(workspace).map(s => s.id);
}

// Get stage label map from workspace
export function getStageLabels(workspace) {
  return Object.fromEntries(getPipelineStages(workspace).map(s => [s.id, s.name]));
}

// Get stage weight map from workspace
export function getStageWeights(workspace) {
  return Object.fromEntries(getPipelineStages(workspace).map(s => [s.id, s.probability / 100]));
}

export const LIFECYCLE_STAGES = ['lead','mql','sql','opportunity','client'];

export const LIFECYCLE_LABELS = {lead:'Lead',mql:'MQL',sql:'SQL',opportunity:'Opportunity',client:'Client'};

export const CONTACT_STATUSES = ['new','working','nurture','disqualified'];

export const CONTACT_STATUS_LABELS = {new:'New',working:'Working',nurture:'Nurture',disqualified:'Disqualified'};

export const COMPANY_TYPES = ['prospect','partner','client','other'];

export const COMPANY_TYPE_LABELS = {prospect:'Prospect',partner:'Partner',client:'Client',other:'Other'};

export const WIN_REASONS = ['Product Fit','Strong Champion','Pricing','Timing','Inbound Demand','Referral','Existing Relationship','Expansion / Upsell','Beat Competitor','ROI / Value','Other'];

export const LOSS_REASONS = ['Price','Timing','Competitor','Budget','Champion Left','No Decision','No Budget','Ghosted','Other'];

// Default lead sources (customizable per workspace)
export const DEFAULT_LEAD_SOURCES = [
  'Inbound',
  'Outbound',
  'Referral',
  'LinkedIn',
  'Event / Conference',
  'Website',
  'Partner',
  'Cold Outreach',
  'Content / Blog',
  'Social Media',
  'Ads',
  'Other',
];

// Get lead sources from workspace config, or fall back to defaults
export function getLeadSources(workspace) {
  const custom = workspace?.company_profile?.lead_sources;
  if (Array.isArray(custom) && custom.length > 0) return custom;
  return DEFAULT_LEAD_SOURCES;
}

export const SEED_PROSPECTS = [
    {id:1,name:'Sarah Chen',title:'VP Engineering',company:'Stripe',email:'sarah@stripe.com',phone:'+1 415-555-0101',linkedin:'linkedin.com/in/sarahchen',tier:'hot',stage:'engaged',dealValue:120000,stageEnteredAt:'2026-07-20',angle:'Cost reduction via AI automation',notes:'Met at SaaStr Annual. Very technical buyer, wants API-level integration. Budget approved for Q3.',touchpoints:[{date:'2026-07-15',channel:'email',note:'Initial cold email sent referencing Stripe\'s API-first culture',outcome:'replied'},{date:'2026-07-18',channel:'linkedin',note:'Connected on LinkedIn, discussed AI trends',outcome:'connected'},{date:'2026-07-20',channel:'call',note:'Discovery call with her and 2 engineers. They want POC in August.',outcome:'meeting'}],customFields:{role:'Engineering Leader',techStack:'AWS, Kubernetes, Python'},countries:['US'],tags:['api','enterprise','saastr'],createdAt:'2026-07-15'},
    {id:2,name:'James Rodriguez',title:'CRO',company:'Shopify',email:'james@shopify.com',phone:'+1 647-555-0202',linkedin:'linkedin.com/in/jamesrodriguez',tier:'warm',stage:'contacted',dealValue:85000,stageEnteredAt:'2026-07-16',angle:'Revenue growth via marketplace expansion',notes:'Referred by Sarah Chen. He\'s focused on merchant growth tools. Needs board-level justification.',touchpoints:[{date:'2026-07-16',channel:'email',note:'Warm intro email via Sarah',outcome:'pending'}],customFields:{role:'Executive',dealSize:'Mid-Market'},countries:['CA'],tags:['warm-intro','marketplace'],createdAt:'2026-07-16'},
    {id:3,name:'Akira Tanaka',title:'Head of Growth',company:'Notion',email:'akira@makenotion.com',phone:'+81 3-5555-0303',linkedin:'linkedin.com/in/akiratanaka',tier:'hot',stage:'proposal',dealValue:200000,stageEnteredAt:'2026-07-15',angle:'PLG to enterprise migration strategy',notes:'Demo went exceptionally well. Budget confirmed for Q3. Legal needs to review. Key champion.',touchpoints:[{date:'2026-07-10',channel:'email',note:'Cold email with Notion-to-enterprise case study',outcome:'replied'},{date:'2026-07-12',channel:'call',note:'Discovery call. He wants to move upmarket from PLG.',outcome:'meeting'},{date:'2026-07-15',channel:'email',note:'Sent proposal PDF and pricing page',outcome:'replied'},{date:'2026-07-18',channel:'call',note:'Follow-up call. Asked about SLA and compliance. Positive.',outcome:'meeting'}],customFields:{role:'Growth Leader',champion:true},countries:['JP','US'],tags:['plg','enterprise','champion'],createdAt:'2026-07-10'},
    {id:4,name:'Maria Santos',title:'CTO',company:'Nubank',email:'maria@nubank.com.br',phone:'+55 11-5555-0404',linkedin:'linkedin.com/in/mariasantos',tier:'cold',stage:'lead',dealValue:60000,stageEnteredAt:'2026-07-20',angle:'Fintech compliance automation',notes:'Found via TechCrunch article on Nubank\'s expansion. Early stage, need to build relationship first.',touchpoints:[],customFields:{role:'Executive',industry:'Fintech'},countries:['BR'],tags:['fintech','compliance'],createdAt:'2026-07-20'},
    {id:5,name:'David Kim',title:'Director of Ops',company:'Figma',email:'david@figma.com',phone:'+1 415-555-0505',linkedin:'linkedin.com/in/davidkim',tier:'warm',stage:'negotiation',dealValue:150000,stageEnteredAt:'2026-07-19',angle:'Design-to-dev handoff automation',notes:'Contract review in progress with their legal team. Main objection is data residency. We can accommodate.',touchpoints:[{date:'2026-07-05',channel:'email',note:'Cold email on design handoff pain points',outcome:'replied'},{date:'2026-07-08',channel:'call',note:'Discovery call. He described manual handoff as "a nightmare".',outcome:'meeting'},{date:'2026-07-12',channel:'email',note:'Sent proposal with ROI calculator',outcome:'replied'},{date:'2026-07-19',channel:'email',note:'Sent contract for review',outcome:'replied'}],customFields:{role:'Operations',techStack:'Figma, Storybook, Chromatic'},countries:['US'],tags:['design','negotiation'],createdAt:'2026-07-05'},
    {id:6,name:'Emma Wilson',title:'VP Sales',company:'Canva',email:'emma@canva.com',phone:'+61 2-5555-0606',linkedin:'linkedin.com/in/emmawilson',tier:'hot',stage:'won',dealValue:340000,stageEnteredAt:'2026-07-01',outcomeReason:'Champion advocacy',wonAgainstCompetitor:'Salesforce',angle:'Enterprise sales enablement',notes:'Closed! Signed 3-year deal. Champion was Emma\'s head of enablement. Implementation starts Aug 1. Great reference potential.',touchpoints:[{date:'2026-06-20',channel:'email',note:'Initial outreach via mutual connection',outcome:'replied'},{date:'2026-06-25',channel:'call',note:'Product demo with her team of 5',outcome:'meeting'},{date:'2026-06-28',channel:'email',note:'Sent proposal',outcome:'replied'},{date:'2026-07-01',channel:'call',note:'Closed-won call. Celebrated!',outcome:'closed'}],customFields:{role:'Executive',dealType:'New Business'},countries:['AU'],tags:['won','reference','enterprise'],createdAt:'2026-06-20'},
    {id:7,name:'Alex Petrov',title:'Head of Partnerships',company:'Vercel',email:'alex@vercel.com',phone:'+1 415-555-0707',linkedin:'linkedin.com/in/alexpetrov',tier:'cold',stage:'lead',dealValue:45000,stageEnteredAt:'2026-07-21',angle:'Edge computing co-marketing partnership',notes:'Potential co-marketing and integration partnership, not a direct sale. Long cycle expected.',touchpoints:[],customFields:{role:'Partnerships',type:'Partnership'},countries:['US'],tags:['partnership','edge'],createdAt:'2026-07-21'},
    {id:8,name:'Priya Sharma',title:'CFO',company:'Razorpay',email:'priya@razorpay.com',phone:'+91 80-5555-0808',linkedin:'linkedin.com/in/priyasharma',tier:'warm',stage:'contacted',dealValue:95000,stageEnteredAt:'2026-07-21',lostToCompetitor:'',angle:'Payment infrastructure optimization',notes:'Had an initial call. She\'s evaluating 3 vendors. HubSpot is incumbent. Need to differentiate.',touchpoints:[{date:'2026-07-17',channel:'email',note:'Cold email with payment optimization stats',outcome:'no-reply'},{date:'2026-07-21',channel:'email',note:'Follow-up with case study from similar fintech',outcome:'pending'}],customFields:{role:'Executive',industry:'Fintech'},countries:['IN'],tags:['fintech','competitive'],createdAt:'2026-07-17'},
    {id:9,name:'Marcus Johnson',title:'CEO',company:'Rippling',email:'marcus@rippling.com',phone:'+1 415-555-0909',linkedin:'linkedin.com/in/marcusjohnson',tier:'hot',stage:'meeting',dealValue:500000,stageEnteredAt:'2026-07-21',angle:'Unified HR-IT platform expansion into EMEA',notes:'Massive opportunity. Demo scheduled with decision committee of 6. Prepping custom ROI deck. Competition: Workday.',touchpoints:[{date:'2026-07-14',channel:'email',note:'Sent personalized video demo',outcome:'replied'},{date:'2026-07-16',channel:'call',note:'30-min intro with Marcus. He said "this is exactly what we need for EMEA".',outcome:'meeting'},{date:'2026-07-21',channel:'email',note:'Scheduling committee demo',outcome:'pending'}],customFields:{role:'C-Suite',dealSize:'Enterprise'},countries:['US'],tags:['enterprise','hot','expansion'],createdAt:'2026-07-14'},
    {id:10,name:'Lina Johansson',title:'Head of Product',company:'Klarna',email:'lina@klarna.com',phone:'+46 8-5555-1010',linkedin:'linkedin.com/in/linajohansson',tier:'warm',stage:'engaged',dealValue:180000,stageEnteredAt:'2026-07-18',angle:'Buyer experience personalization at scale',notes:'Product-led growth focus. She wants to A/B test our personalization engine. 2-week trial started.',touchpoints:[{date:'2026-07-09',channel:'email',note:'Cold email about personalization',outcome:'replied'},{date:'2026-07-12',channel:'call',note:'Discovery call. Very product-savvy, asked great technical questions.',outcome:'meeting'},{date:'2026-07-18',channel:'email',note:'Sent trial credentials + onboarding guide',outcome:'replied'}],customFields:{role:'Product Leader',trial:true},countries:['SE'],tags:['product','trial','personalization'],createdAt:'2026-07-09'},
    {id:11,name:'Omar Hassan',title:'VP AI/ML',company:'Cohere',email:'omar@cohere.com',phone:'+1 416-555-1111',linkedin:'linkedin.com/in/omarhassan',tier:'cold',stage:'lead',dealValue:130000,stageEnteredAt:'2026-07-22',angle:'LLM fine-tuning infrastructure partnership',notes:'Strategic partnership opportunity. They could become both customer and partner. Intro requested.',touchpoints:[],customFields:{role:'Executive',industry:'AI/ML'},countries:['CA'],tags:['ai','partnership'],createdAt:'2026-07-22'},
    {id:12,name:'Yuki Nakamura',title:'SVP Marketing',company:'Mercari',email:'yuki@mercari.com',phone:'+81 3-5555-1212',linkedin:'linkedin.com/in/yukinakamura',tier:'warm',stage:'contacted',dealValue:75000,stageEnteredAt:'2026-07-22',angle:'Marketplace seller acquisition automation',notes:'Referred by Tokyo investor. Second-hand marketplace focus. Japanese language required.',touchpoints:[{date:'2026-07-22',channel:'email',note:'Warm intro email via investor connection',outcome:'pending'}],customFields:{role:'Executive',region:'APAC'},countries:['JP'],tags:['marketplace','apac','warm-intro'],createdAt:'2026-07-22'},
    {id:13,name:'Hannah Lee',title:'General Counsel',company:'Anthropic',email:'hannah@anthropic.com',phone:'+1 415-555-1313',linkedin:'linkedin.com/in/hannahlee',tier:'cold',stage:'lead',dealValue:90000,stageEnteredAt:'2026-07-23',angle:'AI safety compliance and governance',notes:'Tough sell. They have strong internal compliance. Need to find the right angle. Researching their gaps.',touchpoints:[],customFields:{role:'Legal',industry:'AI'},countries:['US'],tags:['ai','compliance'],createdAt:'2026-07-23'},
    {id:14,name:'Carlos Delgado',title:'SVP Enterprise',company:'Twilio',email:'carlos@twilio.com',phone:'+1 415-555-1414',linkedin:'linkedin.com/in/carlosdelgado',tier:'warm',stage:'proposal',dealValue:220000,stageEnteredAt:'2026-07-17',angle:'CPaaS optimization and cost reduction',notes:'They\'re spending $2M+ on Twilio competitor. Can save them 30%. Proposal with ROI calc sent. Decision by Aug 5.',touchpoints:[{date:'2026-06-30',channel:'email',note:'Cold email with cost comparison analysis',outcome:'replied'},{date:'2026-07-05',channel:'call',note:'Discovery: they want to reduce CPaaS spend',outcome:'meeting'},{date:'2026-07-10',channel:'email',note:'Sent ROI analysis showing $600K savings',outcome:'replied'},{date:'2026-07-17',channel:'email',note:'Proposal sent with implementation timeline',outcome:'replied'}],customFields:{role:'Executive',dealType:'Cost Optimization'},countries:['US'],tags:['cpaas','roi','enterprise'],createdAt:'2026-06-30'},
    {id:15,name:'Fatima Al-Rashid',title:'Chief Digital Officer',company:'Careem',email:'fatima@careem.com',phone:'+971 4-555-1515',linkedin:'linkedin.com/in/fatimaalrashid',tier:'hot',stage:'meeting',dealValue:160000,stageEnteredAt:'2026-07-20',angle:'Super-app expansion into new verticals',notes:'Very promising. Careem expanding beyond rides. They need our platform for new vertical launches. Demo this Friday.',touchpoints:[{date:'2026-07-12',channel:'email',note:'Cold email referencing Uber expansion playbook',outcome:'replied'},{date:'2026-07-15',channel:'call',note:'Great call. She wants to move fast. Introduced to their Head of Product.',outcome:'meeting'},{date:'2026-07-20',channel:'email',note:'Scheduled product demo with full team',outcome:'pending'}],customFields:{role:'C-Suite',region:'MENA'},countries:['AE'],tags:['super-app','mena','expansion'],createdAt:'2026-07-12'},
    {id:16,name:'Tom Mitchell',title:'Head of CRM',company:'HubSpot',email:'tom@hubspot.com',phone:'+1 617-555-1616',linkedin:'linkedin.com/in/tommitchell',tier:'cold',stage:'lost',dealValue:0,stageEnteredAt:'2026-07-10',outcomeReason:'Competitor',lostToCompetitor:'Salesforce',angle:'They went with Salesforce',notes:'We lost to Salesforce. They wanted deeper Sales Cloud integration. Good learning: need to build that connector.',touchpoints:[{date:'2026-07-01',channel:'email',note:'Initial outreach',outcome:'replied'},{date:'2026-07-05',channel:'call',note:'Demo',outcome:'meeting'},{date:'2026-07-10',channel:'email',note:'Lost to Salesforce',outcome:'lost'}],customFields:{role:'Mid-Management',industry:'CRM'},countries:['US'],tags:['lost','competitor'],createdAt:'2026-07-01'},
    {id:17,name:'Sofia Martinez',title:'VP Design',company:'Airbnb',email:'sofia@airbnb.com',phone:'+1 415-555-1717',linkedin:'linkedin.com/in/sofiamartinez',tier:'warm',stage:'engaged',dealValue:110000,stageEnteredAt:'2026-07-19',angle:'Design system scaling and workflow automation',notes:'She manages 40+ designers. Pain: cross-team design consistency. Our design system tooling is a perfect fit.',touchpoints:[{date:'2026-07-11',channel:'linkedin',note:'Engaged with her post about design systems',outcome:'connected'},{date:'2026-07-14',channel:'call',note:'Informal chat about design workflows',outcome:'meeting'},{date:'2026-07-19',channel:'email',note:'Sent product deck tailored to design teams',outcome:'replied'}],customFields:{role:'Design Leader',teamSize:42},countries:['US'],tags:['design','enterprise'],createdAt:'2026-07-11'},
    {id:18,name:'Raj Patel',title:'Director of Data Science',company:'Netflix',email:'raj@netflix.com',phone:'+1 408-555-1818',linkedin:'linkedin.com/in/rajpatel',tier:'cold',stage:'lead',dealValue:250000,stageEnteredAt:'2026-07-23',angle:'Recommendation engine optimization',notes:'Netflix is always optimizing. ML infrastructure angle might work. Need to find the right contact strategy.',touchpoints:[],customFields:{role:'Technical Leader',industry:'Entertainment'},countries:['US'],tags:['ai','entertainment'],createdAt:'2026-07-23'},
    {id:19,name:'Elena Petrova',title:'COO',company:'Revolut',email:'elena@revolut.com',phone:'+44 20-5555-1919',linkedin:'linkedin.com/in/elenapetrova',tier:'warm',stage:'negotiation',dealValue:195000,stageEnteredAt:'2026-07-18',angle:'International expansion compliance automation',notes:'Contract in final review. Main delay is their compliance team reviewing our SOC2 reports. Good relationship with champion.',touchpoints:[{date:'2026-07-02',channel:'email',note:'Cold email on multi-country compliance',outcome:'replied'},{date:'2026-07-06',channel:'call',note:'Discovery call',outcome:'meeting'},{date:'2026-07-09',channel:'email',note:'Proposal sent with compliance matrix',outcome:'replied'},{date:'2026-07-14',channel:'email',note:'Contract sent, waiting on legal',outcome:'replied'},{date:'2026-07-18',channel:'call',note:'Negotiation call. She wants multi-year discount.',outcome:'meeting'}],customFields:{role:'C-Suite',region:'EMEA'},countries:['GB','LT'],tags:['fintech','negotiation','compliance'],createdAt:'2026-07-02'},
    {id:20,name:'Wei Zhang',title:'VP Infrastructure',company:'ByteDance',email:'wei@bytedance.com',phone:'+86 10-5555-2020',linkedin:'linkedin.com/in/weizhang',tier:'cold',stage:'contacted',dealValue:300000,stageEnteredAt:'2026-07-22',angle:'Cloud cost optimization at scale',notes:'Very large potential deal. They spend $50M+ on cloud. Our cost optimization tool could save 15-20%. Language barrier, need Mandarin support.',touchpoints:[{date:'2026-07-22',channel:'email',note:'Sent Chinese-language executive summary and English deck',outcome:'pending'}],customFields:{role:'Technical Leader',region:'APAC'},countries:['CN','SG'],tags:['cloud','enterprise','apac'],createdAt:'2026-07-22'},
];

export const SEED_TEMPLATES = [
    {id:1,name:'Cold Email - Cost Savings',subject:"Quick question about {{company}}'s {{pain_point}}",body:'Hi {{first_name}},\n\nI noticed {{company}} has been scaling fast. Most companies at your stage face {{pain_point}}, we helped {{reference_company}} reduce costs by 40% in 90 days.\n\nWould a 15-minute call make sense?\n\nBest,\n{{sender_name}}'},
    {id:2,name:'Follow-Up - No Response',subject:'Re: Quick question',body:'Hi {{first_name}},\n\nJust bumping this up, I know things get busy. If the timing isn\'t right, no worries.\n\nBest,\n{{sender_name}}'},
    {id:3,name:'LinkedIn DM - Warm',subject:'',body:'Hey {{first_name}}, saw your post about {{topic}}. Really resonated. Would love to connect.'},
];
