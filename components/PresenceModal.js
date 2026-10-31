// React Native's Modal, reporting itself while it is visible (lib/sheetPresence): the A-127 update
// notice never shows over it, and the required screen never replaces the app while one is open (a
// form in a Modal keeps what was typed). Every <Modal in the app comes from here (drift guard:
// __tests__/updateNoticeReview.test.js). React Native shows a Modal whose visible prop is missing.
// A-204: a Modal is its own root (touches in it never reach App's view), so its content sits in one
// view that closes the keyboard on a tap away from the field being typed (components/tapAwayKeyboard).
import { Modal as RNModal, View, StyleSheet } from 'react-native';
import { useSheetPresence } from '../lib/sheetPresence';
import { tapAwayProps } from './tapAwayKeyboard';

export default function Modal({ children, ...props }) {
  useSheetPresence(props.visible === undefined ? true : !!props.visible);
  return (
    <RNModal {...props}>
      <View style={s.fill} {...tapAwayProps}>{children}</View>
    </RNModal>
  );
}

const s = StyleSheet.create({ fill: { flex: 1 } });
