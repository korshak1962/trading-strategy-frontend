// src/components/charts/Crosshair.jsx
import React from 'react';

/**
 * Crosshair component for highlighting mouse position
 * @param {Object} props - Component props
 * @param {boolean} props.show - Whether to show the crosshair
 * @param {Object} props.position - {x, y} position
 * @param {boolean} props.horizontal - Show horizontal line
 * @param {boolean} props.vertical - Show vertical line
 * @returns {JSX.Element|null}
 */
const Crosshair = ({ show, position, horizontal = true, vertical = true }) => {
  if (!show || !position) return null;
  
  const { x, y } = position;
  
  return (
    <>
      {vertical && (
        <div 
          className="crosshair-line vertical" 
          style={{ left: x }}
        ></div>
      )}
      
      {horizontal && (
        <div 
          className="crosshair-line horizontal" 
          style={{ top: y }}
        ></div>
      )}
    </>
  );
};

export default Crosshair;