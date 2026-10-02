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
  // Drawn at the approved prototype weight, stroke 72 of 1024 (fic(); founder Q14 = A,
  // 2026-10-02). The source SVGs keep 54; the weight is set here, in one place.
  return <SvgXml xml={xml.replace(/__C__/g, color).replace(/stroke-width="54"/g, 'stroke-width="72"')} width={size} height={size} />;
}
