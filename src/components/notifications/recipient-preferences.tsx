"use client";

type Preferences = {
  notify_certificate_updates: boolean;
  notify_general: boolean;
};

export function RecipientPreferences({ value, onChange, disabled, label }: {
  value: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2 lg:col-span-full">
      <legend className="sr-only">{label}</legend>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value.notify_certificate_updates}
          onChange={(event) => onChange({ notify_certificate_updates: event.target.checked })}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        />
        <span>
          <span className="block font-semibold text-slate-900">Certificados atualizados</span>
          <span className="block text-xs leading-5">Atualizações de certificados e comunicados enviados pela central de avisos internos.</span>
        </span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value.notify_general}
          onChange={(event) => onChange({ notify_general: event.target.checked })}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        />
        <span>
          <span className="block font-semibold text-slate-900">Avisos gerais</span>
          <span className="block text-xs leading-5">Avisos de vencimento e resumos de certificados vencidos, conforme o planejamento.</span>
        </span>
      </label>
    </fieldset>
  );
}
