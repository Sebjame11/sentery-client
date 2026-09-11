const API_URL = '/zen/v1/chat/completions';
const MODEL = 'deepseek-v4-flash-free';
const API_KEY = 'sk-QlP6T4UQLyO8WmoSGryKdrB8iL8pxkUfvqEgiAG8dvLZLiD7lzRn7037uBhm9xa0';

export function isAiConfigured() { return true; }
export function getApiKey() { return API_KEY; }

export async function aiChat(messages, options = {}) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            model: MODEL,
            messages,
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 4096,
            stream: false,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`AI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    return message?.content || message?.reasoning_content || '';
}

export async function aiGenerate(systemPrompt, userPrompt, options = {}) {
    return aiChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ], options);
}

const SALES_SYSTEM = `You are an expert B2B sales assistant for Sentery, a sales intelligence platform. You help sales professionals with:
- Writing personalized outreach emails and follow-ups
- Preparing for meetings and calls
- Assessing deal risk and recommending actions
- Handling objections with tailored responses
- Enriching prospect information with insights
- Analyzing win/loss patterns

Rules:
- Be concise and actionable
- Use a professional but warm tone
- Reference specific data from the prospect when provided
- Never use emojis or em dashes
- Format responses in clean text or markdown
- Keep emails under 150 words
- Always include a clear call to action`;

export function buildProspectContext(prospect) {
    if (!prospect) return 'No prospect data available.';
    const touches = (prospect.touchpoints || []).map(t =>
        `- ${t.date} [${t.channel}]: ${t.note}${t.outcome ? ` (${t.outcome})` : ''}`
    ).join('\n');

    return `Prospect: ${prospect.name}
Title: ${prospect.title}
Company: ${prospect.company}
Email: ${prospect.email}
Phone: ${prospect.phone}
LinkedIn: ${prospect.linkedin}
Industry: ${prospect.industry || 'Not specified'}
Country: ${prospect.country || 'Not specified'}
Tier: ${prospect.tier}
Stage: ${prospect.stage}
Deal Value: $${(prospect.dealValue || 0).toLocaleString()}
Angle: ${prospect.angle || 'Not specified'}
Notes: ${prospect.notes || 'None'}
Tags: ${(prospect.tags || []).join(', ') || 'None'}
Lost To Competitor: ${prospect.lostToCompetitor || 'N/A'}
Won Against Competitor: ${prospect.wonAgainstCompetitor || 'N/A'}
Created: ${prospect.createdAt}
Days in pipeline: ${Math.floor((Date.now() - new Date(prospect.createdAt).getTime()) / 86400000)}

Touchpoints (${(prospect.touchpoints || []).length}):
${touches || 'No touchpoints yet'}`;
}

export async function generateEmail(prospect, purpose = 'outreach') {
    const context = buildProspectContext(prospect);
    const purposeMap = {
        outreach: 'Write a cold outreach email',
        followup: 'Write a follow-up email after no response',
        reconnect: 'Write a re-engagement email for a dormant prospect',
        proposal: 'Write an email to accompany a proposal',
        checkin: 'Write a brief check-in email',
        breakup: 'Write a breakup email (last attempt)',
    };
    const instruction = purposeMap[purpose] || purpose;
    return aiGenerate(SALES_SYSTEM, `${instruction} for this prospect:\n\n${context}\n\nWrite only the email. Include subject line on the first line prefixed with "Subject: ".`, { maxTokens: 2048 });
}

export async function generateFollowUp(prospect, lastTouchpoint) {
    const context = buildProspectContext(prospect);
    const lastTouch = lastTouchpoint ? `\nLast touchpoint: ${lastTouchpoint.date} [${lastTouchpoint.channel}] - ${lastTouchpoint.note} (outcome: ${lastTouchpoint.outcome || 'unknown'})` : '';
    return aiGenerate(SALES_SYSTEM, `Write a follow-up message for this prospect. Be specific about what happened last and suggest a clear next step.\n\n${context}${lastTouch}\n\nWrite only the message text.`, { maxTokens: 2048 });
}

export async function generateMeetingBrief(prospect) {
    const context = buildProspectContext(prospect);
    const systemPrompt = `You are an enterprise Revenue Intelligence AI responsible for generating Meeting Prep Briefs for sales teams.

Your ONLY job is to analyze the provided meeting, CRM, email, notes, company information, and context, then return ONE valid JSON object.

