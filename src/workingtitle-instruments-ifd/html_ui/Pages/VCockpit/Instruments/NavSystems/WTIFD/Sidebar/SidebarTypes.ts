/**
 * A type representing the state of the sidebar.
 * 'none' means no sidebar is available.
 * 'collapsed' means the sidebar is available but currently collapsed. The sidebar tab is visible on the right hand side of the screen.
 * 'sidebar' means the sidebar is visible in its sidebar state.
 * 'full' means the sidebar is visible in its full state.
 */
export type SidebarState = 'none' | 'collapsed' | 'sidebar' | 'full';
