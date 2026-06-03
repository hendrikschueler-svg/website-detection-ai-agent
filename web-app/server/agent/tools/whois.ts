// WHOIS / RDAP lookup tool.
// Uses the public RDAP.org aggregator — free, no API key required,
// returns structured JSON (modern replacement for raw WHOIS).

import axios from "axios";

export interface WhoisResult {
  domain: string;
  registrar?: string;
  creationDate?: string;
  expiryDate?: string;
  country?: string;
  status?: string[];
  error?: string;
}

export async function whoisLookup(domain: string): Promise<WhoisResult> {
  // Strip protocol / path if caller passed a full URL
  const cleanDomain = domain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();

  try {
    const response = await axios.get(`https://rdap.org/domain/${cleanDomain}`, {
      timeout: 10000,
      headers: { Accept: "application/json" },
      validateStatus: () => true,
    });

    if (response.status !== 200) {
      return {
        domain: cleanDomain,
        error: `RDAP returned HTTP ${response.status}`,
      };
    }

    const data = response.data;

    // Registration / expiry dates
    const registrationEvent = (data.events ?? []).find(
      (e: any) => e.eventAction === "registration"
    );
    const expirationEvent = (data.events ?? []).find(
      (e: any) => e.eventAction === "expiration"
    );

    // Registrar — listed as an entity with role "registrar"
    const registrarEntity = (data.entities ?? []).find((e: any) =>
      e.roles?.includes("registrar")
    );
    let registrar: string | undefined;
    if (registrarEntity?.vcardArray?.[1]) {
      const vcardFields: any[] = registrarEntity.vcardArray[1];
      const fnField = vcardFields.find((f) => f[0] === "fn");
      registrar = fnField?.[3];
    }
    if (!registrar && registrarEntity?.handle) {
      registrar = registrarEntity.handle;
    }

    // Country — from registrant entity's vcard adr field
    let country: string | undefined;
    const registrantEntity = (data.entities ?? []).find((e: any) =>
      e.roles?.includes("registrant")
    );
    if (registrantEntity?.vcardArray?.[1]) {
      const vcardFields: any[] = registrantEntity.vcardArray[1];
      const adrField = vcardFields.find((f) => f[0] === "adr");
      // vcard adr: [type, params, type, pobox, ext, street, city, region, postalCode, country]
      country = adrField?.[1]?.["cc"] ?? adrField?.[3]?.[6];
    }

    console.log(`[whois] ${cleanDomain}: registrar=${registrar}, created=${registrationEvent?.eventDate}, country=${country}`);

    return {
      domain: cleanDomain,
      registrar,
      creationDate: registrationEvent?.eventDate,
      expiryDate: expirationEvent?.eventDate,
      country,
      status: data.status ?? [],
    };
  } catch (err: any) {
    console.error(`[whois] Lookup failed for ${cleanDomain}:`, err.message);
    return { domain: cleanDomain, error: err.message };
  }
}
