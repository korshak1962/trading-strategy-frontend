import InfoTooltip from './InfoTooltip';

/**
 * A plain-English caption (constructor editor UX Stage B, screener designer.md §6.1): the sentence
 * in sans `text-sm`, an optional semibold head (`R2 Sell`), and an ⓘ holding the code label
 * (`code: R2 LongClose: RUN close[0] < AT_ENTRY(OPEN_STOP)`) for power users and validation locators.
 */
export default function DisplayCaption({ head = null, text, code = null, className = 'mt-1 text-sm text-gray-700', testId, codeTestId }) {
  return (
    <div className={className} data-testid={testId}>
      {head && <span className="font-semibold">{head}</span>}
      {head && ': '}
      <span>{text}</span>
      {code && <InfoTooltip text={`code: ${code}`} editor align="left" testId={codeTestId} />}
    </div>
  );
}
