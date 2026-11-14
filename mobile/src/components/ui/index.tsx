// HR Connect UI kit: thin adapters over the BNA UI components (src/components/ui/*.tsx) + layout helpers.
// Screens import from '@/components/ui'; BNA primitives can also be imported directly (e.g. '@/components/ui/tabs').
import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, Eye, EyeOff, Inbox, Info, Minus, Tag, TriangleAlert, X } from 'lucide-react-native';
import { createContext, useContext, useMemo, useState, type ComponentProps, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text as RNText, View, useWindowDimensions, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { dockClearance } from '@/components/layout/dock';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Avatar as BAvatar, AvatarFallback } from '@/components/ui/avatar';
import { Button as BButton, type ButtonVariant } from '@/components/ui/button';
import { Card as BCard } from '@/components/ui/card';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger, ComboboxValue } from '@/components/ui/combobox';
import { DatePicker } from '@/components/ui/date-picker';
import { HRIcon } from '@/components/ui/hr-icon';
import type { HRIconName } from '@/components/ui/hr-icon-map';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { fromISO, toISO } from '@/lib/calc';
import { useAppFont } from '@/lib/fonts';
import { radius, space, useTheme } from '@/lib/theme';
import { type } from '@/theme/typography';
import { sizes } from '@/theme/spacing';

export { useToast } from '@/components/ui/toast';
export { Input, Skeleton, Spinner };

export function useBreakpoint() {
  const { width } = useWindowDimensions();
  return { width, isWide: width >= 1200, isTablet: width >= 768, isMobile: width < 768 };
}

/** Set by the app shell so a page doesn't repeat the title that the header already shows. */
export const PageTitleContext = createContext<{ title: string; hideDuplicate: boolean }>({ title: '', hideDuplicate: false });

// ---------------------------------------------------------------- text
type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label';
export function T({ v = 'body', muted, color, style, children, ...rest }: {
  v?: Variant; muted?: boolean; color?: string; style?: StyleProp<TextStyle>; children?: ReactNode; numberOfLines?: number; accessibilityLabel?: string; accessibilityRole?: 'header' | 'text' | 'alert'; maxFontSizeMultiplier?: number;
}) {
  const { c } = useTheme();
  const base = type[v];
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const font = useAppFont(flat?.fontWeight ?? base.fontWeight);
  return (
    <RNText maxFontSizeMultiplier={v === 'h1' || v === 'h2' ? 1.25 : v === 'h3' ? 1.35 : 1.6} {...rest} style={[{ color: color ?? (muted ? c.muted : c.text) }, base, v === 'h1' || v === 'h2' || v === 'h3' ? { flexShrink: 1 } : null, { fontVariant: ['tabular-nums'] }, style, font]}>
      {children}
    </RNText>
  );
}

// ---------------------------------------------------------------- layout
export function Card({ children, style, pad = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const { c } = useTheme();
  const { isMobile } = useBreakpoint();
  return (
    <BCard style={[{ width: undefined, alignSelf: 'stretch', borderWidth: 1, borderColor: c.border, padding: pad ? (isMobile ? 14 : 20) : 0, borderRadius: radius.lg, minWidth: 0 }, style] as never}>
      {children}
    </BCard>
  );
}

export function Row({ children, style, gap = space.sm, wrap, align = 'center' }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean; align?: 'center' | 'flex-start' | 'flex-end';
}) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

