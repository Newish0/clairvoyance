type Point = [number, number];

/**
 * Calculates the angle in degrees at point B for the sequence A-B-C.
 * Returns an angle between 0 and 180 degrees.
 */
function calculateAngleAtVertex(pA: Point, pB: Point, pC: Point): number {
    const vBAx = pA[0] - pB[0];
    const vBAy = pA[1] - pB[1];
    const vBCx = pC[0] - pB[0];
    const vBCy = pC[1] - pB[1];

    const dotProduct = vBAx * vBCx + vBAy * vBCy;
    const magBA = Math.sqrt(vBAx * vBAx + vBAy * vBAy);
    const magBC = Math.sqrt(vBCx * vBCx + vBCy * vBCy);

    if (magBA === 0 || magBC === 0) {
        return 180; // Collinear or coincident points
    }
    let cosAngle = dotProduct / (magBA * magBC);
    cosAngle = Math.max(-1, Math.min(1, cosAngle)); // Clamp for precision issues
    const angleRad = Math.acos(cosAngle);
    return angleRad * (180 / Math.PI);
}

/**
 * Internal Chaikin's algorithm for a single polyline segment.
 * This does not handle angle preservation itself; it's the core smoothing logic.
 */
function _chaikinSmoothCore(
    points: ReadonlyArray<Point>,
    iterations: number,
    ratio: number
): Point[] {
    if (points.length < 2 || iterations <= 0) {
        return [...points.map((p) => [...p] as Point)]; // Deep copy
    }

    const safeRatio = Math.max(0.01, Math.min(0.49, ratio));
    let currentPoints: Point[] = [...points.map((p) => [...p] as Point)];

    for (let iter = 0; iter < iterations; iter++) {
        if (currentPoints.length < 2) break;

        const newPoints: Point[] = [];
        // Always keep the first point of the current segment being processed
        newPoints.push([...currentPoints[0]]);

        for (let i = 0; i < currentPoints.length - 1; i++) {
            const p0 = currentPoints[i];
            const p1 = currentPoints[i + 1];

            const qx = (1 - safeRatio) * p0[0] + safeRatio * p1[0];
            const qy = (1 - safeRatio) * p0[1] + safeRatio * p1[1];
            newPoints.push([qx, qy]);

            const rx = safeRatio * p0[0] + (1 - safeRatio) * p1[0];
            const ry = safeRatio * p0[1] + (1 - safeRatio) * p1[1];
            newPoints.push([rx, ry]);
        }
        // Always keep the last point of the current segment
        newPoints.push([...currentPoints[currentPoints.length - 1]]);
        currentPoints = newPoints;
    }
    return currentPoints;
}

/**
 * Smooths a line using Chaikin's corner-cutting algorithm, with an option to preserve sharp angles.
 * The line is split at vertices forming an angle sharper than the threshold,
 * and Chaikin smoothing is applied to the segments between these "anchor" points.
 *
 * @param originalPoints The array of points forming the line.
 * @param iterations The number of smoothing passes to apply to non-sharp segments. Default is 1.
 * @param ratio The ratio for cutting corners (typically 0.25). Default is 0.25.
 * @param sharpAngleThresholdDegrees Angles (in degrees) smaller than this value at a vertex will be preserved.
 *                                   The vertex itself will be kept, and smoothing will occur on either side.
 *                                   Set to 0 to smooth all angles (or >=180 to effectively do the same).
 *                                   Default is 0.
 * @returns A new array of smoothed points.
 */
export function chaikinSmoothWithAngleThreshold(
    originalPoints: ReadonlyArray<Point>,
    iterations: number = 1,
    ratio: number = 0.25,
    sharpAngleThresholdDegrees: number = 0
): Point[] {
    if (originalPoints.length < 2) {
        return [...originalPoints.map((p) => [...p] as Point)]; // Deep copy
    }
    if (iterations <= 0) {
        return [...originalPoints.map((p) => [...p] as Point)];
    }

    // If threshold is very high (>=180) or 0, effectively no angle preservation,
    // or if line is too short to have an internal angle.
    if (
        sharpAngleThresholdDegrees <= 0 ||
        sharpAngleThresholdDegrees >= 180 ||
        originalPoints.length < 3
    ) {
        return _chaikinSmoothCore(originalPoints, iterations, ratio);
    }

    const anchorIndices: number[] = [0]; // The first point is always an anchor

    // Identify interior anchor points based on sharp angles
    for (let i = 1; i < originalPoints.length - 1; i++) {
        const pA = originalPoints[i - 1];
        const pB = originalPoints[i];
        const pC = originalPoints[i + 1];
        const angle = calculateAngleAtVertex(pA, pB, pC);
        if (angle < sharpAngleThresholdDegrees) {
            anchorIndices.push(i);
        }
    }
    anchorIndices.push(originalPoints.length - 1); // The last point is always an anchor

    // Remove duplicate anchor indices (e.g. if first/last also met criteria, or consecutive sharp points)
    // and ensure they are sorted.
    const uniqueSortedAnchorIndices = [...new Set(anchorIndices)].sort((a, b) => a - b);

    if (uniqueSortedAnchorIndices.length <= 1) {
        // This should not happen if originalPoints.length >=2 because 0 and length-1 are always added.
        // But as a fallback, or if all points collapse to one anchor.
        return _chaikinSmoothCore(originalPoints, iterations, ratio);
    }

    const resultPolyline: Point[] = [];
    for (let i = 0; i < uniqueSortedAnchorIndices.length - 1; i++) {
        const startIndex = uniqueSortedAnchorIndices[i];
        const endIndex = uniqueSortedAnchorIndices[i + 1];

        // Extract the sub-polyline segment, including its start and end anchors
        const subPolyline: Point[] = [];
        for (let j = startIndex; j <= endIndex; j++) {
            // Deep copy points for the sub-polyline
            subPolyline.push([...originalPoints[j]] as Point);
        }

        if (subPolyline.length > 1) {
            // Need at least 2 points for Chaikin
            const smoothedSubPolyline = _chaikinSmoothCore(subPolyline, iterations, ratio);

            if (resultPolyline.length === 0) {
                resultPolyline.push(...smoothedSubPolyline);
            } else {
                // Avoid duplicating the common anchor point.
                // The first point of smoothedSubPolyline is the same as the last point
                // of the previously added segment.
                resultPolyline.push(...smoothedSubPolyline.slice(1));
            }
        } else if (subPolyline.length === 1) {
            // This can happen if two consecutive points in the original line were anchors.
            // Add the single anchor point if it's not already the last point in results.
            if (
                resultPolyline.length === 0 ||
                resultPolyline[resultPolyline.length - 1][0] !== subPolyline[0][0] ||
                resultPolyline[resultPolyline.length - 1][1] !== subPolyline[0][1]
            ) {
                resultPolyline.push(subPolyline[0]);
            }
        }
    }

    // If resultPolyline is empty (e.g. original was 1 point and it was an anchor), return original
    if (resultPolyline.length === 0 && originalPoints.length > 0) {
        return [...originalPoints.map((p) => [...p] as Point)];
    }

    return resultPolyline;
}
