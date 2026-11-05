import SectorPcpCentral from './SectorPcpCentral';
import { SECTOR_CENTRALS } from './sectorCentrals';

export default function WeavingDashboard() {
  return <SectorPcpCentral config={SECTOR_CENTRALS.tecelagem} />;
}