/** Responsive grid: children share the row equally, wrapping at `min` px. */
export function Grid({ children, min = 220, gap = space.md }: { children: ReactNode; min?: number; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{
    (Array.isArray(children) ? children : [children]).filter(Boolean).map((ch, i) => (
      <View key={i} style={{ flexGrow: 1, flexShrink: 1, flexBasis: min, minWidth: Math.min(min, 150), maxWidth: '100%' }}>{ch}</View>
    ))}</View>;
}

export function Screen({ title, subtitle, actions, children, scroll = true }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; scroll?: boolean;
}) {
  const { c } = useTheme();
  const { isTablet, isMobile } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const bottomPad = isMobile ? dockClearance(insets.bottom) : 56;
  const page = useContext(PageTitleContext);
  const showTitle = !(page.hideDuplicate && page.title === title);
  const body = (
    <View style={{ padding: isTablet ? space.xl : space.lg, gap: space.lg, maxWidth: sizes.maxContent, width: '100%', alignSelf: 'center' }}>
      <View style={isMobile ? { alignItems: 'center', gap: space.md } : { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ flexShrink: 1, minWidth: isTablet ? 200 : 0, maxWidth: '100%', alignItems: isMobile ? 'center' : 'stretch' }}>
          {showTitle ? <T v="h1" accessibilityRole="header" style={isMobile ? { fontSize: 24, lineHeight: 30, textAlign: 'center' } : undefined}>{title}</T> : null}
          {subtitle ? <T muted style={{ marginTop: showTitle ? 2 : 0, textAlign: isMobile ? 'center' : 'left' }}>{subtitle}</T> : null}
        </View>
        {actions ? <Row wrap style={{ maxWidth: '100%', flexShrink: 1, justifyContent: isMobile ? 'center' : 'flex-start' }}>{actions}</Row> : null}
      </View>
      {children}
    </View>
  );
  return scroll
    ? <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: bottomPad }} keyboardShouldPersistTaps="handled">{body}</ScrollView>
    : <View style={{ flex: 1, backgroundColor: c.bg, paddingBottom: isMobile ? bottomPad - 56 : 0 }}>{body}</View>;
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const { isMobile } = useBreakpoint();
  return (
    <View style={{ gap: space.md }}>
      <Row style={{ justifyContent: isMobile ? 'center' : 'space-between' }} wrap><T v="h2" style={isMobile ? { textAlign: 'center' } : undefined}>{title}</T>{right}</Row>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- controls
type Variants = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'outline';
const variantMap: Record<Variants, ButtonVariant> = { primary: 'default', secondary: 'outline', outline: 'outline', danger: 'destructive', ghost: 'ghost', success: 'success' };

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, small, style }: {
  title: string; onPress?: () => void; variant?: Variants; icon?: ReactNode; disabled?: boolean; loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  // call sites pass an element like <Plus size={16} />; BNA wants the icon component itself
  const el = icon as ReactElement<Record<string, unknown>> | undefined;
  const isHR = el?.type === HRIcon;
  const hrKey = isHR ? JSON.stringify([el!.props.name, el!.props.size, el!.props.tone, el!.props.animate, el!.props.disabled]) : '';
  // HRIcon is configured by props (name…), which extracting `.type` would discard: re-bind them, but take the colour BNA computes for the variant
  const hrComp = useMemo(
    () => (isHR ? (({ color }: { color?: string }) => <HRIcon {...(el!.props as object as ComponentProps<typeof HRIcon>)} color={color ?? (el!.props.color as string | undefined)} />) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hrKey],
  );
  const iconComp = (isHR ? hrComp : el?.type) as ComponentType<never> | undefined;
  return (
    <BButton label={title} variant={variantMap[variant]} size={small ? 'sm' : 'default'} loading={loading} disabled={disabled}
      icon={typeof iconComp === 'function' || typeof iconComp === 'object' ? (iconComp as never) : undefined}
      onPress={onPress} style={style as ViewStyle}>
      {title}
    </BButton>
  );
}