IMPORTANT RULES:
- Return ONLY raw JSON.
- Do not wrap the JSON in markdown.
- Do not use \`\`\`json.
- Do not write explanations.
- Do not write conversational text.
- Do not include markdown, headings, bullets, tables, comments, or trailing commas.
- Output must be valid JSON parsable by JSON.parse().

Think like an experienced Enterprise Account Executive, Sales Director, Sales Engineer, Customer Success Leader, and Revenue Operations Manager.
The brief should help a salesperson prepare for an important meeting in under 60 seconds.
Prioritize actionable insights over summarization.
Never hallucinate information. If information is unavailable, return null.
Never invent names, dates, stakeholders, or metrics.
Infer only when highly supported by the provided context.

OUTPUT SCHEMA:
{
  "summary": { "headline": "", "overview": "", "meeting_goal": "", "confidence": "High|Medium|Low" },
  "meeting": { "company": "", "contact_name": "", "title": "", "meeting_type": "", "meeting_date": null, "deal_stage": "", "opportunity_value": "", "account_tier": "", "owner": "" },
  "risk_assessment": { "overall_risk": "Low|Medium|High|Critical", "risk_score": 0, "reasoning": "", "top_risks": [{ "title": "", "severity": "Low|Medium|High|Critical", "description": "", "business_impact": "" }] },
  "positive_signals": [{ "title": "", "description": "", "importance": "Low|Medium|High" }],
  "stakeholders": [{ "name": null, "title": "", "role_in_buying_process": "", "influence": "Low|Medium|High", "engagement": "", "notes": "" }],
  "conversation_objectives": [{ "priority": 1, "objective": "", "reason": "" }],
  "discovery_questions": { "business": [], "technical": [], "decision_process": [], "budget": [], "timeline": [] },
  "recommended_actions": [{ "priority": "High|Medium|Low", "action": "", "owner": "", "expected_outcome": "" }],
  "next_steps": [""],
  "success_criteria": [""],
  "probability": { "close_probability": 0, "confidence": "High|Medium|Low", "reasoning": "", "key_factor_to_improve": "" },
  "talking_points": [""],
  "objections_to_expect": [{ "objection": "", "recommended_response": "" }],
  "competitive_insight": { "competitors": [], "risk": "", "recommendation": "" },
  "company_context": { "industry": "", "size": "", "recent_news": [], "business_priorities": [], "technology_stack": [], "known_challenges": [] }
}`;
    return aiGenerate(systemPrompt, context, { maxTokens: 4096 });
}

export async function assessDealRisk(prospect) {
    const context = buildProspectContext(prospect);
    return aiGenerate(SALES_SYSTEM, `Assess the risk level of this deal. Analyze:
1. Overall Risk (Low/Medium/High/Critical)
2. Risk Factors (list each with severity)
3. Positive Signals
4. Recommended Actions to reduce risk
5. Probability of close estimate (percentage)

Be data-driven. Reference specific touchpoints and patterns.\n\n${context}`, { maxTokens: 2048 });
}

export async function generateObjectionResponse(prospect, objection) {
    const context = buildProspectContext(prospect);
    return aiGenerate(SALES_SYSTEM, `The prospect raised this objection: "${objection}"

Generate 2-3 tailored responses using different approaches (e.g., reframing, social proof, question-based). Each response should be 2-3 sentences.\n\nProspect context:\n${context}`, { maxTokens: 2048 });
}

export async function enrichProspect(companyName, industry) {
    return aiGenerate(SALES_SYSTEM, `Research and enrich information about ${companyName}${industry ? ` in the ${industry} industry` : ''}. Provide:
1. Company Overview (2-3 sentences)
2. Likely Pain Points (3-5)
3. Best Outreach Angles (2-3)
4. Key Decision Maker Titles to Target
5. Technology Stack (likely)
6. Company Size Estimate
7. Recent News or Trends (if any notable)

Be factual but concise. Base on general industry knowledge.`, { maxTokens: 2048 });
}

export async function generateWinLossSummary(prospect) {
    const context = buildProspectContext(prospect);
    const outcome = prospect.stage === 'won' ? 'WON' : 'LOST';
    return aiGenerate(SALES_SYSTEM, `Analyze why this deal was ${outcome}. Provide:
1. Key Factors (3-5)
2. What We Did Well
3. What Could Be Improved
4. Patterns to Replicate (or Avoid)
5. Recommendations for Similar Deals

Reference specific touchpoints and timeline.\n\n${context}`, { maxTokens: 2048 });
}

export async function generateSmartInsights(prospects) {
    const summary = prospects.slice(0, 20).map(p =>
        `${p.company}: stage=${p.stage}, value=$${p.dealValue || 0}, touches=${(p.touchpoints || []).length}, days=${Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000)}`
    ).join('\n');
    return aiGenerate(SALES_SYSTEM, `Analyze this sales pipeline and provide 3-5 actionable insights:\n\n${summary}\n\nFocus on: pipeline health, at-risk deals, quick wins, and strategic recommendations. Be specific and actionable.`, { maxTokens: 2048 });
}

