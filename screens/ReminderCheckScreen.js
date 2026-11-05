// "Make sure your reminders arrive" (Android) / "Check reminders" (iPhone) — since 2026-11-05 a guided
// conversation (docs/specs/reminder-setup-conversation.md RS-1..RS-14; picture
// docs/design/reminder-setup-conversation.html), replacing the list of A-112 picture B (rebuild =
// replace). Every door opens it here: Settings › Notifications, Today's reminder cards (focus), the
// test-reminder tap, the once-per-phone opening (SP-5) and the cold return from Android (resume).
// The conversation lives in components/ReminderConversation; its rules in lib/reminderConversation.
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_SCREEN_EDGES } from '../lib/tabBarStyle';
import { useTheme } from '../lib/theme';
import ReminderConversation from '../components/ReminderConversation';

export default function ReminderCheckScreen({ navigation, route }) {
  const focus = route?.params?.focus; // the item a Today card pointed at
  const resume = route?.params?.resume; // RS-4: the item Android was showing when it closed the app
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SafeAreaView style={s.container} edges={TAB_SCREEN_EDGES}>
      <ReminderConversation mode="screen" focus={focus} resume={resume} onClose={() => navigation.goBack()} />
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.ground },
});