/** Text field: label above the control (13px medium), inline error/hint below. */
export function Field({ label: lb, error, hint, required, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string; required?: boolean }) {
  const { c } = useTheme();
  const [show, setShow] = useState(false);
  const secret = !!rest.secureTextEntry;
  const Glyph = show ? EyeOff : Eye;
  return (
    <View style={{ gap: 6, flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
      <T v="label" color={c.text}>{lb}{required ? <T v="label" color={c.danger}> *</T> : null}</T>
      <Input error={error ?? undefined} variant="outline" containerStyle={{ marginBottom: 0 }}
        type={rest.multiline ? 'textarea' : 'input'} {...(rest as object)} secureTextEntry={secret && !show} accessibilityLabel={lb}
        rightComponent={secret ? <Pressable onPress={() => setShow((v) => !v)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} hitSlop={12}><Glyph size={18} strokeWidth={1.85} color={c.muted} /></Pressable> : undefined} />
      {!error && hint ? <T v="small" muted>{hint}</T> : null}
    </View>
  );
}

export function DateField({ label: lb, value, onChange, hint, error }: { label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string }) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return (
    <View style={{ gap: 4, flexGrow: 1 }}>
      <DatePicker mode="date" label={lb} variant="outline" placeholder="Select date" value={valid ? fromISO(value) : undefined}
        onChange={(d) => onChange(d ? toISO(d) : '')} error={error} />
      {!error && hint ? <T v="small" muted>{hint}</T> : null}
    </View>
  );
}

export function SelectField<V extends string>({ label: lb, value, onChange, options, placeholder = 'Select…', allowClear }: {
  label: string; value: V | ''; onChange: (v: V | '') => void; options: { value: V; label: string; sub?: string }[]; placeholder?: string; allowClear?: boolean;
}) {
  const cur = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6, flexGrow: 1 }}>
      <T v="small" muted style={{ fontWeight: '400' }}>{lb}</T>
      <Combobox value={cur ? { value: cur.value, label: cur.label } : null} onValueChange={(o) => onChange((o?.value ?? '') as V | '')}>
        <ComboboxTrigger><ComboboxValue placeholder={placeholder} /></ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder={`Search ${lb.toLowerCase()}…`} />
          <ComboboxList>
            <ComboboxEmpty>No results</ComboboxEmpty>
            {allowClear ? <ComboboxItem value="">— None —</ComboboxItem> : null}
            {options.map((o) => <ComboboxItem key={o.value} value={o.value}>{o.sub ? `${o.label} · ${o.sub}` : o.label}</ComboboxItem>)}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange, label }: {
  options: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label?: string;
}) {
  const { c } = useTheme();
  const font = useAppFont('400');
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="small" muted style={{ fontWeight: '400' }}>{label}</T> : null}
      <Row wrap gap={6}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={o.label}
              style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, backgroundColor: on ? c.primary : c.surface, borderColor: on ? c.primary : c.border }}>
              <RNText style={[{ color: on ? c.onPrimary : c.text, fontSize: 13 }, font]}>{o.label}</RNText>
            </Pressable>
          );
        })}
      </Row>
    </View>
  );
}

