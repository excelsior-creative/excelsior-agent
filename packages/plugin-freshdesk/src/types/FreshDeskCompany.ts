export type FreshDeskCompany = {
  id: number;
  name: string;
  description: string | null;
  note: string;
  domains: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  health_score: string | null;
  account_tier: string | null;
  renewal_date: string | null;
  industry: string | null;
  org_company_id: number;
};
