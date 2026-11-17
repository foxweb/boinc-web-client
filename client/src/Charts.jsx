import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBytes, formatDay, formatNumber } from './format';

function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function useChartTheme() {
  const [theme, setTheme] = useState(() => ({
    grid: 'rgba(16,42,51,0.08)',
    accent: '#0f8f86',
    accentDeep: '#0b3d4a',
    warm: '#d97706',
    bright: '#3dd6c6',
    tooltip: {
      background: '#fff',
      border: '1px solid rgba(16,42,51,0.1)',
      borderRadius: 10,
      fontSize: 12,
      color: '#102a33',
    },
  }));

  useEffect(() => {
    const sync = () => {
      setTheme({
        grid: cssVar('--chart-grid', 'rgba(16,42,51,0.08)'),
        accent: cssVar('--accent', '#0f8f86'),
        accentDeep: cssVar('--accent-deep', '#0b3d4a'),
        warm: cssVar('--warm', '#d97706'),
        bright: cssVar('--accent-bright', '#3dd6c6'),
        tooltip: {
          background: cssVar('--chart-tooltip-bg', '#fff'),
          border: `1px solid ${cssVar('--chart-tooltip-border', 'rgba(16,42,51,0.1)')}`,
          borderRadius: 10,
          fontSize: 12,
          color: cssVar('--chart-tooltip-fg', '#102a33'),
        },
      });
    };
    sync();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return theme;
}

export function LiveUtilizationChart({ points }) {
  const theme = useChartTheme();
  const data = (points || []).map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }));

  if (!data.length) {
    return <div className="empty">Сэмплы утилизации появятся через несколько секунд…</div>;
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.accent} stopOpacity={0.45} />
              <stop offset="100%" stopColor={theme.accent} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gpuFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.warm} stopOpacity={0.4} />
              <stop offset="100%" stopColor={theme.warm} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.tooltip.color }} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: theme.tooltip.color }} unit="%" width={40} />
          <Tooltip contentStyle={theme.tooltip} />
          <Legend />
          <Area type="monotone" dataKey="cpuUtilization" name="CPU %" stroke={theme.accent} fill="url(#cpuFill)" strokeWidth={2} />
          <Area type="monotone" dataKey="gpuUtilization" name="GPU %" stroke={theme.warm} fill="url(#gpuFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActiveTasksChart({ points }) {
  const theme = useChartTheme();
  const data = (points || []).map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }));
  if (!data.length) return <div className="empty">Нет точек истории активных задач</div>;

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.tooltip.color }} minTickGap={40} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.tooltip.color }} width={30} />
          <Tooltip contentStyle={theme.tooltip} />
          <Legend />
          <Line type="monotone" dataKey="active" name="Активные" stroke={theme.accentDeep} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="running" name="Выполняются" stroke={theme.accent} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CreditHistoryChart({ statistics }) {
  const theme = useChartTheme();
  const series = (statistics || []).flatMap((project) =>
    (project.daily || []).map((d) => ({
      day: d.day,
      label: formatDay(d.day),
      project: project.name,
      hostExpavg: d.hostExpavgCredit,
      hostDelta: d.hostCreditDelta,
      hostTotal: d.hostTotalCredit,
    })),
  );

  const byDay = new Map();
  for (const row of series) {
    const key = row.day;
    const cur = byDay.get(key) || { day: row.day, label: row.label, hostExpavg: 0, hostDelta: 0, hostTotal: 0 };
    cur.hostExpavg += row.hostExpavg;
    cur.hostDelta += row.hostDelta;
    cur.hostTotal += row.hostTotal;
    byDay.set(key, cur);
  }
  const data = [...byDay.values()].sort((a, b) => a.day - b.day);

  if (!data.length) return <div className="empty">Нет статистики кредитов</div>;

  return (
    <div className="chart-box tall">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.tooltip.color }} />
          <YAxis tick={{ fontSize: 11, fill: theme.tooltip.color }} width={56} tickFormatter={(v) => formatNumber(v, 0)} />
          <Tooltip
            contentStyle={theme.tooltip}
            formatter={(value, name) => [formatNumber(value, 0), name]}
          />
          <Legend />
          <Bar dataKey="hostDelta" name="Δ кредит хоста / день" fill={theme.accent} radius={[6, 6, 0, 0]} />
          <Line type="monotone" dataKey="hostExpavg" name="Средний кредит (RAC)" stroke={theme.warm} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TransferHistoryChart({ dailyXfers }) {
  const theme = useChartTheme();
  const data = (dailyXfers || []).slice(-30).map((d) => ({
    label: formatDay(d.dayMs),
    up: d.up,
    down: d.down,
  }));
  if (!data.length) return <div className="empty">Нет истории передач</div>;

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.tooltip.color }} />
          <YAxis tick={{ fontSize: 11, fill: theme.tooltip.color }} width={64} tickFormatter={(v) => formatBytes(v)} />
          <Tooltip
            contentStyle={theme.tooltip}
            formatter={(value, name) => [formatBytes(value), name]}
          />
          <Legend />
          <Area type="monotone" dataKey="down" name="Скачано" stroke={theme.accentDeep} fill={`${theme.accentDeep}2e`} strokeWidth={2} />
          <Area type="monotone" dataKey="up" name="Отправлено" stroke={theme.accent} fill={`${theme.accent}2e`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DiskUsageChart({ disk }) {
  const theme = useChartTheme();
  const projects = disk?.projects || [];
  if (!projects.length) return <div className="empty">Нет данных о диске</div>;
  const data = projects.map((p) => ({ name: p.name, usage: p.diskUsage }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid stroke={theme.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => formatBytes(v)} tick={{ fontSize: 11, fill: theme.tooltip.color }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: theme.tooltip.color }} />
          <Tooltip contentStyle={theme.tooltip} formatter={(v) => formatBytes(v)} />
          <Bar dataKey="usage" name="Диск" fill={theme.bright} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
