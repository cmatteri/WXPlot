import React from 'react';
import './Legend.css';

function Legend(props) {
  return (
    <div className="Legend">
      {props.groups.map(group => 
        <LegendGroup
          key={group.name}
          name={group.name}
          textHeightPx={props.textHeightPx}
          traces={group.traces}
        />
      )}
    </div>
  );
}

function LegendGroup(props) {
  return (
    <div className="LegendGroup">
      <span>{props.name}</span>
      {props.traces.map(trace => 
        <LegendEntry
          key={trace.name()}
          textHeightPx={props.textHeightPx}
          trace={trace}
        />
      )}
    </div> 
  );
}

function LegendEntry(props) {
  const LEGEND_LINE_LEN = 20;
  function drawTraceSample(canvas) {
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.beginPath();
    const lineHeight = Math.round(props.textHeightPx / 2) + 0.5;
    ctx.moveTo(0, lineHeight);
    ctx.lineTo(LEGEND_LINE_LEN, lineHeight);
    ctx.lineWidth = props.trace.thickness();
    ctx.setLineDash(props.trace.dash());
    ctx.strokeStyle = props.trace.color();
    ctx.stroke();
  }
  const canvasStyle = {
    width: LEGEND_LINE_LEN + 'px',
    height: props.textHeightPx + 'px'
  };
  return (
    <div className="LegendEntry">
      <canvas className="LegendEntry__canvas"
        ref={drawTraceSample}
        width={20 * devicePixelRatio}
        height={props.textHeightPx * devicePixelRatio}
        style={canvasStyle}
      >
      </canvas>
      <span>{props.trace.name()}</span>
    </div>
  );
}

export default Legend;