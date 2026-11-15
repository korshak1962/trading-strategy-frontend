import './InfoTooltip.css';

/**
 * Small hover/focus tooltip: an "i" icon followed by a floating description box (CSS-driven, see
 * InfoTooltip.css; extracted from StrategyConfig.jsx). The icon is focusable, so the tooltip also
 * opens from the keyboard and next to disabled controls.
 *
 * - `align`: 'center' (default) | 'left' | 'right' — which way the bubble extends (avoids clipping at a row's edge).
 * - `code`: appended as "(code X)" so a tooltip links to the codes captions and validation messages use.
 * - `editor`: the rule-editor variant (wider bubble, normal text inside uppercase headings).
 */
const InfoTooltip = ({ text, align = 'center', code = null, editor = false, testId }) => {
  if (editor && !text && !code) return null;
  const body = code ? `${text ? `${text} ` : ''}(code ${code})` : text;
  const cls = ['param-tooltip-anchor'];
  if (align === 'left') cls.push('param-tooltip-left');
  if (align === 'right') cls.push('param-tooltip-right');
  if (editor) cls.push('param-tooltip-editor');
  return (
    <span className={cls.join(' ')} data-testid={testId}>
      <span className="param-info-icon" tabIndex={0} role="img" aria-label="info">i</span>
      <span className="param-tooltip" role="tooltip">{body}</span>
    </span>
  );
};

export default InfoTooltip;
