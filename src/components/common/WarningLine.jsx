import InfoTooltip from './InfoTooltip';
import { warningEntryOf, warningInfoText } from '../../utils/warningItems';

/**
 * One warning as the UI shows it (editor UX Stage B, F-B3b): the plain message, and an ⓘ holding
 * the stable code and the machine string (`code: STATE_RULE_OPEN — <the warnings text>`) when the
 * backend sent a `warningItems` entry. `entry` is `{text, message, code}` or a plain string.
 */
export default function WarningLine({ entry, className, testId }) {
  const e = warningEntryOf(entry);
  if (!e) return null;
  const info = warningInfoText(e);
  return (
    <div className={className} data-testid={testId} data-warning-code={e.code || undefined}>
      <span>{e.message}</span>
      {info && <InfoTooltip text={info} editor align="left" testId={testId ? `${testId}-code` : undefined} />}
    </div>
  );
}
