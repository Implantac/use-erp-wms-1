import SectorPcpCentral from './SectorPcpCentral';
import { SECTOR_CENTRALS } from './sectorCentrals';

export default function KnittingDashboard() {
  return <SectorPcpCentral config={SECTOR_CENTRALS.malharia} />;
}
