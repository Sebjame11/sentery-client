// UI-facing catalog for the segment builder.
// Mirrors backend FIELD_DEFS; custom field definitions from the DB are merged
// at runtime so future custom fields appear automatically.

export const OPERATOR_LABELS = {
  is: 'Is', is_not: 'Is not', contains: 'Contains', not_contains: 'Does not contain',
  starts_with: 'Starts with', is_empty: 'Is empty', is_not_empty: 'Is not empty',
  eq: 'Equals', gt: 'Greater than', lt: 'Less than', gte: 'Greater than or equal',
  lte: 'Less than or equal', between: 'Between', exact: 'Is', before: 'Before', after: 'After',
  within_days: 'Within the last', older_than: 'More than', in: 'Is any of',
  contains_any: 'Contains any of', contains_all: 'Contains all of', contains_none: 'Contains none of',
};

export const OPERATORS_BY_TYPE = {
  text: ['is', 'is_not', 'contains', 'not_contains', 'starts_with', 'is_empty', 'is_not_empty'],
  number: ['eq', 'gt', 'lt', 'gte', 'lte', 'between'],
  date: ['exact', 'before', 'after', 'within_days', 'older_than', 'between'],
  enum: ['is', 'is_not', 'in'],
  multienum: ['contains_any', 'contains_all', 'contains_none'],
  bool: ['is'],
};

export function describeCondition(c, catalog) {
  const { fields = [], custom_fields = [], options = {} } = catalog || {};
  let def = fields.find(f => f.field === c.field);
  let label = def?.label || c.field;
  let type = def?.type || 'text';
  if (c.field.startsWith('cf:')) {
    const cf = custom_fields.find(f => 'cf:' + f.id === c.field);
    label = cf?.name || 'Custom field';
    type = cf?.type || 'text';
  }
  const opLabel = OPERATOR_LABELS[c.op] || c.op;
  const val = Array.isArray(c.value) ? c.value.join(', ') : c.value;
  return { label, type, opLabel, val };
}

export function valueKind(type, op) {
  if (op === 'between') return type === 'number' ? 'number-range' : type === 'date' ? 'date-range' : 'text';
  if (type === 'bool') return 'bool';
  if (type === 'enum') return op === 'in' ? 'enum-multi' : 'enum';
  if (type === 'multienum') return 'tags';
  if (type === 'number') return 'number';
  if (type === 'date') {
    if (op === 'within_days' || op === 'older_than') return 'days';
    return 'date';
  }
  return 'text';
}

export function emptyCondition(catalog, preferredField) {
  const { fields = [], custom_fields = [] } = catalog || {};
  const all = [...fields, ...custom_fields.map(f => ({ ...f, field: 'cf:' + f.id }))];
  const pick = all.find(f => f.field === preferredField) || all[0] || { field: 'name', type: 'text' };
  return { field: pick.field, op: defaultOp(pick.type), value: defaultValue(pick.type, pick.op) };
}

function defaultOp(type) {
  switch (type) {
    case 'number': return 'gt';
    case 'date': return 'within_days';
    case 'enum': return 'is';
    case 'multienum': return 'contains_any';
    case 'bool': return 'is';
    default: return 'contains';
  }
}

function defaultValue(type) {
  switch (type) {
    case 'number': return 0;
    case 'date': return 7; // days (default op is within_days)
    case 'bool': return true;
    case 'enum': return '';
    case 'multienum': return [];
    default: return '';
  }
}
// Mirror of backend COMPANY_FIELD_DEFS — used as a fallback when the
// /segments/fields catalog was loaded before company support shipped.
export const COMPANY_FIELDS = [
  { field: 'name',        label: 'Company name',    group: 'Company',   type: 'text' },
  { field: 'domain',      label: 'Domain',          group: 'Company',   type: 'text' },
  { field: 'industry',    label: 'Industry',        group: 'Company',   type: 'text' },
  { field: 'company_size',label: 'Company size',   group: 'Company',   type: 'text' },
  { field: 'company_type',label: 'Company type',   group: 'Company',   type: 'text' },
  { field: 'city',        label: 'City',            group: 'Company',   type: 'text' },
  { field: 'region',      label: 'Region',           group: 'Company',   type: 'text' },
  { field: 'country',     label: 'Country',          group: 'Company',   type: 'text' },
  { field: 'annual_revenue', label: 'Annual revenue', group: 'Company', type: 'number' },
  { field: 'tags',        label: 'Tags',             group: 'Company',   type: 'multienum' },
  { field: 'created_at',  label: 'Created date',     group: 'Company',   type: 'date' },
  { field: 'updated_at',  label: 'Updated date',     group: 'Company',   type: 'date' },
  { field: 'open_deals',   label: 'Open deals count',    group: 'Company deals', type: 'number' },
  { field: 'total_deal_value', label: 'Total deal value', group: 'Company deals', type: 'number' },
  { field: 'has_open_deal',label: 'Has open deal',      group: 'Company deals', type: 'bool' },
  { field: 'last_deal_activity', label: 'Last deal activity', group: 'Company deals', type: 'date' },
];