export function Segmented<V extends string>(p: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { c } = useTheme();
  const font = useAppFont('400');
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3 }} accessibilityRole="tablist">
      {p.options.map((o) => {
        const on = o.value === p.value;
        return (
          <Pressable key={o.value} onPress={() => p.onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: on ? c.surface : 'transparent' }}>
            <RNText style={[{ color: on ? c.text : c.muted, fontSize: 13 }, font]}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- feedback
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'primary';
/** Status badge: colour + a text glyph, so state is never communicated by colour alone. */
export function Badge({ label: text, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { c } = useTheme();
  const m: Record<Tone, [string, string, ComponentType<{ size: number; color: string; strokeWidth?: number }> | HRIconName]> = {
    neutral: [c.surfaceAlt, c.muted, Minus], success: [c.successSoft, c.success, 'completed'], warning: [c.warningSoft, c.warning, 'pending'],
    danger: [c.dangerSoft, c.danger, 'overdue'], info: [c.infoSoft, c.info, Info], accent: [c.accentSoft, c.accent, Tag], primary: [c.primarySoft, c.info, Info],
  };
  const [bg, fg, Glyph] = m[tone];
  const font = useAppFont('500');
  return (
    <View accessibilityLabel={text} style={[{ backgroundColor: bg, alignSelf: 'flex-start', flexShrink: 0, paddingVertical: 3, paddingLeft: 7, paddingRight: 9, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
      {/* the icon means status is never conveyed by colour alone */}
      {typeof Glyph === 'string' ? <HRIcon name={Glyph} size="sm" color={fg} /> : <Glyph size={12} color={fg} strokeWidth={2.25} />}
      <RNText style={[{ color: fg, fontSize: 12, lineHeight: 16 }, font]}>{text}</RNText>
    </View>
  );
}

export function Loading({ label: text = 'Loading…' }: { label?: string }) {
  return (
    <View style={{ padding: 24, gap: 12 }} accessibilityRole="progressbar" accessibilityLabel={text}>
      <Skeleton height={22} width="40%" /><Skeleton height={86} /><Skeleton height={86} /><Skeleton height={140} />
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
      <View style={{ backgroundColor: c.surfaceAlt, padding: 14, borderRadius: 999 }}><Inbox size={24} color={c.muted} /></View>
      <T v="h3" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T muted style={{ textAlign: 'center', maxWidth: 360 }}>{body}</T> : null}
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ padding: 24, alignItems: 'center', gap: 10 }} accessibilityRole="alert">
      <AlertCircle size={24} color={c.danger} />
      <T v="h3">Something went wrong</T>
      <T muted style={{ textAlign: 'center' }}>{message}</T>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} small /> : null}
    </View>
  );
}

/** Renders loading (skeleton) / error / empty states around data. */
export function Async<T2>({ state, empty, children }: {
  state: { data: T2 | null; error: string | null; loading: boolean; reload: () => void };
  empty?: (d: T2) => boolean; children: (d: T2) => ReactNode;
}) {
  if (state.loading && state.data === null) return <Loading />;
  if (state.error && state.data === null) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data === null) return null;
  if (empty?.(state.data)) return <EmptyState title="Nothing here yet" />;
  return <>{children(state.data)}</>;
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'success' | 'warning'; children: ReactNode }) {
  const { c } = useTheme();
  const m = { info: [c.infoSoft, c.info, Info], danger: [c.dangerSoft, c.danger, AlertCircle], success: [c.successSoft, c.success, CheckCircle2], warning: [c.warningSoft, c.warning, TriangleAlert] }[tone];
  const Icon = m[2] as ComponentType<{ size: number; color: string }>;
  return (
    <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={{ backgroundColor: m[0] as string, padding: 12, borderRadius: radius.md, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Icon size={18} color={m[1] as string} />
      <View style={{ flex: 1 }}><T v="body" color={m[1] as string} style={{ fontWeight: '400' }}>{children}</T></View>
    </View>
  );
}

export function ProgressBar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }}>
      <Progress value={v} height={height} style={color ? undefined : undefined} />
    </View>
  );
}

