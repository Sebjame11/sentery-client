export function parseCSV(text) {
    const lines = text.replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) return [];
    const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const headerMap = {};
    rawHeaders.forEach((h, i) => {
        const k = h.replace(/[^a-z0-9]/g, '');
        headerMap[k] = i;
        headerMap[h] = i;
        headerMap[rawHeaders[i]] = i;
    });
    function getVal(row, ...keys) {
        for (const k of keys) {
            const idx = headerMap[k] ?? headerMap[k.replace(/[^a-z0-9]/g, '')];
            if (idx !== undefined && idx < row.length) return row[idx].replace(/^"|"$/g, '').trim();
        }
        return '';
    }
    function splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inQuotes = !inQuotes; }
            else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
            else { current += line[i]; }
        }
        result.push(current);
        return result;
    }

    const lifecycleMap = {
        'lead': 'lead', 'subscriber': 'lead',
        'mql': 'mql', 'marketing qualified lead': 'mql',
        'sql': 'sql', 'sales qualified lead': 'sql',
        'opportunity': 'opportunity',
        'customer': 'client', 'client': 'client',
        'evangelist': 'client', 'other': 'lead',
    };

    return lines.slice(1).map(line => {
        const vals = splitCSVLine(line);
        const firstName = getVal(vals, 'firstname', 'first_name', 'fname');
        const lastName = getVal(vals, 'lastname', 'last_name', 'lname', 'surname');
        const name = getVal(vals, 'name', 'fullname', 'contactname', 'personname')
            || ((firstName + ' ' + lastName).trim())
            || getVal(vals, 'companyname', 'company', 'organization', 'org');
        if (!name) return null;
        const company = getVal(vals, 'companyname', 'company', 'organization', 'org');
        const title = getVal(vals, 'title', 'role', 'jobtitle', 'job_title', 'position');
        const email = getVal(vals, 'email', 'emailaddress', 'email_address');
        const phone = getVal(vals, 'phone', 'phonenumber', 'phone_number', 'mobile', 'phone1');
        const linkedin = getVal(vals, 'linkedin', 'linkedinurl', 'linkedin_url', 'linkedIn URL');
        const industry = getVal(vals, 'industry');
        const city = getVal(vals, 'city', 'cityname');
        const country = getVal(vals, 'country', 'countryregion', 'country_region', 'countryname');
        const leadSource = getVal(vals, 'leadsource', 'lead_source', 'source');
        const lifecycleRaw = getVal(vals, 'lifecyclestage', 'lifecycle_stage', 'lifecycle');
        const lifecycleStage = lifecycleMap[lifecycleRaw.toLowerCase()] || 'lead';
        const notes = [industry, city].filter(Boolean).join(' · ');
        const hubspotId = getVal(vals, 'recordid', 'id', 'hs_object_id');
        const createDate = getVal(vals, 'createdate', 'hs_createdate');
        return {
            id: Date.now() + Math.random(),
            name: name,
            firstName: firstName,
            lastName: lastName,
            title: title,
            company: company || name,
            email: email,
            phone: phone,
            linkedin: linkedin,
            tier: 'cold',
            stage: 'lead',
            lifecycleStage: lifecycleStage,
            leadSource: leadSource,
            dealValue: parseFloat(getVal(vals, 'dealvalue', 'deal', 'value', 'amount')) || 0,
            stageEnteredAt: createDate ? createDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
            angle: industry ? industry + ' outreach' : '',
            notes: notes + (hubspotId ? ' (HubSpot ID: ' + hubspotId + ')' : ''),
            countries: country ? [country] : [],
            touchpoints: [],
            createdAt: createDate || new Date().toISOString(),
        };
    }).filter(Boolean);
}

