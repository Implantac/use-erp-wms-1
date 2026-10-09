export type FunnelFormData = {
  title: string; description: string; stage: string; value: string; probability: string;
  expected_close_date: string; contact_name: string; contact_email: string; contact_phone: string;
  source: string; notes: string; client_id: string; sales_rep_id: string;
};

export const EMPTY_FORM: FunnelFormData = {
  title: '', description: '', stage: 'lead', value: '', probability: '10',
  expected_close_date: '', contact_name: '', contact_email: '', contact_phone: '',
  source: '', notes: '', client_id: '', sales_rep_id: '',
};
