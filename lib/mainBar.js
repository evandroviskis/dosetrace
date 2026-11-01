// A-206 (founder 2026-11-01, "não deixa a barra oculta em momento algum, tanto no Android quanto no
// iPhone"): the one glass bar App.js MainStack draws under every screen of the main stack.
// mainBarState: the chosen tab is the tab under the stack (the one a pushed screen was opened from) —
// the MainTabs nearest the top, as a notification tap can leave two in the stack (senior review B1);
// overTabs: a screen is open over that MainTabs; locked: the screen on top holds the person (Premium
// during a purchase, the food chat while a message is sent: gestureEnabled false, review B2).
// mainBarPress: a tap on any tab (the chosen one too) closes the screens opened over the tabs and shows
// that tab — never while locked.
export function mainBarState(stackState, tabNames, descriptors) {
  const routes = stackState && stackState.routes ? stackState.routes : [];
  const topAt = Math.min(stackState && typeof stackState.index === 'number' ? stackState.index : routes.length - 1, routes.length - 1);
  let tabsAt = -1;
  for (let i = topAt; i >= 0; i -= 1) if (routes[i].name === 'MainTabs') { tabsAt = i; break; }
  const tabsRoute = tabsAt >= 0 ? routes[tabsAt] : null;
  const ts = tabsRoute && tabsRoute.state;
  const current = ts && ts.routes && ts.routes[ts.index || 0] ? ts.routes[ts.index || 0].name : (tabsRoute && tabsRoute.params && tabsRoute.params.screen) || tabNames[0];
  const index = Math.max(0, tabNames.indexOf(current));
  const top = topAt >= 0 ? routes[topAt] : null;
  const opts = top && descriptors && descriptors[top.key] ? descriptors[top.key].options : null;
  return {
    index,
    routes: tabNames.map((name) => ({ key: name, name })),
    overTabs: !!top && top.name !== 'MainTabs',
    locked: !!opts && opts.gestureEnabled === false,
  };
}

export function mainBarPress(navigation, bar, name) {
  if (bar.locked) return;
  if (bar.overTabs) navigation.popTo('MainTabs', { screen: name });
  else if (bar.routes[bar.index].name !== name) navigation.navigate('MainTabs', { screen: name });
}