export function parseCompaniesCSV(text) {
    const lines = text.replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) return [];
    const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const headerMap = {};
    rawHeaders.forEach((h, i) => {
        const k = h.replace(/[^a-z0-9]/g, '');
        headerMap[k] = i;
        headerMap[h] = i;
        headerMap[rawHeaders[i]] = i;
    });
    function getVal(row, ...keys) {
        for (const k of keys) {
            const idx = headerMap[k] ?? headerMap[k.replace(/[^a-z0-9]/g, '')];
            if (idx !== undefined && idx < row.length) return row[idx].replace(/^"|"$/g, '').trim();
        }
        return '';
    }
    function splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inQuotes = !inQuotes; }
            else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
            else { current += line[i]; }
        }
        result.push(current);
        return result;
    }
    return lines.slice(1).map(line => {
        const vals = splitCSVLine(line);
        const name = getVal(vals, 'companyname', 'company name', 'company', 'name', 'organization', 'org');
        if (!name) return null;
        const rawType = getVal(vals, 'type', 'companytype', 'company_type').toLowerCase();
        const typeMap = { prospect: 'prospect', partner: 'partner', client: 'client', customer: 'client', other: 'other' };
        const companyType = typeMap[rawType] || 'prospect';
        return {
            id: Date.now() + Math.random(),
            name: name,
            domain: getVal(vals, 'websiteurl', 'website url', 'website', 'domain', 'url'),
            industry: getVal(vals, 'industry', 'sector'),
            companySize: getVal(vals, 'companysize', 'company_size', 'size', 'employees'),
            annualRevenue: getVal(vals, 'annualrevenue', 'annual_revenue', 'revenue'),
            phone: getVal(vals, 'phonenumber', 'phone number', 'phone', 'mobile'),
            address: getVal(vals, 'address', 'street'),
            city: getVal(vals, 'city', 'cityname'),
            region: getVal(vals, 'region', 'state', 'province'),
            country: getVal(vals, 'countryregion', 'country/region', 'country region', 'country'),
            description: getVal(vals, 'description', 'about', 'desc'),
            linkedinUrl: getVal(vals, 'linkedin', 'linkedinurl', 'linkedin_url'),
            companyType: companyType,
            outboundType: getVal(vals, 'outboundtype', 'outbound type', 'outbound'),
            tags: getVal(vals, 'tags', 'labels').split(/[;,]/).map(t => t.trim()).filter(Boolean),
            createdAt: new Date().toISOString(),
        };
    }).filter(Boolean);
}

// Parse HubSpot deal export CSV
export function parseDealsCSV(text, stageMap) {
    function splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { inQuotes = !inQuotes; }
            else if (line[i] === ',' && !inQuotes) { result.push(current); current = ''; }
            else { current += line[i]; }
        }
        result.push(current);
        return result;
    }
    function parseCSVLine(line) { return splitCSVLine(line); }
    const lines = text.replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) return [];
    const rawHeaders = parseCSVLine(lines[0]);
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const headerMap = {};
    rawHeaders.forEach((h, i) => {
        const k = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        headerMap[k] = i;
        headerMap[h] = i;
        headerMap[rawHeaders[i]] = i;
    });
    function getVal(row, ...keys) {
        for (const k of keys) {
            const idx = headerMap[k] ?? headerMap[k.replace(/[^a-z0-9]/g, '')];
            if (idx !== undefined && idx < row.length) return row[idx].replace(/^"|"$/g, '').trim();
        }
        return '';
    }
    return lines.slice(1).map(line => {
        const vals = parseCSVLine(line);
        if (vals.length < 4) return null;
        const dealStage = getVal(vals, 'dealstage', 'deal stage', 'stage');
        const stage = stageMap[dealStage.toLowerCase()] || stageMap[dealStage] || dealStage.toLowerCase().replace(/[^a-z0-9]/g, '') || 'lead';
        const closeDateRaw = getVal(vals, 'closedate', 'close date', 'closedate');
        let closeDate = closeDateRaw;
        if (closeDateRaw && closeDateRaw.includes(' ')) closeDate = closeDateRaw.split(' ')[0];
        const createDateRaw = getVal(vals, 'createdate', 'create date', 'createdon', 'created at');
        let createDate = createDateRaw;
        if (createDateRaw && createDateRaw.includes(' ')) createDate = createDateRaw.split(' ')[0];
        return {
            name: getVal(vals, 'dealname', 'deal name', 'name'),
            stage: stage,
            dealValue: Number(getVal(vals, 'amount', 'dealvalue', 'deal value', 'amountclosed', 'amount closed').replace(/[^0-9.-]/g, '')) || 0,
            dealType: getVal(vals, 'dealtype', 'deal type'),
            closeDate: closeDate || null,
            createDate: createDate || null,
            companyName: getVal(vals, 'associatedcompany', 'associated company', 'company'),
            primaryContactName: getVal(vals, 'associatedcontact', 'associated contact', 'contact'),
            notes: getVal(vals, 'associatednote', 'associated note', 'note', 'description').split(/;\s*/).filter(n => n.trim()).join('\n\n'),
            associatedCall: getVal(vals, 'associatedcall', 'associated call', 'call').split(/;\s*/).filter(n => n.trim()).join('\n\n'),
            closedLostReason: getVal(vals, 'closedlostreason', 'closed lost reason', 'lostreason', 'lost reason'),
            closedWonReason: getVal(vals, 'closedwonreason', 'closed won reason', 'wonreason', 'won reason'),
            lastContacted: getVal(vals, 'lastcontacted', 'last contacted') || null,
        };
    }).filter(Boolean);
}
