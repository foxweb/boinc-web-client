import net from 'node:net';
import crypto from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const EOT = Buffer.from([0x03]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) =>
    [
      'project',
      'result',
      'file_transfer',
      'msg',
      'daily_statistics',
      'dx',
      'gui_url',
      'rsc_backoff_time',
      'rsc_backoff_interval',
      'notice',
      'app',
      'app_version',
      'workunit',
    ].includes(name),
  cdataPropName: '__cdata',
  trimValues: true,
  // Keep values as strings: BOINC auth nonces must not lose trailing digits via Number().
  parseTagValue: false,
});

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'object' && value.__cdata != null) return String(value.__cdata).trim();
  return String(value).trim();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boolFlag(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

export class BoincClient {
  constructor({ host, port, password, socketPath = null, timeoutMs = 8000 }) {
    this.host = host;
    this.port = port;
    this.password = password;
    this.socketPath = socketPath || null;
    this.timeoutMs = timeoutMs;
  }

  async request(innerXml) {
    const socket = await this.#connect();
    try {
      await this.#authorize(socket);
      return await this.#rpc(socket, innerXml);
    } finally {
      socket.destroy();
    }
  }

  async getOverview() {
    const [
      version,
      hostInfo,
      ccStatus,
      projects,
      results,
      transfers,
      disk,
      statistics,
      dailyXfers,
      messages,
    ] = await Promise.all([
      this.request('<exchange_versions><major>1</major><minor>0</minor><release>0</release></exchange_versions>'),
      this.request('<get_host_info/>'),
      this.request('<get_cc_status/>'),
      this.request('<get_project_status/>'),
      this.request('<get_results/>'),
      this.request('<get_file_transfers/>'),
      this.request('<get_disk_usage/>'),
      this.request('<get_statistics/>'),
      this.request('<get_daily_xfer_history/>'),
      this.request('<get_messages><seqno>0</seqno></get_messages>'),
    ]);

    const host = this.#normalizeHost(hostInfo?.host_info);
    const status = this.#normalizeCcStatus(ccStatus?.cc_status);
    const projectList = this.#normalizeProjects(projects?.projects?.project);
    const resultList = this.#normalizeResults(results?.results?.result);
    const transferList = this.#normalizeTransfers(transfers?.file_transfers?.file_transfer);
    const diskUsage = this.#normalizeDisk(disk?.disk_usage_summary, projectList);
    const stats = this.#normalizeStatistics(statistics?.statistics?.project_statistics, projectList);
    const xferHistory = this.#normalizeDailyXfers(dailyXfers?.daily_xfers?.dx);
    const messageList = this.#normalizeMessages(messages?.msgs?.msg).slice(-80).reverse();

    const active = resultList.filter((r) => r.active);
    const running = active.filter((r) => r.activeTaskState === 1);
    const cpuBusy = running.filter((r) => !r.usesGpu).length;
    const gpuBusy = running.filter((r) => r.usesGpu).length;
    const ncpus = host.ncpus || 1;
    const cpuUtilization = Math.min(100, (cpuBusy / ncpus) * 100);
    const gpuUtilization = host.gpuCount > 0 ? Math.min(100, (gpuBusy / host.gpuCount) * 100) : null;

    const totalHostCredit = projectList.reduce((sum, p) => sum + p.hostTotalCredit, 0);
    const totalHostAvg = projectList.reduce((sum, p) => sum + p.hostExpavgCredit, 0);
    const estFlops = host.fpops || 0;
    const estGflops = estFlops / 1e9;

    return {
      connected: true,
      fetchedAt: new Date().toISOString(),
      endpoint: this.socketPath
        ? { socket: this.socketPath }
        : { host: this.host, port: this.port },
      version: version?.server_version
        ? `${version.server_version.major}.${version.server_version.minor}.${version.server_version.release}`
        : null,
      host,
      status,
      projects: projectList,
      results: resultList,
      transfers: transferList,
      disk: diskUsage,
      statistics: stats,
      dailyXfers: xferHistory,
      messages: messageList,
      derived: {
        activeCount: active.length,
        runningCount: running.length,
        readyCount: resultList.filter((r) => !r.active && r.state === 2).length,
        cpuBusy,
        gpuBusy,
        cpuUtilization,
        gpuUtilization,
        totalHostCredit,
        totalHostAvg,
        estGflops,
        // Rough instantaneous FLOPS estimate from busy CPU cores.
        currentGflops: estGflops * (cpuBusy / ncpus),
      },
    };
  }

  #connect() {
    return new Promise((resolve, reject) => {
      const target = this.socketPath
        ? { path: this.socketPath }
        : { host: this.host, port: this.port };
      const label = this.socketPath || `${this.host}:${this.port}`;
      const socket = net.createConnection(target);
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onConnect = () => {
        cleanup();
        socket.setTimeout(this.timeoutMs);
        resolve(socket);
      };
      const cleanup = () => {
        socket.off('error', onError);
        socket.off('connect', onConnect);
      };
      socket.once('error', onError);
      socket.once('connect', onConnect);
      socket.setTimeout(this.timeoutMs, () => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${label}`));
      });
    });
  }

  async #authorize(socket) {
    const auth1 = await this.#rpc(socket, '<auth1/>');
    const nonce = textOf(auth1?.nonce);
    if (!nonce) throw new Error('BOINC auth1 did not return a nonce');
    const digest = crypto.createHash('md5').update(nonce + this.password).digest('hex');
    const auth2 = await this.#rpc(socket, `<auth2><nonce_hash>${digest}</nonce_hash></auth2>`);
    if (!auth2 || Object.prototype.hasOwnProperty.call(auth2, 'unauthorized')) {
      throw new Error(`BOINC authorization rejected: ${JSON.stringify(auth2)}`);
    }
    if (!Object.prototype.hasOwnProperty.call(auth2, 'authorized')) {
      throw new Error(`BOINC authorization failed: ${JSON.stringify(auth2)}`);
    }
  }

  #rpc(socket, innerXml) {
    const payload =
      Buffer.concat([
        Buffer.from(`<boinc_gui_rpc_request>\n${innerXml}\n</boinc_gui_rpc_request>`, 'utf8'),
        EOT,
      ]);

    return new Promise((resolve, reject) => {
      let buf = Buffer.alloc(0);
      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf(EOT);
        if (idx !== -1) {
          cleanup();
          const xml = buf.subarray(0, idx).toString('utf8');
          try {
            const parsed = parser.parse(xml);
            resolve(parsed.boinc_gui_rpc_reply || parsed);
          } catch (err) {
            reject(err);
          }
        }
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error('BOINC RPC timeout'));
      };
      const onClose = () => {
        cleanup();
        reject(new Error('BOINC socket closed before reply'));
      };
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
        socket.off('close', onClose);
      };
      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('timeout', onTimeout);
      socket.once('close', onClose);
      socket.write(payload);
    });
  }

  #normalizeHost(info) {
    if (!info) return {};
    const coprocs = info.coprocs || {};
    const gpuEntries = Object.entries(coprocs).filter(([k]) => k.startsWith('coproc_'));
    const gpus = gpuEntries.map(([key, value]) => ({
      type: key.replace(/^coproc_/, ''),
      name: textOf(value?.name) || key,
      count: num(value?.count, 1),
      peakFlops: num(value?.peak_flops),
      availableRam: num(value?.available_ram),
      version: textOf(value?.version),
    }));
    return {
      domainName: textOf(info.domain_name),
      ipAddr: textOf(info.ip_addr),
      hostCpid: textOf(info.host_cpid),
      ncpus: num(info.p_ncpus),
      vendor: textOf(info.p_vendor),
      model: textOf(info.p_model),
      features: textOf(info.p_features),
      fpops: num(info.p_fpops),
      iops: num(info.p_iops),
      memBytes: num(info.m_nbytes),
      cacheBytes: num(info.m_cache),
      swapBytes: num(info.m_swap),
      diskTotal: num(info.d_total),
      diskFree: num(info.d_free),
      osName: textOf(info.os_name),
      osVersion: textOf(info.os_version),
      productName: textOf(info.product_name),
      virtualboxVersion: textOf(info.virtualbox_version),
      timezone: num(info.timezone),
      gpus,
      gpuCount: gpus.reduce((s, g) => s + (g.count || 1), 0),
    };
  }

  #normalizeCcStatus(status) {
    if (!status) return {};
    const modeName = (m) => ({ 1: 'always', 2: 'auto', 3: 'never' }[num(m)] || String(m));
    return {
      networkStatus: num(status.network_status),
      taskMode: modeName(status.task_mode),
      taskModePerm: modeName(status.task_mode_perm),
      gpuMode: modeName(status.gpu_mode),
      gpuModePerm: modeName(status.gpu_mode_perm),
      networkMode: modeName(status.network_mode),
      networkModePerm: modeName(status.network_mode_perm),
      taskSuspendReason: num(status.task_suspend_reason),
      gpuSuspendReason: num(status.gpu_suspend_reason),
      networkSuspendReason: num(status.network_suspend_reason),
    };
  }

  #normalizeProjects(list) {
    return asArray(list).map((p) => ({
      masterUrl: textOf(p.master_url),
      name: textOf(p.project_name) || textOf(p.master_url),
      userName: textOf(p.user_name),
      teamName: textOf(p.team_name),
      hostVenue: textOf(p.host_venue),
      userTotalCredit: num(p.user_total_credit),
      userExpavgCredit: num(p.user_expavg_credit),
      hostTotalCredit: num(p.host_total_credit),
      hostExpavgCredit: num(p.host_expavg_credit),
      resourceShare: num(p.resource_share),
      njobsSuccess: num(p.njobs_success),
      njobsError: num(p.njobs_error),
      elapsedTime: num(p.elapsed_time),
      lastRpcTime: num(p.last_rpc_time),
      nextRpcTime: num(p.next_rpc_time),
      suspended: boolFlag(p, 'suspended_via_gui'),
      dontRequestMoreWork: boolFlag(p, 'dont_request_more_work'),
      ended: boolFlag(p, 'ended'),
      schedulerRpcInProgress: boolFlag(p, 'scheduler_rpc_in_progress'),
      guiUrls: asArray(p.gui_urls?.gui_url).map((u) => ({
        name: textOf(u.name),
        description: textOf(u.description),
        url: textOf(u.url),
      })),
    }));
  }

  #normalizeResults(list) {
    return asArray(list).map((r) => {
      const at = r.active_task;
      const plan = textOf(r.plan_class).toLowerCase();
      const usesGpu = /cuda|opencl|nvidia|ati|intel_gpu|gpu/.test(plan);
      return {
        name: textOf(r.name),
        wuName: textOf(r.wu_name),
        projectUrl: textOf(r.project_url),
        platform: textOf(r.platform),
        versionNum: num(r.version_num),
        planClass: textOf(r.plan_class),
        state: num(r.state),
        exitStatus: num(r.exit_status),
        reportDeadline: num(r.report_deadline),
        receivedTime: num(r.received_time),
        estimatedCpuTimeRemaining: num(r.estimated_cpu_time_remaining),
        finalCpuTime: num(r.final_cpu_time),
        finalElapsedTime: num(r.final_elapsed_time),
        active: !!at,
        activeTaskState: at ? num(at.active_task_state) : null,
        fractionDone: at ? num(at.fraction_done) : 0,
        currentCpuTime: at ? num(at.current_cpu_time) : 0,
        elapsedTime: at ? num(at.elapsed_time) : 0,
        progressRate: at ? num(at.progress_rate) : 0,
        workingSetSize: at ? num(at.working_set_size) : 0,
        slot: at ? num(at.slot) : null,
        pid: at ? num(at.pid) : null,
        usesGpu,
      };
    });
  }

  #normalizeTransfers(list) {
    return asArray(list).map((t) => {
      const pfx = t.persistent_file_xfer || {};
      const fx = t.file_xfer || {};
      return {
        projectUrl: textOf(t.project_url),
        projectName: textOf(t.project_name),
        name: textOf(t.name),
        nbytes: num(t.nbytes),
        maxNbytes: num(t.max_nbytes),
        status: num(t.status),
        isUpload: num(pfx.is_upload) === 1 || boolFlag(pfx, 'is_upload'),
        bytesXferred: num(fx.bytes_xferred ?? pfx.last_bytes_xferred),
        xferSpeed: num(fx.xfer_speed),
        timeSoFar: num(pfx.time_so_far),
        numRetries: num(pfx.num_retries),
      };
    });
  }

  #normalizeDisk(summary, projects) {
    if (!summary) return {};
    const byUrl = Object.fromEntries(projects.map((p) => [p.masterUrl, p.name]));
    return {
      total: num(summary.d_total),
      free: num(summary.d_free),
      boinc: num(summary.d_boinc),
      allowed: num(summary.d_allowed),
      projects: asArray(summary.project).map((p) => ({
        masterUrl: textOf(p.master_url),
        name: byUrl[textOf(p.master_url)] || textOf(p.master_url),
        diskUsage: num(p.disk_usage),
      })),
    };
  }

  #normalizeStatistics(list, projects) {
    const byUrl = Object.fromEntries(projects.map((p) => [p.masterUrl, p.name]));
    return asArray(list).map((ps) => {
      const days = asArray(ps.daily_statistics)
        .map((d) => ({
          day: num(d.day) * 1000,
          userTotalCredit: num(d.user_total_credit),
          userExpavgCredit: num(d.user_expavg_credit),
          hostTotalCredit: num(d.host_total_credit),
          hostExpavgCredit: num(d.host_expavg_credit),
        }))
        .sort((a, b) => a.day - b.day);

      // Convert cumulative totals into per-day deltas where possible.
      const withDelta = days.map((d, i) => {
        if (i === 0) return { ...d, hostCreditDelta: 0, userCreditDelta: 0 };
        return {
          ...d,
          hostCreditDelta: Math.max(0, d.hostTotalCredit - days[i - 1].hostTotalCredit),
          userCreditDelta: Math.max(0, d.userTotalCredit - days[i - 1].userTotalCredit),
        };
      });

      return {
        masterUrl: textOf(ps.master_url),
        name: byUrl[textOf(ps.master_url)] || textOf(ps.master_url),
        daily: withDelta,
      };
    });
  }

  #normalizeDailyXfers(list) {
    return asArray(list)
      .map((dx) => ({
        // BOINC stores "when" as days since 1970-01-01 in some builds.
        when: num(dx.when),
        up: num(dx.up),
        down: num(dx.down),
        dayMs: num(dx.when) * 86400 * 1000,
      }))
      .sort((a, b) => a.when - b.when);
  }

  #normalizeMessages(list) {
    return asArray(list).map((m) => ({
      project: textOf(m.project),
      priority: num(m.pri),
      seqno: num(m.seqno),
      body: textOf(m.body),
      time: num(m.time) * 1000,
    }));
  }
}
