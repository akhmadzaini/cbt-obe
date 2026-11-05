import { formatDate } from "../../lib/format";
import type { SystemEventRow } from "../../lib/types";

const ACTION_LABELS: Record<string, string> = {
  "backup.create": "Backup dibuat",
  "backup.download": "Backup diunduh",
  "backup.delete": "Backup dihapus",
  "restore.finish": "Restore dari server",
  "restore.upload": "Restore dari unggahan",
  "restore.fail": "Restore gagal",
  "reset.factory": "Factory reset",
  "reset.fail": "Factory reset gagal",
  "session.reset": "Reset sesi peserta",
  "session.cancel": "Batalkan submission peserta",
};

export default function EventLogSection({ events }: { events: SystemEventRow[] }) {
  return (
      <section className="card">
        <h2 className="text-base font-bold text-slate-900">
          Riwayat Operasi Sistem
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          100 aktivitas terakhir. Riwayat ini tidak dihapus saat factory reset.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2 pr-4">Waktu</th>
                <th className="py-2 pr-4">Aksi</th>
                <th className="py-2 pr-4">Admin</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.length === 0 && (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={5}>
                    Belum ada aktivitas.
                  </td>
                </tr>
              )}
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="py-2 pr-4 text-slate-600">
                    {formatDate(event.createdAt)}
                  </td>
                  <td className="py-2 pr-4 font-medium text-slate-800">
                    {ACTION_LABELS[event.action] ?? event.action}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {event.actorUsername}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {event.ipAddress ?? "—"}
                  </td>
                  <td className="py-2 text-xs text-slate-500">
                    {event.detail ? JSON.stringify(event.detail) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
  );
}
