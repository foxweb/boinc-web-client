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

const tooltipStyle = {
  background: '#fff',
  border: '1px solid rgba(16,42,51,0.1)',
  borderRadius: 10,
  fontSize: 12,
};

export function LiveUtilizationChart({ points }) {
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
              <stop offset="0%" stopColor="#0f8f86" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#0f8f86" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gpuFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d97706" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(16,42,51,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={40} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Area type="monotone" dataKey="cpuUtilization" name="CPU %" stroke="#0f8f86" fill="url(#cpuFill)" strokeWidth={2} />
          <Area type="monotone" dataKey="gpuUtilization" name="GPU %" stroke="#d97706" fill="url(#gpuFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActiveTasksChart({ points }) {
  const data = (points || []).map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }));
  if (!data.length) return <div className="empty">Нет точек истории активных задач</div>;

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(16,42,51,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          <Line type="monotone" dataKey="active" name="Активные" stroke="#0b3d4a" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="running" name="Выполняются" stroke="#0f8f86" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CreditHistoryChart({ statistics }) {
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

  // Aggregate by day across projects for a clean overview chart.
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
          <CartesianGrid stroke="rgba(16,42,51,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => formatNumber(v, 0)} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [formatNumber(value, 0), name]}
          />
          <Legend />
          <Bar dataKey="hostDelta" name="Δ кредит хоста / день" fill="#0f8f86" radius={[6, 6, 0, 0]} />
          <Line type="monotone" dataKey="hostExpavg" name="Средний кредит (RAC)" stroke="#d97706" strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TransferHistoryChart({ dailyXfers }) {
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
          <CartesianGrid stroke="rgba(16,42,51,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={(v) => formatBytes(v)} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [formatBytes(value), name]}
          />
          <Legend />
          <Area type="monotone" dataKey="down" name="Скачано" stroke="#0b3d4a" fill="rgba(11,61,74,0.18)" strokeWidth={2} />
          <Area type="monotone" dataKey="up" name="Отправлено" stroke="#0f8f86" fill="rgba(15,143,134,0.18)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DiskUsageChart({ disk }) {
  const projects = disk?.projects || [];
  if (!projects.length) return <div className="empty">Нет данных о диске</div>;
  const data = projects.map((p) => ({ name: p.name, usage: p.diskUsage }));

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid stroke="rgba(16,42,51,0.08)" horizontal={false} />
          <XAxis type="number" tickFormatter={(v) => formatBytes(v)} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatBytes(v)} />
          <Bar dataKey="usage" name="Диск" fill="#3dd6c6" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
