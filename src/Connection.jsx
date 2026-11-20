import { BaseEdge, getSmoothStepPath } from '@xyflow/react';
import { roundedPath } from './routing.js';

export function ConnectionEdge({ id, data, label, labelStyle, labelBgStyle, labelBgPadding, labelBgBorderRadius, markerEnd, style, ...geometry }) {
  const route = data.route;
  if (route === null) return null;
  const [fallbackPath, labelX, labelY] = route ? [] : getSmoothStepPath(geometry);
  return <BaseEdge id={id} path={route ? roundedPath(route.points) : fallbackPath}
    label={route && !route.label ? undefined : label}
    labelX={route?.label?.x ?? labelX} labelY={route?.label?.y ?? labelY}
    labelStyle={labelStyle} labelBgStyle={labelBgStyle} labelBgPadding={labelBgPadding}
    labelBgBorderRadius={labelBgBorderRadius} markerEnd={markerEnd} style={style} />;
}
