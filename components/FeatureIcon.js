import { SvgXml } from 'react-native-svg';
import { FEATURE_ICON_XML } from './featureIconsData';

/**
 * Renders one of the DoseTrace feature glyphs (founder-supplied single-stroke
 * vector set) at the given size, recolored to `color` so it adapts to the
 * light/dark theme instead of shipping a baked color. `name` is a key of
 * FEATURE_ICON_XML: reconstitution | curve | bell | stack | scan.
 */
export default function FeatureIcon({ name, size = 24, color = '#000000' }) {
  const xml = FEATURE_ICON_XML[name];
  if (!xml) return null;
  return <SvgXml xml={xml.replace(/__C__/g, color)} width={size} height={size} />;
}
