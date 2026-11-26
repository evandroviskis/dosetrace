// How-to video player (docs/specs/howto-videos.md HV-3, HV-4, HV-5, HV-12; picture
// docs/design/videos-perguntas.html, "2 · o tocador, dentro do app"). Full screen inside the app, never
// the browser: a dark surface in both themes (the theme's fixed `player` tokens, like any video player),
// "×" that closes at any moment, the question on top, the video, the progress with elapsed and total
// time, play/pause, and the fixed example line under the video (always visible while it plays). When the
// video ends it closes by itself; Android back and a swipe (down, or from the left) close it the same way.
// A video that cannot load closes the player and the FAQ shows the offline line (onFailed).
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Modal from './PresenceModal'; // reports itself while visible (the update notice never shows over it)
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { useLanguage } from '../i18n/LanguageContext';
import { formatDuration, swipeCloses } from '../lib/howtoVideos';
import FeatureIcon from './FeatureIcon';


export default function HowtoPlayer({ video, title, onClose, onFinished, onFailed }) {
  const { useVideoPlayer, VideoView } = require('expo-video'); // only rendered when the module exists (lib/howtoRuntime)
  const { colors } = useTheme();
  const p = colors.player;
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(p), [p]);
  const [time, setTime] = useState(0);
  const [total, setTotal] = useState(video.dur);
  const [playing, setPlaying] = useState(true);
  const done = useRef(false);
  const cb = useRef({ onClose, onFinished, onFailed });
  cb.current = { onClose, onFinished, onFailed };

  const player = useVideoPlayer({ uri: video.url }, (pl) => {
    pl.timeUpdateEventInterval = 0.25;
    pl.loop = false;
    pl.play();
  });

  useEffect(() => {
    const subs = [
      player.addListener('timeUpdate', (e) => setTime(e.currentTime || 0)),
      player.addListener('playingChange', (e) => setPlaying(!!e.isPlaying)),
      player.addListener('sourceLoad', (e) => { if (e && e.duration > 0) setTotal(e.duration); }),
      player.addListener('playToEnd', () => {
        if (done.current) return;
        done.current = true;
        cb.current.onFinished();
      }),
      player.addListener('statusChange', (e) => {
        if (e && e.status === 'error' && !done.current) {
          done.current = true;
          cb.current.onFailed();
        }
      }),
    ];
    return () => subs.forEach((x) => { try { x.remove(); } catch { /* gone */ } });
  }, [player]);

  // HV-4 (iPhone simulator 2026-11-26): a swipe down or to the right closes the player like ×. Read from
  // where the finger went down and where it lifted (raw touch events on the root, which arrive even over
  // the native video view); a PanResponder dropped every move there (same timestamp), so it never fired.
  // One finger only; a touch the system cancels never closes.
  const down = useRef(null);
  const touchStart = (e) => {
    const n = e.nativeEvent;
    down.current = n.touches && n.touches.length !== 1 ? null : { x: n.pageX, y: n.pageY };
  };
  const touchEnd = (e) => {
    const from = down.current;
    down.current = null;
    const n = e.nativeEvent;
    if (!from || (n.touches && n.touches.length > 0)) return;
    if (swipeCloses({ dx: n.pageX - from.x, dy: n.pageY - from.y })) cb.current.onClose();
  };
  const touchCancel = () => { down.current = null; };

  const toggle = () => {
    try { if (player.playing) player.pause(); else player.play(); } catch { /* released */ }
  };
  const pct = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <StatusBar style="light" />
      <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]} onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={touchCancel}>
        <View style={s.top}>
          <TouchableOpacity
            onPress={onClose}
            style={s.x}
            accessibilityRole="button"
            accessibilityLabel={t('howto_close')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FeatureIcon name="close" size={22} color={p.ink} />
          </TouchableOpacity>
          <Text style={s.title} numberOfLines={2} accessibilityRole="header">{title}</Text>
          <View style={s.xSpace} />
        </View>

        <View style={s.frame}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture={false} surfaceType="textureView" />
        </View>

        <View style={s.bottom}>
          <View style={s.track}>
            <View style={[s.fill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={s.controls}>
            <Text style={s.time}>{formatDuration(time)}</Text>
            <TouchableOpacity
              onPress={toggle}
              style={s.pp}
              accessibilityRole="button"
              accessibilityLabel={t(playing ? 'howto_pause' : 'howto_play')}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24">
                {playing
                  ? [<Rect key="a" x={6} y={5} width={4} height={14} rx={1} fill={p.onInk} />, <Rect key="b" x={14} y={5} width={4} height={14} rx={1} fill={p.onInk} />]
                  : <Path d="M8 5.5v13l10.5-6.5z" fill={p.onInk} />}
              </Svg>
            </TouchableOpacity>
            <Text style={[s.time, s.timeEnd]}>{formatDuration(total)}</Text>
          </View>
          <Text style={s.foot}>{t('howto_example')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (p) => StyleSheet.create({
  root: { flex: 1, backgroundColor: p.surface },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 8 },
  x: { width: 44, height: 44, borderRadius: 22, backgroundColor: p.chip, alignItems: 'center', justifyContent: 'center' },
  xSpace: { width: 44 },
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: p.ink, textAlign: 'center' },
  frame: { flex: 1, marginHorizontal: 16, marginVertical: 8, borderRadius: 18, backgroundColor: p.frame, borderWidth: StyleSheet.hairlineWidth, borderColor: p.line, overflow: 'hidden' },
  bottom: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 10 },
  track: { height: 3, borderRadius: 2, backgroundColor: p.track, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2, backgroundColor: p.ink },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontSize: 13, color: p.ink2, fontVariant: ['tabular-nums'], minWidth: 48 },
  timeEnd: { textAlign: 'right' },
  pp: { width: 56, height: 56, borderRadius: 28, backgroundColor: p.ink, alignItems: 'center', justifyContent: 'center' },
  foot: { fontSize: 13, lineHeight: 18, color: p.ink3, textAlign: 'center' },
});
