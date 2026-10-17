import { useEffect, useRef } from 'react';
import {
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { recordOpportunityEvidenceOpen } from '../../features/opportunityState/opportunityTelemetry';
import ActionStateBadge from './ActionStateBadge';

const NOT_AVAILABLE = 'Not available';

const PILLARS = Object.freeze([
  ['benchmark_leadership', 'Benchmark leadership'],
  ['multi_horizon_rs', 'Multi-horizon RS'],
  ['trend_integrity', 'Trend integrity'],
  ['structure_tightness', 'Structure/tightness'],
  ['liquidity_freshness', 'Liquidity/freshness'],
]);

const SCORE_INPUT_LABELS = Object.freeze({
  benchmark_relative_return_65d: '65-session benchmark-relative return',
  rs_line_new_high: 'RS-line new-high status',
  rs_line_blue_dot: 'RS-line leadership status',
  rs_rating_1m: 'one-month relative strength',
  rs_rating_3m: 'three-month relative strength',
  stage: 'trend stage',
  ma_alignment: 'moving-average alignment',
  invalidation: 'trend invalidation checks',
  squeeze: 'volatility squeeze status',
  tight_closes_count: 'tight-closes count',
  quiet_days_count: 'quiet-day count',
  volume_vs_50d: 'volume relative to its 50-day average',
  volume_dry_up_max: 'volume dry-up threshold',
  setup_payload: 'pattern analysis',
  primary_pattern: 'primary-pattern assessment',
  liquidity: 'liquidity assessment',
  liquidity_passes: 'liquidity result',
  feature_status: 'scan data status',
  is_scannable: 'screening eligibility',
});

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return NOT_AVAILABLE;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const formatScore = (score) => {
  if (score === null || score === undefined || score === '') return NOT_AVAILABLE;
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? numericScore.toFixed(1) : String(score);
};

const formatCode = (value) => {
  const words = String(value).replace(/[_-]/g, ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

const missingInputExplanation = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (values.includes('future_benchmark_date')) {
    return "Benchmark data is later than this stock's snapshot.";
  }
  const labels = values.map((value) => SCORE_INPUT_LABELS[value] || formatCode(value));
  return `Missing ${labels.length === 1 ? 'input' : 'inputs'}: ${labels.join(', ')}.`;
};

function Section({ title, children }) {
  return (
    <Box component="section" sx={{ mb: 2.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Detail({ label, value }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.35 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ textAlign: 'right' }}>{formatValue(value)}</Typography>
    </Box>
  );
}

function EvidenceList({ values, formatItem = formatCode }) {
  if (!Array.isArray(values) || values.length === 0) {
    return <Typography variant="body2" color="text.secondary">{NOT_AVAILABLE}</Typography>;
  }

  return (
    <List dense disablePadding>
      {values.map((value, index) => (
        <ListItem key={`${String(value)}-${index}`} disableGutters sx={{ py: 0.15 }}>
          <ListItemText primary={formatItem(value)} primaryTypographyProps={{ variant: 'body2' }} />
        </ListItem>
      ))}
    </List>
  );
}

function EvidenceDetails({ values, formatValues = false }) {
  if (!isRecord(values) || Object.keys(values).length === 0) {
    return <Typography variant="body2" color="text.secondary">{NOT_AVAILABLE}</Typography>;
  }

  return Object.entries(values).map(([key, value]) => (
    <Detail
      key={key}
      label={formatCode(key)}
      value={formatValues && typeof value === 'string' ? formatCode(value) : value}
    />
  ));
}

function OpportunityEvidenceDrawer({
  open,
  row,
  onClose,
  onEvidenceOpen,
  opportunityTelemetrySurface,
}) {
  const wasOpen = useRef(false);
  const hasRow = isRecord(row);
  const isOpen = Boolean(open && hasRow);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      onEvidenceOpen?.(row);
      if (opportunityTelemetrySurface) {
        const evidence = isRecord(row.opportunity_state) ? row.opportunity_state : {};
        void recordOpportunityEvidenceOpen(evidence.market, opportunityTelemetrySurface);
      }
    }
    wasOpen.current = isOpen;
  }, [isOpen, onEvidenceOpen, opportunityTelemetrySurface, row]);

  if (!hasRow) return null;

  const evidence = isRecord(row.opportunity_state) ? row.opportunity_state : {};
  const scorePillars = isRecord(evidence.score_pillars)
    ? evidence.score_pillars
    : {};
  const missingInputs = isRecord(evidence.metrics?.score_missing_inputs)
    ? evidence.metrics.score_missing_inputs : {};
  const availablePillars = PILLARS.filter(([key]) => Number.isFinite(scorePillars[key])).length;
  const scoreMissing = row.resilience_score === null || row.resilience_score === undefined || row.resilience_score === '';
  const incomplete = scoreMissing && (availablePillars > 0 || Object.keys(missingInputs).length > 0);
  const displayedMetrics = isRecord(evidence.metrics)
    ? Object.fromEntries(Object.entries(evidence.metrics).filter(([key]) => key !== 'score_missing_inputs'))
    : {};

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, p: 2 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
        <Typography id="opportunity-evidence-title" component="h2" variant="h6">
          Opportunity evidence
        </Typography>
        <IconButton aria-label="Close opportunity evidence" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Section title="Action state">
        <ActionStateBadge state={row.action_state} />
      </Section>

      <Section title="Resilience score">
        <Typography variant="h4" component="p">{incomplete ? 'Incomplete' : formatScore(row.resilience_score)}</Typography>
        {incomplete && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {availablePillars} of 5 pillars available. The total requires all five.
          </Typography>
        )}
        {scoreMissing && !incomplete && evidence.policy_version === 'correction-survivors-v1' && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This snapshot has no pillar scores. Individual pillars need to be calculated in a new scan.
          </Typography>
        )}
      </Section>

      <Section title="Score pillars">
        {PILLARS.map(([key, label]) => (
          <Box key={key}>
            <Detail label={label} value={Number.isFinite(scorePillars[key]) ? Number(scorePillars[key].toFixed(1)) : null} />
            {missingInputExplanation(missingInputs[key]) && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                {missingInputExplanation(missingInputs[key])}
              </Typography>
            )}
          </Box>
        ))}
      </Section>

      <Section title="Data availability">
        <EvidenceDetails values={evidence.data_availability} formatValues />
      </Section>

      <Section title="Metrics">
        <EvidenceDetails values={displayedMetrics} />
      </Section>

      <Section title="Passed checks">
        <EvidenceList values={evidence.passed_checks} />
      </Section>

      <Section title="Failed checks">
        <EvidenceList values={evidence.failed_checks} />
      </Section>

      <Section title="Warnings">
        <EvidenceList values={evidence.warnings} />
      </Section>

      <Section title="Action reasons">
        <EvidenceList values={evidence.action_reasons} formatItem={(reason) => String(reason)} />
      </Section>

      <Section title="Provenance">
        <Detail label="Market" value={evidence.market} />
        <Detail label="MIC" value={evidence.mic} />
        <Detail label="Benchmark" value={evidence.benchmark_symbol} />
        <Detail label="As-of date" value={evidence.as_of_date} />
        <Detail label="Benchmark date" value={evidence.benchmark_as_of_date} />
      </Section>
    </Drawer>
  );
}

export { OpportunityEvidenceDrawer };
export default OpportunityEvidenceDrawer;
