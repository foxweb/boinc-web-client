import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActiveTasksChart,
  CreditHistoryChart,
  DiskUsageChart,
  LiveUtilizationChart,
  TransferHistoryChart,
} from './Charts';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatNumber,
  formatPercent,
  projectLabel,
  shortTaskName,
} from './format';

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'projects', label: 'Проекты' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'charts', label: 'Графики' },
  { id: 'transfers', label: 'Передачи' },
  { id: 'messages', label: 'Сообщения' },
  { id: 'host', label: 'Хост' },
];

function taskStatus(r) {
  if (r.active && r.activeTaskState === 1) return { label: 'Выполняется', cls: 'badge' };
  if (r.active) return { label: 'Приостановлена', cls: 'badge warn' };
  if (r.state === 2) return { label: 'Готова к запуску', cls: 'badge idle' };
  if (r.state === 5) return { label: 'Готова к отправке', cls: 'badge' };
  return { label: `Состояние ${r.state}`, cls: 'badge idle' };
}

export default function App() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState({ host: '192.168.1.45', port: 31416, password: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);

  const load = useCallback(async (refresh = false) => {
    try {
      const res = await fetch(`/api/overview${refresh ? '?refresh=1' : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Ошибка загрузки');
      setData(json);
      setError(json.lastError?.message || null);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setCfg((prev) => ({ ...prev, host: c.host, port: c.port })))
      .catch(() => {});
    load(true);
    const id = setInterval(() => load(false), 5000);
    return () => clearInterval(id);
  }, [load]);

  const saveConfig = async (e) => {
    e.preventDefault();
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    setLoading(true);
    setSettingsOpen(false);
    await load(true);
  };

  const projects = data?.projects || [];
  const results = data?.results || [];
  const activeResults = useMemo(() => results.filter((r) => r.active), [results]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1 className="brand">
            BOINC <span>Monitor</span>
          </h1>
          <p className="tagline">
            Локальный веб-клиент статистики и графиков через GUI RPC API.
          </p>
        </div>
        <div className="conn">
          <div className={`pill`}>
            <span className={`dot ${error && !data ? 'err' : ''}`} />
            {data?.endpoint?.socket
              ? 'unix-socket → BOINC'
              : data?.endpoint
              ? `${data.endpoint.host}:${data.endpoint.port}`
              : `${cfg.host}:${cfg.port}`}
            {data?.version ? ` · v${data.version}` : ''}
          </div>
          <div className="conn-actions">
            <button
              className={`icon-btn ${settingsOpen ? 'active' : ''}`}
              type="button"
              aria-label="Настройки"
              aria-expanded={settingsOpen}
              title="Настройки"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.22-1.14.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.7a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.49.41 1.04.72 1.63.94l.36 2.54c.05.24.26.42.5.42h3.8c.24 0 .45-.18.5-.42l.36-2.54c.59-.22 1.14-.53 1.63-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                />
              </svg>
            </button>
            <button className="refresh-btn" type="button" onClick={() => load(true)}>
              Обновить
            </button>
          </div>
        </div>
      </header>

      {settingsOpen && (
        <form className="panel settings" onSubmit={saveConfig}>
          <label>
            Хост
            <input
              value={cfg.host}
              onChange={(e) => setCfg({ ...cfg, host: e.target.value })}
              placeholder="192.168.1.45"
            />
          </label>
          <label>
            Порт
            <input
              value={cfg.port}
              onChange={(e) => setCfg({ ...cfg, port: e.target.value })}
              placeholder="31416"
            />
          </label>
          <label>
            Пароль GUI RPC
            <input
              type="password"
              value={cfg.password}
              onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
              placeholder="оставьте пустым, чтобы не менять"
            />
          </label>
          <button type="submit">Подключить</button>
        </form>
      )}

      {error && <div className="error-banner">{error}</div>}

      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && !data ? (
        <div className="panel empty">Подключение к BOINC…</div>
      ) : !data ? (
        <div className="panel empty">Нет данных. Проверьте хост и пароль.</div>
      ) : (
        <>
          {tab === 'overview' && (
            <>
              <section className="hero-metrics">
                <div className="metric">
                  <div className="label">Активные задачи</div>
                  <div className="value">{data.derived.runningCount}/{data.derived.activeCount}</div>
                  <div className="hint">выполняются / всего активных</div>
                </div>
                <div className="metric">
                  <div className="label">CPU утилизация</div>
                  <div className="value">{formatNumber(data.derived.cpuUtilization, 0)}%</div>
                  <div className="hint">
                    {data.derived.cpuBusy} из {data.host.ncpus} ядер
                  </div>
                </div>
                <div className="metric">
                  <div className="label">Кредит хоста (RAC)</div>
                  <div className="value">{formatNumber(data.derived.totalHostAvg, 0)}</div>
                  <div className="hint">всего {formatNumber(data.derived.totalHostCredit, 0)}</div>
                </div>
                <div className="metric">
                  <div className="label">Оценка GFLOPS</div>
                  <div className="value">{formatNumber(data.derived.currentGflops, 1)}</div>
                  <div className="hint">пик CPU {formatNumber(data.derived.estGflops, 1)} GFLOPS</div>
                </div>
              </section>

              <div className="grid-2">
                <div className="panel">
                  <h2>Утилизация в реальном времени</h2>
                  <LiveUtilizationChart points={data.liveHistory} />
                </div>
                <div className="panel">
                  <h2>Хост</h2>
                  <div className="detail-grid">
                    <div className="kv">
                      <div className="k">Имя</div>
                      <div className="v">{data.host.domainName}</div>
                    </div>
                    <div className="kv">
                      <div className="k">ОС</div>
                      <div className="v">
                        {data.host.osName} {data.host.osVersion}
                      </div>
                    </div>
                    <div className="kv">
                      <div className="k">CPU</div>
                      <div className="v">{data.host.model}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Память</div>
                      <div className="v">{formatBytes(data.host.memBytes)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Режим задач</div>
                      <div className="v">{data.status.taskMode}</div>
                    </div>
                    <div className="kv">
                      <div className="k">GPU</div>
                      <div className="v">
                        {data.host.gpus?.length
                          ? data.host.gpus.map((g) => `${g.name}×${g.count}`).join(', ')
                          : 'нет'}
                        {data.derived.gpuUtilization != null
                          ? ` · ${formatNumber(data.derived.gpuUtilization, 0)}%`
                          : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid-2">
                <div className="panel">
                  <h2>Активные задачи</h2>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Задача</th>
                          <th>Проект</th>
                          <th>Прогресс</th>
                          <th>Осталось</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeResults.slice(0, 8).map((r) => (
                          <tr key={r.name}>
                            <td>{shortTaskName(r.name)}</td>
                            <td>{projectLabel(r.projectUrl, projects)}</td>
                            <td>
                              <div className="mono">{formatPercent(r.fractionDone)}</div>
                              <div className="bar">
                                <span style={{ width: `${Math.min(100, r.fractionDone * 100)}%` }} />
                              </div>
                            </td>
                            <td className="mono">{formatDuration(r.estimatedCpuTimeRemaining)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="panel">
                  <h2>Диск</h2>
                  <div className="detail-grid" style={{ marginBottom: '0.75rem' }}>
                    <div className="kv">
                      <div className="k">Свободно</div>
                      <div className="v">{formatBytes(data.disk.free)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Всего</div>
                      <div className="v">{formatBytes(data.disk.total)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Лимит BOINC</div>
                      <div className="v">{formatBytes(data.disk.allowed)}</div>
                    </div>
                  </div>
                  <DiskUsageChart disk={data.disk} />
                </div>
              </div>
            </>
          )}

          {tab === 'projects' && (
            <div className="grid-2">
              <div className="panel">
                <h2>Проекты</h2>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Проект</th>
                        <th>RAC хоста</th>
                        <th>Всего</th>
                        <th>Задачи</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr
                          key={p.masterUrl}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedProject(p)}
                        >
                          <td>
                            {p.name}
                            {p.suspended ? <span className="badge warn">pause</span> : null}
                          </td>
                          <td className="mono">{formatNumber(p.hostExpavgCredit, 0)}</td>
                          <td className="mono">{formatNumber(p.hostTotalCredit, 0)}</td>
                          <td className="mono">
                            {p.njobsSuccess}/{p.njobsError}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="panel">
                <h2>Детали проекта</h2>
                {!selectedProject ? (
                  <div className="empty">Выберите проект слева</div>
                ) : (
                  <div className="detail-grid">
                    <div className="kv">
                      <div className="k">Название</div>
                      <div className="v">{selectedProject.name}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Пользователь</div>
                      <div className="v">{selectedProject.userName}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Команда</div>
                      <div className="v">{selectedProject.teamName || '—'}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Доля ресурса</div>
                      <div className="v">{formatNumber(selectedProject.resourceShare, 0)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Кредит пользователя</div>
                      <div className="v">{formatNumber(selectedProject.userTotalCredit, 0)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">RAC пользователя</div>
                      <div className="v">{formatNumber(selectedProject.userExpavgCredit, 0)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Время на проекте</div>
                      <div className="v">{formatDuration(selectedProject.elapsedTime)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Последний RPC</div>
                      <div className="v">{formatDate(selectedProject.lastRpcTime * 1000)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">URL</div>
                      <div className="v">
                        <a href={selectedProject.masterUrl} target="_blank" rel="noreferrer">
                          {selectedProject.masterUrl}
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="grid-2">
              <div className="panel">
                <h2>Результаты / задачи ({results.length})</h2>
                <div className="table-wrap" style={{ maxHeight: 560 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Имя</th>
                        <th>Статус</th>
                        <th>%</th>
                        <th>Дедлайн</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => {
                        const st = taskStatus(r);
                        return (
                          <tr
                            key={r.name}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedTask(r)}
                          >
                            <td>
                              <div>{shortTaskName(r.name)}</div>
                              <div className="muted">{projectLabel(r.projectUrl, projects)}</div>
                            </td>
                            <td>
                              <span className={st.cls}>{st.label}</span>
                            </td>
                            <td className="mono">{r.active ? formatPercent(r.fractionDone) : '—'}</td>
                            <td className="mono">{formatDate(r.reportDeadline * 1000)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="panel">
                <h2>Детали задачи</h2>
                {!selectedTask ? (
                  <div className="empty">Выберите задачу слева</div>
                ) : (
                  <div className="detail-grid">
                    <div className="kv">
                      <div className="k">Имя</div>
                      <div className="v">{selectedTask.name}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Workunit</div>
                      <div className="v">{selectedTask.wuName}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Plan class</div>
                      <div className="v">{selectedTask.planClass || '—'}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Прогресс</div>
                      <div className="v">{formatPercent(selectedTask.fractionDone)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">CPU время</div>
                      <div className="v">{formatDuration(selectedTask.currentCpuTime)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Elapsed</div>
                      <div className="v">{formatDuration(selectedTask.elapsedTime)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">Осталось</div>
                      <div className="v">{formatDuration(selectedTask.estimatedCpuTimeRemaining)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">RSS</div>
                      <div className="v">{formatBytes(selectedTask.workingSetSize)}</div>
                    </div>
                    <div className="kv">
                      <div className="k">PID / slot</div>
                      <div className="v">
                        {selectedTask.pid ?? '—'} / {selectedTask.slot ?? '—'}
                      </div>
                    </div>
                    <div className="kv">
                      <div className="k">Получена</div>
                      <div className="v">{formatDate(selectedTask.receivedTime * 1000)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'charts' && (
            <>
              <div className="grid-2">
                <div className="panel">
                  <h2>Кредиты по дням</h2>
                  <p className="muted">Δ host credit и RAC из get_statistics</p>
                  <CreditHistoryChart statistics={data.statistics} />
                </div>
                <div className="panel">
                  <h2>Активные задачи (live)</h2>
                  <ActiveTasksChart points={data.liveHistory} />
                </div>
              </div>
              <div className="grid-2">
                <div className="panel">
                  <h2>CPU / GPU утилизация</h2>
                  <LiveUtilizationChart points={data.liveHistory} />
                </div>
                <div className="panel">
                  <h2>Сетевой трафик</h2>
                  <TransferHistoryChart dailyXfers={data.dailyXfers} />
                </div>
              </div>
            </>
          )}

          {tab === 'transfers' && (
            <div className="panel">
              <h2>Текущие передачи файлов</h2>
              {!data.transfers?.length ? (
                <div className="empty">Сейчас нет активных передач</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Файл</th>
                        <th>Проект</th>
                        <th>Направление</th>
                        <th>Прогресс</th>
                        <th>Скорость</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transfers.map((t) => (
                        <tr key={`${t.projectUrl}-${t.name}`}>
                          <td>{shortTaskName(t.name)}</td>
                          <td>{t.projectName || projectLabel(t.projectUrl, projects)}</td>
                          <td>{t.isUpload ? 'upload' : 'download'}</td>
                          <td className="mono">
                            {formatBytes(t.bytesXferred)} / {formatBytes(t.nbytes || t.maxNbytes)}
                          </td>
                          <td className="mono">{formatBytes(t.xferSpeed)}/s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <h2 style={{ marginTop: '1.25rem' }}>История трафика</h2>
              <TransferHistoryChart dailyXfers={data.dailyXfers} />
            </div>
          )}

          {tab === 'messages' && (
            <div className="panel">
              <h2>Сообщения клиента</h2>
              <div className="msg-list">
                {(data.messages || []).map((m) => (
                  <div className="msg" key={m.seqno}>
                    <div className="meta">
                      <span>
                        #{m.seqno}
                        {m.project ? ` · ${m.project}` : ''}
                      </span>
                      <span>{formatDate(m.time)}</span>
                    </div>
                    <div className="body">{m.body}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'host' && (
            <div className="grid-2">
              <div className="panel">
                <h2>Железо и ОС</h2>
                <div className="detail-grid">
                  <div className="kv">
                    <div className="k">Hostname</div>
                    <div className="v">{data.host.domainName}</div>
                  </div>
                  <div className="kv">
                    <div className="k">IP (клиент)</div>
                    <div className="v">{data.host.ipAddr}</div>
                  </div>
                  <div className="kv">
                    <div className="k">CPID</div>
                    <div className="v">{data.host.hostCpid}</div>
                  </div>
                  <div className="kv">
                    <div className="k">CPU</div>
                    <div className="v">
                      {data.host.vendor} · {data.host.ncpus} cores
                    </div>
                  </div>
                  <div className="kv">
                    <div className="k">Модель</div>
                    <div className="v">{data.host.model}</div>
                  </div>
                  <div className="kv">
                    <div className="k">FPOPS</div>
                    <div className="v">{formatNumber(data.host.fpops, 0)}</div>
                  </div>
                  <div className="kv">
                    <div className="k">RAM / Swap</div>
                    <div className="v">
                      {formatBytes(data.host.memBytes)} / {formatBytes(data.host.swapBytes)}
                    </div>
                  </div>
                  <div className="kv">
                    <div className="k">Диск</div>
                    <div className="v">
                      {formatBytes(data.host.diskFree)} свободно из {formatBytes(data.host.diskTotal)}
                    </div>
                  </div>
                  <div className="kv">
                    <div className="k">ОС</div>
                    <div className="v">
                      {data.host.osName} {data.host.osVersion}
                    </div>
                  </div>
                </div>
              </div>
              <div className="panel">
                <h2>Режимы CC</h2>
                <div className="detail-grid">
                  <div className="kv">
                    <div className="k">Задачи</div>
                    <div className="v">{data.status.taskMode}</div>
                  </div>
                  <div className="kv">
                    <div className="k">GPU</div>
                    <div className="v">{data.status.gpuMode}</div>
                  </div>
                  <div className="kv">
                    <div className="k">Сеть</div>
                    <div className="v">{data.status.networkMode}</div>
                  </div>
                  <div className="kv">
                    <div className="k">Suspend reasons</div>
                    <div className="v">
                      task {data.status.taskSuspendReason} / gpu {data.status.gpuSuspendReason} /
                      net {data.status.networkSuspendReason}
                    </div>
                  </div>
                </div>
                <h3 style={{ marginTop: '1rem' }}>GPU</h3>
                {!data.host.gpus?.length ? (
                  <p className="muted">GPU не обнаружены через get_host_info</p>
                ) : (
                  data.host.gpus.map((g) => (
                    <div key={g.type} className="msg" style={{ marginTop: '0.5rem' }}>
                      <strong>{g.name}</strong>
                      <div className="muted">
                        type {g.type} · count {g.count} · peak {formatNumber(g.peakFlops / 1e9, 1)}{' '}
                        GFLOPS
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
