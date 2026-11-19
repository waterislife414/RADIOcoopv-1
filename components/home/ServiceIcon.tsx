import {
  AlignHorizontalJustifyCenter, Battery, ClipboardCheck, Cog, Disc, Droplet, Factory, Power, RefreshCw, ScanLine, Snowflake, Spline, Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ServiceIcon as IconName } from '@/config/services';

const MAP: Record<IconName, LucideIcon> = {
  disc: Disc,
  battery: Battery,
  zap: Zap,
  power: Power,
  droplet: Droplet,
  refresh: RefreshCw,
  scan: ScanLine,
  clipboard: ClipboardCheck,
  cog: Cog,
  engine: Factory,
  align: AlignHorizontalJustifyCenter,
  snow: Snowflake,
  spring: Spline,
};

export function ServiceIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = MAP[name];
  return <Icon className={className} aria-hidden />;
}
