import SectorPcpCentral, { SECTOR_CENTRALS } from './SectorPcpCentral';

export default function SpinningDashboard() {
  return <SectorPcpCentral config={SECTOR_CENTRALS.fiacao} />;
}
