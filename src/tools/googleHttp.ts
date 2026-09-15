// Borda das ferramentas do Workspace: executa o GReq com UrlFetch e o token do script (escopos do manifesto, ADR-015).
import type { Google } from './google';

export const gasGoogle: Google = (req) => {
  const payload = req.raw !== undefined ? { contentType: req.contentType ?? 'text/plain', payload: req.raw } : req.body !== undefined ? { contentType: 'application/json', payload: JSON.stringify(req.body) } : {};
  const res = UrlFetchApp.fetch(req.url, {
    method: req.method,
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
    ...payload,
  });
  return { code: res.getResponseCode(), body: res.getContentText('UTF-8') };
};

/** Fuso do gasclaw e o offset atual ("-03:00") para períodos das ferramentas. */
export function zone(): { timeZone: string; offset: string } {
  const timeZone = Session.getScriptTimeZone();
  return { timeZone, offset: Utilities.formatDate(new Date(), timeZone, 'XXX') };
}
