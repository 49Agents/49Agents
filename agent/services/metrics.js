import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';

const execAsync = promisify(exec);

// Previous /proc/stat readings for CPU delta: { [key]: { idle, total } }
const prevCpu = {};

function parseProcStat(line) {
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function cpuPercent(key, idle, total) {
  const prev = prevCpu[key];
  prevCpu[key] = { idle, total };
  if (!prev) return null;
  const dIdle = idle - prev.idle;
  const dTotal = total - prev.total;
  if (dTotal === 0) return 0;
  return Math.round((1 - dIdle / dTotal) * 100);
}

async function getLocalGpu() {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null',
      { encoding: 'utf-8', timeout: 3000 }
    );
    const out = stdout.trim();
    if (!out) return null;
    // Take first GPU line
    const parts = out.split('\n')[0].split(',').map(s => s.trim());
    return {
      utilization: parseInt(parts[0], 10),
      memUsed: parseInt(parts[1], 10) * 1024 * 1024, // MiB -> bytes
      memTotal: parseInt(parts[2], 10) * 1024 * 1024
    };
  } catch {
    return null;
  }
}

/**
 * Get local system metrics (CPU, RAM, GPU).
 * Agent version: local only, no SSH remote metrics.
 */
export async function getLocalMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let cpu = null;
  try {
    const stat = readFileSync('/proc/stat', 'utf-8');
    const firstLine = stat.split('\n')[0];
    const { idle, total } = parseProcStat(firstLine);
    cpu = cpuPercent('local', idle, total);
  } catch {
    const load = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    cpu = Math.round((load / cpuCount) * 100);
  }

  if (cpu === null) {
    const load = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    cpu = Math.round((load / cpuCount) * 100);
  }

  const gpu = await getLocalGpu();

  return {
    ram: { total: totalMem, used: usedMem, available: freeMem },
    cpu,
    gpu
  };
}

export const metricsService = {
  /**
   * Get metrics for this local machine only.
   * In the agent model, each machine has its own agent, so no SSH remote metrics needed.
   */
  async getMetrics() {
    return getLocalMetrics();
  }
};
