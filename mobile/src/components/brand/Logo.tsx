import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { BRAND, ICON, LOGO_VIEWBOX, WORDMARK } from './logo-geometry';

/**
 * HR Connect logo — flat vector (no gradients, glow, blur or reflections).
 * `onDark`: for navy surfaces; `onLight`: for white / light-grey surfaces. `mark` renders the icon alone.
 * Width is responsive: it fills its container up to `maxWidth` and keeps its aspect ratio.
 */
export function Logo({ variant = 'onDark', mark = false, maxWidth = 320 }: { variant?: 'onDark' | 'onLight'; mark?: boolean; maxWidth?: number }) {
  const dark = variant === 'onDark';
  const tile = dark ? BRAND.navyLight : BRAND.navyDark;
  const side = dark ? '#AEB9CF' : '#9AA7C0';
  const hr = dark ? BRAND.white : BRAND.navyDark;
  const connect = dark ? BRAND.greyLight : BRAND.greyDark;
  const vb = mark ? LOGO_VIEWBOX.mark : LOGO_VIEWBOX.lockup;
  const r = ICON.rect;
  return (
    <View style={{ width: '100%', maxWidth: mark ? Math.min(maxWidth, 96) : maxWidth, aspectRatio: vb[2] / vb[3] }}>
      <Svg width="100%" height="100%" viewBox={vb.join(' ')} accessibilityLabel="HR Connect" role="img">
        <Rect x={r.x} y={r.y} width={r.w} height={r.h} rx={r.r} fill={tile} />
        <G fill={side}>
          <Circle cx={ICON.left_head[0]} cy={ICON.left_head[1]} r={ICON.left_head[2]} />
          <Circle cx={ICON.right_head[0]} cy={ICON.right_head[1]} r={ICON.right_head[2]} />
          <Path d={ICON.left_body} /><Path d={ICON.right_body} />
        </G>
        {/* centre figure: a tile-coloured halo (drawn first) separates it from the figures behind, then the white shapes */}
        <G fill={tile} stroke={tile} strokeWidth={20} strokeLinejoin="round">
          <Path d={ICON.center_body} />
          <Circle cx={ICON.center_head[0]} cy={ICON.center_head[1]} r={ICON.center_head[2]} />
        </G>
        <G fill={BRAND.white}>
          <Path d={ICON.center_body} />
          <Circle cx={ICON.center_head[0]} cy={ICON.center_head[1]} r={ICON.center_head[2]} />
        </G>
        {mark ? null : <><Path d={WORDMARK.hr} fill={hr} /><Path d={WORDMARK.connect} fill={connect} /></>}
      </Svg>
    </View>
  );
}
