-- FR-ATT-12 (SHOULD): optional office Wi-Fi networks per branch (SSID names or BSSID MAC addresses).
-- Existing branches get an empty list, which keeps the Wi-Fi check off. Branch already has RLS (workspaceId).

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "wifiNetworks" TEXT[] DEFAULT ARRAY[]::TEXT[];
