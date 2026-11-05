import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { RankTrendPoint, StudentSubmissionDetail } from '../shared/types';

interface RankTrendChartD3Props {
  result: StudentSubmissionDetail;
}

export const RankTrendChartD3: React.FC<RankTrendChartD3Props> = ({ result }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [simulateRevisedSheet, setSimulateRevisedSheet] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<RankTrendPoint | null>(null);

  const trendData: RankTrendPoint[] = useMemo(() => {
    const baseTrend: RankTrendPoint[] =
      result.rank_trend && result.rank_trend.length >= 2
        ? result.rank_trend
        : [
            {
              step_label: 'Initial Sheet Eval',
              event_type: 'initial_eval',
              overall_rank: Math.max(1, Math.round(result.overall_rank * 0.45)),
              shift_rank: Math.max(1, Math.round(result.shift_rank * 0.5)),
              total_candidates: Math.max(1, Math.round(result.total_candidates * 0.25)),
              score: result.score,
              key_version: 1,
              timestamp_label: `n=${Math.max(1, Math.round(result.total_candidates * 0.25))}`,
            },
            {
              step_label: '50% Cohort Sync',
              event_type: 'cohort_growth',
              overall_rank: Math.max(1, Math.round(result.overall_rank * 0.7)),
              shift_rank: Math.max(1, Math.round(result.shift_rank * 0.75)),
              total_candidates: Math.max(1, Math.round(result.total_candidates * 0.5)),
              score: result.score,
              key_version: result.answer_key_version_number,
              timestamp_label: `n=${Math.max(1, Math.round(result.total_candidates * 0.5))}`,
            },
            {
              step_label: '75% Cohort Sync',
              event_type: 'cohort_growth',
              overall_rank: Math.max(1, Math.round(result.overall_rank * 0.88)),
              shift_rank: Math.max(1, Math.round(result.shift_rank * 0.9)),
              total_candidates: Math.max(1, Math.round(result.total_candidates * 0.75)),
              score: result.score,
              key_version: result.answer_key_version_number,
              timestamp_label: `n=${Math.max(1, Math.round(result.total_candidates * 0.75))}`,
            },
            {
              step_label: 'Live Key Standing',
              event_type: 'current_live',
              overall_rank: result.overall_rank,
              shift_rank: result.shift_rank,
              total_candidates: result.total_candidates,
              score: result.score,
              key_version: result.answer_key_version_number,
              timestamp_label: `n=${result.total_candidates}`,
            },
          ];

    if (!simulateRevisedSheet) {
      return baseTrend;
    }

    const improvedOverallRank = Math.max(
      1,
      result.overall_rank - Math.max(1, Math.round(result.total_candidates * 0.06))
    );
    const improvedShiftRank = Math.max(1, result.shift_rank - 1);

    return [
      ...baseTrend,
      {
        step_label: 'Updated Sheet (+1.25)',
        event_type: 'key_revision',
        overall_rank: improvedOverallRank,
        shift_rank: improvedShiftRank,
        total_candidates: result.total_candidates,
        score: Number(Math.min(200, result.score + 1.25).toFixed(2)),
        key_version: result.answer_key_version_number + 1,
        timestamp_label: 'Revised Key',
      },
    ];
  }, [result, simulateRevisedSheet]);

  const firstPoint = trendData[0];
  const lastPoint = trendData[trendData.length - 1];
  const rankDelta = firstPoint.overall_rank - lastPoint.overall_rank; // positive = improved (moved closer to #1)

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl || trendData.length === 0) return;

    const width = 680;
    const height = 240;
    const margin = { top: 24, right: 36, bottom: 38, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const areaGradient = defs
      .append('linearGradient')
      .attr('id', 'rankTrendAreaGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    areaGradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#2563eb')
      .attr('stop-opacity', 0.25);

    areaGradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#2563eb')
      .attr('stop-opacity', 0.02);

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scalePoint<string>()
      .domain(trendData.map((d) => d.step_label))
      .range([0, innerWidth])
      .padding(0.2);

    const ranks = trendData.map((d) => d.overall_rank);
    const minRank = Math.max(1, (d3.min(ranks) || 1) - 2);
    const maxRank = Math.max(minRank + 4, (d3.max(ranks) || 10) + 2);

    // Inverted scale so Rank #1 is at the top of the chart
    const yScale = d3
      .scaleLinear()
      .domain([minRank, maxRank])
      .range([0, innerHeight]);

    // Horizontal grid lines
    const yTicks = yScale.ticks(4);
    g.selectAll('.grid-line')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', 0.22)
      .attr('stroke-dasharray', '3,3');

    // Y-axis labels (#Rank)
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(4)
      .tickFormat((d) => `#${Math.round(Number(d))}`);

    g.append('g')
      .call(yAxis)
      .call((sel) => sel.select('.domain').remove())
      .call((sel) => sel.selectAll('.tick line').remove())
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace');

    // X-axis labels
    const xAxis = d3.axisBottom(xScale);
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .call((sel) =>
        sel.select('.domain').attr('stroke', '#cbd5e1').attr('stroke-opacity', 0.5)
      )
      .call((sel) => sel.selectAll('.tick line').remove())
      .selectAll('text')
      .attr('fill', '#64748b')
      .attr('font-size', '11px')
      .attr('dy', '14px');

    // Area generator
    const areaGen = d3
      .area<RankTrendPoint>()
      .x((d) => xScale(d.step_label) || 0)
      .y0(innerHeight)
      .y1((d) => yScale(d.overall_rank))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(trendData)
      .attr('fill', 'url(#rankTrendAreaGradient)')
      .attr('d', areaGen);

    // Line generator
    const lineGen = d3
      .line<RankTrendPoint>()
      .x((d) => xScale(d.step_label) || 0)
      .y((d) => yScale(d.overall_rank))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(trendData)
      .attr('fill', 'none')
      .attr('stroke', '#2563eb')
      .attr('stroke-width', 2.75)
      .attr('d', lineGen);

    // Data nodes + labels
    const nodes = g
      .selectAll('.trend-node')
      .data(trendData)
      .enter()
      .append('g')
      .attr('class', 'trend-node')
      .attr(
        'transform',
        (d) => `translate(${xScale(d.step_label) || 0},${yScale(d.overall_rank)})`
      )
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => {
        setHoveredPoint(d);
      })
      .on('mouseleave', () => {
        setHoveredPoint(null);
      });

    nodes
      .append('circle')
      .attr('r', (d) => (d.event_type === 'key_revision' ? 6.5 : 5.5))
      .attr('fill', (d) =>
        d.event_type === 'key_revision' ? '#10b981' : '#1d4ed8'
      )
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2);

    nodes
      .append('text')
      .attr('y', -11)
      .attr('text-anchor', 'middle')
      .attr('fill', (d) =>
        d.event_type === 'key_revision' ? '#10b981' : '#1e293b'
      )
      .attr('class', 'dark:fill-slate-200')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => `#${d.overall_rank}`);
  }, [trendData]);

  const activePoint = hoveredPoint || lastPoint;

  return (
    <section
      ref={containerRef}
      aria-label="Rank Trend Trajectory"
      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Rank Trend & Key Revision Trajectory (D3)
            </h2>
            <span
              className={`px-2 py-0.5 text-[11px] font-mono tabular-nums font-semibold rounded-md flex items-center gap-1 ${
                rankDelta >= 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
              }`}
            >
              {rankDelta >= 0 ? (
                <>
                  <TrendingUp className="w-3 h-3" />
                  <span>
                    {rankDelta > 0
                      ? `+${rankDelta} Rank Gain`
                      : 'Stable Top Standing'}
                  </span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-3 h-3" />
                  <span>Cohort Expansion ({Math.abs(rankDelta)} pos)</span>
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tracks how your dense rank shifts as new candidates join or when your response sheet / shift key updates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSimulateRevisedSheet((prev) => !prev)}
          className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
            simulateRevisedSheet
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-500'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {simulateRevisedSheet
              ? 'Showing Revised Sheet (+1.25 Marks)'
              : 'Preview Sheet / Key Update (+1.25)'}
          </span>
        </button>
      </div>

      {/* D3 SVG Canvas */}
      <div className="w-full overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox="0 0 680 240"
          className="w-full h-56 select-none"
          role="img"
          aria-label="D3 Rank Trend Chart"
        />
      </div>

      {/* Live Snapshot Telemetry Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
        <div className="p-3 bg-slate-50/80 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-xl">
          <div className="text-slate-400">Selected Milestone</div>
          <div className="font-bold text-slate-900 dark:text-white mt-0.5">
            {activePoint.step_label}
          </div>
        </div>
        <div className="p-3 bg-slate-50/80 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-xl">
          <div className="text-slate-400">Overall Standing</div>
          <div className="font-mono tabular-nums font-bold text-blue-700 dark:text-blue-400 mt-0.5">
            #{activePoint.overall_rank} / {activePoint.total_candidates}
          </div>
        </div>
        <div className="p-3 bg-slate-50/80 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-xl">
          <div className="text-slate-400">Shift {result.shift_number} Rank</div>
          <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-white mt-0.5">
            #{activePoint.shift_rank}
          </div>
        </div>
        <div className="p-3 bg-slate-50/80 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 rounded-xl">
          <div className="text-slate-400">Evaluated Marks</div>
          <div className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
            {activePoint.score.toFixed(2)} (Key v{activePoint.key_version})
          </div>
        </div>
      </div>
    </section>
  );
};
