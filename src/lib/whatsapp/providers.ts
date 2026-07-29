export const EUATENDO_PROVIDER = "euatendo" as const;
export const WHATSAPP_EXTENSION_PROVIDER = "whatsapp_extension" as const;

export const WHATSAPP_NOTIFICATION_PROVIDERS = [
  EUATENDO_PROVIDER,
  WHATSAPP_EXTENSION_PROVIDER,
] as const;

export type WhatsAppProviderName = (typeof WHATSAPP_NOTIFICATION_PROVIDERS)[number];

export function isWhatsAppProviderName(value: string | null | undefined): value is WhatsAppProviderName {
  return WHATSAPP_NOTIFICATION_PROVIDERS.some((provider) => provider === value);
}

export function getWhatsAppProviderLabel(provider: string | null | undefined) {
  if (provider === WHATSAPP_EXTENSION_PROVIDER) {
    return "Extensao do Chrome";
  }

  if (provider === EUATENDO_PROVIDER) {
    return "WhatsApp";
  }

  return "Canal legado";
}

export function providerSupportsClientNotifications(provider: WhatsAppProviderName) {
  return provider === EUATENDO_PROVIDER || provider === WHATSAPP_EXTENSION_PROVIDER;
}
