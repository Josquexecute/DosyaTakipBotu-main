import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import type { FolderFingerprint } from '../../shared/types';
import { TRACKING_FILE_NAME, TRACKING_FOLDER_NAME } from '../../shared/constants';
import { CASE_FILE_RECURSIVE_SCAN_DEPTH, findCaseSubfolder } from './case-folder-utils';
import { isPcloudConflictFile } from '../storage/conflict-file-detector';

const FINGERPRINT_MAX_DEPTH = CASE_FILE_RECURSIVE_SCAN_DEPTH;
const FINGERPRINT_MAX_ENTRIES = 5000;

export async function getFolderFingerprint(folderPath: string): Promise<FolderFingerprint> {
  const rootStat = await safeStat(folderPath);
  const evrak = await findCaseSubfolder(folderPath, 'EVRAK');
  const hasar = await findCaseSubfolder(folderPath, 'HASAR');
  const olayYeri = await findCaseSubfolder(folderPath, 'OLAY YERİ');
  const onarim = await findCaseSubfolder(folderPath, 'ONARIM');
  const trackingPath = path.join(folderPath, TRACKING_FOLDER_NAME, TRACKING_FILE_NAME);
  const trackingStat = await safeStat(trackingPath);
  const trackingConflictEntries = await collectTrackingConflictEntries(path.join(folderPath, TRACKING_FOLDER_NAME));

  const fingerprintEntries = [
    ...(evrak.exists ? await collectFingerprintEntries(evrak.path, evrak.actualName) : []),
    ...(hasar.exists ? await collectFingerprintEntries(hasar.path, hasar.actualName) : []),
    ...(olayYeri.exists ? await collectFingerprintEntries(olayYeri.path, olayYeri.actualName) : []),
    ...(onarim.exists ? await collectFingerprintEntries(onarim.path, onarim.actualName) : [])
  ].sort((a, b) => a.localeCompare(b, 'tr'));

  const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => []);
  const childCount = entries.length;
  const treeSize = fingerprintEntries.reduce((sum, entry) => sum + Number(entry.split('|').at(3) ?? 0), 0);
  const raw = [
    folderPath,
    rootStat.mtimeMs,
    childCount,
    evrak.exists, evrak.actualName,
    hasar.exists, hasar.actualName,
    olayYeri.exists, olayYeri.actualName,
    onarim.exists, onarim.actualName,
    // v0.3.15: pCloud Drive'da her scan'de takip.json içeriğini okumak indirme/I/O tetikleyebilir.
    // mtime+size değişmediği sürece content hash yerine metadata fingerprint yeterlidir.
    trackingStat.mtimeMs, trackingStat.size,
    trackingConflictEntries.length, ...trackingConflictEntries,
    fingerprintEntries.length,
    ...fingerprintEntries
  ].join('|');

  return {
    folderPath,
    mtimeMs: rootStat.mtimeMs,
    size: rootStat.size + trackingStat.size + childCount + treeSize + trackingConflictEntries.length,
    childCount,
    evrakMtimeMs: evrak.exists ? latestMtime(fingerprintEntries, evrak.actualName) : 0,
    hasarMtimeMs: hasar.exists ? latestMtime(fingerprintEntries, hasar.actualName) : 0,
    trackingMtimeMs: trackingStat.mtimeMs,
    hash: crypto.createHash('sha1').update(raw).digest('hex')
  };
}


async function collectTrackingConflictEntries(trackingFolderPath: string): Promise<string[]> {
  const entries = await fs.readdir(trackingFolderPath, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isPcloudConflictFile(entry.name)) continue;
    const fullPath = path.join(trackingFolderPath, entry.name);
    const stat = await safeStat(fullPath);
    out.push(`${TRACKING_FOLDER_NAME}/${entry.name}|F|${Math.round(stat.mtimeMs)}|${stat.size}`);
  }
  return out.sort((a, b) => a.localeCompare(b, 'tr'));
}

async function collectFingerprintEntries(root: string, label: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, label, 0, out);
  if (out.length > FINGERPRINT_MAX_ENTRIES) {
    out.splice(FINGERPRINT_MAX_ENTRIES);
    out.push(`${label}|LIMIT|${FINGERPRINT_MAX_ENTRIES}|0`);
  }
  return out;
}

async function walk(currentPath: string, relative: string, depth: number, out: string[]): Promise<void> {
  if (depth > FINGERPRINT_MAX_DEPTH || out.length > FINGERPRINT_MAX_ENTRIES) return;
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === TRACKING_FOLDER_NAME || entry.name.startsWith('.')) continue;
    const fullPath = path.join(currentPath, entry.name);
    const rel = `${relative}/${entry.name}`;
    const stat = await safeStat(fullPath);
    out.push(`${rel}|${entry.isDirectory() ? 'D' : 'F'}|${Math.round(stat.mtimeMs)}|${stat.size}`);
    if (entry.isDirectory()) await walk(fullPath, rel, depth + 1, out);
    if (out.length > FINGERPRINT_MAX_ENTRIES) break;
  }
}

function latestMtime(entries: string[], label: string): number {
  let latest = 0;
  for (const entry of entries) {
    if (!entry.startsWith(`${label}/`)) continue;
    const raw = entry.split('|').at(2);
    const value = raw ? Number(raw) : 0;
    if (Number.isFinite(value) && value > latest) latest = value;
  }
  return latest;
}


async function safeStat(filePath: string): Promise<{ mtimeMs: number; size: number }> {
  try {
    const stat = await fs.stat(filePath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return { mtimeMs: 0, size: 0 };
  }
}
