import { useEffect, useRef } from 'react';
import { BaseEdge, getSmoothStepPath, Position, useReactFlow } from '@xyflow/react';
import { drag } from 'd3-drag';
import { select } from 'd3-selection';

const LEAD = { [Position.Top]: [0, -18], [Position.Right]: [18, 0], [Position.Bottom]: [0, 18], [Position.Left]: [-18, 0] };

function bendPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }, bend) {
  const [sx, sy] = LEAD[sourcePosition];
  const [tx, ty] = LEAD[targetPosition];
  return `M ${sourceX} ${sourceY} L ${sourceX + sx} ${sourceY + sy} L ${bend.x} ${bend.y} L ${targetX + tx} ${targetY + ty} L ${targetX} ${targetY}`;
}

export function ConnectionEdge({ id, data, pathOptions, label, labelStyle, labelBgStyle, labelBgPadding, labelBgBorderRadius, markerEnd, style, ...geometry }) {
  const grip = useRef(null);
  const { screenToFlowPosition } = useReactFlow();
  const { panning, saveBend, select: selectEdge, bend } = data;
  const callbacks = useRef(null);
  useEffect(() => { callbacks.current = { panning, saveBend, selectEdge }; }, [panning, saveBend, selectEdge]);

  useEffect(() => {
    const element = select(grip.current);
    const behavior = drag().clickDistance(4)
      .filter(event => !callbacks.current.panning && !event.button)
      .on('start', event => {
        const from = { x: event.x, y: event.y };
        callbacks.current.selectEdge({ id, type: 'edge' });
        event.on('drag', next => {
          if (Math.hypot(next.x - from.x, next.y - from.y) < 5) return;
          const event = next.sourceEvent;
          const pointer = event.changedTouches ? Array.from(event.changedTouches).find(touch => touch.identifier === next.identifier) : event;
          if (pointer) callbacks.current.saveBend(id, screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY }));
        });
      });
    element.call(behavior);
    return () => element.on('.drag', null);
  }, [id, screenToFlowPosition]);

  const [autoPath, autoX, autoY] = getSmoothStepPath({ ...geometry, ...pathOptions });
  const path = bend ? bendPath(geometry, bend) : autoPath;
  return <>
    <BaseEdge id={id} path={path} label={label} labelX={bend?.x ?? autoX} labelY={bend?.y ?? autoY}
      labelStyle={labelStyle} labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius} markerEnd={markerEnd} style={style} interactionWidth={0} />
    <path ref={grip} d={path} className="connection-grip nopan" fill="none" stroke="transparent" strokeWidth="22"
      vectorEffect="non-scaling-stroke" aria-hidden="true" />
  </>;
}
