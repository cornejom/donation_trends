import React, { useState } from 'react';
import { DonorTrendSummary, TrendMetric, TrendCalculationModel } from '../types';

interface RunChartProps {
  summary: DonorTrendSummary;
  trendMetric: TrendMetric;
  model: TrendCalculationModel;
}

export const RunChart: React.FC<RunChartProps> = ({ summary, trendMetric, model }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const points = summary.monthlyPoints;
  if (!points || points.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-500">
        No monthly points available in this analysis window.
      </div>
    );
  }

  // Dimensions
  const width = 800;
  const height = 240;
  const padding = { top: 24, right: 148, bottom: 44, left: 68 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Max amount across months for scaling
  const maxAmount = Math.max(...points.map((p) => p.amount), 10);
  // Give 15% headroom
  const yMax = Math.ceil((maxAmount * 1.15) / 50) * 50 || 100;
  const yMin = 0;

  // Coordinate mappers
  const n = points.length;
  const getX = (index: number) => {
    if (n === 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (n - 1)) * chartWidth;
  };

  const getY = (amount: number) => {
    const clamped = Math.max(yMin, Math.min(yMax, amount));
    return padding.top + chartHeight - ((clamped - yMin) / (yMax - yMin)) * chartHeight;
  };

  // Trendline parameters based on active calculation model
  let activeSlope = summary.slopeDollar;
  let activeIntercept = summary.interceptDollar;
  let activePropSlope = summary.slopeProportional;

  if (model === 'theilSen') {
    activeSlope = summary.theilSenSlope;
    activeIntercept = summary.theilSenIntercept;
    activePropSlope = summary.theilSenProportional;
  } else if (model === 'windowShift') {
    // Window shift difference between 2nd half and 1st half
    activeSlope = summary.windowShiftDollar;
    activePropSlope = summary.windowShiftProportional;
    const mid = Math.floor(n / 2);
    const mid1 = (mid - 1) / 2;
    const mid2 = mid + (n - 1 - mid) / 2;
    const dx = mid2 - mid1;
    const effectiveSlope = dx > 0 ? summary.windowShiftDollar / dx : 0;
    activeIntercept = summary.averageMonthly - effectiveSlope * ((n - 1) / 2);
  }

  // Trendline coordinates based on active model (y = slope * x + intercept)
  const xStart = getX(0);
  const xEnd = getX(n - 1);
  const yValStart = activeIntercept;
  const yValEnd = activeIntercept + (model === 'windowShift' && n >= 2 ? ((activeSlope) / (Math.max(1, (Math.floor(n / 2) + (n - 1 - Math.floor(n / 2)) / 2) - ((Math.floor(n / 2) - 1) / 2)))) * (n - 1) : activeSlope * (n - 1));
  const yStart = getY(yValStart);
  const yEnd = getY(yValEnd);

  // Y-axis tick intervals (4 steps)
  const yTicks = [0, yMax * 0.33, yMax * 0.66, yMax];

  // Formatting helpers
  const formatDollar = (val: number) =>
    `$${val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const slopeDollarDisplay = `${activeSlope >= 0 ? '+' : ''}$${activeSlope.toFixed(2)}/mo`;
  const slopePropDisplay = `${activePropSlope >= 0 ? '+' : ''}${activePropSlope.toFixed(1)}%/mo`;

  const isPositive = activeSlope > 0.01;
  const isNegative = activeSlope < -0.01;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 transition-all">
      {/* Header Metric Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-200/80 text-xs">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-slate-600 block text-[11px]">Total in Window</span>
            <span className="font-mono font-semibold text-sm text-slate-900 tabular-nums">
              ${summary.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-slate-600 block text-[11px]">Monthly Average</span>
            <span className="font-mono font-semibold text-sm text-slate-900 tabular-nums">
              ${summary.averageMonthly.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-slate-600 block text-[11px]">Active Giving Months</span>
            <span className="font-mono font-semibold text-sm text-slate-900 tabular-nums">
              {summary.activeMonthsCount} of {points.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-slate-600 block text-[11px]">
              {model === 'ols' ? 'OLS Linear Slope' : model === 'theilSen' ? 'Theil-Sen Median Slope' : 'Window Shift'}
            </span>
            <span
              className={`font-mono font-bold text-sm tabular-nums ${
                isPositive ? 'text-emerald-700' : isNegative ? 'text-rose-600' : 'text-slate-700'
              }`}
            >
              {trendMetric === 'dollar' ? slopeDollarDisplay : slopePropDisplay}
            </span>
          </div>
          <div className="text-right pl-3 border-l border-slate-200">
            <span className="text-slate-600 block text-[11px]">Secondary Rate</span>
            <span className="font-mono text-xs text-slate-700 tabular-nums">
              {trendMetric === 'dollar' ? slopePropDisplay : slopeDollarDisplay}
            </span>
          </div>
        </div>
      </div>

      {/* Disconnected SVG Run Chart */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[540px] select-none"
          role="img"
          aria-label={`Monthly run chart for ${summary.household.displayName}`}
        >
          {/* Background gridlines */}
          {yTicks.map((tickVal, i) => {
            const yPos = getY(tickVal);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={yPos}
                  x2={width - padding.right}
                  y2={yPos}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                  strokeDasharray={tickVal === 0 ? undefined : '3,3'}
                />
                <text
                  x={padding.left - 10}
                  y={yPos + 4}
                  textAnchor="end"
                  className="text-[11px] font-mono fill-slate-600"
                >
                  {formatDollar(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Fitted Linear Trendline Overlay */}
          {n >= 2 && (
            <g>
              <line
                x1={xStart}
                y1={yStart}
                x2={xEnd}
                y2={yEnd}
                stroke={isPositive ? '#059669' : isNegative ? '#E11D48' : '#64748B'}
                strokeWidth="2"
                strokeDasharray="6,4"
                opacity="0.85"
              />
              {/* Trendline end label */}
              <text
                x={xEnd + 8}
                y={Math.max(padding.top + 6, Math.min(height - padding.bottom - 4, yEnd + 1))}
                textAnchor="start"
                dominantBaseline="middle"
                className={`text-[10px] font-mono font-medium select-none ${
                  isPositive ? 'fill-emerald-700' : isNegative ? 'fill-rose-600' : 'fill-slate-600'
                }`}
              >
                {model === 'theilSen' ? 'robust median slope' : model === 'windowShift' ? 'window shift' : 'trend'}
              </text>
            </g>
          )}

          {/* DISCONNECTED MONTHLY POINTS (No connecting line segments per explicit instruction) */}
          {points.map((pt, idx) => {
            const cx = getX(idx);
            const cy = getY(pt.amount);
            const isZero = pt.amount === 0;
            const isHovered = hoveredIndex === idx;

            return (
              <g
                key={pt.monthKey}
                className="cursor-pointer transition-transform"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Vertical drop guide on hover */}
                {isHovered && (
                  <line
                    x1={cx}
                    y1={padding.top}
                    x2={cx}
                    y2={padding.top + chartHeight}
                    stroke="#94A3B8"
                    strokeWidth="1"
                    strokeDasharray="2,2"
                  />
                )}

                {/* Outer halo on hover */}
                {isHovered && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="9"
                    fill={isZero ? '#CBD5E1' : '#0F172A'}
                    opacity="0.15"
                  />
                )}

                {/* Point dot marker */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={isHovered ? 6 : isZero ? 4 : 5}
                  fill={isZero ? '#F8FAFC' : '#0F172A'}
                  stroke={isZero ? '#94A3B8' : '#0F172A'}
                  strokeWidth={isZero ? '1.5' : '2'}
                />

                {/* X-axis Month Label */}
                <text
                  x={cx}
                  y={height - padding.bottom + 20}
                  textAnchor="middle"
                  className={`text-[11px] font-mono ${
                    isHovered ? 'fill-slate-900 font-semibold' : 'fill-slate-600'
                  }`}
                >
                  {pt.monthLabel}
                </text>

                {/* Point Amount label right below/above point if hovered */}
                {isHovered && (
                  <g>
                    <rect
                      x={cx - 42}
                      y={cy - 34}
                      width="84"
                      height="24"
                      rx="4"
                      fill="#0F172A"
                      className="shadow-md"
                    />
                    <text
                      x={cx}
                      y={cy - 18}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      className="text-[11px] font-mono font-medium tabular-nums"
                    >
                      ${pt.amount.toFixed(2)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Interactive Tooltip Card & Footnote */}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 inline-block"></span>
            <span>Monthly Giving Point</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-white inline-block"></span>
            <span>$0 / Inactive Month</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block"></span>
            <span>Fitted Trendline</span>
          </div>
        </div>

        <span className="italic text-[11px] text-slate-600">
          Points are disconnected to preserve discrete monthly giving intervals.
        </span>
      </div>
    </div>
  );
};
