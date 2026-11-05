import SectorPcpCentral from './SectorPcpCentral';
import { SECTOR_CENTRALS } from './sectorCentrals';

export default function DyeingDashboard() {
  return <SectorPcpCentral config={SECTOR_CENTRALS.tinturaria} />;
}
