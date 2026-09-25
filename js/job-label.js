import { escapeHtml } from "./format.js";

function hexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "";
}

export function jobRecord(row) {
  const job = row?.jobs;
  if (!job) return null;
  return Array.isArray(job) ? job[0] : job;
}

const jobAliases = {
  버커니어: "buccaneer",
  버퍼서: "buccaneer",
  배틀로드: "buccaneer",
  "버퍼서(배틀로드)": "buccaneer",
};

const displayNames = {
  buccaneer: "버커니어",
};

export function jobDisplayName(job) {
  if (!job) return "";
  return displayNames[job.id] || job.name || "";
}

export function findJob(jobs, name) {
  if (!name || !jobs?.length) return null;
  const key = normalizeJobName(name);
  const direct = jobs.find((job) => normalizeJobName(jobDisplayName(job)) === key || normalizeJobName(job.name) === key);
  if (direct) return direct;
  const aliasId = jobAliases[key];
  if (!aliasId) return null;
  return jobs.find((job) => job.id === aliasId) || null;
}

export function jobStyle(job) {
  const color = hexColor(job?.color);
  if (!color) return "";
  const dark = hexColor(job.color_dark) || color;
  return `--job-color:${color};--job-color-dark:${dark}`;
}

export function jobLabel(name, job) {
  const text = name ? escapeHtml(name) : "-";
  const style = jobStyle(job);
  if (!style) return text;
  return `<span class="job-label" style="${style}">${text}</span>`;
}

export function normalizeJobName(value) {
  return String(value ?? "").replaceAll(" ", "").replaceAll("·", "");
}
