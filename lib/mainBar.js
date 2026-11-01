// A-206 (founder 2026-11-01, "não deixa a barra oculta em momento algum, tanto no Android quanto no
// iPhone"): the one glass bar App.js MainStack draws under every screen of the main stack.
// mainBarState: the chosen tab is the tab under the stack (the one a pushed screen was opened from);
// overTabs: a screen is open over the tabs. mainBarPress: a tap on any tab (the chosen one too) closes
// the screens opened over the tabs and shows that tab.
export function mainBarState(stackState, tabNames) {
  const tabsRoute = stackState && stackState.routes ? stackState.routes.find((r) => r.name === 'MainTabs') : null;
  const ts = tabsRoute && tabsRoute.state;
  const current = ts && ts.routes && ts.routes[ts.index || 0] ? ts.routes[ts.index || 0].name : (tabsRoute && tabsRoute.params && tabsRoute.params.screen) || tabNames[0];
  const index = Math.max(0, tabNames.indexOf(current));
  const top = stackState && stackState.routes ? stackState.routes[stackState.index || 0] : null;
  return { index, routes: tabNames.map((name) => ({ key: name, name })), overTabs: !!top && top.name !== 'MainTabs' };
}

export function mainBarPress(navigation, bar, name) {
  if (bar.overTabs) navigation.popTo('MainTabs', { screen: name });
  else if (bar.routes[bar.index].name !== name) navigation.navigate('MainTabs', { screen: name });
}
