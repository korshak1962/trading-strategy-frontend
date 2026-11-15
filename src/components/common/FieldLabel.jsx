import InfoTooltip from './InfoTooltip';

/**
 * A heading with an ⓘ above one control (editor UX Stage A). The ⓘ sits outside any <label>, so a
 * click on it neither focuses nor toggles the control; the control keeps its own aria-label.
 */
const FieldLabel = ({ label, tooltip, code = null, align = 'left', testId, className = '', children }) => (
  <div className={`inline-flex flex-col ${className}`}>
    <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap leading-4">
      {label}
      <InfoTooltip text={tooltip} code={code} align={align} editor testId={testId} />
    </span>
    {children}
  </div>
);

export default FieldLabel;