function Sparkline({ values, color, w = 72, h = 28 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 3 - ((v - min) / span) * (h - 6)}`).join(' ');
  return <View aria-hidden><Svg width={w} height={h}><Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg></View>;
}

export function StatCard({ label: lb, value, icon, tone = 'primary', sub, delta, trend }: {
  label: string; value: string | number; icon: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent'; sub?: string;
  /** e.g. { text: '+3 vs yesterday', tone: 'success' } — shown with a ▲/▼/– glyph so direction isn't colour-only */
  delta?: { text: string; tone: 'success' | 'danger' | 'neutral'; dir?: 'up' | 'down' | 'flat' }; trend?: number[];
}) {
  const { c } = useTheme();
  const bg = { primary: c.primarySoft, success: c.successSoft, warning: c.warningSoft, danger: c.dangerSoft, info: c.infoSoft, accent: c.accentSoft }[tone];
  const line = { primary: c.solid.info, success: c.solid.success, warning: c.solid.warning, danger: c.solid.danger, info: c.solid.info, accent: c.solid.accent }[tone];
  const { isMobile } = useBreakpoint();
  const DeltaIcon = delta?.dir === 'up' ? ArrowUpRight : delta?.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <Card style={{ flex: 1, gap: 10, alignItems: isMobile ? 'center' : 'stretch' }}>
      <Row style={isMobile ? { flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: '100%' } : { justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {isMobile ? <View style={{ backgroundColor: bg, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}>{icon}</View> : null}
        <T v="small" muted style={{ fontWeight: '400', flexShrink: 1, textAlign: isMobile ? 'center' : 'left' }}>{lb}</T>
        {isMobile ? null : <View style={{ backgroundColor: bg, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}>{icon}</View>}
      </Row>
      <Row style={{ justifyContent: isMobile ? 'center' : 'space-between', maxWidth: '100%' }} wrap>
        <T maxFontSizeMultiplier={1.2} style={{ fontSize: isMobile ? 28 : 32, fontWeight: '700', lineHeight: isMobile ? 34 : 38, letterSpacing: -0.4, flexShrink: 1, textAlign: isMobile ? 'center' : 'left' }} accessibilityLabel={`${lb}: ${value}`}>{value}</T>
        {trend ? <Sparkline values={trend} color={line} /> : null}
      </Row>
      {delta ? <Row gap={4} style={isMobile ? { justifyContent: 'center' } : undefined}><DeltaIcon size={16} color={delta.tone === 'success' ? c.success : delta.tone === 'danger' ? c.danger : c.muted} /><T v="small" color={delta.tone === 'success' ? c.success : delta.tone === 'danger' ? c.danger : c.muted} style={{ fontWeight: '500' }}>{delta.text}</T></Row> : sub ? <T v="small" muted style={{ textAlign: isMobile ? 'center' : 'left' }}>{sub}</T> : null}
    </Card>
  );
}

const AVATAR_TONES = ['#29476D', '#3974C6', '#4A6B8A', '#5B6FC2', '#3C7F8C', '#566579'];
/** Initials avatar (used whenever no authorised photo exists): restrained navy / slate tones, white initials. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  const tone = AVATAR_TONES[Array.from(name).reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <BAvatar size={size}>
      <AvatarFallback style={{ backgroundColor: tone }} textStyle={{ color: '#fff', fontWeight: '400', fontSize: Math.round(size * 0.38) }}>{initials || '?'}</AvatarFallback>
    </BAvatar>
  );
}

/** Modal form container: centred card on tablets/desktop, bottom sheet on phones. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { c } = useTheme();
  const { isTablet } = useBreakpoint();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable onPress={onClose} accessibilityLabel="Close dialog" style={{ flex: 1, backgroundColor: 'rgba(8,14,27,0.6)', justifyContent: isTablet ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable onPress={() => {}} style={{
          backgroundColor: c.surface, width: '100%', maxWidth: 560, maxHeight: '92%', borderWidth: 1, borderColor: c.border,
          borderRadius: isTablet ? radius.xl : 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
        }}>
          {!isTablet ? <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginTop: 8 }} /> : null}
          <Row style={{ justifyContent: 'space-between', padding: space.lg, paddingBottom: space.sm }}>
            <T v="h2" accessibilityRole="header" style={{ flex: 1 }}>{title}</T>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12}><X size={24} color={c.muted} /></Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: space.sm, gap: space.md }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Confirmation for decisions that are hard to undo (BNA AlertDialog). */
export function ConfirmDialog({ visible, title, description, confirmText = 'Confirm', onConfirm, onClose, destructive }: {
  visible: boolean; title: string; description?: string; confirmText?: string; onConfirm: () => void; onClose: () => void; destructive?: boolean;
}) {
  return <AlertDialog isVisible={visible} onClose={onClose} title={title} description={description} confirmText={confirmText} cancelText="Cancel" onConfirm={onConfirm} onCancel={onClose} style={destructive ? undefined : undefined} />;
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function toneFor(status: string): Tone {
  switch (status) {
    case 'present': case 'approved': case 'completed': case 'active': case 'paid': case 'hired': case 'enrolled': case 'open': return 'success';
    case 'late': case 'pending': case 'screening': case 'draft': case 'applied': return 'warning';
    case 'absent': case 'rejected': case 'overdue': case 'failed': return 'danger';
    case 'remote': case 'interview': case 'offered': case 'on_leave': case 'in_progress': return 'info';
    case 'public_holiday': return 'accent';
    default: return 'neutral'; // inactive, ended, not_started, cancelled, closed
  }
}
export const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
