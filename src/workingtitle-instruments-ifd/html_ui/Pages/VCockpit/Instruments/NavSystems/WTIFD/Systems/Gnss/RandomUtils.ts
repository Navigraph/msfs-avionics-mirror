import { Vec2Math } from '@microsoft/msfs-sdk';
import { UncertaintyEllipse } from './PositionMath';

/**
 * A set of functions for generating random samples from various distributions.
 */
export class RandomUtils {
  /**
   * Generates n random samples from a normal distribution with the specified mean and standard deviation.
   * @param mean The mean of the normal distribution.
   * @param stdDev The standard deviation of the normal distribution.
   * @param n The number of random samples to generate. Defaults to 1.
   * @returns An array containing the generated random samples.
   */
  public static sampleNormal(mean: number, stdDev: number, n: number = 1): number[] {
    // The Box-Muller transform (https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform) is used to generate normally distributed random
    // samples.
    const samples = [];

    for (let i = 0; i < n / 2; i++) {
      const u1 = 1 - Math.random(); // Convert from [0, 1) to (0, 1], as log(0) is undefined.
      const u2 = Math.random();
      const radius = Math.sqrt(-2 * Math.log(u1));
      const angle = 2 * Math.PI * u2;
      samples.push(mean + stdDev * radius * Math.cos(angle));
      samples.push(mean + stdDev * radius * Math.sin(angle));
    }

    if (n % 2 === 1) {
      // If n is odd, generate one (more) sample.
      const u1 = 1 - Math.random(); // Convert from [0, 1) to (0, 1], as log(0) is undefined.
      const u2 = Math.random();
      const radius = Math.sqrt(-2 * Math.log(u1));
      const angle = 2 * Math.PI * u2;
      samples.push(mean + stdDev * radius * Math.sin(angle));
    }

    return samples;
  }

  /**
   * Generates a random sample from a uniform distribution between the specified minimum and maximum values.
   * @param min The minimum value of the uniform distribution.
   * @param max The maximum value of the uniform distribution.
   * @returns A random sample from the uniform distribution.
   */
  public static sampleUniform(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Generates a uniformly distributed random sample within the given range around the specified value, specifically in the
   * interval [value - range/2, value + range/2].
   * @param value The value around which to sample.
   * @param range The range which to sample around the value.
   * @returns A random sample uniformly distributed around the specified value within the given range.
   */
  public static sampleUniformAround(value: number, range: number): number {
    return RandomUtils.sampleUniform(value - range / 2, value + range / 2);
  }

  /**
   * Generates a random sample from the specified uncertainity ellipse, assuming a bivariate normal distribution.
   * @param ellipse The uncertainty ellipse to sample from.
   * @param out The array to write the random sample into. The length of the array must be at least 2.
   * @param scale The scale factor to scale the uncertainty ellipse by, in each direction. Defaults to 1.
   * @returns The random sample, written into the specified array.
   */
  public static sampleUncertaintyEllipse(ellipse: UncertaintyEllipse, out: Float64Array, scale: number = 1): Float64Array {
    // Algorithm from https://en.wikipedia.org/wiki/Multivariate_normal_distribution#Drawing_values_from_the_distribution (eigenvalue/vector variant).
    // 1. Compute the A matrix through Cholesky decomposition or spectral decomposition (already done by caller).
    // 2. Generate two independent standard normal samples.
    const initialSamples = RandomUtils.sampleNormal(0, 1, 2);

    // 3. x = Az, where x is the error, A is the matrix whose columns are the eigenvectors scaled by sqrt(corresponding eigenvalue) and z is
    // the vector of independent standard normal samples.
    out = Vec2Math.set(
      ellipse.majorAxis[0] * initialSamples[0] * scale + ellipse.minorAxis[0] * initialSamples[1] * scale,
      ellipse.majorAxis[1] * initialSamples[0] * scale + ellipse.minorAxis[1] * initialSamples[1] * scale,
      out,
    );

    return out;
  }
}