export async function detectCompetitors(companyProfile) {
  const systemPrompt = `You are an expert competitive intelligence analyst. Given a company's profile, identify who their top 5-10 competitors are in the market.

Return ONLY valid JSON with this structure (no markdown, no code fences, no extra text):
{
  "competitors": [
    { "name": "Company Name", "website": "https://...", "category": "category", "threat": "high|medium|low", "notes": "brief description" }
  ],
  "market_position": "2-3 sentence summary of where this company sits in the market",
  "analysis_date": "ISO date"
}`;
  const userPrompt = `Analyze this company and tell me who their main competitors are:

Company Name: ${companyProfile.company_name || 'Unknown'}
Website: ${companyProfile.website || 'N/A'}
Industry: ${companyProfile.industry || 'N/A'}
Description: ${companyProfile.description || 'N/A'}
Products/Services: ${(Array.isArray(companyProfile.products) ? companyProfile.products.join(', ') : companyProfile.products) || 'N/A'}`;
  const reply = await aiChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 2048 });
  try {
    return JSON.parse(reply);
  } catch {
    return { competitors: [], market_position: '', analysis_date: new Date().toISOString() };
  }
}

export async function enrichCompetitor(name) {
    return aiGenerate(SALES_SYSTEM, `Research the company "${name}" as a competitor in the sales/prospecting space. Return ONLY a valid JSON object with these fields:
- "category": best fit from: CRM, Prospecting, Data, Automation, Analytics, Communication, Other
- "threat": one of: low, medium, high, critical
- "strength": 2-3 sentences on what they do well
- "weakness": 2-3 sentences on where they fall short
- "notes": 1-2 sentences of additional context

Return ONLY valid JSON, no markdown, no code fences, no extra text.`, { maxTokens: 2048 });
}

export async function generateCompetitorBattleCard(competitor, prospects) {
    const lostTo = prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor === competitor.name);
    const wonAgainst = prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor === competitor.name);
    const lostValue = lostTo.reduce((s, p) => s + (p.dealValue || 0), 0);
    const wonValue = wonAgainst.reduce((s, p) => s + (p.dealValue || 0), 0);
    const context = `Competitor: ${competitor.name}
Category: ${competitor.category}
Threat Level: ${competitor.threat}
Known Strengths: ${competitor.strength || 'Unknown'}
Known Weaknesses: ${competitor.weakness || 'Unknown'}
Deals Lost To Them: ${lostTo.length} ($${lostValue.toLocaleString()})
Deals Won Against Them: ${wonAgainst.length} ($${wonValue.toLocaleString()})`;

    return aiGenerate(SALES_SYSTEM, `Generate a competitive battle card for ${competitor.name}. Include:

1. KEY TALKING POINTS - 3-5 points on how to position against them, what makes us different
2. COMMON OBJECTIONS - 2-3 likely objections a prospect would raise when comparing to ${competitor.name}, with specific responses
3. WIN STRATEGY - Recommended approach for competing against them

Be specific and actionable. Reference real selling scenarios.\n\nContext:\n${context}`, { maxTokens: 3072 });
}

export async function generateTemplate(description) {
    return aiGenerate(SALES_SYSTEM, `Create a sales email template based on this description: "${description}"

Return ONLY valid JSON with these fields:
- "name": Short descriptive name for the template
- "subject": Email subject line (use {{first_name}}, {{company}}, etc.)
- "body": Email body with variables like {{first_name}}, {{company}}, {{pain_point}}, {{sender_name}}
- "category": one of: Cold Email, Follow-Up, LinkedIn, Proposal, Breakup, Re-engagement

Rules:
- Subject under 60 characters
- Body under 200 words
- Professional warm tone
- Include variable placeholders
- No emojis or em dashes

Return ONLY valid JSON, no markdown, no code fences, no extra text.`, { maxTokens: 2048 });
}

export async function generateCompetitiveLandscape(competitors, prospects) {
    const compSummary = competitors.slice(0, 10).map(c =>
        `${c.name} (${c.category}, threat: ${c.threat}) - Strengths: ${c.strength || 'N/A'}, Weaknesses: ${c.weakness || 'N/A'}`
    ).join('\n');
    const lostDeals = prospects.filter(p => p.stage === 'lost' && p.lostToCompetitor);
    const wonDeals = prospects.filter(p => p.stage === 'won' && p.wonAgainstCompetitor);
    const dealSummary = `Lost deals: ${lostDeals.length} ($${lostDeals.reduce((s, p) => s + (p.dealValue || 0), 0).toLocaleString()})
Won deals: ${wonDeals.length} ($${wonDeals.reduce((s, p) => s + (p.dealValue || 0), 0).toLocaleString()})`;

    return aiGenerate(SALES_SYSTEM, `Analyze the competitive landscape and provide strategic insights. Include:

1. MARKET POSITIONING - How we compare against each competitor
2. BIGGEST THREATS - Which competitors pose the most risk and why
3. BIGGEST OPPORTUNITIES - Where we consistently win and can double down
4. GAPS IN INTELLIGENCE - What we don't know about the competitive landscape
5. RECOMMENDED ACTIONS - 3-5 concrete next steps

Be data-driven and actionable.\n\nTracked Competitors:\n${compSummary}\n\nDeal Data:\n${dealSummary}`, { maxTokens: 3072 });
}
