import { createClient } from '@supabase/supabase-js';

const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!key || !url) throw new Error('Ambiente de leitura indisponivel');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function read(table, fields) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const result = await db.from(table).select(fields).order('id').range(from, from + 499);
    if (result.error) throw new Error(`Leitura indisponivel: ${table}`);
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}
// Aggregate only. Never select names, rendered messages, phones, credentials or provider payloads.
const [events, certificates, clients] = await Promise.all([
  read('notification_events', 'id,status,provider,send_date,certificado_id,recipient_id,type'),
  read('certificados', 'id,cliente_id,renovacao_status,status'),
  read('clientes', 'id'),
]);
const groups = {};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
for (const event of events) {
  const key = `${event.provider}/${event.status}/${event.send_date < today ? 'anterior' : event.send_date === today ? 'hoje' : 'futuro'}`;
  groups[key] = (groups[key] || 0) + 1;
}
const linked = new Set(certificates.map(c => c.cliente_id));
const duplicateGroups = {};
for (const event of events) {
  const key = JSON.stringify([event.type, event.certificado_id, event.recipient_id, event.send_date]);
  duplicateGroups[key] = (duplicateGroups[key] || 0) + 1;
}
console.log(JSON.stringify({ today, eventsByProviderStatusDate: groups,
  clients: clients.length, clientsWithoutCertificate: clients.filter(c => !linked.has(c.id)).length,
  certificates: certificates.length,
  operational: certificates.filter(c => c.status !== 'invalido' && ['em_acompanhamento', 'renovou_fasa'].includes(c.renovacao_status)).length,
  inactive: certificates.filter(c => c.renovacao_status === 'cliente_inativo').length,
  repeatedKeys: Object.values(duplicateGroups).filter(n => n > 1).length,
  note: 'Chaves repetidas nao provam entrega duplicada nem distinguem destinatarios removidos.' }, null, 2));
