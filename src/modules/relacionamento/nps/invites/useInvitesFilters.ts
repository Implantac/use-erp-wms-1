import { useMemo } from 'react';
import { PAGE_SIZE } from './options';
import type { NPSInvite } from './types';

export function useInvitesFilters(
  invites: NPSInvite[],
  statusFilter: string,
  channelFilter: string,
  textFilter: string,
  page: number,
) {
  const filteredInvites = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    return invites.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (channelFilter !== 'all' && i.channel !== channelFilter) return false;
      if (q) {
        const name = (i.clients?.name ?? '').toLowerCase();
        const email = (i.clients?.email ?? '').toLowerCase();
        const phone = (i.clients?.phone ?? '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) return false;
      }
      return true;
    });
  }, [invites, statusFilter, channelFilter, textFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInvites.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageInvites = useMemo(
    () => filteredInvites.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredInvites, currentPage],
  );

  const stats = useMemo(() => {
    const total = filteredInvites.length;
    const sent = filteredInvites.filter((i) => ['sent', 'opened', 'responded'].includes(i.status)).length;
    const opened = filteredInvites.filter((i) => ['opened', 'responded'].includes(i.status)).length;
    const responded = filteredInvites.filter((i) => i.status === 'responded').length;
    const pending = filteredInvites.filter((i) => i.status === 'pending').length;
    const bounced = filteredInvites.filter((i) => i.status === 'bounced' || i.status === 'failed').length;
    const revoked = filteredInvites.filter((i) => i.status === 'revoked').length;
    return {
      total, sent, opened, responded, pending, bounced, revoked,
      openRate: sent ? Math.round((opened / sent) * 100) : 0,
      responseRate: sent ? Math.round((responded / sent) * 100) : 0,
    };
  }, [filteredInvites]);

  return { filteredInvites, totalPages, currentPage, pageInvites, stats };
}
