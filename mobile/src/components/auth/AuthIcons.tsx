import Svg, { Path } from 'react-native-svg';

/** Sign-in glyphs from the HR Connect Figma file (20×20, 1.33 stroke). */
interface IconProps { color?: string; size?: number }
const base = (color: string, size: number) => ({ width: size, height: size, viewBox: '0 0 20 20', fill: 'none' as const, stroke: color, strokeWidth: 1.33333, strokeLinecap: 'round' as const });

export function MailIcon({ color = '#64748B', size = 20 }: IconProps) {
  return (
    <Svg {...base(color, size)}>
      <Path d="M4.16667 4.16667H15.8333C16.7538 4.16667 17.5 4.91286 17.5 5.83333V14.1667C17.5 15.0871 16.7538 15.8333 15.8333 15.8333H4.16667C3.24619 15.8333 2.5 15.0871 2.5 14.1667V5.83333C2.5 4.91286 3.24619 4.16667 4.16667 4.16667Z" />
      <Path d="M2.5 5.83333L10 10.8333L17.5 5.83333" />
    </Svg>
  );
}

export function LockIcon({ color = '#64748B', size = 20 }: IconProps) {
  return (
    <Svg {...base(color, size)}>
      <Path d="M5.83333 8.33333H14.1667C15.0871 8.33333 15.8333 9.07952 15.8333 10V15.8333C15.8333 16.7538 15.0871 17.5 14.1667 17.5H5.83333C4.91286 17.5 4.16667 16.7538 4.16667 15.8333V10C4.16667 9.07952 4.91286 8.33333 5.83333 8.33333Z" />
      <Path d="M6.66667 8.33333V5.83333C6.66667 4.94928 7.01786 4.10143 7.64298 3.47631C8.2681 2.85119 9.11595 2.5 10 2.5C10.8841 2.5 11.7319 2.85119 12.357 3.47631C12.9821 4.10143 13.3333 4.94928 13.3333 5.83333V8.33333" />
    </Svg>
  );
}

/** `slashed` is the "password is visible, hide it" state; Figma only draws the plain eye. */
export function EyeIcon({ color = '#64748B', size = 20, slashed = false }: IconProps & { slashed?: boolean }) {
  return (
    <Svg {...base(color, size)}>
      <Path d="M1.66667 10C1.66667 10 4.58333 5 10 5C15.4167 5 18.3333 10 18.3333 10C18.3333 10 15.4167 15 10 15C4.58333 15 1.66667 10 1.66667 10Z" />
      <Path d="M12.5 10C12.5 11.3807 11.3807 12.5 10 12.5C8.61929 12.5 7.5 11.3807 7.5 10C7.5 8.61929 8.61929 7.5 10 7.5C11.3807 7.5 12.5 8.61929 12.5 10Z" />
      {slashed ? <Path d="M3.5 3.5L16.5 16.5" /> : null}
    </Svg>
  );
}

export function ShieldIcon({ color = '#64748B', size = 20 }: IconProps) {
  return (
    <Svg {...base(color, size)}>
      <Path d="M10 18.3333C10 18.3333 16.6667 15 16.6667 10V4.16667L10 1.66667L3.33333 4.16667V10C3.33333 15 10 18.3333 10 18.3333Z" />
    </Svg>
  );
}
