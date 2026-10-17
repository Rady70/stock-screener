function rowValue(row, field) {
  if (field === 'price') return row.price ?? row.current_price;
  if (field === 'listing_search') return `${row.symbol || ''} ${row.company_name || ''}`.trim();
  if (field === 'listing_aware_volume') {
    return row?.scan_mode === 'listing_only' ? Number.POSITIVE_INFINITY : row?.volume;
  }
  if (field === 'price_change_1d') return row.price_change_1d ?? row.pct_day;
  if (field === 'perf_week') return row.perf_week ?? row.pct_week;
  if (field === 'perf_month') return row.perf_month ?? row.pct_month;
  if (field === 'market_cap_usd') {
    const currency = String(row.currency || '').toUpperCase();
    return row.market_cap_usd
      ?? ((currency === 'USD' || row.market === 'US') ? row.market_cap : null);
  }
  return row?.[field];
}

const DECIMAL = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

function rangeNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return Number.NaN;
  if (typeof value === 'string' && !DECIMAL.test(value.trim())) return Number.NaN;
  const number = Number(value);
  if (number === 0 && typeof value === 'string' && /[1-9]/.test(value.split(/[eE]/)[0])) return Number.NaN;
  return Number.isFinite(number) ? number : Number.NaN;
}

const CONDITION_EVALUATORS = {
  range: (row, condition) => {
    const listingSentinel = condition.field === 'listing_aware_volume' && row?.scan_mode === 'listing_only';
    const value = listingSentinel ? Number.POSITIVE_INFINITY : rangeNumber(rowValue(row, condition.field));
    if (Number.isNaN(value)) return false;
    if (condition.min != null) {
      const min = rangeNumber(condition.min);
      if (Number.isNaN(min) || value < min) return false;
    }
    if (condition.max != null) {
      const max = rangeNumber(condition.max);
      if (Number.isNaN(max) || value > max) return false;
    }
    return true;
  },
  categorical: (row, condition) => {
    const value = rowValue(row, condition.field);
    const included = value != null && condition.values.includes(value);
    return condition.mode === 'exclude' ? value == null || !included : included;
  },
  boolean: (row, condition) => {
    const value = rowValue(row, condition.field);
    return typeof value === 'boolean' && value === condition.value;
  },
  text: (row, condition) => {
    const value = rowValue(row, condition.field);
    return value != null && String(value).toLowerCase().includes(condition.pattern.toLowerCase());
  },
};

export function evaluateCondition(row, condition) {
  return CONDITION_EVALUATORS[condition.kind]?.(row, condition) ?? false;
}

export function evaluateGroup(row, group) {
  if (group.enabled === false) return false;
  const matches = (group.conditions || []).map((condition) => evaluateCondition(row, condition));
  return group.match === 'any' ? matches.some(Boolean) : matches.every(Boolean);
}

export function evaluateExpression(row, expression) {
  if (!evaluateGroup(row, expression.required)) return false;
  const groups = (expression.groups || []).filter((group) => group.enabled !== false);
  if (!groups.length) return true;
  const matches = groups.map((group) => evaluateGroup(row, group));
  return expression.group_join === 'all' ? matches.every(Boolean) : matches.some(Boolean);
}

export function matchedGroupNames(row, expression) {
  return (expression.groups || [])
    .filter((group) => group.enabled !== false && evaluateGroup(row, group))
    .map((group) => ({ id: group.id, name: group.name }));
}

export function annotateExpressionMatches(rows, expression) {
  return rows
    .filter((row) => evaluateExpression(row, expression))
    .map((row) => ({ ...row, matched_groups: matchedGroupNames(row, expression) }));
}
