import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { toCSV } from './calc';

const safeName = (s: string) => s.replace(/[^\w.\-]+/g, '_');

/** Save/share a CSV: browser download on web, share sheet on native. */
export async function exportCSV(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  const csv = '﻿' + toCSV(rows, columns);
  const name = safeName(filename.endsWith('.csv') ? filename : `${filename}.csv`);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: name, UTI: 'public.comma-separated-values-text' });
}

export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

const baseCss = `body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0F1B2D;padding:28px}h1{color:#0B1F3A;margin:0 0 4px}
.muted{color:#5D6B82;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#EAF0F8;text-align:left;font-size:12px;padding:8px}
td{border-bottom:1px solid #E1E8F2;padding:8px;font-size:13px}td.n,th.n{text-align:right}.total td{font-weight:700;border-top:2px solid #0B1F3A}`;

export function tableHtml(title: string, subtitle: string, head: string[], body: (string | number)[][]) {
  return `<html><head><meta charset="utf-8"><style>${baseCss}</style></head><body><h1>${esc(title)}</h1><div class="muted">${esc(subtitle)}</div>
  <table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
}

/** Render HTML to a PDF: share sheet on native, print dialog (Save as PDF) on web. */
export async function exportPDF(html: string, name: string) {
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: safeName(name), UTI: 'com.adobe.pdf' });
}
