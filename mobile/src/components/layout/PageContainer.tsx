import { Slot } from 'expo-router';
import { View } from 'react-native';
import { PageTitleContext, useBreakpoint } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { AppHeader, useBreadcrumbs } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { MobileHeader } from './MobileHeader';
import { MobileNavigation } from './MobileNavigation';

/** Desktop: sidebar + header + content. Tablet: header + content (no sidebar). Mobile: compact header + bottom tabs. */
export function AppShell() {
  const { isWide, isTablet, isMobile } = useBreakpoint();
  const { c } = useTheme();
  const { title } = useBreadcrumbs();
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.bg }}>
      {isTablet ? <AppSidebar defaultCollapsed={!isWide} /> : null}
      <View style={{ flex: 1 }}>
        {isMobile ? <MobileHeader /> : <AppHeader />}
        <PageTitleContext.Provider value={{ title, hideDuplicate: isMobile }}>
          <View style={{ flex: 1 }}><Slot /></View>
        </PageTitleContext.Provider>
        {/* floats over the content (absolute) so the glass has something to blur; Screen() pads its scroll area to clear it */}
        {isMobile ? <MobileNavigation /> : null}
      </View>
    </View>
  );
}
