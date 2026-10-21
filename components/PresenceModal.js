// React Native's Modal, reporting itself while it is visible (lib/sheetPresence): the A-127 update
// notice never shows over it, and the required screen never replaces the app while one is open (a
// form in a Modal keeps what was typed). Every <Modal in the app comes from here (drift guard:
// __tests__/updateNoticeReview.test.js). React Native shows a Modal whose visible prop is missing.
import { Modal as RNModal } from 'react-native';
import { useSheetPresence } from '../lib/sheetPresence';

export default function Modal(props) {
  useSheetPresence(props.visible === undefined ? true : !!props.visible);
  return <RNModal {...props} />;
}
