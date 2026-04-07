import { Briefcase, Dumbbell, Heart, Home, Laptop, Leaf, Plane, Sparkles, Star, Wallet } from 'lucide-react';

export const SPHERE_ICON_OPTIONS = [
  { key: 'briefcase', Icon: Briefcase },
  { key: 'heart', Icon: Heart },
  { key: 'dumbbell', Icon: Dumbbell },
  { key: 'wallet', Icon: Wallet },
  { key: 'sparkles', Icon: Sparkles },
  { key: 'home', Icon: Home },
  { key: 'laptop', Icon: Laptop },
  { key: 'leaf', Icon: Leaf },
  { key: 'plane', Icon: Plane },
  { key: 'star', Icon: Star }
] as const;

export function resolveSphereIcon(icon?: string | null) {
  return SPHERE_ICON_OPTIONS.find((item) => item.key === icon)?.Icon;
}
