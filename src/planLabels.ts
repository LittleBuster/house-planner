// Dimension text follows the wall axis but always faces the readable half-plane.
export function readablePlanAngle(degrees: number) {
  let angle = ((degrees+180)%360+360)%360-180;
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}
