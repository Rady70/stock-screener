import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { recordOpportunityEvidenceOpen } from '../../features/opportunityState/opportunityTelemetry';
import OpportunityEvidenceDrawer from './OpportunityEvidenceDrawer';

vi.mock('../../features/opportunityState/opportunityTelemetry', () => ({
  recordOpportunityEvidenceOpen: vi.fn().mockResolvedValue(undefined),
}));

const OPPORTUNITY_ROW = {
  action_state: 'setup_ready',
  resilience_score: 84,
  opportunity_state: {
    as_of_date: '2026-08-21',
    market: 'US',
    mic: 'XNAS',
    benchmark_symbol: 'SPY',
    benchmark_as_of_date: '2026-08-20',
    score_pillars: {
      benchmark_leadership: 20,
      multi_horizon_rs: 18.2,
      trend_integrity: 20,
      structure_tightness: 18,
      liquidity_freshness: 20,
    },
    passed_checks: ['leadership_gate'],
    failed_checks: ['structure_gate'],
    warnings: ['benchmark_date_lag'],
    action_reasons: ['survivor', 'setup_ready'],
  },
};

describe('OpportunityEvidenceDrawer', () => {
  beforeEach(() => {
    recordOpportunityEvidenceOpen.mockClear();
  });

  it.each(['event_risk', 'extended'])('shows known pillars and a missing-input reason for %s', (state) => {
    renderWithProviders(<OpportunityEvidenceDrawer open onClose={vi.fn()} row={{
      action_state: state,
      resilience_score: null,
      opportunity_state: {
        policy_version: 'correction-survivors-v1-partial-pillars',
        score_pillars: {
          benchmark_leadership: 20, multi_horizon_rs: 17, trend_integrity: 20,
          structure_tightness: null, liquidity_freshness: 20,
        },
        metrics: { score_missing_inputs: { structure_tightness: ['tight_closes_count'] } },
      },
    }} />);
    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByText('4 of 5 pillars available. The total requires all five.')).toBeInTheDocument();
    expect(within(screen.getByText('Multi-horizon RS').parentElement).getByText('17')).toBeInTheDocument();
    expect(screen.getByText('Missing input: tight-closes count.')).toBeInTheDocument();
    expect(screen.queryByText('77.0')).not.toBeInTheDocument();
  });

  it('explains a withheld future-dated score', () => {
    renderWithProviders(<OpportunityEvidenceDrawer open onClose={vi.fn()} row={{
      resilience_score: null,
      opportunity_state: {
        metrics: { score_missing_inputs: { benchmark_leadership: ['future_benchmark_date'] } },
      },
    }} />);
    expect(screen.getByText("Benchmark data is later than this stock's snapshot.")).toBeInTheDocument();
  });

  it('does not recalculate legacy pillar scores in the browser', () => {
    renderWithProviders(<OpportunityEvidenceDrawer open onClose={vi.fn()} row={{
      resilience_score: null,
      opportunity_state: {
        policy_version: 'correction-survivors-v1',
        metrics: { rs_rating_1m: 90, rs_rating_3m: 80, tight_closes_count: null },
      },
    }} />);
    expect(screen.getByText(/This snapshot has no pillar scores/)).toBeInTheDocument();
    expect(within(screen.getByText('Multi-horizon RS').parentElement).getByText('Not available')).toBeInTheDocument();
  });

  it('displays actual zero scores without an incomplete warning', () => {
    renderWithProviders(<OpportunityEvidenceDrawer open onClose={vi.fn()} row={{
      resilience_score: 0,
      opportunity_state: {
        score_pillars: { benchmark_leadership: 0, multi_horizon_rs: 0, trend_integrity: 0,
          structure_tightness: 0, liquidity_freshness: 0 },
      },
    }} />);
    expect(screen.getByText('0.0')).toBeInTheDocument();
    expect(screen.queryByText('Incomplete')).not.toBeInTheDocument();
  });

  it('formats computed pillar decimals without changing the stored evidence', () => {
    const row = { resilience_score: null, opportunity_state: { score_pillars: { multi_horizon_rs: 15.399999999999999 } } };
    renderWithProviders(<OpportunityEvidenceDrawer open onClose={vi.fn()} row={row} />);
    expect(within(screen.getByText('Multi-horizon RS').parentElement).getByText('15.4')).toBeInTheDocument();
    expect(row.opportunity_state.score_pillars.multi_horizon_rs).toBe(15.399999999999999);
  });

  // Catches a drawer coupled to chart bundles or full Setup Engine evidence instead of compact persisted evidence.
  it('renders compact evidence without chart or setup payloads', () => {
    renderWithProviders(<OpportunityEvidenceDrawer open row={OPPORTUNITY_ROW} onClose={vi.fn()} />);

    expect(screen.getByText('Resilience score')).toBeInTheDocument();
    expect(screen.getByText('84.0')).toBeInTheDocument();
    expect(screen.getByText('Setup Ready')).toBeInTheDocument();
    expect(screen.getByText('Benchmark leadership')).toBeInTheDocument();
    expect(screen.getByText('Multi-horizon RS')).toBeInTheDocument();
    expect(screen.getByText('Trend integrity')).toBeInTheDocument();
    expect(screen.getByText('Structure/tightness')).toBeInTheDocument();
    expect(screen.getByText('Liquidity/freshness')).toBeInTheDocument();
    expect(screen.getByText('Leadership gate')).toBeInTheDocument();
    expect(screen.getByText('Structure gate')).toBeInTheDocument();
    expect(screen.getByText('Benchmark date lag')).toBeInTheDocument();
    expect(screen.getByText('survivor')).toBeInTheDocument();
    expect(screen.getByText('setup_ready')).toBeInTheDocument();
    expect(screen.getByText('SPY')).toBeInTheDocument();
    expect(screen.getByText('XNAS')).toBeInTheDocument();
    expect(screen.getByText('2026-08-21')).toBeInTheDocument();
    expect(screen.getByText('2026-08-20')).toBeInTheDocument();
    expect(screen.queryByText('Chart')).not.toBeInTheDocument();
  });

  // Catches browser-side score reconstruction or missing-value coercion that falsely reports zero or false evidence.
  it('shows unavailable for omitted compact values and pillar scores', () => {
    renderWithProviders(
      <OpportunityEvidenceDrawer
        open
        row={{ action_state: null, resilience_score: null, opportunity_state: {} }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Not computed')).toBeInTheDocument();
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(10);
  });

  it('renders persisted availability and metric evidence for data-limited rows', () => {
    renderWithProviders(
      <OpportunityEvidenceDrawer
        open
        row={{
          action_state: 'data_limited',
          resilience_score: null,
          opportunity_state: {
            data_availability: {
              event_calendar: 'unavailable',
              liquidity: 'available',
            },
            metrics: {
              liquidity_passes: false,
              volume_vs_50d: 0.7,
            },
          },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Data availability')).toBeInTheDocument();
    expect(screen.getByText('Event calendar')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('Liquidity passes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText('Volume vs 50d')).toBeInTheDocument();
    expect(screen.getByText('0.7')).toBeInTheDocument();
  });

  it('does not read the removed resilience_pillars alias', () => {
    renderWithProviders(
      <OpportunityEvidenceDrawer
        open
        row={{
          action_state: null,
          resilience_score: null,
          opportunity_state: {
            resilience_pillars: { trend_integrity: 20 },
          },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText('20')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(10);
  });

  // Catches duplicate telemetry events across rerenders and an implicit dependency on a row symbol.
  it('notifies once for each closed-to-open transition without requiring a symbol', () => {
    const onEvidenceOpen = vi.fn();
    const rowWithoutSymbol = { ...OPPORTUNITY_ROW };
    const { rerender } = renderWithProviders(
      <OpportunityEvidenceDrawer open={false} row={rowWithoutSymbol} onClose={vi.fn()} onEvidenceOpen={onEvidenceOpen} />,
    );

    rerender(
      <OpportunityEvidenceDrawer open row={rowWithoutSymbol} onClose={vi.fn()} onEvidenceOpen={onEvidenceOpen} />,
    );
    rerender(
      <OpportunityEvidenceDrawer open row={rowWithoutSymbol} onClose={vi.fn()} onEvidenceOpen={onEvidenceOpen} />,
    );

    expect(onEvidenceOpen).toHaveBeenCalledTimes(1);
    expect(onEvidenceOpen).toHaveBeenCalledWith(rowWithoutSymbol);

    rerender(
      <OpportunityEvidenceDrawer open={false} row={rowWithoutSymbol} onClose={vi.fn()} onEvidenceOpen={onEvidenceOpen} />,
    );
    rerender(
      <OpportunityEvidenceDrawer open row={rowWithoutSymbol} onClose={vi.fn()} onEvidenceOpen={onEvidenceOpen} />,
    );

    expect(onEvidenceOpen).toHaveBeenCalledTimes(2);
  });

  it.each(['scan', 'daily', 'watchlist'])(
    'records one privacy-safe %s event per closed-to-open transition',
    (surface) => {
      const { rerender } = renderWithProviders(
        <OpportunityEvidenceDrawer
          open={false}
          row={OPPORTUNITY_ROW}
          onClose={vi.fn()}
          opportunityTelemetrySurface={surface}
        />,
      );

      rerender(
        <OpportunityEvidenceDrawer
          open
          row={OPPORTUNITY_ROW}
          onClose={vi.fn()}
          opportunityTelemetrySurface={surface}
        />,
      );
      rerender(
        <OpportunityEvidenceDrawer
          open
          row={OPPORTUNITY_ROW}
          onClose={vi.fn()}
          opportunityTelemetrySurface={surface}
        />,
      );

      expect(recordOpportunityEvidenceOpen).toHaveBeenCalledOnce();
      expect(recordOpportunityEvidenceOpen).toHaveBeenCalledWith('US', surface);
    },
  );

  // Catches static callers accidentally emitting live usage telemetry.
  it('does not record evidence telemetry when the live surface is omitted', () => {
    renderWithProviders(
      <OpportunityEvidenceDrawer open row={OPPORTUNITY_ROW} onClose={vi.fn()} />,
    );

    expect(recordOpportunityEvidenceOpen).not.toHaveBeenCalled();
  });
});
